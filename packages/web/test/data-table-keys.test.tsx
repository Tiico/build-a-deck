// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { DataTable } from '../src/editor/DataTable.js'
import { projectDoc } from './project-doc.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// The table is the spreadsheet L4 chose (#479, beslut 2026-09-27, variant A): Enter and ↓ go down
// the column, Shift+Enter and ↑ go up, and a paste of several cells — tabs between them, lines
// between rows — fills a block from the cell it lands in, in the order the table shows, as one
// step back. It used to put two rows of TSV into one cell.
function table() {
  const onReplaceRows = vi.fn()
  render(<DataTable doc={projectDoc()} selectedRow={null} onSelectRow={() => undefined} onCell={() => undefined} onAddRow={() => undefined} onRemoveRow={() => undefined} onReplaceRows={onReplaceRows} onAddField={() => undefined} onRemoveField={() => undefined} onMoveField={() => undefined} />)
  return { onReplaceRows }
}
const cell = (label: string) => screen.getByLabelText(label)

describe('the keys of the spreadsheet (#479)', () => {
  it('goes down the column on Enter and ↓, and up on Shift+Enter and ↑', async () => {
    const user = userEvent.setup()
    table()
    cell('dragon title').focus()
    await user.keyboard('{Enter}')
    expect(document.activeElement).toBe(cell('knight title'))
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(cell('wizard title'))
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(cell('wizard title'))
    await user.keyboard('{Shift>}{Enter}{/Shift}')
    expect(document.activeElement).toBe(cell('knight title'))
    await user.keyboard('{ArrowUp}')
    expect(document.activeElement).toBe(cell('dragon title'))
  })

  it('keeps Enter as a new paragraph in prose, and goes down the column on Ctrl+Enter', async () => {
    const user = userEvent.setup()
    table()
    cell('dragon body').focus()
    await user.keyboard('{Control>}{Enter}{/Control}')
    expect(document.activeElement).toBe(cell('knight body'))
  })

  it('fills a block from the cell a paste of several cells lands in, as one change', () => {
    const { onReplaceRows } = table()
    fireEvent.paste(cell('knight antal'), { clipboardData: { getData: (type: string) => (type === 'text/plain' ? '5\n7\n' : '') } })
    expect(onReplaceRows).toHaveBeenCalledTimes(1)
    const rows = onReplaceRows.mock.calls[0]![0] as { id: string; fields: Record<string, unknown> }[]
    expect(rows.map((r) => [r.id, r.fields['antal']])).toEqual([['dragon', 2], ['knight', 5], ['wizard', 7]])
  })

  it('fills across columns on a tab, and leaves a single value to the cell', () => {
    const { onReplaceRows } = table()
    fireEvent.paste(cell('dragon title'), { clipboardData: { getData: (type: string) => (type === 'text/plain' ? 'Draken\tFlyger.\nRiddaren\tRider.' : '') } })
    const rows = onReplaceRows.mock.calls[0]![0] as { id: string; fields: Record<string, unknown> }[]
    expect(rows[0]!.fields).toMatchObject({ title: 'Draken', body: 'Flyger.' })
    expect(rows[1]!.fields).toMatchObject({ title: 'Riddaren', body: 'Rider.' })
    onReplaceRows.mockClear()
    fireEvent.paste(cell('dragon title'), { clipboardData: { getData: () => 'bara ett ord' } })
    expect(onReplaceRows).not.toHaveBeenCalled()
  })
})
