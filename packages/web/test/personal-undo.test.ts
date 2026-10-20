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
describe('ett steg som aktören vägrar (#1056)', () => {
  it('sägs som ett ångra som inte gick, och tar inte över Bos cell', async () => {
    // Det aktören säger till den första editorn kan hållas kvar: en långsam linje.
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
    try {
      const { ada, bo, close } = await pair()
      try {
        ada.setCell('dragon', 'title', 'Ada')
        await landed(ada)
        await eventually(() => expect(title(bo)).toBe('Ada'))
        holding = true
        bo.setCell('dragon', 'title', 'Bo')
        await vi.waitFor(async () => expect((await run.projects.readEdits(run.projectId, 0)).length).toBe(2))

        expect(ada.undo()).toBe('undo.what.deck')
        await vi.waitFor(() => expect(held.length).toBeGreaterThanOrEqual(2))
        holding = false
        for (const message of held.splice(0)) message()
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
      setEditSocketImplementation(EditSocket as unknown as EditSocketCtor)
    }
  })
})
