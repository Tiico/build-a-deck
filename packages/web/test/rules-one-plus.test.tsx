// @vitest-environment jsdom
// One ＋ instead of one per gap (#216, decided 2026-09-21: «A · i marginalen», prototype
// `docs/ux-audits/2026-09-18/prototyper/06-ett-plus.html`).
//
// The book used to draw a ＋ beside every block — ten of them in a book of ten — and the owner
// asked for fewer. What was decided is a single ＋ that follows the block the pointer or the
// focus is on, standing in the right margin where the old one stood.
//
// «Or the focus» is the half that has to be measured rather than trusted. A way in that exists
// only under a pointer does not exist for a keyboard or a thumb, which is the fault #184 took out
// of this very control; a decision that brings a follower ＋ back must not bring that with it. So
// every claim below is asked of the page: where the ＋ is, what it is called, what it does, and
// that a keyboard reaches every gap the book has — the one before the first block included.
//
// What it looks like is `rules-layout`'s, in a real engine: one ＋ on the screen, a target of at
// least `--byd-tap`, and the sliver of the block's own click area it reaches into.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { EditorPage } from '../src/editor/EditorPage.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import type { RuleDoc } from '@byd/server'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

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
    { kind: 'text', id: 't1', text: 'Dra ett kort ur högen.' },
    { kind: 'text', id: 't2', text: 'Lägg det framför dig.' },
    { kind: 'list', id: 'l1', ordered: true, items: ['Dra.', 'Spela ut.'] },
  ],
}

async function openBook(): Promise<void> {
  await run.projects.create(run.projectId, { ...projectDoc(), rules })
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
  fireEvent.click(screen.getByRole('tab', { name: 'Regler' }))
  await within(book()).findByText('Dra ett kort ur högen.')
}

const book = () => document.querySelector('[data-rulebook]') as HTMLElement
const blockOf = (id: string) => book().querySelector(`[data-block="${id}"]`) as HTMLElement
const plusses = () => [...book().querySelectorAll<HTMLElement>('.byd-rules-add')]
const plus = () => plusses()[0]!
const says = () => plus().getAttribute('aria-label')

describe('the one ＋ the book draws (#216)', () => {
  it('draws a single ＋ however many blocks the book has, resting in the gap before the first', async () => {
    await openBook()
    expect(book().querySelectorAll('[data-block]').length).toBeGreaterThan(3)
    expect(plusses()).toHaveLength(1)
    // Where it rests is the first gap, which a book of blocks-with-a-＋-after-them has no other
    // way to reach: it is the ＋ a hand meets before it has pointed at anything, and the first
    // stop a Tab into the book lands on.
    expect(says()).toBe('Lägg till först')
    expect(plus().compareDocumentPosition(blockOf('h1')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('follows the pointer from block to block, and goes home when the pointer leaves the book', async () => {
    await openBook()
    fireEvent.pointerOver(blockOf('t1').querySelector('[role="button"]')!)
    await waitFor(() => expect(says()).toBe('Lägg till efter t1'))
    expect(plusses()).toHaveLength(1)
    expect(blockOf('t1').contains(plus())).toBe(true)
    fireEvent.pointerOver(blockOf('l1').querySelector('[role="button"]')!)
    await waitFor(() => expect(says()).toBe('Lägg till efter l1'))
    expect(blockOf('t1').contains(plus())).toBe(false)
    // The title is not a block and not nothing either: it is the first gap, and the ＋ goes there
    // rather than staying where the hand last was.
    fireEvent.pointerOver(within(book()).getByRole('heading', { name: 'Skogens herrar' }))
    await waitFor(() => expect(says()).toBe('Lägg till först'))
    fireEvent.pointerOver(blockOf('l1').querySelector('[role="button"]')!)
    await waitFor(() => expect(says()).toBe('Lägg till efter l1'))
    fireEvent.pointerLeave(book())
    await waitFor(() => expect(says()).toBe('Lägg till först'))
  })

  // The half a follower ＋ is most likely to lose, and the one #184 already had to put back.
  it('follows the focus too, and is the next stop after the block it stands at', async () => {
    await openBook()
    const handle = blockOf('t2').querySelector<HTMLElement>('[role="button"]')!
    handle.focus()
    await waitFor(() => expect(says()).toBe('Lägg till efter t2'))
    // Next in the tab order means next in the document: the block's own handle, then its ＋, then
    // the block after it. Nothing here sets `tabindex`, so the order is the order of the page.
    const stops = [...book().querySelectorAll<HTMLElement>('[role="button"], button')]
    expect(stops.indexOf(plus())).toBe(stops.indexOf(handle) + 1)
    expect(blockOf('t2').contains(plus())).toBe(true)
    // And the ＋ stands still while it is the thing that has the focus: a pointer drifting over a
    // neighbour must not take the button out from under a hand that has just reached it.
    plus().focus()
    fireEvent.pointerOver(blockOf('h1').querySelector('[role="button"]')!)
    await waitFor(() => expect(says()).toBe('Lägg till efter t2'))
    expect(document.activeElement).toBe(plus())
  })

  // What makes the first gap reachable a second time, and not only before anything was pointed
  // at: focus that leaves the book for something else puts the ＋ back where it rests, so the next
  // Tab into the book meets that gap again.
  it('goes home when the focus leaves the book for something outside it', async () => {
    await openBook()
    const handle = blockOf('t1').querySelector<HTMLElement>('[role="button"]')!
    handle.focus()
    await waitFor(() => expect(says()).toBe('Lägg till efter t1'))
    screen.getByRole('tab', { name: 'Kortvägg' }).focus()
    await waitFor(() => expect(says()).toBe('Lägg till först'))
    expect(plusses()).toHaveLength(1)
  })

  // Every gap is reachable, and reachable means a keyboard reaches it: the one before the first
  // block is the ＋'s resting place, and a Tab into the book lands on it before anything else.
  it('lays the new block in the gap the ＋ stands at, the one before the first block included', async () => {
    await openBook()
    const ids = () => [...book().querySelectorAll('[data-block]')].map((b) => b.getAttribute('data-block'))
    expect(ids()).toEqual(['h1', 't1', 't2', 'l1'])
    fireEvent.click(plus())
    await waitFor(() => expect(ids()).toHaveLength(5))
    expect(ids().slice(1)).toEqual(['h1', 't1', 't2', 'l1'])
    // The new block is opened where it landed, and the ＋ follows it there rather than staying in
    // a gap the book no longer has in the same place.
    const laid = ids()[0]!
    expect(await within(book()).findByLabelText(`Text ${laid}`)).toBeTruthy()
    await waitFor(() => expect(says()).toBe(`Lägg till efter ${laid}`))
  })

  it('lays it after the block it stands at, when it stands at one', async () => {
    await openBook()
    fireEvent.pointerOver(blockOf('t1').querySelector('[role="button"]')!)
    await waitFor(() => expect(says()).toBe('Lägg till efter t1'))
    fireEvent.click(plus())
    const ids = () => [...book().querySelectorAll('[data-block]')].map((b) => b.getAttribute('data-block'))
    await waitFor(() => expect(ids()).toHaveLength(5))
    expect(ids()[0]).toBe('h1')
    expect(ids()[1]).toBe('t1')
    expect(ids().slice(3)).toEqual(['t2', 'l1'])
  })

  // A book being read rather than written has no ＋ at all, resting place or not: a page that can
  // be typed into while it says what it is about to lose would be two things at once.
  it('draws no ＋ where the book is not being written in', async () => {
    await run.projects.create(run.otherProjectId, projectDoc())
    history.replaceState(null, '', `/editor?project=${run.otherProjectId}&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')
    fireEvent.click(screen.getByRole('tab', { name: 'Regler' }))
    await screen.findByRole('button', { name: 'Börja skriva reglerna' })
    expect(document.querySelectorAll('.byd-rules-add')).toHaveLength(0)
  })
})
