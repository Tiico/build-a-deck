// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { DataTable } from '../src/editor/DataTable.js'
import { projectDoc } from './project-doc.js'

describe('DataTable (B as a tab)', () => {
  it('shows one row per card with the fields the template binds plus antal, edits cells, adds and removes rows', () => {
    const doc = projectDoc()
    const onCell = vi.fn()
    const onAddRow = vi.fn()
    const onRemoveRow = vi.fn()
    const onReplaceRows = vi.fn()
    render(<DataTable doc={doc} selectedRow="knight" onSelectRow={() => undefined} onCell={onCell} onAddRow={onAddRow} onRemoveRow={onRemoveRow} onReplaceRows={onReplaceRows} />)

    // Every column header is a sort control (#15): its name is the column, the arrow is the state.
    // The first and last columns carry no name: the selection's checkbox (#17) and the row's ×.
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent!.replace(/\s*[↕↑↓]$/, ''))
    expect(headers).toEqual(['', 'id', 'title', 'body', 'antal', ''])
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows.map((r) => r.getAttribute('data-card-ref'))).toEqual(['dragon', 'knight', 'wizard'])
    expect(rows[1]!.getAttribute('aria-selected')).toBe('true')

    const title = within(rows[0]!).getByDisplayValue('Drake')
    fireEvent.change(title, { target: { value: 'Drakhona' } })
    expect(onCell).toHaveBeenCalledWith('dragon', 'title', 'Drakhona')
    const antal = within(rows[0]!).getByDisplayValue('2')
    fireEvent.change(antal, { target: { value: '3' } })
    expect(onCell).toHaveBeenCalledWith('dragon', 'antal', 3)

    fireEvent.click(screen.getByRole('button', { name: /nytt kort/i }))
    expect(onAddRow).toHaveBeenCalledWith(expect.stringMatching(/^kort-\d+$/))
    // The × asks first (#8); the card leaves the deck when the question is answered yes.
    fireEvent.click(within(rows[2]!).getByRole('button', { name: /ta bort/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Ja, ta bort' }))
    expect(onRemoveRow).toHaveBeenCalledWith('wizard')
  })

  it('exports the current table and imports a selected CSV file', async () => {
    const doc = projectDoc()
    const onReplaceRows = vi.fn()
    render(<DataTable doc={doc} selectedRow={null} onSelectRow={() => undefined} onCell={() => undefined} onAddRow={() => undefined} onRemoveRow={() => undefined} onReplaceRows={onReplaceRows} />)

    const download = screen.getByRole('link', { name: 'Exportera CSV' }) as HTMLAnchorElement
    expect(download.download).toBe('skogens-herrar-kort.csv')
    expect(decodeURIComponent(download.href.split(',')[1] ?? '')).toContain('id,title,body,antal')

    const file = new File(['id,title,body,antal\ndrake,Drake,Flygande,2'], 'kort.csv', { type: 'text/csv' })
    fireEvent.change(screen.getByLabelText('Importera CSV'), { target: { files: [file] } })
    await waitFor(() => expect(onReplaceRows).toHaveBeenCalledWith([
      { id: 'drake', fields: { title: 'Drake', body: 'Flygande', antal: 2 } },
    ]))
  })
})

// The × at the end of a row is the smallest button in the editor and used to take a card out of
// the deck on the way past it (#8). It asks first now, in the same strip a bulk delete asks in,
// and the question names the card so "Ja" is never a guess.
describe('DataTable row delete (#8)', () => {
  const renderTable = (onRemoveRow: () => void) =>
    render(
      <DataTable
        doc={projectDoc()}
        selectedRow={null}
        onSelectRow={() => undefined}
        onCell={() => undefined}
        onAddRow={() => undefined}
        onRemoveRow={onRemoveRow}
        onReplaceRows={() => undefined}
      />,
    )
  const rowRemove = (cardRef: string) => within(document.querySelector(`[data-card-ref="${cardRef}"]`) as HTMLElement).getByRole('button', { name: /ta bort/i })

  it('asks about the card by name instead of taking it out at once', async () => {
    const user = userEvent.setup()
    const onRemoveRow = vi.fn()
    renderTable(onRemoveRow)

    await user.click(rowRemove('wizard'))

    expect(onRemoveRow).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog', { name: 'Ta bort kortet wizard' })).toBeDefined()
    // The question opens on the answer that loses nothing: a stray Enter keeps the card.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Avbryt' }))

    await user.click(screen.getByRole('button', { name: 'Ja, ta bort' }))

    expect(onRemoveRow).toHaveBeenCalledWith('wizard')
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('keeps the card and gives the focus back to the × that asked when the answer is no', async () => {
    const user = userEvent.setup()
    const onRemoveRow = vi.fn()
    renderTable(onRemoveRow)

    await user.click(rowRemove('knight'))
    await user.keyboard('{Escape}')

    expect(onRemoveRow).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(document.activeElement).toBe(rowRemove('knight'))
    expect(document.querySelectorAll('[data-card-ref]')).toHaveLength(3)
  })
})
