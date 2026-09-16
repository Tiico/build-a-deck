// @vitest-environment jsdom
// A width the designer sets herself (#46).
//
// The table measures every column against what stands in it, and that is the right answer almost
// always — it is the whole of #46 — but it is an answer about the deck and not about the person
// reading it. A designer working on the rules text wants `body` wide and does not care that `art`
// asked for the same room; the next one wants the opposite an hour later. So a column can be
// pulled to a width of its own, and what is pulled is held: that column takes exactly what it was
// given and neither gives to nor takes from the ones that share out the rest.
//
// It is a view of the project and never the project (L4), like the sort and the filter — which is
// what tells it apart from the order of the columns, and why it is remembered in the browser
// rather than written into the document.
//
// The width travels on the column's own `<col>`, where what a column is worth sizing like already
// travels, so the measurement needs to be told nothing it cannot read off the table. That is what
// this file reads: what the table declares. What comes out of it at real widths in a real engine
// is in `data-table-widths.test.tsx`, because jsdom lays nothing out and measures nothing.
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { applyEdit } from '@byd/server/doc'
import { DataTable } from '../src/editor/DataTable.js'
import { StatusLive } from '../src/status/StatusLive.js'
import { heldWidths } from '../src/editor/widths.js'
import type { ProjectDoc } from '../src/editor/types.js'
import { projectDoc } from './project-doc.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

function Editing({ project }: { project?: string | undefined }) {
  const [doc, setDoc] = useState<ProjectDoc>(projectDoc)
  return (
    <DataTable
      doc={doc}
      project={project}
      selectedRow={null}
      onSelectRow={() => undefined}
      onCell={() => undefined}
      onAddRow={() => undefined}
      onRemoveRow={() => undefined}
      onReplaceRows={(rows) => setDoc((current) => ({ ...current, rows }))}
      onAddField={(field) => setDoc((current) => applyEdit(current, { v: 'addField', field }))}
      onRemoveField={(field) => setDoc((current) => applyEdit(current, { v: 'removeField', field }))}
      onMoveField={() => undefined}
    />
  )
}

const head = (field: string) => document.querySelector(`thead th[data-col="${field}"]`) as HTMLElement
const name = (field: string) => head(field).querySelector('button') as HTMLButtonElement
const grip = (field: string) => head(field).querySelector('.byd-data-pull') as HTMLElement | null
// What the table says this column's width is, on the column itself — which is where the
// measurement reads it, so this is the same fact and not a second copy of it.
const set = (field: string) => (document.querySelector(`col[data-col="${field}"]`) as HTMLElement | null)?.getAttribute('data-width') ?? null
// What the table said out loud, in the region it says a width in.
const said = () => document.querySelector('[data-status-live="polite"]')?.textContent ?? ''

// A drag of the heading's edge, as a pointer really reports one.
function pull(field: string, by: number): void {
  const at = grip(field)!
  fireEvent.pointerDown(at, { pointerId: 1, button: 0, clientX: 0 })
  fireEvent.pointerMove(at, { pointerId: 1, clientX: by })
  fireEvent.pointerUp(at, { pointerId: 1, clientX: by })
}

beforeEach(() => localStorage.clear())

describe('a column pulled to a width of its own (#46)', () => {
  it("is pulled by its own heading, and only the designer's columns have an edge to pull", () => {
    render(<Editing />)

    // Every column of the deck can be pulled; the card's id is a machine key and `antal` is the
    // engine's own count, and neither is prose anybody reads at a width of her choosing (L4).
    expect(grip('title')).not.toBeNull()
    expect(grip('body')).not.toBeNull()
    expect(grip('id')).toBeNull()
    expect(grip('antal')).toBeNull()

    pull('body', 320)
    expect(set('body')).toBe('320')
    expect(set('title')).toBeNull()

    // And it is held: a width the designer set is not a width the next measurement may hand out
    // to somebody else. Another column is made, which is a new deck and a new measurement.
    fireEvent.click(screen.getByRole('button', { name: 'Kolumner' }))
    fireEvent.click(screen.getByRole('button', { name: 'Lägg till' }))
    expect(set('body')).toBe('320')
  })

  it('draws the table it will keep, on every frame the hand moves', () => {
    render(<Editing />)
    const at = grip('body')!
    fireEvent.pointerDown(at, { pointerId: 1, button: 0, clientX: 0 })
    fireEvent.pointerMove(at, { pointerId: 1, clientX: 200 })

    // What the hand is asking for is declared where the measurement reads it, and the measurement
    // is run — so the picture under the hand is the one the release keeps. A width written
    // straight onto the column instead is a picture nothing else agrees with: the table's own
    // width still says what the last measurement said, and under a fixed layout a table wider
    // than its columns hands the difference back out over all of them. The edge then lags the
    // hand on the way in, races it on the way out, and jumps when the hand lets go.
    expect(set('body')).toBe('200')

    fireEvent.pointerUp(at, { pointerId: 1, clientX: 200 })
    expect(set('body')).toBe('200')
  })

  it('is a width only where the hand really pulled one', () => {
    render(<Editing project="p1" />)
    const at = grip('body')!

    // A press and a release in the same place is a click on the edge and not a pull of it. It
    // used to freeze the column at whatever the measurement had just handed it — and silently,
    // since a column that has stopped following its deck looks exactly like one that still
    // does — so an aimed-at heading could stop answering its own values for good.
    fireEvent.pointerDown(at, { pointerId: 1, button: 0, clientX: 40 })
    fireEvent.pointerUp(at, { pointerId: 1, clientX: 40 })
    expect(set('body')).toBeNull()
    expect(heldWidths('p1')).toEqual({})

    // Nor is a hand that slid two pixels while it was letting go.
    fireEvent.pointerDown(at, { pointerId: 1, button: 0, clientX: 40 })
    fireEvent.pointerMove(at, { pointerId: 1, clientX: 42 })
    fireEvent.pointerUp(at, { pointerId: 1, clientX: 42 })
    expect(set('body')).toBeNull()
    expect(heldWidths('p1')).toEqual({})

    // And a pull is a pull from the first pixel past that, at the width the hand asked for and
    // not at the width it had crossed the threshold with.
    pull('body', 120)
    expect(set('body')).toBe('120')
  })

  it('refuses the press the browser would carry the whole column off by', () => {
    render(<Editing />)
    // The edge stands inside a heading that is `draggable`, and starting a drag is the default
    // action of a press: measured in Chromium, a press on the edge of a static heading fires
    // `dragstart` on the heading. So the press's default is refused here — and it has to be the
    // mouse's press, because for a mouse the drag does not hang from the pointer event. Without
    // this, every pull in the width was also a drag in the order.
    const down = fireEvent.mouseDown(grip('body')!, { button: 0, clientX: 0 })
    expect(down).toBe(false)
  })

  it('never goes under a fingertip, however far the hand carries on', () => {
    render(<Editing />)
    pull('body', -400)
    // 44 px is what the editor declares a target to be, and a column narrower than that is not a
    // width the designer chose — it is a column being thrown away by a hand that slipped.
    expect(set('body')).toBe('44')
  })

  it('gives the column back to the measurement when the edge is asked twice', () => {
    render(<Editing />)
    pull('title', 300)
    expect(set('title')).toBe('300')

    fireEvent.doubleClick(grip('title')!)
    // Nothing on the column, which is how the measurement is told to answer for it again.
    expect(set('title')).toBeNull()
  })

  it('is pullable from the keyboard too, so a width is not a drag away only', async () => {
    const user = userEvent.setup()
    render(<Editing />)
    name('body').focus()

    // From a width it already has, so what is measured is the step and not the browser: jsdom lays
    // nothing out, and a column it has never drawn is nought pixels wide to it.
    pull('body', 200)

    // Alt and Shift with an arrow, beside the Alt alone that moves the column: the same hand, the
    // same two keys, and the two things a heading can do to the column it names.
    await user.keyboard('{Alt>}{Shift>}{ArrowRight}{/Shift}{/Alt}')
    expect(set('body')).toBe('216')
    await user.keyboard('{Alt>}{Shift>}{ArrowLeft}{/Shift}{/Alt}')
    expect(set('body')).toBe('200')

    // The focus stays on the column being pulled, as it stays on the column being moved.
    expect(document.activeElement).toBe(name('body'))
  })

  it("says in the head's own door which columns were set by hand, and gives one back", async () => {
    const user = userEvent.setup()
    render(<Editing />)
    pull('body', 280)

    await user.click(screen.getByRole('button', { name: 'Kolumner' }))
    // The door is where the table says what it has to say about its columns as columns (#46 on
    // #32), and a width somebody set by hand is exactly that: it is why this column is not the
    // width the deck asks for, and this is the only place that fact can be read, or undone,
    // without a pointer.
    const back = screen.getByRole('button', { name: 'Låt body följa innehållet igen' })
    expect(back.textContent).toContain('280')
    expect(screen.queryByRole('button', { name: 'Låt title följa innehållet igen' })).toBeNull()

    await user.click(back)
    expect(set('body')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Låt body följa innehållet igen' })).toBeNull()
  })

  it('remembers a width per project, and forgets one that was given back', () => {
    const { unmount } = render(<Editing project="p1" />)
    pull('body', 260)
    expect(heldWidths('p1')).toEqual({ body: 260 })
    unmount()

    // The same game opened again is the same table: the width is there before anything is drawn.
    render(<Editing project="p1" />)
    expect(set('body')).toBe('260')
    // And another game is another table. A column called `body` in one says nothing about a
    // column called `body` in the next.
    expect(heldWidths('p2')).toEqual({})

    fireEvent.doubleClick(grip('body')!)
    expect(heldWidths('p1')).toEqual({})
  })

  it('forgets a width when the column it belonged to is taken away', async () => {
    const user = userEvent.setup()
    render(<Editing project="p1" />)
    pull('body', 260)
    expect(heldWidths('p1')).toEqual({ body: 260 })

    await user.click(screen.getByRole('button', { name: 'Kolumner' }))
    await user.click(screen.getByRole('button', { name: 'Ta bort fältet body' }))
    await user.click(screen.getByRole('button', { name: 'Ja, ta bort' }))
    // A width is about a column, and there is no column. What was left behind instead was a
    // number under a name nothing answers to — and the next column made under that name, empty
    // and brand new, was drawn at a width a hand had chosen for somebody else's values.
    expect(heldWidths('p1')).toEqual({})

    await user.type(screen.getByLabelText('Namn'), 'body')
    await user.click(screen.getByRole('button', { name: 'Lägg till' }))
    expect(set('body')).toBeNull()
  })

  // What used to stand here: the chip that named the columns a pull had pushed out past the edge,
  // and the hand-written geometry it needed, since jsdom lays nothing out. Both go with #145 —
  // the tick and `id` stand still in the inline direction now, so the card a row belongs to never
  // leaves the screen and there is nothing to be fetched back. The edge under `id` says there is
  // more to the left without costing the reader the place she was standing in.

  // A drag with a way out of it (#142). Escape is what a hand that has changed its mind reaches
  // for in every application there is, and the table answered it with nothing: the column stood
  // at the width it had been dragged to, and that width was written and remembered. Measured in
  // Chromium at 1440 x 900, a column of 44 px pulled 200 px wider was 244 px at the press of
  // Escape and 244 px after the release.
  //
  // Ctrl+Z afterwards is a different thing and always was: an undone width is a row in the
  // history, and a drag the hand took back is nothing that ever happened.
  it('puts the column back where the pull began when the hand takes it back with Escape', () => {
    render(
      <StatusLive>
        <Editing project="p1" />
      </StatusLive>,
    )
    const at = grip('body')!
    pull('body', 120)
    expect(set('body')).toBe('120')
    expect(said()).toBe('body är 120 px bred')

    // The hand is still down: a frame of the pull, and no release.
    fireEvent.pointerDown(at, { pointerId: 1, button: 0, clientX: 0 })
    fireEvent.pointerMove(at, { pointerId: 1, clientX: 200 })
    expect(set('body')).toBe('200')

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(set('body')).toBe('120')
    // And the release that follows it is a release of nothing: the hand let go of a pull that
    // was already over.
    fireEvent.pointerUp(at, { pointerId: 1, clientX: 200 })
    expect(set('body')).toBe('120')
    expect(heldWidths('p1')).toEqual({ body: 120 })
    // Said where a width is said, because it is the same fact about the same column.
    expect(said()).toBe('Draget avbröts')
  })

  it('gives a column that had no width of its own back to the measurement when the drag is taken back', () => {
    render(<Editing project="p1" />)
    const at = grip('title')!
    fireEvent.pointerDown(at, { pointerId: 1, button: 0, clientX: 0 })
    fireEvent.pointerMove(at, { pointerId: 1, clientX: 200 })
    expect(set('title')).toBe('200')

    // Back where it began is back to no width at all — the column follows its deck again, which
    // is what it was doing when the hand came down on its edge.
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(set('title')).toBeNull()
    fireEvent.pointerUp(at, { pointerId: 1, clientX: 200 })
    expect(set('title')).toBeNull()
    expect(heldWidths('p1')).toEqual({})
  })

  // A gesture taken away from the page altogether: a pen lifted, a system gesture, a touch drag
  // the browser decided was a scroll. The listeners hung on `window` were never taken down by it,
  // so the pull went on running with nothing driving it — and the heading it belonged to stopped
  // being `draggable` until a `pointerup` that never comes.
  it('ends the pull when the pointer is taken away from it, without waiting for a release', () => {
    render(<Editing project="p1" />)
    const at = grip('body')!
    expect(head('body').getAttribute('draggable')).toBe('true')

    fireEvent.pointerDown(at, { pointerId: 1, button: 0, clientX: 0 })
    fireEvent.pointerMove(at, { pointerId: 1, clientX: 200 })
    // A column being pulled may not also be picked up and carried off by the same grip.
    expect(head('body').getAttribute('draggable')).toBeNull()

    fireEvent.pointerCancel(at, { pointerId: 1, clientX: 200 })
    expect(head('body').getAttribute('draggable')).toBe('true')
    expect(set('body')).toBeNull()
    expect(heldWidths('p1')).toEqual({})
  })

  it('does not remember anything for a table that was not opened from a project', () => {
    render(<Editing />)
    pull('body', 260)
    // The width is still the designer's for as long as she is looking at it; there is simply
    // nothing to file it under, and a guess would file it under somebody else's game.
    expect(set('body')).toBe('260')
    expect(localStorage.getItem('byd.widths')).toBeNull()
  })
})
