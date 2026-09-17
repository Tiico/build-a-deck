// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { EditorPage } from '../src/editor/EditorPage.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { ProjectClient } from '../src/editor/ProjectClient.js'
import type { VersionChange } from '@byd/server/doc'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

// A project with a history: three saves, the middle one worth naming.
async function withHistory(): Promise<void> {
  const doc = projectDoc()
  await run.projects.create(run.projectId, doc)
  const second = structuredClone(doc)
  second.rows[0]!.fields['title'] = 'Drakhona'
  await run.projects.replace(run.projectId, 1, second)
  const third = structuredClone(second)
  third.rows.push({ id: 'troll', fields: { title: 'Troll', antal: 1 } })
  await run.projects.replace(run.projectId, 2, third)
}

async function openEditor(): Promise<void> {
  // The fixture says it is answering by answering, not by a word of the project's turning up on
  // the screen (#149) — and this project is renamed in one of its own versions, so a word from it
  // is not even a fact about the editor. What is waited for afterwards is the editor's own chrome.
  await run.answering()
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  render(<EditorPage />)
  await screen.findByRole('button', { name: /rev \d/ })
}

describe('the project\'s history in the editor (B4)', () => {
  it('opens from the revision, lists the versions newest first with when they were, and closes again', async () => {
    await withHistory()
    await openEditor()
    expect(screen.queryByRole('dialog', { name: 'Historik' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /rev 3/ }))
    const panel = await screen.findByRole('dialog', { name: 'Historik' })
    const rows = await within(panel).findAllByRole('listitem')
    expect(rows).toHaveLength(3)
    expect(rows.map((r) => r.getAttribute('data-rev'))).toEqual(['3', '2', '1'])
    expect(rows[0]!.textContent).toContain('Version 3')
    // The day is a heading over the rows now (#177); the row itself carries the clock.
    expect(rows[0]!.textContent).toMatch(/\d\d[:.]\d\d/)
    // The version the editor stands on says so.
    expect(rows[0]!.getAttribute('data-current')).toBe('true')

    fireEvent.click(within(panel).getByRole('button', { name: 'Stäng historiken' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Historik' })).toBeNull())
  })

  it('says what a version changed when it is opened, in words rather than as a patch', async () => {
    await withHistory()
    await openEditor()
    fireEvent.click(screen.getByRole('button', { name: /rev 3/ }))
    const panel = await screen.findByRole('dialog', { name: 'Historik' })

    fireEvent.click(await within(panel).findByRole('button', { name: /Version 2/ }))
    expect(await within(panel).findByText(/1 ändrade/)).toBeTruthy()
    fireEvent.click(await within(panel).findByRole('button', { name: /Version 3/ }))
    expect(await within(panel).findByText(/1 nya kort/)).toBeTruthy()
  })

  it('names a version and takes the name back, without changing the game', async () => {
    await withHistory()
    await openEditor()
    fireEvent.click(screen.getByRole('button', { name: /rev 3/ }))
    const panel = await screen.findByRole('dialog', { name: 'Historik' })

    fireEvent.click(await within(panel).findByRole('button', { name: /Version 2/ }))
    const field = await within(panel).findByLabelText('Namn på version 2')
    fireEvent.change(field, { target: { value: 'Första blindtestet' } })
    fireEvent.blur(field)
    await waitFor(async () => expect((await run.projects.versions(run.projectId)).find((v) => v.rev === 2)?.label).toBe('Första blindtestet'))
    expect(await within(panel).findByText('Första blindtestet')).toBeTruthy()
    // The document did not move: naming is not an edit.
    expect((await run.projects.load(run.projectId))?.rev).toBe(3)
  })

  it('brings an older version back as an edit, which becomes the next version when saved', async () => {
    await withHistory()
    await openEditor()
    fireEvent.click(screen.getByRole('button', { name: /rev 3/ }))
    const panel = await screen.findByRole('dialog', { name: 'Historik' })

    fireEvent.click(await within(panel).findByRole('button', { name: /Version 1/ }))
    fireEvent.click(await within(panel).findByRole('button', { name: 'Återställ version 1' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Historik' })).toBeNull())
    // The card is as it was in version 1, and the change is unsaved.
    expect(await screen.findByText('Drake')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Spara' }))
    await waitFor(async () => expect((await run.projects.load(run.projectId))?.rev).toBe(4))
    const stored = await run.projects.load(run.projectId)
    expect(stored?.rows.find((r) => r.id === 'dragon')?.fields['title']).toBe('Drake')
    // Nothing that came before was rewritten.
    expect((await run.projects.at(run.projectId, 3))?.rows.find((r) => r.id === 'dragon')?.fields['title']).toBe('Drakhona')
  })
})

// A designer scanning her own history (#177). Fifteen rows that all said `Version N · i dag` were
// a list of timestamps and not a record of work: the only way to find the save where the duel
// cards changed was to open all fifteen. So the row says it without being opened.
describe('a row in the history says what its save changed (#177)', () => {
  // Three saves that are three different kinds of work, which is exactly what the old panel could
  // not tell apart: cards written, a card added and the template moved, and a save that touched
  // nothing about the game at all.
  async function threeKindsOfWork(): Promise<void> {
    const doc = projectDoc()
    await run.projects.create(run.projectId, doc)
    const written = structuredClone(doc)
    written.rows[0]!.fields['title'] = 'Drakhona'
    written.rows[1]!.fields['title'] = 'Riddarinna'
    await run.projects.replace(run.projectId, 1, written)
    const bigger = structuredClone(written)
    bigger.rows.push({ id: 'troll', fields: { title: 'Troll', antal: 1 } })
    bigger.template = { faces: { ...bigger.template.faces, back: { base: [], variants: {} } } }
    bigger.rules = { title: 'Så spelas det', blocks: [] }
    await run.projects.replace(run.projectId, 2, bigger)
    const renamedOnly = structuredClone(bigger)
    renamedOnly.name = 'Skogens andar'
    await run.projects.replace(run.projectId, 3, renamedOnly)
  }

  it('says how many cards moved and which parts were touched, without a row being opened', async () => {
    await threeKindsOfWork()
    await openEditor()
    fireEvent.click(screen.getByRole('button', { name: /rev 4/ }))
    const panel = await screen.findByRole('dialog', { name: 'Historik' })

    const row = (rev: number) => panel.querySelector(`[data-rev="${rev}"]`) as HTMLElement
    // Two cards rewritten.
    await waitFor(() => expect(row(2).textContent).toContain('2 ändrade'))
    // A card added, and two parts of the game that are not cards moved — a chip each, in words.
    expect(row(3).textContent).toContain('1 nytt kort')
    expect(within(row(3)).getByText('mallen')).toBeTruthy()
    expect(within(row(3)).getByText('reglerna')).toBeTruthy()
    // And the one that only renamed the game says that, rather than reading as an empty save.
    expect(row(4).textContent).toContain('Skogens andar')
  })

  // A save the history has no word for is still a save (#177). `diffProjects` looks at the cards,
  // the two orders, the name, the template, the setup, the rules and the symbols — and at none of
  // `palette`, `framing` or `fonts`, which the editor writes every time a picture is nudged in its
  // frame (E1) or a font is swapped (B3). A byte-identical document is refused a version, so such a
  // save really did change the game; the row must not tell the designer that nothing happened.
  it('says a save it has no word for as something changed, never as nothing changed', async () => {
    const doc = projectDoc()
    await run.projects.create(run.projectId, doc)
    const nudged = structuredClone(doc)
    nudged.framing = { 'dragon/body': { zoom: 1.4 } }
    expect(await run.projects.replace(run.projectId, 1, nudged)).toMatchObject({ rev: 2 })
    await openEditor()

    fireEvent.click(screen.getByRole('button', { name: /rev 2/ }))
    const panel = await screen.findByRole('dialog', { name: 'Historik' })
    await within(panel).findAllByRole('listitem')
    const row = panel.querySelector('[data-rev="2"]') as HTMLElement
    const times = (text: string) => (row.textContent ?? '').split(text).length - 1
    await waitFor(() => expect(times('Annat ändrat.')).toBe(1))
    expect(panel.textContent).not.toContain('Inget ändrat')
    // And the ear hears what the eye reads, here as in every other row.
    expect(within(row).getByRole('button', { name: /Annat ändrat\./ })).toBeTruthy()

    // The same is true one click in: the opened version is the one before it and the one after it,
    // which are never the same document either.
    fireEvent.click(within(row).getByRole('button', { name: /Version 2/ }))
    await waitFor(() => expect(times('Annat ändrat.')).toBe(2))
    expect(panel.textContent).not.toContain('Inget ändrat')
  })

  it('groups the versions under the day they were made, and never says "i dag" as the whole time', async () => {
    await threeKindsOfWork()
    await openEditor()
    fireEvent.click(screen.getByRole('button', { name: /rev 4/ }))
    const panel = await screen.findByRole('dialog', { name: 'Historik' })

    expect(await within(panel).findByRole('heading', { name: 'I dag', level: 3 })).toBeTruthy()
    // The clock is in the row; the day is over it.
    const rows = within(panel).getAllByRole('listitem')
    expect(rows.every((r) => /\d\d[:.]\d\d/.test(r.textContent ?? ''))).toBe(true)
    expect(panel.textContent).not.toMatch(/i dag/)
  })

  // A screen reader gets the chips as sentences, because a short word in a coloured pill is not
  // something a reader who hears the row can make anything of (L12).
  it('names the whole row for a reader who hears it, chips spelled out', async () => {
    await threeKindsOfWork()
    await openEditor()
    fireEvent.click(screen.getByRole('button', { name: /rev 4/ }))
    const panel = await screen.findByRole('dialog', { name: 'Historik' })

    await waitFor(() => expect(within(panel).getByRole('button', { name: /mallen ändrad/ })).toBeTruthy())
    const opener = within(panel).getByRole('button', { name: /mallen ändrad/ })
    expect(opener.getAttribute('aria-label')).toContain('reglerna ändrade')
    expect(opener.getAttribute('aria-label')).toContain('1 nytt kort')
    // What the eye reads is in what the ear hears: the visible chip word is part of the name.
    expect(opener.getAttribute('aria-label')).toContain('mallen')
  })

  // The panel opens on the list; the summaries come after. A history of a year must not be a
  // second of white before anything is drawn, and the rows must not move when they land.
  it('draws the rows before the summaries come back, into the line the summary will fill', async () => {
    await threeKindsOfWork()
    let land: (changes: VersionChange[]) => void = () => undefined
    const spy = vi.spyOn(ProjectClient.prototype, 'changes').mockReturnValue(new Promise<VersionChange[]>((resolve) => (land = resolve)))
    try {
      await openEditor()
      fireEvent.click(screen.getByRole('button', { name: /rev 4/ }))
      const panel = await screen.findByRole('dialog', { name: 'Historik' })
      const waiting = await within(panel).findAllByRole('listitem')
      expect(waiting.map((r) => r.getAttribute('data-rev'))).toEqual(['4', '3', '2', '1'])
      // The line the summary will land in is already drawn, so nothing under it moves later.
      expect(waiting.every((r) => r.querySelector('[data-said]') !== null)).toBe(true)
      // And the row does not guess meanwhile: an empty line is honest, and a word about a change
      // nobody has told it about yet would not be.
      expect(panel.textContent).not.toContain('Inget ändrat')
      expect(panel.textContent).not.toContain('Annat ändrat')

      land([{ rev: 4, added: 0, removed: 0, changed: 0, parts: [], reordered: false, columns: false, renamed: 'Skogens andar' }])
      await waitFor(() => expect(panel.querySelector('[data-rev="4"]')!.textContent).toContain('Skogens andar'))
      // The same rows, in the same order: the list was filled in, not built again.
      expect(within(panel).getAllByRole('listitem').map((r) => r.getAttribute('data-rev'))).toEqual(['4', '3', '2', '1'])
    } finally {
      spy.mockRestore()
    }
  })
})

describe('holding the table against an older version (B4)', () => {
  it('starts the comparison from the history, opens the table on it, and lets it go again', async () => {
    await withHistory()
    await openEditor()
    fireEvent.click(screen.getByRole('button', { name: /rev 3/ }))
    const panel = await screen.findByRole('dialog', { name: 'Historik' })
    fireEvent.click(await within(panel).findByRole('button', { name: /Version 1/ }))
    fireEvent.click(await within(panel).findByRole('button', { name: 'Jämför version 1 i tabellen' }))

    // The table opens, holding what is on screen against that version.
    await waitFor(() => expect(document.querySelector('[data-mode]')!.getAttribute('data-mode')).toBe('table'))
    expect(await screen.findByText(/Jämför med version 1/)).toBeTruthy()
    const dragon = document.querySelector('[data-card-ref="dragon"]')!
    expect(dragon.getAttribute('data-change')).toBe('changed')
    expect(within(dragon as HTMLElement).getByText('Drake', { selector: 's' })).toBeTruthy()
    expect(document.querySelector('[data-card-ref="troll"]')!.getAttribute('data-change')).toBe('added')

    fireEvent.click(screen.getByRole('button', { name: 'Sluta jämföra' }))
    await waitFor(() => expect(screen.queryByText(/Jämför med version/)).toBeNull())
    expect(document.querySelector('[data-card-ref="dragon"]')!.getAttribute('data-change')).toBeNull()
  })
})
