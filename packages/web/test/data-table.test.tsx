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

describe('image cells (E1)', () => {
  const HASH = 'c'.repeat(64)
  const withArt = () => {
    const doc = projectDoc()
    doc.template.faces['front']!.base.push({ kind: 'image', id: 'art', x: 4, y: 4, w: 55, h: 36, bind: { field: 'art' } })
    doc.rows[0]!.fields['art'] = `asset:${HASH}`
    return doc
  }

  it('shows an image field as a thumbnail from the server, uploads a chosen file into the cell, and clears it', async () => {
    const doc = withArt()
    const onCell = vi.fn()
    const onUpload = vi.fn(async () => 'd'.repeat(64))
    render(<DataTable doc={doc} selectedRow={null} onSelectRow={() => undefined} onCell={onCell} onAddRow={() => undefined} onRemoveRow={() => undefined} onReplaceRows={() => undefined} assetBase="http://api.local" onUpload={onUpload} />)
    const rows = screen.getAllByRole('row').slice(1)
    const thumb = within(rows[0]!).getByRole('img', { name: 'dragon art' }) as HTMLImageElement
    expect(thumb.src).toBe(`http://api.local/assets/${HASH}`)
    // A card without an image has a place for one, not a broken picture.
    expect(within(rows[1]!).queryByRole('img')).toBeNull()

    const file = new File(['png'], 'riddare.png', { type: 'image/png' })
    fireEvent.change(within(rows[1]!).getByLabelText('Välj bild för knight'), { target: { files: [file] } })
    await waitFor(() => expect(onCell).toHaveBeenCalledWith('knight', 'art', `asset:${'d'.repeat(64)}`))
    expect(onUpload).toHaveBeenCalledWith(file)

    fireEvent.click(within(rows[0]!).getByRole('button', { name: 'Ta bort bild för dragon' }))
    expect(onCell).toHaveBeenCalledWith('dragon', 'art', '')
  })

  it('lists the deck\'s images once each above the table, and a drop of one on a cell uses it again', () => {
    const doc = withArt()
    doc.rows[1]!.fields['art'] = `asset:${HASH}`
    const onCell = vi.fn()
    render(<DataTable doc={doc} selectedRow={null} onSelectRow={() => undefined} onCell={onCell} onAddRow={() => undefined} onRemoveRow={() => undefined} onReplaceRows={() => undefined} assetBase="http://api.local" onUpload={async () => 'e'.repeat(64)} />)
    const strip = screen.getByRole('list', { name: 'Bilder i spelet' })
    const thumbs = within(strip).getAllByRole('img')
    expect(thumbs).toHaveLength(1)
    expect(strip.textContent).toContain('2 kort')

    const rows = screen.getAllByRole('row').slice(1)
    const cell = within(rows[2]!).getByLabelText('Bild för wizard')
    fireEvent.drop(cell, { dataTransfer: { getData: (type: string) => (type === 'text/x-byd-asset' ? HASH : ''), files: [] } })
    expect(onCell).toHaveBeenCalledWith('wizard', 'art', `asset:${HASH}`)
  })
})
