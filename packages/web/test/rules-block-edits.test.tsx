// @vitest-environment jsdom
// Every edit the Regler tab makes names the blocks it changes and no others (#1053, D3, B7). The tab
// wrote the whole book on every keystroke (`setRules`), so a co-editor's edit carried the book as she
// last saw it and wrote back over whatever had landed since. What lands in the actor's log is read
// here: a `spliceRules` naming only the blocks the designer touched, and never a whole book.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { EditorPage } from '../src/editor/EditorPage.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import type { EditIntent, RuleDoc } from '@byd/server'

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

const rules: RuleDoc = {
  title: 'Skogens herrar',
  blocks: [
    { kind: 'heading', id: 'h1', level: 1, text: 'Så spelar ni' },
    { kind: 'text', id: 't1', text: 'Dra ett kort.' },
    { kind: 'text', id: 't2', text: 'Spela ett kort.' },
    { kind: 'heading', id: 'h2', level: 1, text: 'Slutet' },
    { kind: 'text', id: 't3', text: 'Den som har flest poäng vinner.' },
  ],
}

async function openBook(book: RuleDoc | null = rules): Promise<void> {
  await run.projects.create(run.projectId, { ...projectDoc(), ...(book ? { rules: book } : {}) })
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
  await userEvent.click(screen.getByRole('tab', { name: 'Regler' }))
}
const page = () => document.querySelector('[data-rulebook]') as HTMLElement
const adding = () => within(document.querySelector('.byd-rules-bar') as HTMLElement).getByRole('group', { name: 'Lägg till' })
type Splice = Extract<EditIntent, { v: 'spliceRules' }>
// What the actor logged, read once it has logged as many as the press made.
async function logged(n: number): Promise<EditIntent[]> {
  let intents: EditIntent[] = []
  await waitFor(async () => {
    intents = (await run.projects.readEdits(run.projectId, 0)).map((e) => e.intent)
    expect(intents.length).toBeGreaterThanOrEqual(n)
  })
  return intents
}
// What an edit names, in a form a test can hold: which blocks it replaced, where it laid new ones,
// and the ids of what it laid.
const named = (intent: EditIntent) => {
  expect(intent.v).toBe('spliceRules')
  const splice = intent as Splice
  return { replace: splice.replace, after: splice.after, blocks: splice.blocks.map((b) => b.id) }
}

describe('the Regler tab writes only the blocks it touches (#1053)', () => {
  it('writes the paragraph being typed in, and no other block', async () => {
    const user = userEvent.setup()
    await openBook()
    await user.click(within(page()).getByText('Dra ett kort.'))
    const field = within(page()).getByRole('textbox', { name: /^Text/ })
    await user.clear(field)
    await user.type(field, 'Lägg')
    await user.keyboard('{Escape}')
    const intents = await logged(5)
    for (const intent of intents) expect(named(intent)).toEqual({ replace: ['t1'], after: null, blocks: ['t1'] })
    expect((intents.at(-1) as Splice).blocks).toEqual([{ kind: 'text', id: 't1', text: 'Lägg' }])
  })

  it('writes the block made a list, and no other', async () => {
    const user = userEvent.setup()
    await openBook()
    await user.click(within(page()).getByText('Spela ett kort.'))
    await user.click(within(page()).getByRole('button', { name: 'Punktlista' }))
    const [made] = await logged(1)
    expect(named(made!)).toEqual({ replace: ['t2'], after: null, blocks: ['t2'] })
    expect((made as Splice).blocks).toEqual([{ kind: 'list', id: 't2', ordered: false, items: ['Spela ett kort.'] }])
  })

  // Adding lays after the block last written in (#1258), so the paragraph is opened and left first;
  // leaving it untouched writes nothing.
  it('lays a new block where it is added, and touches nothing beside it', async () => {
    const user = userEvent.setup()
    await openBook()
    await user.click(within(page()).getByText('Dra ett kort.'))
    await user.keyboard('{Escape}')
    await user.click(within(adding()).getByRole('button', { name: '＋ Text' }))
    const [added] = await logged(1)
    expect(named(added!)).toMatchObject({ replace: [], after: 't1' })
    expect((added as Splice).blocks).toHaveLength(1)
  })

  it('takes away only the block removed, or the section a heading heads', async () => {
    const user = userEvent.setup()
    await openBook()
    await user.click(within(page()).getByText('Spela ett kort.'))
    await user.click(within(page()).getByRole('button', { name: 'Ta bort stycket' }))
    await user.click(within(page()).getByRole('button', { name: 'Slutet' }))
    await user.click(within(page()).getByRole('button', { name: 'Ta bort avsnittet' }))
    const intents = await logged(2)
    expect(intents.map(named)).toEqual([
      { replace: ['t2'], after: null, blocks: [] },
      { replace: ['h2', 't3'], after: null, blocks: [] },
    ])
  })

  // Before any block has been written in, the row lays at the end of the book (#1258).
  it('lays a section of the designer’s own after the last block she saw', async () => {
    const user = userEvent.setup()
    await openBook()
    await user.click(within(adding()).getByRole('button', { name: '＋ Avsnitt' }))
    const [added] = await logged(1)
    expect(named(added!)).toMatchObject({ replace: [], after: 't3' })
    expect((added as Splice).blocks.map((b) => b.kind)).toEqual(['heading', 'text'])
  })

  it('starts a book where there was none without writing over one a co-editor started', async () => {
    const user = userEvent.setup()
    await openBook(null)
    await user.click(await screen.findByRole('button', { name: /^Ett tomt blad/ }))
    const [started] = await logged(1)
    expect(named(started!)).toMatchObject({ replace: [], after: null })
    expect((started as Splice).title).toBe('Skogens herrar')
  })
})
