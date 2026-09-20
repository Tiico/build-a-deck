// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { DataTable } from '../src/editor/DataTable.js'
import { projectDoc } from './project-doc.js'
import { symbolName, type GameSymbol } from '../src/editor/symbols.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

describe('DataTable (B as a tab)', () => {
  it('shows one row per card with the fields the template binds plus antal, edits cells, adds and removes rows', () => {
    const doc = projectDoc()
    const onCell = vi.fn()
    const onAddRow = vi.fn()
    const onRemoveRow = vi.fn()
    const onReplaceRows = vi.fn()
    render(<DataTable doc={doc} selectedRow="knight" onSelectRow={() => undefined} onCell={onCell} onAddRow={onAddRow} onRemoveRow={onRemoveRow} onReplaceRows={onReplaceRows} onAddField={() => undefined} onRemoveField={() => undefined} onMoveField={() => undefined} />)

    // Every column header is a sort control (#15) and nothing else: its name is the column, the
    // arrow is the state. The first column carries no name: the selection's checkbox is its own
    // label (#17). Last stands the pinned column that removes a card, which says so for a reader
    // who cannot see the ×; the door to the table's columns stands in its head rather than
    // bringing a column of its own to stand in, because that column had nothing under it on any
    // row (#46).
    const heads = screen.getAllByRole('columnheader')
    const headers = heads.map((h) => (h.getAttribute('aria-label') ?? h.querySelector('button')?.textContent ?? h.textContent ?? '').replace(/\s*[↕↑↓]\s*$/, ''))
    expect(headers).toEqual(['', 'id', 'title', 'body', 'antal', 'Ta bort'])
    // And nothing about which columns are the designer's is said in the head itself any more: the
    // × that took one away, and the padlock that stood in its place where one could not be taken
    // away, are both behind the head's own door (#46 on #32), which is where the table already
    // said something about its columns as columns. A heading is a name and the way it sorts.
    expect(heads.filter((h) => h.querySelector('.byd-data-system, .byd-data-dropfield'))).toEqual([])
    expect(heads.map((h) => h.textContent)).toContain('antal ↕')
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows.map((r) => r.getAttribute('data-card-ref'))).toEqual(['dragon', 'knight', 'wizard'])
    expect(rows[1]!.getAttribute('aria-selected')).toBe('true')

    const title = within(rows[0]!).getByDisplayValue('Drake')
    fireEvent.change(title, { target: { value: 'Drakhona' } })
    // The token says which keystrokes belong to the same visit to the cell, so a word typed into
    // one is a single step back (#35); which visit it is is the table's own business.
    expect(onCell).toHaveBeenCalledWith('dragon', 'title', 'Drakhona', expect.any(String))
    const antal = within(rows[0]!).getByDisplayValue('2')
    fireEvent.change(antal, { target: { value: '3' } })
    expect(onCell).toHaveBeenCalledWith('dragon', 'antal', 3, expect.any(String))

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
    render(<DataTable doc={doc} selectedRow={null} onSelectRow={() => undefined} onCell={() => undefined} onAddRow={() => undefined} onRemoveRow={() => undefined} onReplaceRows={onReplaceRows} onAddField={() => undefined} onRemoveField={() => undefined} onMoveField={() => undefined} />)

    // The CSV pair is what falls into a box in the crown (#130): done once, and not a state.
    fireEvent.click(screen.getByRole('button', { name: 'Importera' }))
    const download = screen.getByRole('link', { name: 'Ladda ner CSV' }) as HTMLAnchorElement
    expect(download.download).toBe('skogens-herrar-kort.csv')
    expect(decodeURIComponent(download.href.split(',')[1] ?? '')).toContain('id,title,body,antal')

    const file = new File(['id,title,body,antal\ndrake,Drake,Flygande,2'], 'kort.csv', { type: 'text/csv' })
    fireEvent.change(screen.getByLabelText('Importera CSV…'), { target: { files: [file] } })
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
        onAddField={() => undefined}
        onRemoveField={() => undefined}
        onMoveField={() => undefined}
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
    render(<DataTable doc={doc} selectedRow={null} onSelectRow={() => undefined} onCell={onCell} onAddRow={() => undefined} onRemoveRow={() => undefined} onReplaceRows={() => undefined} onAddField={() => undefined} onRemoveField={() => undefined} onMoveField={() => undefined} assetBase="http://api.local" onUpload={onUpload} />)
    const rows = screen.getAllByRole('row').slice(1)
    const thumb = within(rows[0]!).getByRole('img', { name: 'dragon art' }) as HTMLImageElement
    expect(thumb.src).toBe(`http://api.local/assets/${HASH}`)
    // A card without an image has a place for one, not a broken picture.
    expect(within(rows[1]!).queryByRole('img')).toBeNull()

    const file = new File(['png'], 'riddare.png', { type: 'image/png' })
    fireEvent.change(within(rows[1]!).getByLabelText('Ladda upp bild för knight'), { target: { files: [file] } })
    await waitFor(() => expect(onCell).toHaveBeenCalledWith('knight', 'art', `asset:${'d'.repeat(64)}`))
    expect(onUpload).toHaveBeenCalledWith(file)

    fireEvent.click(within(rows[0]!).getByRole('button', { name: 'Ta bort bild för dragon' }))
    expect(onCell).toHaveBeenCalledWith('dragon', 'art', '')
  })

  it('lists the deck\'s images once each above the table, and a drop of one on a cell uses it again', () => {
    const doc = withArt()
    doc.rows[1]!.fields['art'] = `asset:${HASH}`
    const onCell = vi.fn()
    render(<DataTable doc={doc} selectedRow={null} onSelectRow={() => undefined} onCell={onCell} onAddRow={() => undefined} onRemoveRow={() => undefined} onReplaceRows={() => undefined} onAddField={() => undefined} onRemoveField={() => undefined} onMoveField={() => undefined} assetBase="http://api.local" onUpload={async () => 'e'.repeat(64)} />)
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

// One image on several cards at once (#17 on E1). A deck is drawn in batches — every event card
// takes the same back, every forest card the same art — and setting it card by card is the same
// image chosen twenty times. The action row already writes one column on every marked card; this
// is that row told what a bild is.
describe('an image on every marked card (#17, E1)', () => {
  const HASH = 'c'.repeat(64)
  const OTHER = 'a'.repeat(64)
  const withArt = () => {
    const doc = projectDoc()
    doc.template.faces['front']!.base.push({ kind: 'image', id: 'art', x: 4, y: 4, w: 55, h: 36, bind: { field: 'art' } })
    doc.rows[0]!.fields['art'] = `asset:${HASH}`
    return doc
  }
  const mark = (cardRef: string) => fireEvent.click(screen.getByLabelText(`markera ${cardRef}`))
  const bulk = () => screen.getByRole('toolbar', { name: 'Markerade kort' })

  it('drops one of the deck\'s images into the action row and writes it on every marked card, and on no other', () => {
    const doc = withArt()
    const onReplaceRows = vi.fn()
    render(<DataTable doc={doc} selectedRow={null} onSelectRow={() => undefined} onCell={() => undefined} onAddRow={() => undefined} onRemoveRow={() => undefined} onReplaceRows={onReplaceRows} onAddField={() => undefined} onRemoveField={() => undefined} onMoveField={() => undefined} assetBase="http://api.local" onUpload={async () => OTHER} />)
    mark('knight')
    mark('wizard')

    // The column is the image field, so the value is not a sentence to type: it is a place to put
    // an image. The row says so by having no text field at all for it.
    fireEvent.change(within(bulk()).getByLabelText('Kolumn'), { target: { value: 'art' } })
    expect(within(bulk()).queryByLabelText('Värde')).toBeNull()
    const slot = within(bulk()).getByLabelText('Bild för de markerade korten')

    // Nothing is set until an image is chosen: the button is there and does not work.
    expect((within(bulk()).getByRole('button', { name: 'Sätt bild på 2 kort' }) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.drop(slot, { dataTransfer: { getData: (type: string) => (type === 'text/x-byd-asset' ? HASH : ''), files: [] } })
    fireEvent.click(within(bulk()).getByRole('button', { name: 'Sätt bild på 2 kort' }))

    // One change to the project, not two (L4, B4): both marked cards in a single list of rows.
    expect(onReplaceRows).toHaveBeenCalledTimes(1)
    expect(onReplaceRows.mock.calls[0]![0].map((r: { id: string; fields: Record<string, unknown> }) => [r.id, r.fields['art']])).toEqual([
      ['dragon', `asset:${HASH}`],
      ['knight', `asset:${HASH}`],
      ['wizard', `asset:${HASH}`],
    ])
  })

  it('uploads a chosen file once and puts that one image on every marked card', async () => {
    const doc = withArt()
    const onReplaceRows = vi.fn()
    const onUpload = vi.fn(async () => OTHER)
    render(<DataTable doc={doc} selectedRow={null} onSelectRow={() => undefined} onCell={() => undefined} onAddRow={() => undefined} onRemoveRow={() => undefined} onReplaceRows={onReplaceRows} onAddField={() => undefined} onRemoveField={() => undefined} onMoveField={() => undefined} assetBase="http://api.local" onUpload={onUpload} />)
    mark('knight')
    mark('wizard')
    fireEvent.change(within(bulk()).getByLabelText('Kolumn'), { target: { value: 'art' } })

    const file = new File(['png'], 'skog.png', { type: 'image/png' })
    fireEvent.change(within(bulk()).getByLabelText('Ladda upp bild för de markerade korten'), { target: { files: [file] } })
    // The file becomes one asset, and the row is holding it before anything is written: the
    // thumbnail is what says which image the button is about.
    await waitFor(() => expect((within(bulk()).getByRole('img', { name: 'Bild för de markerade korten' }) as HTMLImageElement).src).toBe(`http://api.local/assets/${OTHER}`))
    fireEvent.click(within(bulk()).getByRole('button', { name: 'Sätt bild på 2 kort' }))

    // Two cards, one upload — the same image on ten cards is one image (E1).
    expect(onUpload).toHaveBeenCalledTimes(1)
    expect(onUpload).toHaveBeenCalledWith(file)
    expect(onReplaceRows.mock.calls[0]![0].map((r: { id: string; fields: Record<string, unknown> }) => r.fields['art'])).toEqual([`asset:${HASH}`, `asset:${OTHER}`, `asset:${OTHER}`])
  })

  it('takes a file dropped straight on the row, and lets the image go once it is set', async () => {
    const doc = withArt()
    const onReplaceRows = vi.fn()
    render(<DataTable doc={doc} selectedRow={null} onSelectRow={() => undefined} onCell={() => undefined} onAddRow={() => undefined} onRemoveRow={() => undefined} onReplaceRows={onReplaceRows} onAddField={() => undefined} onRemoveField={() => undefined} onMoveField={() => undefined} assetBase="http://api.local" onUpload={async () => OTHER} />)
    mark('knight')
    fireEvent.change(within(bulk()).getByLabelText('Kolumn'), { target: { value: 'art' } })

    // A file off the desktop is dropped on the row the same way it is dropped on a cell.
    const file = new File(['png'], 'berg.png', { type: 'image/png' })
    fireEvent.drop(within(bulk()).getByLabelText('Bild för de markerade korten'), { dataTransfer: { getData: () => '', files: [file] } })
    await waitFor(() => expect(within(bulk()).getByRole('img', { name: 'Bild för de markerade korten' })).toBeTruthy())

    fireEvent.click(within(bulk()).getByRole('button', { name: 'Sätt bild på 1 kort' }))
    expect(onReplaceRows.mock.calls[0]![0][1].fields['art']).toBe(`asset:${OTHER}`)

    // And the row lets it go: what was set is done, and the next press has to say which image it
    // is about — a held image and a new set of marked cards is a picture written by mistake.
    expect(within(bulk()).queryByRole('img', { name: 'Bild för de markerade korten' })).toBeNull()
    expect((within(bulk()).getByRole('button', { name: 'Sätt bild på 1 kort' }) as HTMLButtonElement).disabled).toBe(true)
  })

  // The one place a bildfält is still a sentence: a table mounted without anywhere to put an
  // image edits every column as text, cells included. The row says the same thing the cells do.
  it('keeps the text field for an image column when the table has no image store', () => {
    const onReplaceRows = vi.fn()
    render(<DataTable doc={withArt()} selectedRow={null} onSelectRow={() => undefined} onCell={() => undefined} onAddRow={() => undefined} onRemoveRow={() => undefined} onReplaceRows={onReplaceRows} onAddField={() => undefined} onRemoveField={() => undefined} onMoveField={() => undefined} />)
    mark('knight')
    fireEvent.change(within(bulk()).getByLabelText('Kolumn'), { target: { value: 'art' } })

    expect(within(bulk()).queryByLabelText('Bild för de markerade korten')).toBeNull()
    fireEvent.change(within(bulk()).getByLabelText('Värde'), { target: { value: 'skog.png' } })
    fireEvent.click(within(bulk()).getByRole('button', { name: 'Sätt art på 1 kort' }))
    expect(onReplaceRows.mock.calls[0]![0][1].fields['art']).toBe('skog.png')
  })
})

describe('the symbol picker at the brace (E4)', () => {
  const setup = () => {
    const doc = projectDoc()
    const onCell = vi.fn()
    // The editor answers with the name the symbol has in the designer's own language, which is
    // what lands in the icon set and between the braces (E4, A4).
    const onSymbol = vi.fn(async (s: GameSymbol) => symbolName(s))
    render(<DataTable doc={doc} selectedRow={null} onSelectRow={() => undefined} onCell={onCell} onAddRow={() => undefined} onRemoveRow={() => undefined} onReplaceRows={() => undefined} onAddField={() => undefined} onRemoveField={() => undefined} onMoveField={() => undefined} onSymbol={onSymbol} />)
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

  it('closes the library when the hand goes to another row (#236)', () => {
    const { cell } = setup()
    fireEvent.focus(cell)
    type(cell, '{s')
    expect(screen.getByRole('listbox', { name: 'Symboler' })).toBeTruthy()
    // The list belongs to the cell it was opened in. Left standing over a cell nobody is in, it is
    // a library about nothing — and it was standing, because what drew it asked only which cell it
    // had been opened in, never whether anyone was still there.
    const elsewhere = within(screen.getAllByRole('row')[2]!).getByLabelText('knight body')
    fireEvent.blur(cell, { relatedTarget: elsewhere })
    fireEvent.focus(elsewhere)
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('takes the brace back when the brace button is pressed a second time (#236)', () => {
    const { cell, onCell } = setup()
    fireEvent.focus(cell)
    const brace = screen.getByRole('button', { name: 'Sätt in en ikon' })
    // The cell already reads `Flygande.`, so the brace lands at the end of it.
    fireEvent.click(brace)
    expect(onCell).toHaveBeenLastCalledWith('dragon', 'body', 'Flygande.{', expect.anything())
    expect(screen.getByRole('listbox', { name: 'Symboler' })).toBeTruthy()

    // A second press is the same press undone: the list goes, and so does the brace it wrote. A
    // brace standing alone with no finished symbol in it is not something anybody typed — it is a
    // step that was begun and taken back.
    fireEvent.click(brace)
    expect(onCell).toHaveBeenLastCalledWith('dragon', 'body', 'Flygande.', expect.anything())
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('only ever takes back a brace it wrote itself, never one that was typed (#236)', () => {
    const { cell, onCell } = setup()
    // A brace the designer typed herself. The button has no claim on it: pressing it writes a
    // second brace rather than eating the first, because what somebody typed is theirs.
    fireEvent.focus(cell)
    type(cell, 'Flygande. {')
    expect(screen.getByRole('listbox', { name: 'Symboler' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Sätt in en ikon' }))
    // A brace was written, not taken away: the value the cell is asked to hold is one character
    // longer than what it held and ends in the new brace. (The cell is controlled by the document,
    // and this test's `onCell` is a spy that does not write one, so the text it starts from is the
    // row's own `Flygande.` rather than what was typed over it.)
    const [, , written] = onCell.mock.calls.at(-1) as [string, string, string, unknown]
    expect(written.endsWith('{')).toBe(true)
    expect(written.length).toBeGreaterThan('Flygande.'.length)
    expect(screen.getByRole('listbox', { name: 'Symboler' })).toBeTruthy()
  })

  it('moves through the list with the arrow keys, takes one with Enter, and closes on Escape', async () => {
    const { cell, onCell } = setup()
    type(cell, '{s')
    const list = screen.getByRole('listbox', { name: 'Symboler' })
    const names = within(list).getAllByRole('option').map((o) => o.getAttribute('data-symbol'))
    expect(within(list).getAllByRole('option')[0]!.getAttribute('aria-selected')).toBe('true')
    // Driven from the cell rather than entered, which is the same way the rail's Ikon tool drives
    // the same library (E4): the options are not stops in the tab order, and the cell says which
    // one the keys are on so a reader who cannot see the highlight is told the same thing.
    expect(within(list).getAllByRole('option').map((o) => o.getAttribute('tabindex'))).toEqual(within(list).getAllByRole('option').map(() => '-1'))
    expect(cell.getAttribute('aria-activedescendant')).toBe(within(list).getAllByRole('option')[0]!.id)
    fireEvent.keyDown(cell, { key: 'ArrowDown' })
    expect(cell.getAttribute('aria-activedescendant')).toBe(within(list).getAllByRole('option')[1]!.id)
    expect(within(list).getAllByRole('option')[1]!.getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(cell, { key: 'ArrowUp' })
    fireEvent.keyDown(cell, { key: 'ArrowUp' })
    expect(within(list).getAllByRole('option')[0]!.getAttribute('aria-selected')).toBe('true')

    // And the ends of the list, which every other list in the editor answers (#235): eight matches
    // is five arrow presses to the one at the bottom, and a library narrowed by a letter or two is
    // very often longest exactly when the designer knows which end she wants.
    const last = within(list).getAllByRole('option').length - 1
    fireEvent.keyDown(cell, { key: 'End' })
    expect(within(list).getAllByRole('option')[last]!.getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(cell, { key: 'Home' })
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
        onAddField={() => undefined}
        onRemoveField={() => undefined}
        onMoveField={() => undefined}
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
    render(<DataTable doc={now()} selectedRow={null} onSelectRow={() => undefined} onCell={() => undefined} onAddRow={() => undefined} onRemoveRow={() => undefined} onReplaceRows={() => undefined} onAddField={() => undefined} onRemoveField={() => undefined} onMoveField={() => undefined} />)
    expect(screen.queryByText(/Jämför med/)).toBeNull()
    expect(screen.getAllByRole('row').slice(1).map((r) => r.getAttribute('data-change'))).toEqual([null, null, null])
  })
})

// The meaning a symbol is written in (E4). The syntax teaches itself: typing the bar after a
// symbol's name turns the very same picker into the deck's meanings, so the designer never has to
// learn a key that does not collide with moving around a table.
describe('the meaning picker after the bar (E4)', () => {
  const setup = (palette: Record<string, string> = { fara: '#8f2d20', kostnad: '#7a5c00', vinst: '#2f6136' }) => {
    const doc = { ...projectDoc(), palette }
    const onCell = vi.fn()
    render(<DataTable doc={doc} selectedRow={null} onSelectRow={() => undefined} onCell={onCell} onAddRow={() => undefined} onRemoveRow={() => undefined} onReplaceRows={() => undefined} onAddField={() => undefined} onRemoveField={() => undefined} onMoveField={() => undefined} onSymbol={vi.fn(async (s: GameSymbol) => symbolName(s))} />)
    const cell = within(screen.getAllByRole('row')[1]!).getByLabelText('dragon body') as HTMLInputElement
    return { cell, onCell }
  }
  const type = (cell: HTMLInputElement, value: string) => {
    fireEvent.change(cell, { target: { value, selectionStart: value.length } })
  }

  it('offers the deck’s meanings once the bar is typed, and narrows as one is named', () => {
    const { cell } = setup()
    type(cell, 'Skada {sköld|')
    const list = screen.getByRole('listbox', { name: 'Betydelser' })
    expect(within(list).getAllByRole('option').map((o) => o.textContent)).toEqual([expect.stringContaining('fara'), expect.stringContaining('kostnad'), expect.stringContaining('vinst')])

    type(cell, 'Skada {sköld|k')
    expect(within(list).getAllByRole('option').map((o) => o.textContent)).toEqual([expect.stringContaining('kostnad')])
  })

  it('writes the symbol and its meaning together, leaving the rest of the sentence alone', () => {
    const { cell, onCell } = setup()
    // The cursor stands right after the "f", as it does while a word is being typed: what comes
    // after it is the rest of the sentence and is not part of what is being named.
    fireEvent.change(cell, { target: { value: 'Skada {sköld|f 2.', selectionStart: 14 } })
    fireEvent.keyDown(cell, { key: 'Enter' })

    expect(onCell).toHaveBeenCalledWith('dragon', 'body', 'Skada {sköld|fara} 2.')
  })

  it('says nothing when the deck has named no meanings yet, rather than offering an empty list', () => {
    const { cell } = setup({})
    type(cell, 'Skada {sköld|')

    expect(screen.queryByRole('listbox')).toBeNull()
  })
})

// A data file let go on the control that takes one (#292). The compact local pattern the owner
// settled in #291 (variant B): the import control is itself the receiver, there is no second box
// beside it and no drop over the whole Data tab. So a drop is a second way into the one path the
// picker already walks — the same reading, the same replacement, the same warning that a save is
// what makes it stick.
//
// Every file here carries real bytes, and what is measured is the rows that came out of them on
// the far side. A drop that handed the table anything but the designer's file — the literal
// "[object Blob]" a jsdom upload once quietly sent — parses to no id column at all and turns
// these red.
describe('dropping a CSV on the import (#292)', () => {
  const carrying = (given: File[]) => ({
    dataTransfer: { files: given, items: given.map((f) => ({ kind: 'file', type: f.type, getAsFile: () => f })), types: ['Files'], getData: () => '' },
  })
  const csv = (name = 'kort.csv', type = 'text/csv', text = 'id,title,body,antal\ndrake,Drake,Flygande,2\nriddare,Riddare,Till häst,1') =>
    new File([text], name, { type })
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

  // The box in the crown is opened first: the control only exists once the designer has asked for
  // the import (#130), and the drop is that control's and nothing wider.
  const open = () => {
    const onReplaceRows = vi.fn()
    render(
      <DataTable
        doc={projectDoc()}
        selectedRow={null}
        onSelectRow={() => undefined}
        onCell={() => undefined}
        onAddRow={() => undefined}
        onRemoveRow={() => undefined}
        onReplaceRows={onReplaceRows}
        onAddField={() => undefined}
        onRemoveField={() => undefined}
        onMoveField={() => undefined}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Importera' }))
    return { onReplaceRows }
  }
  const control = () => screen.getByLabelText('Importera CSV…').closest('label') as HTMLLabelElement
  const ROWS = [
    { id: 'drake', fields: { title: 'Drake', body: 'Flygande', antal: 2 } },
    { id: 'riddare', fields: { title: 'Riddare', body: 'Till häst', antal: 1 } },
  ]

  it('takes the dropped file down the same path the picker takes, bytes and all', async () => {
    const { onReplaceRows } = open()
    // Both halves are cancelled. A file let go where the page does not catch it is the browser
    // leaving the editor to open the CSV as a page of its own.
    expect(fireEvent.dragOver(control(), carrying([csv()]))).toBe(false)
    expect(fireEvent.drop(control(), carrying([csv()]))).toBe(false)

    // The rows the picker's own test asserts, line for line — one reading and not two.
    await waitFor(() => expect(onReplaceRows).toHaveBeenCalledWith(ROWS))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('marks the control while the file is over it, and lets the mark go again', async () => {
    open()
    const dragged = carrying([csv()])

    expect(control().getAttribute('data-over')).toBeNull()
    fireEvent.dragOver(control(), dragged)
    expect(control().getAttribute('data-over')).toBe('true')
    // Dragged away and nothing let go: the mark is about the drag and nothing was imported.
    fireEvent.dragLeave(control(), dragged)
    expect(control().getAttribute('data-over')).toBeNull()

    fireEvent.dragOver(control(), dragged)
    fireEvent.drop(control(), dragged)
    await waitFor(() => expect(control().getAttribute('data-over')).toBeNull())
  })

  // The one thing a drop must never do: take the first of them and throw the rest away without a
  // word. An import replaces the whole table, so the wrong first file is the wrong deck.
  it('refuses more than one file and names them, instead of quietly taking the first', async () => {
    const { onReplaceRows } = open()
    fireEvent.drop(control(), carrying([csv('vinter.csv'), csv('sommar.csv')]))

    const said = (await screen.findByRole('alert')).textContent ?? ''
    expect(said).toContain('vinter.csv')
    expect(said).toContain('sommar.csv')
    expect(onReplaceRows).not.toHaveBeenCalled()
  })

  // `accept` never sees a dropped file, so the control has to say this itself rather than leave
  // the designer with a control that looked as though it did nothing.
  it('says so when what was let go is not a data file at all', async () => {
    const { onReplaceRows } = open()
    fireEvent.drop(control(), carrying([new File([PNG], 'bordet.png', { type: 'image/png' })]))

    expect((await screen.findByRole('alert')).textContent).toContain('bordet.png')
    expect(onReplaceRows).not.toHaveBeenCalled()
  })

  // And the other side of that: a CSV out of a spreadsheet arrives with an empty type on a great
  // many machines, so a receiver that sorted on `File.type` would turn away the ordinary case
  // (#294). The name is what is read.
  it('takes a dropped CSV the browser had no type for, and a tab-separated file too', async () => {
    const { onReplaceRows } = open()
    fireEvent.drop(control(), carrying([csv('kort.csv', '')]))
    await waitFor(() => expect(onReplaceRows).toHaveBeenCalledWith(ROWS))

    fireEvent.drop(control(), carrying([csv('kort.tsv', '', 'id\ttitle\tbody\tantal\ndrake\tDrake\tFlygande\t2\nriddare\tRiddare\tTill häst\t1')]))
    await waitFor(() => expect(onReplaceRows).toHaveBeenCalledTimes(2))
    expect(onReplaceRows).toHaveBeenLastCalledWith(ROWS)
  })

  // Nothing becomes drop-only. The picker is still a file input a keyboard reaches, it is still
  // the thing the warning is bound to, and a refused drop is something to try again from.
  it('leaves the picker to the keyboard, and lets a refusal be tried again', async () => {
    const { onReplaceRows } = open()
    fireEvent.drop(control(), carrying([csv('vinter.csv'), csv('sommar.csv')]))
    await screen.findByRole('alert')

    const picker = screen.getByLabelText('Importera CSV…') as HTMLInputElement
    expect(picker.tagName).toBe('INPUT')
    expect(picker.type).toBe('file')
    expect(picker.disabled).toBe(false)
    expect(picker.getAttribute('aria-describedby')).toBeTruthy()

    fireEvent.change(picker, { target: { files: [csv()] } })
    await waitFor(() => expect(onReplaceRows).toHaveBeenCalledWith(ROWS))
    // The refusal gave way once the retry went through: what stands is the state of the table,
    // not a line about a gesture that is over.
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })
})
