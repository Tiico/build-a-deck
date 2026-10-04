// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import type { ProjectDoc } from '@byd/server'
import { DataTable, type DataTableProps } from '../src/editor/DataTable.js'
import { projectDoc } from './project-doc.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

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
      onMoveField={() => undefined}
      {...handlers}
    />,
  )
}

const shownIds = () => screen.getAllByRole('row').slice(1).map((row) => row.getAttribute('data-card-ref'))

// The way a value is chosen since #617: through the column's own door in the head. The door is
// left standing, as a hand would leave it; a press anywhere else in the work closes it.
async function tick(user: ReturnType<typeof userEvent.setup>, field: string, value: string) {
  const handle = screen.getByRole('button', { name: new RegExp(`^Filtrera på ${field}`) })
  if (handle.getAttribute('aria-expanded') !== 'true') await user.click(handle)
  await user.click(within(screen.getByRole('group', { name: `Filtrera på ${field}` })).getByRole('checkbox', { name: value }))
}

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

// The filter of a column with a vocabulary stands in that column's head (#617, variant A): a
// button beside the sort opens the values as ticks, and what is ticked is said as a token in the
// search field — «typ: varelse ×» — so the state is read without opening anything.
describe('DataTable column filter in the head (#617)', () => {
  it('lists the column\'s values behind the head, shows only the ticked type, and says so in the field', async () => {
    const user = userEvent.setup()
    renderTable(bigDoc())
    expect(screen.queryByRole('group', { name: 'Filtrera på typ' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Filtrera på typ' }))

    const door = screen.getByRole('group', { name: 'Filtrera på typ' })
    const ticks = within(door).getAllByRole('checkbox')
    expect(ticks.map((tick) => (tick as HTMLInputElement).checked)).toEqual([false, false, false])
    expect(ticks.map((tick) => tick.getAttribute('aria-label'))).toEqual(['fälla', 'plats', 'varelse'])

    await user.click(within(door).getByRole('checkbox', { name: 'varelse' }))

    expect(shownIds()).toEqual(['drake', 'alv', 'troll', 'orm'])
    expect(screen.getByText('4 av 8 kort')).toBeDefined()
    expect(screen.getByText('typ: varelse')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Ta bort filtret typ: varelse' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Filtrera på typ, 1 valt' }).getAttribute('aria-expanded')).toBe('true')
  })

  it('takes the tick away from the token in the field, and leaves the hand in the field', async () => {
    const user = userEvent.setup()
    renderTable(bigDoc())
    await user.click(screen.getByRole('button', { name: 'Filtrera på typ' }))
    await user.click(screen.getByRole('checkbox', { name: 'varelse' }))
    expect(shownIds()).toHaveLength(4)

    await user.click(screen.getByRole('button', { name: 'Ta bort filtret typ: varelse' }))

    expect(shownIds()).toHaveLength(8)
    expect(screen.queryByText('typ: varelse')).toBeNull()
    expect(document.activeElement).toBe(screen.getByLabelText('Sök i alla fält'))
    expect(screen.getByRole('button', { name: 'Filtrera på typ' })).toBeDefined()
  })

  it('opens on the first tick, closes on Escape back to its handle, and closes on a press in the work', async () => {
    const user = userEvent.setup()
    renderTable(bigDoc())
    const handle = screen.getByRole('button', { name: 'Filtrera på typ' })
    await user.click(handle)
    expect(document.activeElement).toBe(screen.getByRole('checkbox', { name: 'fälla' }))

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('group', { name: 'Filtrera på typ' })).toBeNull()
    expect(document.activeElement).toBe(handle)

    await user.click(handle)
    expect(screen.getByRole('group', { name: 'Filtrera på typ' })).toBeDefined()
    await user.click(screen.getByLabelText('Sök i alla fält'))
    expect(screen.queryByRole('group', { name: 'Filtrera på typ' })).toBeNull()
  })
})

describe('DataTable search and column filter together (#16, #617)', () => {
  it('narrows the search to the pressed type, and lets go of the type again', async () => {
    const user = userEvent.setup()
    renderTable(bigDoc())

    await user.type(screen.getByLabelText('Sök i alla fält'), 'kort')
    expect(shownIds()).toEqual(['grop', 'alv'])

    await tick(user, 'typ', 'varelse')
    expect(shownIds()).toEqual(['alv'])
    expect(screen.getByText('1 av 8 kort')).toBeDefined()

    await tick(user, 'typ', 'varelse')
    expect(shownIds()).toEqual(['grop', 'alv'])
  })

  it('treats two ticked values of the same column as alternatives', async () => {
    const user = userEvent.setup()
    renderTable(bigDoc())

    await tick(user, 'typ', 'fälla')
    await tick(user, 'typ', 'plats')

    expect(shownIds()).toEqual(['grop', 'nat', 'stock', 'grav'])
    expect(screen.getByText('4 av 8 kort')).toBeDefined()
  })
})

describe('DataTable filter and sort together (#16 on #15)', () => {
  it('keeps the sorted order among the rows the filter lets through, whichever came first', async () => {
    const user = userEvent.setup()
    renderTable(bigDoc())

    await user.click(screen.getByRole('button', { name: /^kostnad/ }))
    await tick(user, 'typ', 'varelse')
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
      onMoveField={() => undefined}
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
      onMoveField={() => undefined}
    />
  )
}

describe('DataTable new card under an active filter (#16)', () => {
  it('keeps the new card on screen even though it matches nothing, and says so', async () => {
    const user = userEvent.setup()
    render(<AddableTable start={bigDoc()} />)
    await tick(user, 'typ', 'varelse')
    expect(shownIds()).toEqual(['drake', 'alv', 'troll', 'orm'])

    await user.click(screen.getByRole('button', { name: /Nytt kort/ }))

    expect(shownIds()).toEqual(['drake', 'alv', 'troll', 'orm', 'kort-9'])
    expect(screen.getByText('5 av 9 kort')).toBeDefined()
    expect(screen.getByText('nytt kort visas trots filtret').closest('[aria-live="polite"]')).not.toBeNull()
  })

  it('lets the new card fall behind the filter as soon as the filter is touched again', async () => {
    const user = userEvent.setup()
    render(<AddableTable start={bigDoc()} />)
    await tick(user, 'typ', 'varelse')
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

    await tick(user, 'typ', 'varelse')
    expect(shownIds()).toHaveLength(4)

    expect(doc.rows.map((row) => row.id)).toHaveLength(8)
    fireEvent.click(screen.getByRole('button', { name: 'CSV' }))
    const csv = decodeURIComponent((screen.getByRole('link', { name: 'Ladda ner CSV' }) as HTMLAnchorElement).href)
    fireEvent.click(screen.getByRole('button', { name: 'CSV' }))
    for (const id of ['drake', 'grop', 'alv', 'nat', 'troll', 'stock', 'orm', 'grav']) expect(csv).toContain(id)

    await tick(user, 'typ', 'varelse')
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
  // The filter is the first thing in the tab order now (#130): it is a state the reader is
  // standing in, and the CSV pair — done once, and not a state — is behind the box at the end of
  // the crown, which is also where the keyboard reaches it.
  it('puts the search field first in the tab order, the CSV box after it, and the filter in the head', async () => {
    const user = userEvent.setup()
    renderTable(bigDoc())

    await user.tab()
    expect(document.activeElement).toBe(screen.getByLabelText('Sök i alla fält'))
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'CSV' }))
    // And what the box holds is not in the tab order at all until it is opened, which is the
    // whole of what a box costs and what it buys.
    expect(screen.queryByLabelText('Importera CSV…')).toBeNull()
    await user.keyboard('{Enter}')
    await user.tab()
    expect(document.activeElement).toBe(screen.getByLabelText('Importera CSV…'))
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Ladda ner CSV' }))
    // First in the table, the way past it (#575).
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('link', { name: /^Hoppa förbi tabellen/ }))
    await user.tab()
    expect(document.activeElement).toBe(screen.getByLabelText('Markera alla synliga'))
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /^id/ }))
    // The column's filter stands right after what the column is called and sorts on (#617); the
    // columns before it are words with no vocabulary and have no filter to stop at.
    for (let i = 0; i < 6 && document.activeElement !== screen.getByRole('button', { name: /^typ/ }); i++) await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /^typ/ }))
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Filtrera på typ' }))
  })

  it('opens the door with Enter, ticks a value with Space, and comes back to the handle on Escape', async () => {
    const user = userEvent.setup()
    renderTable(bigDoc())
    const handle = screen.getByRole('button', { name: 'Filtrera på typ' })

    for (let i = 0; i < 10 && document.activeElement !== handle; i++) await user.tab()
    expect(document.activeElement).toBe(handle)

    await user.keyboard('{Enter}')
    expect(document.activeElement).toBe(screen.getByRole('checkbox', { name: 'fälla' }))
    await user.keyboard(' ')
    expect(shownIds()).toEqual(['grop', 'nat'])
    expect(screen.getByText('2 av 8 kort')).toBeDefined()
    expect(screen.getByText('typ: fälla')).toBeDefined()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('group', { name: 'Filtrera på typ' })).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Filtrera på typ, 1 valt' }))
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
    await tick(user, 'typ', 'varelse')
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

describe('DataTable filter for a deck that has no category column (#16)', () => {
  it('offers the search alone when no column reads as a vocabulary', () => {
    // The fields of a deck are the designer's own: this one is title, body and antal, and none of
    // them repeats. A chip row would have one chip per card, so there is none.
    renderTable(projectDoc())

    expect(screen.queryByRole('button', { name: /^Filtrera på/ })).toBeNull()
    expect(screen.getByLabelText('Sök i alla fält')).toBeDefined()
    expect(screen.getByText('3 av 3 kort')).toBeDefined()
  })
})

// A picture is not a word, and the chip row is a row of words (#16 on E1).
describe('DataTable filter for a deck with images (#16 on E1)', () => {
  // The same deck, given a picture column: `art` is drawn by the template, so its cells hold
  // `asset:<hash>` and two images are shared across the eight cards — which counts exactly like
  // the type column does.
  function withArt(): ProjectDoc {
    const doc = bigDoc()
    const art = (n: number) => `asset:${String(n).repeat(64)}`
    // The template is a factory of its own, so pushing the picture onto this front lays nothing
    // under the next test's feet (#49).
    doc.template.faces['front']?.base.push({ kind: 'image', id: 'art', x: 5, y: 16, w: 53, h: 12, bind: { field: 'art' } })
    return { ...doc, rows: doc.rows.map((row, i) => ({ ...row, fields: { ...row.fields, art: art(i % 2) } })) }
  }

  it('does not offer the hash of a picture as a filter, and keeps the columns that are words', () => {
    renderTable(withArt())

    expect(screen.queryByRole('button', { name: /^Filtrera på art/ })).toBeNull()
    expect(screen.queryByText(/^asset:/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Filtrera på typ' })).toBeDefined()
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

    await tick(user, 'typ', 'varelse')

    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(onRemoveRow).not.toHaveBeenCalled()
  })
})

// The keyboard's way into the same filter (#617 on L23): a character opens a list. «typ:» in the
// search field lists the column's values under it, narrowing as the designer types, and Enter takes
// the one under the cursor as a token — the same token the column's door would have made.
describe('DataTable typed column in the search field (#617, L23)', () => {
  it('lists the column\'s values on «typ:», narrows them as the designer types, and takes the chosen one as a token', async () => {
    const user = userEvent.setup()
    renderTable(bigDoc())
    const field = screen.getByLabelText('Sök i alla fält')
    await user.click(field)
    await user.keyboard('typ:')

    const list = screen.getByRole('listbox', { name: 'typ' })
    expect(within(list).getAllByRole('option').map((option) => option.getAttribute('aria-label'))).toEqual(['fälla', 'plats', 'varelse'])
    // The text «typ:» is a way in, not a search: nothing is filtered by it.
    expect(shownIds()).toHaveLength(8)

    await user.keyboard('v')
    expect(within(screen.getByRole('listbox', { name: 'typ' })).getAllByRole('option').map((option) => option.getAttribute('aria-label'))).toEqual(['varelse'])

    await user.keyboard('{Enter}')
    expect(shownIds()).toEqual(['drake', 'alv', 'troll', 'orm'])
    expect(screen.getByText('typ: varelse')).toBeDefined()
    expect((field as HTMLInputElement).value).toBe('')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(document.activeElement).toBe(field)
  })

  it('walks the list with the arrows and says when no value begins so', async () => {
    const user = userEvent.setup()
    renderTable(bigDoc())
    await user.click(screen.getByLabelText('Sök i alla fält'))
    await user.keyboard('typ:')
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(screen.getByText('typ: varelse')).toBeDefined()

    await user.keyboard('typ:x')
    expect(screen.getByRole('listbox', { name: 'typ' }).textContent).toContain('inget värde börjar så')
    expect(shownIds()).toEqual(['drake', 'alv', 'troll', 'orm'])
  })
})
