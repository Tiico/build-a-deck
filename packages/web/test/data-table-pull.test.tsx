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

  it('does not remember anything for a table that was not opened from a project', () => {
    render(<Editing />)
    pull('body', 260)
    // The width is still the designer's for as long as she is looking at it; there is simply
    // nothing to file it under, and a guess would file it under somebody else's game.
    expect(set('body')).toBe('260')
    expect(localStorage.getItem('byd.widths')).toBeNull()
  })
})
