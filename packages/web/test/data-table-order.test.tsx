// @vitest-environment jsdom
// The order of the columns, changed from the head (#46).
//
// Until now the order was the document's own derivation — what the template draws, in the
// template's order, then whatever else the cards carry — and nothing a designer did could change
// it. It is hers now, and she changes it where it is: a heading is dragged onto another, exactly
// as a layer is dragged onto another in the template (#18), and — because a table that can only be
// dragged is a table a keyboard has lost — Alt and an arrow do the same thing a step at a time.
//
// Every edit here is applied by the one pure function the actor applies it with, so what is
// asserted is the head the designer would be looking at and not a spy's log.
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { applyEdit } from '@byd/server/doc'
import { DataTable } from '../src/editor/DataTable.js'
import type { ProjectDoc } from '../src/editor/types.js'
import { projectDoc } from './project-doc.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// A deck with four columns of the designer's own, so a move has somewhere to go on either side.
function wideDoc(): ProjectDoc {
  return ['kostnad', 'typ'].reduce((doc, field) => applyEdit(doc, { v: 'addField', field }), projectDoc())
}

function Editing({ doc: initial = wideDoc(), moves }: { doc?: ProjectDoc; moves?: [string, string | null][] }) {
  const [doc, setDoc] = useState(initial)
  return (
    <DataTable
      doc={doc}
      selectedRow={null}
      onSelectRow={() => undefined}
      onCell={() => undefined}
      onAddRow={() => undefined}
      onRemoveRow={() => undefined}
      onReplaceRows={(rows) => setDoc((current) => ({ ...current, rows }))}
      onAddField={(field) => setDoc((current) => applyEdit(current, { v: 'addField', field }))}
      onRemoveField={(field) => setDoc((current) => applyEdit(current, { v: 'removeField', field }))}
      onMoveField={(field, before) => {
        moves?.push([field, before])
        setDoc((current) => applyEdit(current, { v: 'moveField', field, before }))
      }}
    />
  )
}

// The head as the designer reads it: one heading per column, in the order they stand.
const order = () => Array.from(document.querySelectorAll('thead th[data-col]')).map((th) => th.getAttribute('data-col'))
const head = (field: string) => document.querySelector(`thead th[data-col="${field}"]`) as HTMLElement
const name = (field: string) => head(field).querySelector('button') as HTMLButtonElement

describe('the order of the columns is the designer\'s (#46)', () => {
  it('moves a column by dragging its heading onto another, either way along the head', () => {
    const moves: [string, string | null][] = []
    render(<Editing moves={moves} />)
    expect(order()).toEqual(['id', 'title', 'body', 'kostnad', 'typ', 'antal'])

    // Dropped on a heading to its left, the column comes to stand before that heading.
    fireEvent.dragStart(head('typ'))
    fireEvent.dragOver(head('title'))
    fireEvent.drop(head('title'))
    expect(moves.at(-1)).toEqual(['typ', 'title'])
    expect(order()).toEqual(['id', 'typ', 'title', 'body', 'kostnad', 'antal'])

    // Dropped on one to its right, it comes to stand after it — which is before whatever follows.
    fireEvent.dragStart(head('typ'))
    fireEvent.drop(head('body'))
    expect(order()).toEqual(['id', 'title', 'body', 'typ', 'kostnad', 'antal'])

    // And dropped on the last of them it is last of all, which has nothing to stand before.
    fireEvent.dragStart(head('title'))
    fireEvent.drop(head('kostnad'))
    expect(moves.at(-1)).toEqual(['title', null])
    expect(order()).toEqual(['id', 'body', 'typ', 'kostnad', 'title', 'antal'])
  })

  it('moves a column with the keyboard as well, so the order is not a drag away only', async () => {
    const user = userEvent.setup()
    render(<Editing />)
    name('body').focus()

    await user.keyboard('{Alt>}{ArrowLeft}{/Alt}')
    expect(order()).toEqual(['id', 'body', 'title', 'kostnad', 'typ', 'antal'])
    await user.keyboard('{Alt>}{ArrowRight}{/Alt}')
    await user.keyboard('{Alt>}{ArrowRight}{/Alt}')
    expect(order()).toEqual(['id', 'title', 'kostnad', 'body', 'typ', 'antal'])

    // The column keeps the focus it was moved with: a designer moving a column two places may not
    // have to find it again between the two keystrokes.
    expect(document.activeElement).toBe(name('body'))

    // And the ends are ends: the same key again at the far left does nothing at all rather than
    // wrapping the column round to the other side of the head.
    name('title').focus()
    await user.keyboard('{Alt>}{ArrowLeft}{/Alt}')
    expect(order()).toEqual(['id', 'title', 'kostnad', 'body', 'typ', 'antal'])
  })

  it('leaves the arrow alone: without Alt, a heading answers the way it always did', async () => {
    const user = userEvent.setup()
    render(<Editing />)
    name('body').focus()

    await user.keyboard('{ArrowLeft}')
    expect(order()).toEqual(['id', 'title', 'body', 'kostnad', 'typ', 'antal'])
    // And the heading is still the control that sorts: a column that can be dragged has not
    // stopped being one that can be pressed.
    await user.click(name('body'))
    expect(head('body').getAttribute('aria-sort')).toBe('ascending')
  })

  it('does not move the two the table owns (L4)', async () => {
    const user = userEvent.setup()
    const moves: [string, string | null][] = []
    render(<Editing moves={moves} />)

    // The card's id and `antal` are the tool's columns, not the designer's: neither can be picked
    // up, and neither answers the keys that move one.
    expect(head('id').getAttribute('draggable')).not.toBe('true')
    expect(head('antal').getAttribute('draggable')).not.toBe('true')
    name('antal').focus()
    await user.keyboard('{Alt>}{ArrowLeft}{/Alt}')
    name('id').focus()
    await user.keyboard('{Alt>}{ArrowRight}{/Alt}')
    expect(moves).toEqual([])
    expect(order()).toEqual(['id', 'title', 'body', 'kostnad', 'typ', 'antal'])

    // Nor is one of them a place to drop a column: `antal` stands last wherever the table shows
    // it, so a column dropped on it would be asking for a place that is not on offer.
    fireEvent.dragStart(head('title'))
    fireEvent.drop(head('antal'))
    expect(moves).toEqual([])
  })

  it('says which heading a carried column would land in front of', () => {
    render(<Editing />)

    fireEvent.dragStart(head('typ'))
    fireEvent.dragOver(head('title'))
    expect(head('title').hasAttribute('data-over')).toBe(true)
    // Only the one it is over, and never the column being carried itself.
    expect(Array.from(document.querySelectorAll('thead th[data-over]')).map((th) => th.getAttribute('data-col'))).toEqual(['title'])

    fireEvent.dragEnd(head('typ'))
    expect(document.querySelectorAll('thead th[data-over]')).toHaveLength(0)
  })
})
