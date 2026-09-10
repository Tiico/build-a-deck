// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import type { ProjectDoc } from '@byd/server'
import { DataTable, type DataTableProps } from '../src/editor/DataTable.js'
import { projectDoc } from './project-doc.js'

// The same deck the filter tests use: eight cards over three types, so a selection can be made
// under a filter and still say something about the deck as a whole.
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

// The editor owns the project: a whole new list of rows comes back as a new doc, exactly as
// `EditorPage` hands `onReplaceRows` to `ProjectClient.replaceRows`.
function BulkTable({ start, onRows = () => undefined }: { start: ProjectDoc; onRows?(rows: ProjectDoc['rows']): void }) {
  const [doc, setDoc] = useState(start)
  const noop = () => undefined
  return (
    <DataTable
      doc={doc}
      selectedRow={null}
      onSelectRow={noop}
      onCell={noop}
      onAddRow={noop}
      onRemoveRow={noop}
      onReplaceRows={(rows) => {
        onRows(rows)
        setDoc((d) => ({ ...d, rows }))
      }}
      onAddField={noop}
      onRemoveField={noop}
    />
  )
}

const box = (name: string) => screen.getByRole('checkbox', { name }) as HTMLInputElement
const shownIds = () => screen.getAllByRole('row').slice(1).map((row) => row.getAttribute('data-card-ref')!)

describe('DataTable row selection (#17)', () => {
  it('gives every row a checkbox that names its card, and ticks it', async () => {
    const user = userEvent.setup()
    renderTable(bigDoc())
    expect(box('markera drake').checked).toBe(false)

    await user.click(box('markera drake'))

    expect(box('markera drake').checked).toBe(true)
    expect(box('markera grop').checked).toBe(false)
  })
})

describe('DataTable action row (#17)', () => {
  it('stays away until something is selected, and says out loud how many cards it is about', async () => {
    const user = userEvent.setup()
    renderTable(bigDoc())
    expect(screen.queryByRole('toolbar', { name: 'Markerade kort' })).toBeNull()

    await user.click(box('markera drake'))
    expect(screen.getByRole('toolbar', { name: 'Markerade kort' })).toBeDefined()
    expect(screen.getByText('1 markerat kort').closest('[aria-live="polite"]')).not.toBeNull()

    await user.click(box('markera grop'))
    expect(screen.getByText('2 markerade kort')).toBeDefined()

    await user.click(box('markera grop'))
    await user.click(box('markera drake'))
    expect(screen.queryByRole('toolbar', { name: 'Markerade kort' })).toBeNull()
    expect(screen.queryByText(/markerat|markerade/)).toBeNull()
  })
})

describe('DataTable "markera alla synliga" (#17 on #16)', () => {
  it('marks every row on screen from the header, and lets go of them all again', async () => {
    const user = userEvent.setup()
    renderTable(bigDoc())

    await user.click(box('Markera alla synliga'))

    expect(shownIds().map((id) => box(`markera ${id}`).checked)).toEqual(new Array(8).fill(true))
    expect(screen.getByText('8 markerade kort')).toBeDefined()

    await user.click(box('Markera alla synliga'))

    expect(shownIds().map((id) => box(`markera ${id}`).checked)).toEqual(new Array(8).fill(false))
    expect(screen.queryByRole('toolbar', { name: 'Markerade kort' })).toBeNull()
  })

  it('means the rows the filter lets through, and reads as partly marked when one is let go', async () => {
    const user = userEvent.setup()
    renderTable(bigDoc())
    await user.click(screen.getByRole('button', { name: 'varelse' }))

    await user.click(box('Markera alla synliga'))
    expect(screen.getByText('4 markerade kort')).toBeDefined()
    expect(box('Markera alla synliga').checked).toBe(true)

    await user.click(box('markera troll'))

    expect(screen.getByText('3 markerade kort')).toBeDefined()
    expect(box('Markera alla synliga').checked).toBe(false)
    expect(box('Markera alla synliga').indeterminate).toBe(true)
  })
})

describe('DataTable bulk delete (#17)', () => {
  it('asks how many cards first, then takes them out of the deck as one change', async () => {
    const user = userEvent.setup()
    const onRows = vi.fn()
    render(<BulkTable start={bigDoc()} onRows={onRows} />)
    await user.click(box('markera grop'))
    await user.click(box('markera stock'))

    await user.click(screen.getByRole('button', { name: 'Ta bort 2 kort' }))

    expect(onRows).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog', { name: 'Ta bort 2 kort' })).toBeDefined()
    expect(screen.getByText('Ta bort 2 kort ur leken?')).toBeDefined()

    await user.click(screen.getByRole('button', { name: 'Ja, ta bort' }))

    expect(onRows).toHaveBeenCalledTimes(1)
    expect(onRows.mock.calls[0]![0].map((row: ProjectDoc['rows'][number]) => row.id)).toEqual(['drake', 'alv', 'nat', 'troll', 'orm', 'grav'])
    expect(shownIds()).toEqual(['drake', 'alv', 'nat', 'troll', 'orm', 'grav'])
    expect(screen.queryByRole('toolbar', { name: 'Markerade kort' })).toBeNull()
    expect(screen.getByText('6 av 6 kort')).toBeDefined()
  })

  it('leaves the deck as it was when the question is answered no, and keeps the marking', async () => {
    const user = userEvent.setup()
    const onRows = vi.fn()
    render(<BulkTable start={bigDoc()} onRows={onRows} />)
    await user.click(box('markera grop'))

    await user.click(screen.getByRole('button', { name: 'Ta bort 1 kort' }))
    await user.click(screen.getByRole('button', { name: 'Avbryt' }))

    expect(onRows).not.toHaveBeenCalled()
    expect(shownIds()).toHaveLength(8)
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(box('markera grop').checked).toBe(true)
  })
})

describe('DataTable bulk delete from the keyboard (#17)', () => {
  it('marks with Space, opens the question with Enter, and lets Escape answer no', async () => {
    const user = userEvent.setup()
    const onRows = vi.fn()
    render(<BulkTable start={bigDoc()} onRows={onRows} />)

    const grop = box('markera grop')
    for (let i = 0; i < 40 && document.activeElement !== grop; i++) await user.tab()
    await user.keyboard(' ')
    expect(grop.checked).toBe(true)

    // The action row stands between the filter and the table, so it is a shift-tab away.
    const remove = screen.getByRole('button', { name: 'Ta bort 1 kort' })
    for (let i = 0; i < 40 && document.activeElement !== remove; i++) await user.tab({ shift: true })
    expect(document.activeElement).toBe(remove)

    await user.keyboard('{Enter}')
    // The question takes the focus with it: it is answered where it is read. It lands on the
    // answer that loses nothing, so the Enter that opened it cannot also empty the deck.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Avbryt' }))

    await user.keyboard('{Escape}')
    expect(onRows).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Ta bort 1 kort' }))

    await user.keyboard('{Enter}')
    // Taking the cards out is a step the hand takes on purpose: away from the safe answer, onto
    // the red one that says what it does, and only then Enter.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Avbryt' }))
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Ja, ta bort' }))
    await user.keyboard('{Enter}')
    expect(onRows).toHaveBeenCalledTimes(1)
    expect(shownIds()).toEqual(['drake', 'alv', 'nat', 'troll', 'stock', 'orm', 'grav'])
    // Nothing under the cursor was taken away: the focus lands on the header's own checkbox.
    expect(document.activeElement).toBe(screen.getByLabelText('Markera alla synliga'))
  })

  it('keeps the cards when the question is answered without being read (#8)', async () => {
    const user = userEvent.setup()
    const onRows = vi.fn()
    render(<BulkTable start={bigDoc()} onRows={onRows} />)
    await user.click(box('markera grop'))

    await user.click(screen.getByRole('button', { name: 'Ta bort 1 kort' }))
    // The reflex that answers a question on the way past — Enter on whatever holds the focus —
    // must cost nothing.
    await user.keyboard('{Enter}')

    expect(onRows).not.toHaveBeenCalled()
    expect(shownIds()).toHaveLength(8)
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Ta bort 1 kort' }))
  })
})

describe('DataTable bulk duplicate (#17)', () => {
  it('copies every marked card right after itself, with an id of its own, in one change', async () => {
    const user = userEvent.setup()
    const onRows = vi.fn()
    render(<BulkTable start={bigDoc()} onRows={onRows} />)
    await user.click(box('markera grop'))
    await user.click(box('markera orm'))

    await user.click(screen.getByRole('button', { name: 'Duplicera 2 kort' }))

    expect(onRows).toHaveBeenCalledTimes(1)
    expect(shownIds()).toEqual(['drake', 'grop', 'grop-kopia', 'alv', 'nat', 'troll', 'stock', 'orm', 'orm-kopia', 'grav'])
    expect((screen.getByLabelText('grop-kopia title') as HTMLInputElement).value).toBe('Grop')
    // The copy is a card of its own: what was marked is still the cards that were marked.
    expect(box('markera grop').checked).toBe(true)
    expect(box('markera grop-kopia').checked).toBe(false)
    expect(screen.getByText('2 markerade kort')).toBeDefined()
  })

  it('gives the second copy of the same card a free id', async () => {
    const user = userEvent.setup()
    render(<BulkTable start={bigDoc()} />)
    await user.click(box('markera grop'))

    await user.click(screen.getByRole('button', { name: 'Duplicera 1 kort' }))
    await user.click(screen.getByRole('button', { name: 'Duplicera 1 kort' }))

    expect(shownIds()).toEqual(['drake', 'grop', 'grop-kopia-2', 'grop-kopia', 'alv', 'nat', 'troll', 'stock', 'orm', 'grav'])
  })
})

describe('DataTable bulk set of a column (#17)', () => {
  it('writes one column on every marked card in one change', async () => {
    const user = userEvent.setup()
    const onRows = vi.fn()
    render(<BulkTable start={bigDoc()} onRows={onRows} />)
    await user.click(box('markera drake'))
    await user.click(box('markera orm'))
    // Nothing to write yet: the button waits for a value.
    expect((screen.getByRole('button', { name: /^Sätt/ }) as HTMLButtonElement).disabled).toBe(true)

    await user.selectOptions(screen.getByLabelText('Kolumn'), 'typ')
    await user.type(screen.getByLabelText('Värde'), 'fälla')
    await user.click(screen.getByRole('button', { name: 'Sätt typ på 2 kort' }))

    expect(onRows).toHaveBeenCalledTimes(1)
    expect((screen.getByLabelText('drake typ') as HTMLInputElement).value).toBe('fälla')
    expect((screen.getByLabelText('orm typ') as HTMLInputElement).value).toBe('fälla')
    expect((screen.getByLabelText('alv typ') as HTMLInputElement).value).toBe('varelse')
  })

  it('changes antal as the number it is (L4)', async () => {
    const user = userEvent.setup()
    const onRows = vi.fn()
    render(<BulkTable start={bigDoc()} onRows={onRows} />)
    await user.click(box('markera drake'))

    await user.selectOptions(screen.getByLabelText('Kolumn'), 'antal')
    await user.type(screen.getByLabelText('Värde'), '4')
    await user.click(screen.getByRole('button', { name: 'Sätt antal på 1 kort' }))

    const rows = onRows.mock.calls[0]![0] as ProjectDoc['rows']
    expect(rows.find((row) => row.id === 'drake')!.fields.antal).toBe(4)
    expect(rows.find((row) => row.id === 'alv')!.fields.antal).toBe(3)
    expect((screen.getByLabelText('drake antal') as HTMLInputElement).value).toBe('4')
  })
})

describe('DataTable letting go of the whole selection (#17)', () => {
  it('unmarks everything from the action row, whether all of it is on screen or not', async () => {
    const user = userEvent.setup()
    renderTable(bigDoc())
    await user.click(box('markera drake'))
    await user.click(box('markera grop'))

    await user.click(screen.getByRole('button', { name: 'Avmarkera alla' }))

    expect(shownIds().map((id) => box(`markera ${id}`).checked)).toEqual(new Array(8).fill(false))
    expect(screen.queryByRole('toolbar', { name: 'Markerade kort' })).toBeNull()
  })
})

// A checkbox is a fact about a row the designer can see. A marking that survives out of sight is
// a trap: the next "Ta bort 4 kort" would take a fifth card nobody looked at. So the filter is
// what the selection is measured against — what leaves the screen is let go of, for good.
describe('DataTable selection when the filter moves under it (#17 on #16)', () => {
  it('lets go of a card the filter takes off screen, and does not bring it back', async () => {
    const user = userEvent.setup()
    renderTable(bigDoc())
    await user.click(box('markera drake'))
    await user.click(box('markera grop'))
    expect(screen.getByText('2 markerade kort')).toBeDefined()

    await user.click(screen.getByRole('button', { name: 'varelse' }))
    expect(shownIds()).toEqual(['drake', 'alv', 'troll', 'orm'])
    expect(screen.getByText('1 markerat kort')).toBeDefined()
    expect(box('markera drake').checked).toBe(true)

    await user.click(screen.getByRole('button', { name: 'varelse' }))

    expect(shownIds()).toHaveLength(8)
    expect(screen.getByText('1 markerat kort')).toBeDefined()
    expect(box('markera drake').checked).toBe(true)
    expect(box('markera grop').checked).toBe(false)
  })
})

describe('DataTable sorting under a selection (#17 on #15)', () => {
  it('keeps every tick with its own card when the order changes', async () => {
    const user = userEvent.setup()
    renderTable(bigDoc())
    await user.click(box('markera orm'))
    await user.click(box('markera drake'))

    await user.click(screen.getByRole('button', { name: /^kostnad/ }))

    expect(shownIds()).toEqual(['stock', 'grop', 'orm', 'nat', 'troll', 'grav', 'alv', 'drake'])
    expect(box('markera orm').checked).toBe(true)
    expect(box('markera drake').checked).toBe(true)
    expect(box('markera stock').checked).toBe(false)
    expect(screen.getByText('2 markerade kort')).toBeDefined()
  })
})

describe('DataTable a question that loses its cards (#17)', () => {
  it('drops the delete question when the marking it was about is let go of', async () => {
    const user = userEvent.setup()
    render(<BulkTable start={bigDoc()} />)
    await user.click(box('markera drake'))
    await user.click(screen.getByRole('button', { name: 'Ta bort 1 kort' }))
    expect(screen.getByRole('alertdialog')).toBeDefined()

    // The drake is a varelse: asking for traps takes it, and the question about it, off screen.
    await user.click(screen.getByRole('button', { name: 'fälla' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()

    await user.click(box('markera grop'))

    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.getByRole('toolbar', { name: 'Markerade kort' })).toBeDefined()
  })
})

describe('DataTable marking a row versus opening it (#17)', () => {
  it('keeps the two apart: a tick is for the next bulk change, not for the card preview', async () => {
    const user = userEvent.setup()
    const onSelectRow = vi.fn()
    renderTable(bigDoc(), { onSelectRow })

    await user.click(box('markera grop'))
    expect(onSelectRow).not.toHaveBeenCalled()

    await user.click(screen.getByText('drake'))
    expect(onSelectRow).toHaveBeenCalledWith('drake')
    expect(box('markera drake').checked).toBe(false)
  })
})
