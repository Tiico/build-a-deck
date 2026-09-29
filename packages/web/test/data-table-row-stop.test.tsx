// @vitest-environment jsdom
// The table costs one row of tab stops, not every row's (#575, beställarens beslut 2026-09-29,
// variant C with B's skip link). Sal's Saloon's 77 cards were some 470 presses of Tab before
// «+ Nytt kort» could be reached. Only the row the hand stands in has stops: Tab walks that row
// in its own order and leaves the table after its last stop; Enter and ↑/↓ change rows in the
// column (L4), from the checkbox and the × too; and a link first in the table goes past it.
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { DataTable } from '../src/editor/DataTable.js'
import type { ProjectDoc } from '../src/editor/types.js'
import { projectDoc } from './project-doc.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

function Table({ doc = projectDoc() }: { doc?: ProjectDoc }) {
  const [selected, setSelected] = useState<string | null>(null)
  return (
    <DataTable
      doc={doc}
      project="p1"
      selectedRow={selected}
      onSelectRow={setSelected}
      onCell={() => undefined}
      onAddRow={() => undefined}
      onRemoveRow={() => undefined}
      onReplaceRows={() => undefined}
      onAddField={() => undefined}
      onRemoveField={() => undefined}
      onMoveField={() => undefined}
    />
  )
}

// What Tab can land on in a row: everything focusable that is not taken out of the order.
const stopsIn = (row: Element) =>
  [...row.querySelectorAll<HTMLElement>('input, button, [contenteditable], a[href], [tabindex]')].filter((el) => el.tabIndex >= 0 && el.getAttribute('tabindex') !== '-1')
const rowOf = (cardRef: string) => document.querySelector(`tr[data-card-ref="${cardRef}"]`)!
const newCard = () => screen.getByRole('button', { name: '+ Nytt kort' })

describe('the table as one row of tab stops (#575)', () => {
  it('gives only the row the hand stands in its stops, the first row until the hand has been in one', () => {
    render(<Table />)
    expect(stopsIn(rowOf('dragon')).length).toBeGreaterThan(2)
    expect(stopsIn(rowOf('knight'))).toEqual([])
    expect(stopsIn(rowOf('wizard'))).toEqual([])
  })

  it('walks the row with Tab and leaves the table after its last stop', async () => {
    const user = userEvent.setup()
    render(<Table />)
    // An open prose cell shows its tools as it takes the focus, so the row is walked rather than
    // counted beforehand: every stop is in the row, and the one after the last is «+ Nytt kort».
    stopsIn(rowOf('dragon'))[0]!.focus()
    const walked: Element[] = [document.activeElement!]
    for (let i = 0; i < 20 && rowOf('dragon').contains(document.activeElement); i++) {
      await user.tab()
      walked.push(document.activeElement!)
    }
    expect(walked.length).toBeGreaterThan(3)
    expect(walked.slice(0, -1).every((el) => rowOf('dragon').contains(el))).toBe(true)
    expect(walked.at(-1)).toBe(newCard())
  })

  it('changes rows with ↓ in the column, and the row it lands in is the one with the stops', async () => {
    const user = userEvent.setup()
    render(<Table />)
    screen.getByLabelText('dragon title').focus()
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(screen.getByLabelText('knight title'))
    expect(stopsIn(rowOf('dragon'))).toEqual([])
    expect(stopsIn(rowOf('knight')).length).toBeGreaterThan(2)
  })

  it('changes rows with ↑ and ↓ from the checkbox and from the ×, as from a field', async () => {
    const user = userEvent.setup()
    render(<Table />)
    screen.getByRole('checkbox', { name: /dragon/ }).focus()
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(screen.getByRole('checkbox', { name: /knight/ }))
    const remove = stopsIn(rowOf('knight')).at(-1)!
    remove.focus()
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(stopsIn(rowOf('wizard')).at(-1))
    await user.keyboard('{ArrowUp}')
    expect(document.activeElement).toBe(stopsIn(rowOf('knight')).at(-1))
  })

  it('makes a row clicked into the row with the stops', async () => {
    const user = userEvent.setup()
    render(<Table />)
    await user.click(screen.getByLabelText('wizard title'))
    expect(stopsIn(rowOf('wizard')).length).toBeGreaterThan(2)
    expect(stopsIn(rowOf('dragon'))).toEqual([])
  })

  it('goes past the whole table from a link first in it, which names the cards it skips', async () => {
    const user = userEvent.setup()
    render(<Table />)
    const skip = screen.getByRole('link', { name: 'Hoppa förbi tabellen, 3 kort' })
    // First in the table: before the head's first control.
    const head = document.querySelector('thead')!
    expect(skip.compareDocumentPosition(head) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    skip.focus()
    await user.keyboard('{Enter}')
    expect(document.activeElement).toBe(newCard())
  })
})
