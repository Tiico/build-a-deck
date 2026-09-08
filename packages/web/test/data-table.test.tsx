// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { DataTable } from '../src/editor/DataTable.js'
import { projectDoc } from './project-doc.js'
import { symbolName, type GameSymbol } from '../src/editor/symbols.js'

describe('DataTable (B as a tab)', () => {
  it('shows one row per card with the fields the template binds plus antal, edits cells, adds and removes rows', () => {
    const doc = projectDoc()
    const onCell = vi.fn()
    const onAddRow = vi.fn()
    const onRemoveRow = vi.fn()
    const onReplaceRows = vi.fn()
    render(<DataTable doc={doc} selectedRow="knight" onSelectRow={() => undefined} onCell={onCell} onAddRow={onAddRow} onRemoveRow={onRemoveRow} onReplaceRows={onReplaceRows} />)

    // Every column header is a sort control (#15): its name is the column, the arrow is the state.
    // The first column carries no name: the selection's checkbox is its own label (#17). The last
    // is the pinned column that removes a card, and it says so for a reader who cannot see the ×.
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent!.replace(/\s*[↕↑↓]$/, ''))
    expect(headers).toEqual(['', 'id', 'title', 'body', 'antal', 'Ta bort'])
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

describe('the symbol picker at the brace (E4)', () => {
  const setup = () => {
    const doc = projectDoc()
    const onCell = vi.fn()
    // The editor answers with the name the symbol has in the designer's own language, which is
    // what lands in the icon set and between the braces (E4, A4).
    const onSymbol = vi.fn(async (s: GameSymbol) => symbolName(s))
    render(<DataTable doc={doc} selectedRow={null} onSelectRow={() => undefined} onCell={onCell} onAddRow={() => undefined} onRemoveRow={() => undefined} onReplaceRows={() => undefined} onSymbol={onSymbol} />)
    const cell = within(screen.getAllByRole('row')[1]!).getByLabelText('dragon body') as HTMLInputElement
    return { cell, onCell, onSymbol }
  }
  const type = (cell: HTMLInputElement, value: string) => {
    fireEvent.change(cell, { target: { value, selectionStart: value.length } })
  }

  it('opens the library where the cursor stands, narrows as the name is typed, and writes the chosen symbol into the text', async () => {
    const { cell, onCell, onSymbol } = setup()
    expect(screen.queryByRole('listbox')).toBeNull()
    type(cell, 'Flygande. {')
    const list = screen.getByRole('listbox', { name: 'Symboler' })
    expect(within(list).getAllByRole('option').length).toBeGreaterThan(3)
    type(cell, 'Flygande. {sköl')
    expect(within(list).getAllByRole('option').map((o) => o.textContent)).toEqual([expect.stringContaining('sköld')])

    fireEvent.click(within(list).getAllByRole('option')[0]!)
    await waitFor(() => expect(onCell).toHaveBeenCalledWith('dragon', 'body', 'Flygande. {sköld}'))
    expect(onSymbol).toHaveBeenCalledWith(expect.objectContaining({ id: 'skold' }))
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('moves through the list with the arrow keys, takes one with Enter, and closes on Escape', async () => {
    const { cell, onCell } = setup()
    type(cell, '{s')
    const list = screen.getByRole('listbox', { name: 'Symboler' })
    const names = within(list).getAllByRole('option').map((o) => o.getAttribute('data-symbol'))
    expect(within(list).getAllByRole('option')[0]!.getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(cell, { key: 'ArrowDown' })
    expect(within(list).getAllByRole('option')[1]!.getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(cell, { key: 'ArrowUp' })
    fireEvent.keyDown(cell, { key: 'ArrowUp' })
    expect(within(list).getAllByRole('option')[0]!.getAttribute('aria-selected')).toBe('true')

    fireEvent.keyDown(cell, { key: 'Enter' })
    await waitFor(() => expect(onCell).toHaveBeenCalledWith('dragon', 'body', `{${names[0]}}`))

    type(cell, '{s')
    expect(screen.getByRole('listbox')).toBeTruthy()
    fireEvent.keyDown(cell, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('stays out of the way: a closed brace, a number in braces, and a cell that is not text', () => {
    const { cell } = setup()
    type(cell, 'Betala {2} för att anfalla.')
    expect(screen.queryByRole('listbox')).toBeNull()
    type(cell, 'Betala {2')
    // A bare number is a pip (L2), not a symbol: nothing to look up.
    expect(screen.queryByRole('listbox')).toBeNull()
    const antal = within(screen.getAllByRole('row')[1]!).getByLabelText('dragon antal') as HTMLInputElement
    fireEvent.change(antal, { target: { value: '{s' } })
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})

describe('comparing with an older version in the table (B4)', () => {
  const older = () => {
    const doc = projectDoc()
    doc.rows[0]!.fields['title'] = 'Drake'
    doc.rows = [doc.rows[0]!, doc.rows[1]!, { id: 'troll', fields: { title: 'Troll', body: 'Stor.', antal: 1 } }]
    return doc
  }
  const now = () => {
    const doc = projectDoc()
    doc.rows[0]!.fields['title'] = 'Drakhona'
    return doc
  }

  it('shows what moved since a chosen version: the old value struck through, and rows added or gone', () => {
    render(
      <DataTable
        doc={now()}
        selectedRow={null}
        onSelectRow={() => undefined}
        onCell={() => undefined}
        onAddRow={() => undefined}
        onRemoveRow={() => undefined}
        onReplaceRows={() => undefined}
        compareWith={{ rev: 1, doc: older() }}
      />,
    )
    expect(screen.getByText(/Jämför med version 1/)).toBeTruthy()
    const rows = screen.getAllByRole('row').slice(1)
    // The removed card is shown too, at the end, so it can be seen at all.
    expect(rows.map((r) => r.getAttribute('data-card-ref'))).toEqual(['dragon', 'knight', 'wizard', 'troll'])
    expect(rows[0]!.getAttribute('data-change')).toBe('changed')
    expect(rows[2]!.getAttribute('data-change')).toBe('added')
    expect(rows[3]!.getAttribute('data-change')).toBe('removed')

    const title = within(rows[0]!).getByRole('cell', { name: /Drakhona/ })
    expect(within(title).getByText('Drake')!.tagName).toBe('S')
    // A cell that did not move says it once.
    expect(within(rows[1]!).queryByText('Riddare', { selector: 's' })).toBeNull()
  })

  it('is not in the way when nothing is being compared', () => {
    render(<DataTable doc={now()} selectedRow={null} onSelectRow={() => undefined} onCell={() => undefined} onAddRow={() => undefined} onRemoveRow={() => undefined} onReplaceRows={() => undefined} />)
    expect(screen.queryByText(/Jämför med/)).toBeNull()
    expect(screen.getAllByRole('row').slice(1).map((r) => r.getAttribute('data-change'))).toEqual([null, null, null])
  })
})
