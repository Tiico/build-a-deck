// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import type { ProjectDoc } from '@byd/server'
import { DataTable, type DataTableProps } from '../src/editor/DataTable.js'
import { projectDoc } from './project-doc.js'

// A deck big enough to be worth filtering: eight cards over two card types, a numeric cost, and
// free text in `title` and `body`. Nothing here is alphabetical or numeric in creation order.
function bigDoc(): ProjectDoc {
  const rows: ProjectDoc['rows'] = [
    { id: 'drake', fields: { typ: 'varelse', kostnad: '10', title: 'Drake', body: 'Flygande.', antal: 2 } },
    { id: 'grop', fields: { typ: 'fälla', kostnad: '2', title: 'Grop', body: 'Dolt kort.', antal: 1 } },
    { id: 'alv', fields: { typ: 'varelse', kostnad: '9', title: 'Alv', body: 'Dra ett kort.', antal: 3 } },
    { id: 'nat', fields: { typ: 'fälla', kostnad: '4', title: 'Nät', body: 'Fånga en varelse.', antal: 1 } },
    { id: 'troll', fields: { typ: 'varelse', kostnad: '6', title: 'Troll', body: 'Tål mycket.', antal: 1 } },
    { id: 'stock', fields: { typ: 'plats', kostnad: '1', title: 'Stock', body: 'Dolt hinder.', antal: 2 } },
    { id: 'orm', fields: { typ: 'varelse', kostnad: '3', title: 'Orm', body: 'Gift.', antal: 1 } },
    { id: 'grav', fields: { typ: 'plats', kostnad: '7', title: 'Grav', body: 'Djup grop.', antal: 1 } },
  ]
  return { ...projectDoc(), rows }
}

function renderTable(doc: ProjectDoc, handlers: Partial<DataTableProps> = {}) {
  const noop = () => undefined
  return render(
    <DataTable
      doc={doc}
      selectedRow={null}
      onSelectRow={noop}
      onCell={noop}
      onAddRow={noop}
      onRemoveRow={noop}
      onReplaceRows={noop}
      onAddField={() => undefined}
      onRemoveField={() => undefined}
      {...handlers}
    />,
  )
}

const shownIds = () => screen.getAllByRole('row').slice(1).map((row) => row.getAttribute('data-card-ref'))

describe('DataTable free-text search (#16)', () => {
  it('shows only the cards whose fields carry the searched text', async () => {
    const user = userEvent.setup()
    renderTable(bigDoc())
    expect(shownIds()).toHaveLength(8)

    await user.type(screen.getByLabelText('Sök i alla fält'), 'dolt')

    expect(shownIds()).toEqual(['grop', 'stock'])
  })
})

describe('DataTable count of shown cards (#16)', () => {
  it('says how many of the deck are on screen, and says it out loud', async () => {
    const user = userEvent.setup()
    renderTable(bigDoc())
    expect(screen.getByText('8 av 8 kort').closest('[aria-live="polite"]')).not.toBeNull()

    await user.type(screen.getByLabelText('Sök i alla fält'), 'dolt')

    expect(screen.getByText('2 av 8 kort')).toBeDefined()
  })
})

describe('DataTable type chips (#16)', () => {
  it('offers a chip per value of the deck category column and shows only that type', async () => {
    const user = userEvent.setup()
    renderTable(bigDoc())
    const chips = within(screen.getByRole('group', { name: 'Filtrera på typ' })).getAllByRole('button')
    expect(chips.map((chip) => chip.textContent)).toEqual(['fälla', 'plats', 'varelse'])
    expect(chips.map((chip) => chip.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'false'])

    await user.click(screen.getByRole('button', { name: 'varelse' }))

    expect(shownIds()).toEqual(['drake', 'alv', 'troll', 'orm'])
    expect(chips.map((chip) => chip.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true'])
    expect(screen.getByText('4 av 8 kort')).toBeDefined()
  })
})

describe('DataTable search and chips together (#16)', () => {
  it('narrows the search to the pressed type, and lets go of the type again', async () => {
    const user = userEvent.setup()
    renderTable(bigDoc())

    await user.type(screen.getByLabelText('Sök i alla fält'), 'kort')
    expect(shownIds()).toEqual(['grop', 'alv'])

    await user.click(screen.getByRole('button', { name: 'varelse' }))
    expect(shownIds()).toEqual(['alv'])
    expect(screen.getByText('1 av 8 kort')).toBeDefined()

    await user.click(screen.getByRole('button', { name: 'varelse' }))
    expect(shownIds()).toEqual(['grop', 'alv'])
  })

  it('treats two pressed chips of the same column as alternatives', async () => {
    const user = userEvent.setup()
    renderTable(bigDoc())

    await user.click(screen.getByRole('button', { name: 'fälla' }))
    await user.click(screen.getByRole('button', { name: 'plats' }))

    expect(shownIds()).toEqual(['grop', 'nat', 'stock', 'grav'])
    expect(screen.getByText('4 av 8 kort')).toBeDefined()
  })
})

describe('DataTable filter and sort together (#16 on #15)', () => {
  it('keeps the sorted order among the rows the filter lets through, whichever came first', async () => {
    const user = userEvent.setup()
    renderTable(bigDoc())

    await user.click(screen.getByRole('button', { name: /^kostnad/ }))
    await user.click(screen.getByRole('button', { name: 'varelse' }))
    expect(shownIds()).toEqual(['orm', 'troll', 'alv', 'drake'])

    await user.click(screen.getByRole('button', { name: /^kostnad/ }))
    expect(shownIds()).toEqual(['drake', 'alv', 'troll', 'orm'])
    expect(screen.getByRole('status').textContent).toBe('Sorterad på kostnad, fallande.')
  })
})

// The editor owns the project: a cell edit comes back as a new doc, exactly as `EditorPage` does.
function EditedTable({ start }: { start: ProjectDoc }) {
  const [doc, setDoc] = useState(start)
  const noop = () => undefined
  return (
    <DataTable
      doc={doc}
      selectedRow={null}
      onSelectRow={noop}
      onCell={(cardRef, field, value) =>
        setDoc((d) => ({ ...d, rows: d.rows.map((row) => (row.id === cardRef ? { ...row, fields: { ...row.fields, [field]: value } } : row)) }))
      }
      onAddRow={noop}
      onRemoveRow={noop}
      onReplaceRows={noop}
      onAddField={() => undefined}
      onRemoveField={() => undefined}
    />
  )
}

// The editor owns the project: a new card comes back as a new doc, exactly as `EditorPage` does.
function AddableTable({ start }: { start: ProjectDoc }) {
  const [doc, setDoc] = useState(start)
  const noop = () => undefined
  return (
    <DataTable
      doc={doc}
      selectedRow={null}
      onSelectRow={noop}
      onCell={noop}
      onAddRow={(cardRef) => setDoc((d) => ({ ...d, rows: [...d.rows, { id: cardRef, fields: { title: '', antal: 1 } }] }))}
      onRemoveRow={noop}
      onReplaceRows={noop}
      onAddField={() => undefined}
      onRemoveField={() => undefined}
    />
  )
}

describe('DataTable new card under an active filter (#16)', () => {
  it('keeps the new card on screen even though it matches nothing, and says so', async () => {
    const user = userEvent.setup()
    render(<AddableTable start={bigDoc()} />)
    await user.click(screen.getByRole('button', { name: 'varelse' }))
    expect(shownIds()).toEqual(['drake', 'alv', 'troll', 'orm'])

    await user.click(screen.getByRole('button', { name: /Nytt kort/ }))

    expect(shownIds()).toEqual(['drake', 'alv', 'troll', 'orm', 'kort-9'])
    expect(screen.getByText('5 av 9 kort')).toBeDefined()
    expect(screen.getByText('nytt kort visas trots filtret').closest('[aria-live="polite"]')).not.toBeNull()
  })

  it('lets the new card fall behind the filter as soon as the filter is touched again', async () => {
    const user = userEvent.setup()
    render(<AddableTable start={bigDoc()} />)
    await user.click(screen.getByRole('button', { name: 'varelse' }))
    await user.click(screen.getByRole('button', { name: /Nytt kort/ }))

    await user.type(screen.getByLabelText('Sök i alla fält'), 'troll')

    expect(shownIds()).toEqual(['troll'])
    expect(screen.queryByText('nytt kort visas trots filtret')).toBeNull()
  })
})

describe('DataTable filtering as a view only (#16)', () => {
  it('hides rows without removing them: the project and its export keep every card', async () => {
    const user = userEvent.setup()
    const doc = bigDoc()
    renderTable(doc)

    await user.click(screen.getByRole('button', { name: 'varelse' }))
    expect(shownIds()).toHaveLength(4)

    expect(doc.rows.map((row) => row.id)).toHaveLength(8)
    const csv = decodeURIComponent((screen.getByRole('link', { name: 'Exportera CSV' }) as HTMLAnchorElement).href)
    for (const id of ['drake', 'grop', 'alv', 'nat', 'troll', 'stock', 'orm', 'grav']) expect(csv).toContain(id)

    await user.click(screen.getByRole('button', { name: 'varelse' }))
    expect(shownIds()).toHaveLength(8)
  })
})

describe('DataTable with nothing left to show (#16)', () => {
  it('says that the deck is behind the filter and offers the way back', async () => {
    const user = userEvent.setup()
    renderTable(bigDoc())

    await user.type(screen.getByLabelText('Sök i alla fält'), 'sjöodjur')

    expect(shownIds()).toEqual([])
    expect(screen.getByText('0 av 8 kort')).toBeDefined()
    expect(screen.getByText('Inga kort matchar filtret.')).toBeDefined()

    await user.click(screen.getByRole('button', { name: 'Rensa filter' }))

    expect(shownIds()).toHaveLength(8)
    expect((screen.getByLabelText('Sök i alla fält') as HTMLInputElement).value).toBe('')
    expect(screen.queryByRole('button', { name: 'Rensa filter' })).toBeNull()
  })
})

// Reaching the filter by keyboard alone: the search field is a real field and every chip a real
// button, so the tab order and Space/Enter are the browser's own.
describe('DataTable filtering from the keyboard (#16)', () => {
  it('puts the search field and the chips in the tab order, after the data tools', async () => {
    const user = userEvent.setup()
    renderTable(bigDoc())

    await user.tab()
    expect(document.activeElement).toBe(screen.getByLabelText('Importera CSV'))
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Exportera CSV' }))
    await user.tab()
    expect(document.activeElement).toBe(screen.getByLabelText('Sök i alla fält'))
    for (const name of ['fälla', 'plats', 'varelse']) {
      await user.tab()
      expect(document.activeElement).toBe(screen.getByRole('button', { name }))
    }
    await user.tab()
    expect(document.activeElement).toBe(screen.getByLabelText('Markera alla synliga'))
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /^id/ }))
  })

  it('presses a chip with Space and lets go of it with Enter, keeping the focus on the chip', async () => {
    const user = userEvent.setup()
    renderTable(bigDoc())
    const falla = screen.getByRole('button', { name: 'fälla' })

    for (let i = 0; i < 10 && document.activeElement !== falla; i++) await user.tab()
    expect(document.activeElement).toBe(falla)

    await user.keyboard(' ')
    expect(falla.getAttribute('aria-pressed')).toBe('true')
    expect(shownIds()).toEqual(['grop', 'nat'])
    expect(screen.getByText('2 av 8 kort')).toBeDefined()
    expect(document.activeElement).toBe(falla)

    await user.keyboard('{Enter}')
    expect(falla.getAttribute('aria-pressed')).toBe('false')
    expect(shownIds()).toHaveLength(8)
    expect(document.activeElement).toBe(falla)
  })

  it('searches as the designer types into the field', async () => {
    const user = userEvent.setup()
    renderTable(bigDoc())

    await user.click(screen.getByLabelText('Sök i alla fält'))
    await user.keyboard('grop')
    expect(shownIds()).toEqual(['grop', 'grav'])

    await user.keyboard('{Backspace}{Backspace}{Backspace}{Backspace}')
    expect(shownIds()).toHaveLength(8)
  })
})

describe('DataTable filtering while a cell is being edited (#16 on #15)', () => {
  it('holds the screen still: a row that stops matching stays until the field is left', async () => {
    const user = userEvent.setup()
    render(<EditedTable start={bigDoc()} />)
    await user.click(screen.getByRole('button', { name: 'varelse' }))
    expect(shownIds()).toEqual(['drake', 'alv', 'troll', 'orm'])

    const typ = screen.getByLabelText('troll typ')
    await user.click(typ)
    expect(shownIds()).toEqual(['drake', 'alv', 'troll', 'orm'])

    await user.clear(typ)
    await user.type(typ, 'fälla')
    expect(shownIds()).toEqual(['drake', 'alv', 'troll', 'orm'])
    expect((screen.getByLabelText('troll typ') as HTMLInputElement).value).toBe('fälla')

    // Tabbing on to the next cell of the same row is still editing that row: it stays put.
    await user.tab()
    expect(shownIds()).toEqual(['drake', 'alv', 'troll', 'orm'])

    // Leaving the table for the search field lets the filter have its way.
    await user.click(screen.getByLabelText('Sök i alla fält'))
    expect(shownIds()).toEqual(['drake', 'alv', 'orm'])
    expect(screen.getByText('3 av 8 kort')).toBeDefined()
  })
})

describe('DataTable chips for a deck that has no category column (#16)', () => {
  it('offers the search alone when no column reads as a vocabulary', () => {
    // The fields of a deck are the designer's own: this one is title, body and antal, and none of
    // them repeats. A chip row would have one chip per card, so there is none.
    renderTable(projectDoc())

    expect(screen.queryByRole('group', { name: /^Filtrera på/ })).toBeNull()
    expect(screen.getByLabelText('Sök i alla fält')).toBeDefined()
    expect(screen.getByText('3 av 3 kort')).toBeDefined()
  })
})

describe('DataTable for a deck with no cards yet (#16)', () => {
  it('does not blame a filter that is not on', () => {
    renderTable({ ...projectDoc(), rows: [] })

    expect(shownIds()).toEqual([])
    expect(screen.queryByText('Inga kort matchar filtret.')).toBeNull()
    expect(screen.getByText('0 av 0 kort')).toBeDefined()
  })
})

// A question about a card the filter has taken off the screen is not a question any more (#8),
// exactly as a question about cards that are no longer marked is not one (#17).
describe('DataTable row delete under a filter (#8 on #16)', () => {
  it('takes back the question when the card it is about leaves the screen', async () => {
    const user = userEvent.setup()
    const onRemoveRow = vi.fn()
    renderTable(bigDoc(), { onRemoveRow })

    const grop = document.querySelector('[data-card-ref="grop"]') as HTMLElement
    await user.click(within(grop).getByRole('button', { name: 'ta bort grop' }))
    expect(screen.getByRole('alertdialog', { name: 'Ta bort kortet grop' })).toBeDefined()

    await user.click(screen.getByRole('button', { name: 'varelse' }))

    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(onRemoveRow).not.toHaveBeenCalled()
  })
})
