// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { DataTable } from '../src/editor/DataTable.js'
import { importCardsCsv } from '../src/editor/csv.js'
import { copiesOf } from '../src/editor/fields.js'
import { projectDoc } from './project-doc.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// `antal` is how many copies of a card the deck holds (L4, #479): a whole number from nought. It
// took 0 on a backspace, 0 on an `e`, −2 pasted and −5 from the bulk row, and the card was then
// silently gone from the table; the import clamped to 1 while the cell did not. One rule for all
// three, and the cell says so when it is not kept.
function table(doc = projectDoc()) {
  const onCell = vi.fn()
  const onReplaceRows = vi.fn()
  render(<DataTable doc={doc} selectedRow={null} onSelectRow={() => undefined} onCell={onCell} onAddRow={() => undefined} onRemoveRow={() => undefined} onReplaceRows={onReplaceRows} onAddField={() => undefined} onRemoveField={() => undefined} onMoveField={() => undefined} />)
  return { onCell, onReplaceRows }
}

describe('how many copies a card has (#479)', () => {
  it('reads a whole number from nought, and nothing else', () => {
    expect(copiesOf('3')).toBe(3)
    expect(copiesOf(' 0 ')).toBe(0)
    expect(copiesOf('')).toBeNull()
    expect(copiesOf('-2')).toBeNull()
    expect(copiesOf('2.5')).toBeNull()
    expect(copiesOf('e')).toBeNull()
  })

  it('writes a whole number from the cell, and marks the cell and writes nothing otherwise', () => {
    const { onCell } = table()
    const cell = screen.getByLabelText('dragon antal') as HTMLInputElement
    fireEvent.change(cell, { target: { value: '' } })
    fireEvent.change(cell, { target: { value: '-2' } })
    expect(onCell).not.toHaveBeenCalled()
    expect(cell.getAttribute('aria-invalid')).toBe('true')
    expect(document.getElementById(cell.getAttribute('aria-describedby') ?? '')?.textContent).toBe('antal är ett heltal från 0')
    fireEvent.change(cell, { target: { value: '4' } })
    expect(onCell).toHaveBeenLastCalledWith('dragon', 'antal', 4, expect.any(String))
    expect(cell.getAttribute('aria-invalid')).not.toBe('true')
  })

  it('shows what it had again when the cell is left with something that is not kept', () => {
    table()
    const cell = screen.getByLabelText('dragon antal') as HTMLInputElement
    fireEvent.focus(cell)
    fireEvent.change(cell, { target: { value: '' } })
    fireEvent.blur(cell)
    expect(cell.value).toBe('2')
  })

  it('says on the row when a card is in the table but not in the deck', () => {
    const doc = projectDoc()
    doc.rows[0]!.fields['antal'] = 0
    table(doc)
    const row = screen.getByLabelText('dragon antal').closest('tr') as HTMLElement
    expect(within(row).getByText('ingår inte i leken')).toBeTruthy()
  })

  it('reads an import by the same rule, and says which lines it could not', () => {
    const rows = importCardsCsv('id,title,antal\na,A,2\nb,B,-3\nc,C,1.5\nd,D,0')
    expect(rows.map((r) => r.fields['antal'])).toEqual([2, 1, 1, 0])
  })
})

describe('the bulk row s count (#479)', () => {
  it('writes nothing that is not a count, and says why', () => {
    const { onReplaceRows } = table()
    fireEvent.click(screen.getByLabelText('Markera alla synliga'))
    fireEvent.change(screen.getByLabelText('Kolumn'), { target: { value: 'antal' } })
    const value = screen.getByLabelText('Värde')
    fireEvent.change(value, { target: { value: '-5' } })
    expect(value.getAttribute('aria-invalid')).toBe('true')
    const set = screen.getByRole('button', { name: /^Sätt antal på/ })
    expect(set.hasAttribute('disabled')).toBe(true)
    fireEvent.click(set)
    expect(onReplaceRows).not.toHaveBeenCalled()
  })
})

// A new card where it can be seen (#479): «+ Nytt kort» put the row 3 000 px down, left the table
// at the top and the focus on the button, and all that changed on the screen was the count at the
// foot. The row is now scrolled in and the caret stands in its first cell to write in.
describe('a new card (#479)', () => {
  it('puts the caret in the new card s first cell to write in', async () => {
    const { useState } = await import('react')
    function Growing() {
      const [doc, setDoc] = useState(projectDoc())
      return (
        <DataTable
          doc={doc}
          selectedRow={null}
          onSelectRow={() => undefined}
          onCell={() => undefined}
          onAddRow={(cardRef) => setDoc((was) => ({ ...was, rows: [...was.rows, { id: cardRef, fields: { title: '', antal: 1 } }] }))}
          onRemoveRow={() => undefined}
          onReplaceRows={() => undefined}
          onAddField={() => undefined}
          onRemoveField={() => undefined}
          onMoveField={() => undefined}
        />
      )
    }
    render(<Growing />)
    fireEvent.click(screen.getByRole('button', { name: '+ Nytt kort' }))
    expect(document.activeElement).toBe(screen.getByLabelText('kort-4 title'))
  })
})

// What an import did (#479): it replaced 77 cards with 2 and said nothing. It now says how many
// cards it read, how many went, and which columns are new — in the status, where it is heard.
describe('what an import did (#479)', () => {
  it('says how many cards it read, how many went, and the new columns', async () => {
    const { onReplaceRows } = table()
    fireEvent.click(screen.getByRole('button', { name: 'Importera' }))
    const file = new File(['id,title,Pris\ndragon,Drake,3\nny,Ny,1'], 'kort.csv', { type: 'text/csv' })
    fireEvent.change(screen.getByLabelText('Importera CSV…'), { target: { files: [file] } })
    const said = await screen.findByText(/kort lästes/)
    expect(onReplaceRows).toHaveBeenCalled()
    expect(said.textContent).toBe('2 kort lästes: 1 nytt, 2 togs bort. Ny kolumn: Pris.')
    expect(said.getAttribute('role')).toBe('status')
  })
})
