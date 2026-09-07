// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import type { ProjectDoc } from '@byd/server'
import { DataTable, type DataTableProps } from '../src/editor/DataTable.js'
import { projectDoc } from './project-doc.js'

// A project whose creation order is neither alphabetical by title nor numeric by cost, so any
// sorted order is visibly different from the project's own order.
function costedDoc(): ProjectDoc {
  return {
    ...projectDoc(),
    rows: [
      { id: 'dragon', fields: { title: 'Drake', body: 'Flygande.', kostnad: '10', antal: 2 } },
      { id: 'knight', fields: { title: 'Riddare', body: 'Sköld 1.', kostnad: '2', antal: 1 } },
      { id: 'wizard', fields: { title: 'Alv', body: 'Dra ett kort.', kostnad: '9', antal: 3 } },
    ],
  }
}

function renderTable(doc: ProjectDoc, handlers: Partial<{ onCell: DataTableProps['onCell']; onRemoveRow: DataTableProps['onRemoveRow'] }> = {}) {
  const noop = () => undefined
  return render(
    <DataTable
      doc={doc}
      selectedRow={null}
      onSelectRow={noop}
      onCell={handlers.onCell ?? noop}
      onAddRow={noop}
      onRemoveRow={handlers.onRemoveRow ?? noop}
      onImportRows={noop}
    />,
  )
}

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
      onImportRows={noop}
    />
  )
}

const shownOrder = () => screen.getAllByRole('row').slice(1).map((row) => row.getAttribute('data-card-ref'))

describe('DataTable sorting (a view, #15)', () => {
  it('sorts a text column ascending when its header is activated', () => {
    renderTable(costedDoc())
    expect(shownOrder()).toEqual(['dragon', 'knight', 'wizard'])

    fireEvent.click(screen.getByRole('button', { name: /^title/ }))

    expect(shownOrder()).toEqual(['wizard', 'dragon', 'knight'])
  })

  it('turns the order around on the second activation and releases the sort on the third', () => {
    renderTable(costedDoc())
    const title = screen.getByRole('button', { name: /^title/ })

    fireEvent.click(title)
    fireEvent.click(title)
    expect(shownOrder()).toEqual(['knight', 'dragon', 'wizard'])

    fireEvent.click(title)
    expect(shownOrder()).toEqual(['dragon', 'knight', 'wizard'])
  })

  it('sorts a numeric column as numbers, whether the cells are numbers or numeric text', () => {
    renderTable(costedDoc())

    fireEvent.click(screen.getByRole('button', { name: /^kostnad/ }))
    expect(shownOrder()).toEqual(['knight', 'wizard', 'dragon'])

    fireEvent.click(screen.getByRole('button', { name: /^antal/ }))
    expect(shownOrder()).toEqual(['knight', 'dragon', 'wizard'])
  })

  it('shows the sort state in the header, keeps the control keyboard reachable and announces it', () => {
    renderTable(costedDoc())
    const kostnad = screen.getByRole('button', { name: /^kostnad/ })
    const headerOf = (button: HTMLElement) => button.closest('th') as HTMLElement
    expect(headerOf(kostnad).getAttribute('aria-sort')).toBe('none')
    expect(screen.getByRole('status').textContent).toBe('Osorterad: kortens ordning i projektet.')

    kostnad.focus()
    expect(document.activeElement).toBe(kostnad)

    fireEvent.click(kostnad)
    expect(headerOf(kostnad).getAttribute('aria-sort')).toBe('ascending')
    expect(headerOf(kostnad).textContent).toContain('↑')
    expect(headerOf(screen.getByRole('button', { name: /^title/ })).getAttribute('aria-sort')).toBe('none')
    expect(screen.getByRole('status').textContent).toBe('Sorterad på kostnad, stigande.')

    fireEvent.click(kostnad)
    expect(headerOf(kostnad).getAttribute('aria-sort')).toBe('descending')
    expect(headerOf(kostnad).textContent).toContain('↓')
    expect(screen.getByRole('status').textContent).toBe('Sorterad på kostnad, fallande.')

    fireEvent.click(kostnad)
    expect(headerOf(kostnad).getAttribute('aria-sort')).toBe('none')
    expect(screen.getByRole('status').textContent).toBe('Osorterad: kortens ordning i projektet.')
  })

  it('holds the row still while a cell is being typed in and reorders when the field is left', () => {
    render(<EditedTable start={costedDoc()} />)
    fireEvent.click(screen.getByRole('button', { name: /^kostnad/ }))
    expect(shownOrder()).toEqual(['knight', 'wizard', 'dragon'])

    const cost = screen.getByLabelText('dragon kostnad')
    fireEvent.focus(cost)
    fireEvent.change(cost, { target: { value: '1' } })
    expect(shownOrder()).toEqual(['knight', 'wizard', 'dragon'])
    expect((screen.getByLabelText('dragon kostnad') as HTMLInputElement).value).toBe('1')

    fireEvent.blur(cost)
    expect(shownOrder()).toEqual(['dragon', 'knight', 'wizard'])
  })

  it('is a view only: the project keeps its own order and the rows still answer for their own card', () => {
    const doc = costedDoc()
    const onCell = vi.fn()
    const onRemoveRow = vi.fn()
    renderTable(doc, { onCell, onRemoveRow })

    fireEvent.click(screen.getByRole('button', { name: /^kostnad/ }))
    const first = screen.getAllByRole('row')[1] as HTMLElement

    fireEvent.change(within(first).getByLabelText('knight kostnad'), { target: { value: '5' } })
    expect(onCell).toHaveBeenCalledWith('knight', 'kostnad', '5')
    fireEvent.click(within(first).getByRole('button', { name: /ta bort/i }))
    expect(onRemoveRow).toHaveBeenCalledWith('knight')

    expect(doc.rows.map((row) => row.id)).toEqual(['dragon', 'knight', 'wizard'])
    const csv = screen.getByRole('link', { name: 'Exportera CSV' }) as HTMLAnchorElement
    expect(decodeURIComponent(csv.href).indexOf('dragon')).toBeLessThan(decodeURIComponent(csv.href).indexOf('knight'))
  })
})

// Reaching the sort by keyboard alone: the header control is a real button, so the tab order and
// Enter/Space are the browser's own. These tests drive it through `user-event`, which activates a
// button the way a key press does, rather than dispatching a click at it.
type User = ReturnType<typeof userEvent.setup>

const headerButtons = () =>
  screen
    .getAllByRole('columnheader')
    .map((th) => within(th).queryByRole('button'))
    .filter((button): button is HTMLElement => button !== null)

async function tabTo(user: User, target: HTMLElement) {
  for (let i = 0; i < 20 && document.activeElement !== target; i++) await user.tab()
  expect(document.activeElement).toBe(target)
}

describe('DataTable sorting from the keyboard (#15)', () => {
  it('puts the sort headers in the tab order, in column order, after the data tools', async () => {
    const user = userEvent.setup()
    renderTable(costedDoc())

    await user.tab()
    expect(document.activeElement).toBe(screen.getByLabelText('Importera CSV'))
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Exportera CSV' }))
    await user.tab()
    expect(document.activeElement).toBe(screen.getByLabelText('Sök i alla fält'))

    const buttons = headerButtons()
    expect(buttons.map((button) => button.textContent?.trim().split(' ')[0])).toEqual(['id', 'title', 'body', 'kostnad', 'antal'])
    for (const button of buttons) {
      await user.tab()
      expect(document.activeElement).toBe(button)
    }
  })

  it('runs the whole cycle on Enter, with the header state and the status line following each step', async () => {
    const user = userEvent.setup()
    renderTable(costedDoc())
    const kostnad = screen.getByRole('button', { name: /^kostnad/ })
    const header = kostnad.closest('th') as HTMLElement
    expect(header.getAttribute('aria-sort')).toBe('none')
    expect(screen.getByRole('status').textContent).toBe('Osorterad: kortens ordning i projektet.')

    await tabTo(user, kostnad)

    await user.keyboard('{Enter}')
    expect(shownOrder()).toEqual(['knight', 'wizard', 'dragon'])
    expect(header.getAttribute('aria-sort')).toBe('ascending')
    expect(screen.getByRole('status').textContent).toBe('Sorterad på kostnad, stigande.')

    await user.keyboard('{Enter}')
    expect(shownOrder()).toEqual(['dragon', 'wizard', 'knight'])
    expect(header.getAttribute('aria-sort')).toBe('descending')
    expect(screen.getByRole('status').textContent).toBe('Sorterad på kostnad, fallande.')

    await user.keyboard('{Enter}')
    expect(shownOrder()).toEqual(['dragon', 'knight', 'wizard'])
    expect(header.getAttribute('aria-sort')).toBe('none')
    expect(screen.getByRole('status').textContent).toBe('Osorterad: kortens ordning i projektet.')

    expect(document.activeElement).toBe(kostnad)
  })

  it('activates on Space as well, and moving on to the next header starts that column ascending', async () => {
    const user = userEvent.setup()
    renderTable(costedDoc())
    const title = screen.getByRole('button', { name: /^title/ })
    const kostnad = screen.getByRole('button', { name: /^kostnad/ })

    await tabTo(user, title)
    await user.keyboard(' ')
    expect(shownOrder()).toEqual(['wizard', 'dragon', 'knight'])
    expect(title.closest('th')?.getAttribute('aria-sort')).toBe('ascending')

    await user.keyboard(' ')
    expect(shownOrder()).toEqual(['knight', 'dragon', 'wizard'])
    expect(title.closest('th')?.getAttribute('aria-sort')).toBe('descending')

    await tabTo(user, kostnad)
    await user.keyboard('{Enter}')
    expect(shownOrder()).toEqual(['knight', 'wizard', 'dragon'])
    expect(kostnad.closest('th')?.getAttribute('aria-sort')).toBe('ascending')
    expect(title.closest('th')?.getAttribute('aria-sort')).toBe('none')
    expect(screen.getByRole('status').textContent).toBe('Sorterad på kostnad, stigande.')
  })
})
