// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectClient, setEditSocketImplementation, type EditSocketCtor } from '../src/editor/ProjectClient.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { EditSocket } from './setup.js'

// Personlig ångra i editorn (#1056, L14, D3), med två editorer mot en riktig aktör. Ett steg
// tillbaka var hela dokumentet som det såg ut före ändringen, skickat som `restore`, och det en
// medredigerare hunnit skriva i en annan del av spelet försvann. Nu tar det bara tillbaka det egna,
// och vägrar med ett besked när någon annan har ändrat just det sedan dess.
let run: Running
beforeEach(async () => {
  run = await startServer()
  await run.projects.create(run.projectId, { ...projectDoc(), rules: { title: 'Regler', blocks: [{ kind: 'text', id: 't1', text: 'Första.' }, { kind: 'text', id: 't2', text: 'Andra.' }] } })
})
afterEach(async () => {
  await run.stop()
})

const open = () => ProjectClient.open({ http: run.http, id: run.projectId })
async function eventually(check: () => void, ms = 5_000): Promise<void> {
  const stop = Date.now() + ms
  for (;;) {
    try {
      check()
      return
    } catch (err) {
      if (Date.now() >= stop) throw err
      await new Promise((r) => setTimeout(r, 10))
    }
  }
}
const greeted = (...editors: ProjectClient[]) => eventually(() => expect(editors.map((e) => e.who)).not.toContain(null))
// Det en editor har landat hos aktören: inget eget väntar längre på sitt eko.
const landed = (editor: ProjectClient) => eventually(() => expect((editor as unknown as { pending: unknown[] }).pending).toEqual([]))
const title = (editor: ProjectClient) => editor.doc.rows.find((r) => r.id === 'dragon')?.fields['title']
const texts = (editor: ProjectClient) => editor.doc.rules?.blocks.map((b) => (b.kind === 'text' ? b.text : ''))
const bosParagraph = (bo: ProjectClient) => bo.spliceRules({ replace: ['t2'], after: null, blocks: [{ kind: 'text', id: 't2', text: 'Bo.' }] })

async function pair(): Promise<{ ada: ProjectClient; bo: ProjectClient; close(): void }> {
  const ada = await open()
  const bo = await open()
  await greeted(ada, bo)
  return { ada, bo, close: () => [ada, bo].forEach((e) => e.close()) }
}

describe('ångra tar bara tillbaka det egna (#1056)', () => {
  it('tar tillbaka Adas kort och lämnar Bos stycke, hos båda och i loggen', async () => {
    const { ada, bo, close } = await pair()
    try {
      ada.setCell('dragon', 'title', 'Ada')
      await eventually(() => expect(title(bo)).toBe('Ada'))
      bosParagraph(bo)
      await eventually(() => expect(texts(ada)).toEqual(['Första.', 'Bo.']))

      expect(ada.undo()).toBe('undo.what.deck')
      await landed(ada)
      for (const editor of [ada, bo]) {
        await eventually(() => expect(title(editor)).toBe('Drake'))
        expect(texts(editor)).toEqual(['Första.', 'Bo.'])
      }
      const log = await run.projects.readEdits(run.projectId, 0)
      expect(log.map((e) => e.intent.v)).toEqual(['setCell', 'spliceRules', 'revert'])

      expect(ada.redo()).toBe('undo.what.deck')
      await landed(ada)
      await eventually(() => expect(title(bo)).toBe('Ada'))
      expect(texts(bo)).toEqual(['Första.', 'Bo.'])
    } finally {
      close()
    }
  })

  it('vägrar när Bo har ändrat samma cell sedan dess, säger varför, och tar steget av stacken', async () => {
    const { ada, bo, close } = await pair()
    try {
      ada.setCell('dragon', 'title', 'Ada')
      await eventually(() => expect(title(bo)).toBe('Ada'))
      bo.setCell('dragon', 'title', 'Bo')
      await eventually(() => expect(title(ada)).toBe('Bo'))

      expect(ada.undo()).toBeNull()
      expect(ada.refusedStep).toEqual({ dir: 'undo', what: 'undo.what.deck' })
      expect(ada.refusedSteps).toBe(1)
      expect(ada.canUndo).toBe(false)
      expect(title(ada)).toBe('Bo')
      expect((await run.projects.readEdits(run.projectId, 0)).map((e) => e.intent.v)).toEqual(['setCell', 'setCell'])
    } finally {
      close()
    }
  })

  it('vägrar göra om när Bo har skrivit i cellen efter att Ada ångrat', async () => {
    const { ada, bo, close } = await pair()
    try {
      ada.setCell('dragon', 'title', 'Ada')
      expect(ada.undo()).toBe('undo.what.deck')
      await landed(ada)
      await eventually(() => expect(title(bo)).toBe('Drake'))
      bo.setCell('dragon', 'title', 'Bo')
      await eventually(() => expect(title(ada)).toBe('Bo'))

      expect(ada.redo()).toBeNull()
      expect(ada.refusedStep).toEqual({ dir: 'redo', what: 'undo.what.deck' })
      expect(ada.canRedo).toBe(false)
      expect(title(ada)).toBe('Bo')
    } finally {
      close()
    }
  })
})

// Aktören prövar steget mot sanningen (#1056): Bos ändring av samma cell har landat hos aktören men
// inte hos Ada när hon trycker ångra. Hon ser ingen konflikt och skickar steget; aktören vägrar det,
// och editorn säger att steget inte gick att ta, inte att en ändring gick förlorad.
//
// Det aktören säger till den första editorn som öppnas kan hållas kvar: en långsam linje.
function slowFirstLine(): { hold(): void; release(): void; held(): number; done(): void } {
  let holding = false
  const held: (() => void)[] = []
  let first = true
  setEditSocketImplementation(
    class extends EditSocket {
      constructor(url: string) {
        super(url)
        if (!first) return
        first = false
        // The client's own handler is kept beside the socket, and the socket's frames reach it
        // through a listener that can hold them back.
        let handler: ((event: { data: unknown }) => void) | null = null
        Object.defineProperty(this, 'onmessage', {
          get: () => handler,
          set: (h: ((event: { data: unknown }) => void) | null) => {
            handler = h
          },
        })
        this.addEventListener('message', (event: { data: unknown }) => {
          const deliver = () => handler?.({ data: event.data })
          if (holding) held.push(deliver)
          else deliver()
        })
      }
    } as unknown as EditSocketCtor,
  )
  return {
    hold: () => {
      holding = true
    },
    release: () => {
      holding = false
      for (const message of held.splice(0)) message()
    },
    held: () => held.length,
    done: () => setEditSocketImplementation(EditSocket as unknown as EditSocketCtor),
  }
}

describe('ett steg som aktören vägrar (#1056)', () => {
  it('sägs som ett ångra som inte gick, och tar inte över Bos cell', async () => {
    const line = slowFirstLine()
    try {
      const { ada, bo, close } = await pair()
      try {
        ada.setCell('dragon', 'title', 'Ada')
        await landed(ada)
        await eventually(() => expect(title(bo)).toBe('Ada'))
        line.hold()
        bo.setCell('dragon', 'title', 'Bo')
        await vi.waitFor(async () => expect((await run.projects.readEdits(run.projectId, 0)).length).toBe(2))

        expect(ada.undo()).toBe('undo.what.deck')
        await vi.waitFor(() => expect(line.held()).toBeGreaterThanOrEqual(2))
        line.release()
        await eventually(() => expect(ada.refusedStep).toEqual({ dir: 'undo', what: 'undo.what.deck' }))
        expect(ada.refusedEdits).toBe(0)
        expect(ada.canRedo).toBe(false)
        await eventually(() => expect(title(ada)).toBe('Bo'))
        expect(title(bo)).toBe('Bo')
        expect((await run.projects.readEdits(run.projectId, 0)).map((e) => e.intent.v)).toEqual(['setCell', 'setCell'])
      } finally {
        close()
      }
    } finally {
      line.done()
    }
  })

  // Kapplöpningen i #1070: Bos flytt av samma lager har landat hos aktören men inte hos Ada när hon
  // ångrar sin flytt. Aktören prövade förut bara att lagret steget lägger det efter fanns kvar, och
  // flyttade tillbaka det över Bos flytt.
  it('flyttar inte tillbaka ett lager över Bos flytt av det (#1070)', async () => {
    const line = slowFirstLine()
    const layers = (editor: ProjectClient) => editor.doc.template.faces['front']?.base.map((e) => e.id)
    try {
      const { ada, bo, close } = await pair()
      try {
        ada.moveElement('front', 'body', 0)
        await landed(ada)
        await eventually(() => expect(layers(bo)).toEqual(['body', 'frame', 'title']))
        line.hold()
        bo.moveElement('front', 'body', 1)
        await vi.waitFor(async () => expect((await run.projects.readEdits(run.projectId, 0)).length).toBe(2))

        expect(ada.undo()).toBe('undo.what.template')
        await vi.waitFor(() => expect(line.held()).toBeGreaterThanOrEqual(2))
        line.release()
        await eventually(() => expect(ada.refusedStep).toEqual({ dir: 'undo', what: 'undo.what.template' }))
        await eventually(() => expect(layers(ada)).toEqual(['frame', 'body', 'title']))
        expect(layers(bo)).toEqual(['frame', 'body', 'title'])
        expect((await run.projects.readEdits(run.projectId, 0)).map((e) => e.intent.v)).toEqual(['moveElement', 'moveElement'])
      } finally {
        close()
      }
    } finally {
      line.done()
    }
  })
})

// Ada tar bort ett kort med ett värde i en kolumn, Bo tar bort kolumnen, och Ada ångrar (#1072):
// kortet kommer tillbaka utan värdet, kolumnen kommer inte tillbaka för någon, och editorn vet vad
// som släpptes så att den kan säga det.
describe('ett kort som ångras tillbaka tar inte med sig en kolumn någon annan tagit bort (#1072)', () => {
  const dragon = (editor: ProjectClient) => editor.doc.rows.find((r) => r.id === 'dragon')
  const hasBody = (editor: ProjectClient) => editor.doc.rows.some((r) => 'body' in r.fields) || (editor.doc.template.faces['front']?.base ?? []).some((e) => 'bind' in e && 'field' in e.bind && e.bind.field === 'body')

  it('lägger tillbaka kortet utan värdet, hos båda och i loggen, och säger vad som släpptes', async () => {
    const { ada, bo, close } = await pair()
    try {
      ada.removeRow('dragon')
      await landed(ada)
      await eventually(() => expect(dragon(bo)).toBeUndefined())
      bo.removeField('body')
      await eventually(() => expect(hasBody(ada)).toBe(false))

      expect(ada.undo()).toBe('undo.what.deck')
      expect(ada.droppedStep).toEqual({ dir: 'undo', fields: ['body'] })
      expect(ada.droppedSteps).toBe(1)
      await landed(ada)
      for (const editor of [ada, bo]) {
        await eventually(() => expect(dragon(editor)).toEqual({ id: 'dragon', fields: { title: 'Drake', antal: 2 } }))
        expect(hasBody(editor)).toBe(false)
      }
      expect(JSON.stringify((await run.projects.readEdits(run.projectId, 0)).at(-1)?.intent)).not.toContain('Flygande.')
    } finally {
      close()
    }
  })

  // Kapplöpningen: Bos borttagning av kolumnen har landat hos aktören men inte hos Ada när hon
  // ångrar. Hon ser kolumnen stå kvar och skickar värdet med; aktören släpper det, och editorn säger
  // det när ekot visar vad aktören skrev.
  it('släpper värdet hos aktören när Bos borttagning hann före, och säger det', async () => {
    const line = slowFirstLine()
    try {
      const { ada, bo, close } = await pair()
      try {
        ada.removeRow('dragon')
        await landed(ada)
        await eventually(() => expect(dragon(bo)).toBeUndefined())
        line.hold()
        bo.removeField('body')
        await vi.waitFor(async () => expect((await run.projects.readEdits(run.projectId, 0)).length).toBe(2))

        expect(ada.undo()).toBe('undo.what.deck')
        expect(ada.droppedSteps).toBe(0)
        await vi.waitFor(() => expect(line.held()).toBeGreaterThanOrEqual(2))
        line.release()
        await eventually(() => expect(ada.droppedStep).toEqual({ dir: 'undo', fields: ['body'] }))
        expect(ada.refusedSteps).toBe(0)
        for (const editor of [ada, bo]) {
          await eventually(() => expect(dragon(editor)).toEqual({ id: 'dragon', fields: { title: 'Drake', antal: 2 } }))
          expect(hasBody(editor)).toBe(false)
        }
      } finally {
        close()
      }
    } finally {
      line.done()
    }
  })
})

// Ada byter namn på en kolumn mallen inte ritar, Bo tar bort den under det nya namnet, och Ada ångrar
// (#1076): värdena kom tillbaka under det gamla namnet, och Bos borttagna kolumn stod i leken igen.
// Det steget ska ta tillbaka finns inte längre, så det vägras — i editorn, och hos aktören när Bos
// borttagning hann före.
describe('ett namnbyte på en kolumn någon annan har tagit bort tas inte tillbaka (#1076)', () => {
  const columns = (editor: ProjectClient) => [...new Set(editor.doc.rows.flatMap((r) => Object.keys(r.fields)))]
  const last = async () => (await run.projects.readEdits(run.projectId, 0)).at(-1)?.intent.v
  async function renamed(ada: ProjectClient, bo: ProjectClient): Promise<void> {
    ada.addField('kraft')
    ada.setCell('dragon', 'kraft', '3')
    ada.renameField('kraft', 'styrka')
    await landed(ada)
    await eventually(() => expect(columns(bo)).toContain('styrka'))
  }

  it('vägrar i editorn när Bos borttagning har landat, och kolumnen kommer inte tillbaka', async () => {
    const { ada, bo, close } = await pair()
    try {
      await renamed(ada, bo)
      bo.removeField('styrka')
      await eventually(() => expect(columns(ada)).not.toContain('styrka'))

      expect(ada.undo()).toBeNull()
      expect(ada.refusedStep).toEqual({ dir: 'undo', what: 'undo.what.field' })
      for (const editor of [ada, bo]) expect(columns(editor)).toEqual(['title', 'body', 'antal'])
      expect(await last()).toBe('removeField')
    } finally {
      close()
    }
  })

  it('vägras hos aktören när Bos borttagning hann före, och sägs som ett ångra som inte gick', async () => {
    const line = slowFirstLine()
    try {
      const { ada, bo, close } = await pair()
      try {
        await renamed(ada, bo)
        line.hold()
        bo.removeField('styrka')
        await vi.waitFor(async () => expect(await last()).toBe('removeField'))

        expect(ada.undo()).toBe('undo.what.field')
        await vi.waitFor(() => expect(line.held()).toBeGreaterThanOrEqual(2))
        line.release()
        await eventually(() => expect(ada.refusedStep).toEqual({ dir: 'undo', what: 'undo.what.field' }))
        for (const editor of [ada, bo]) await eventually(() => expect(columns(editor)).toEqual(['title', 'body', 'antal']))
        expect(await last()).toBe('removeField')
      } finally {
        close()
      }
    } finally {
      line.done()
    }
  })
})
