// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
    fireEvent.click(within(rows[2]!).getByRole('button', { name: /ta bort/i }))
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
