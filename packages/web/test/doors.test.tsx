// @vitest-environment jsdom
// Which way out one press of Escape takes, when the editor has more than one door open (#152).
//
// The editor grew two doors a week apart and neither knew about the other: one out of a panel
// standing over the work (#133), one out of a drag the hand has not let go of (#142). Both listen
// on the document, because the press arrives wherever the focus happens to be standing and during
// a drag that is nowhere near what is being dragged — so both hear every press, and something has
// to say which of them it belongs to.
//
// What was saying it was the order the browser had registered them in, which is the order they
// mounted in, which is the order the designer happened to do things in. A panel opened and then a
// drag begun — the ordinary way round, and the only one a single hand can do — gave one press two
// answers: the drag went back and the panel closed behind it. The same two doors the other way
// round gave the drag alone. Nobody chose either of those.
//
// So the question is asked twice here, in both orders, and one answer is demanded of both: the
// drag, alone. A hand in the middle of a drag is asking about the drag; a panel over the work is
// not what it reached for Escape to close. An order that holds in both orders is an order, and
// the press that goes through the wrong door is the whole of the bug.
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { EditorPage } from '../src/editor/EditorPage.js'
import { StatusLive } from '../src/status/StatusLive.js'
import { useDoor, type Doorway } from '../src/doors.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

describe('the editor’s two doors on one press of Escape (#152)', () => {
  let run: Running
  beforeEach(async () => {
    run = await startServer()
    await run.projects.create(run.projectId, projectDoc())
  })
  afterEach(async () => {
    await run.stop()
  })

  // What the table says this column's width is, on the column itself — the same fact the
  // measurement reads, and the only one that says whether a pull was taken back.
  const set = (field: string) => (document.querySelector(`col[data-col="${field}"]`) as HTMLElement | null)?.getAttribute('data-width') ?? null
  const grip = (field: string) => document.querySelector(`thead th[data-col="${field}"] .byd-data-pull`) as HTMLElement | null

  async function openTable(): Promise<void> {
    history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
    render(
      <StatusLive>
        <EditorPage />
      </StatusLive>,
    )
    await screen.findByText('Skogens herrar')
    fireEvent.click(screen.getByRole('tab', { name: 'Tabell' }))
    await waitFor(() => expect(grip('body')).not.toBeNull())
  }

  // The panel over the work: the project's history, opened from the revision in the header.
  async function openPanel(): Promise<void> {
    fireEvent.click(screen.getByRole('button', { name: /rev 1/ }))
    await screen.findByRole('dialog', { name: 'Historik' })
  }

  // The drag under the hand: a column's edge pressed and moved, with no release. Both halves of
  // the pull are the heading's own, so nothing above the table hears the press that began it —
  // which is why the panel is still standing when Escape arrives.
  function beginPull(): void {
    const at = grip('body')!
    fireEvent.pointerDown(at, { pointerId: 1, button: 0, clientX: 0 })
    fireEvent.pointerMove(at, { pointerId: 1, clientX: 200 })
  }

  const orders: [string, (() => Promise<void> | void)[]][] = [
    ['the panel opened first and the drag begun over it', [openPanel, beginPull]],
    ['the drag begun first and the panel opened over it', [beginPull, openPanel]],
  ]

  it.each(orders)('takes the drag back and leaves the panel standing, with %s', async (_order, steps) => {
    await openTable()
    for (const step of steps) await step()
    expect(set('body')).toBe('200')

    fireEvent.keyDown(document, { key: 'Escape' })

    // The drag is what the hand was asking about, so the column goes back to the width it was
    // being measured at before the edge was taken hold of.
    expect(set('body')).toBeNull()
    // And the panel is not: it was standing before the hand came down and it is standing after.
    expect(screen.getByRole('dialog', { name: 'Historik' })).toBeTruthy()
  })
})

// The order written down once, so the next door written inherits it instead of having to know
// what is already open. A door says what it is a way out of and nothing else — no door names
// another door, and none of them counts the listeners on the document.
describe('a door written knowing nothing about the doors already open', () => {
  function Door({ doorway, onEscape }: { doorway: Doorway; onEscape(): void }) {
    useDoor(doorway, onEscape)
    return null
  }

  it('answers before the doors that stand over the work, and after the hand lets go gives them the press back', () => {
    const held = vi.fn()
    const first = vi.fn()
    const second = vi.fn()
    function Doors() {
      const [holding, setHolding] = useState(true)
      return (
        <>
          <Door doorway="standing" onEscape={first} />
          <Door doorway="standing" onEscape={second} />
          {holding && <Door doorway="held" onEscape={held} />}
          <button type="button" onClick={() => setHolding(false)}>släpp</button>
        </>
      )
    }
    render(<Doors />)

    // Something held under the hand is nearer than anything standing over the work, whichever
    // opened first.
    fireEvent.keyDown(document, { key: 'Escape' })
    expect([held.mock.calls.length, first.mock.calls.length, second.mock.calls.length]).toEqual([1, 0, 0])

    fireEvent.click(screen.getByRole('button', { name: 'släpp' }))
    // With the hand empty the press belongs to the last thing opened over the work, and to it
    // alone: one press is one way out.
    fireEvent.keyDown(document, { key: 'Escape' })
    expect([held.mock.calls.length, first.mock.calls.length, second.mock.calls.length]).toEqual([1, 0, 1])
  })

  it('opens in the other order and is answered the same way', () => {
    const held = vi.fn()
    const standing = vi.fn()
    render(
      <>
        <Door doorway="held" onEscape={held} />
        <Door doorway="standing" onEscape={standing} />
      </>,
    )

    fireEvent.keyDown(document, { key: 'Escape' })
    expect([held.mock.calls.length, standing.mock.calls.length]).toEqual([1, 0])
  })

  it('leaves the press alone when a surface below has already answered it, and when no door is open', () => {
    const answered = vi.fn()
    const { unmount } = render(<Door doorway="standing" onEscape={answered} />)

    // A door hung on a subtree answers inside React, which is below the document; a press it has
    // already refused is not a press this can answer again.
    const already = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true, bubbles: true })
    already.preventDefault()
    document.dispatchEvent(already)
    expect(answered).not.toHaveBeenCalled()

    unmount()
    const alone = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true, bubbles: true })
    document.dispatchEvent(alone)
    // Nothing to leave, so nothing is taken from anything else that may be listening.
    expect(alone.defaultPrevented).toBe(false)
  })
})
