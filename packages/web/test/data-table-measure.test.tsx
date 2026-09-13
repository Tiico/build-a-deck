// @vitest-environment jsdom
// When the card table measures itself, and how often (#46).
//
// The measurement is O(cards × columns) twice over — once to ask every value how wide it is, once
// to ask every cell whether it fits — and for a five-hundred-card deck that is milliseconds, not
// microseconds. It may therefore never be hung on anything that happens at the frame rate. A
// scroll is exactly that, and no width can have changed during one: the deck is the deck wherever
// the box happens to be standing.
//
// So this counts passes. jsdom lays nothing out, which is the point: what is being locked here is
// not a width but who asks for one, and when.
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { applyEdit } from '@byd/server/doc'
import { DataTable } from '../src/editor/DataTable.js'
import { fitColumns } from '../src/editor/columns.js'
import type { ProjectDoc } from '../src/editor/types.js'
import { projectDoc } from './project-doc.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// The one function that walks the deck. Everything else the table does on a scroll is a handful
// of rectangles, and those are meant to stay.
vi.mock('../src/editor/columns.js', async (original) => {
  const real = await original<typeof import('../src/editor/columns.js')>()
  return { ...real, fitColumns: vi.fn(real.fitColumns) }
})
const measured = vi.mocked(fitColumns)

function Table({ doc: initial }: { doc: ProjectDoc }) {
  const [doc, setDoc] = useState(initial)
  return (
    <DataTable
      doc={doc}
      selectedRow={null}
      onSelectRow={() => undefined}
      onCell={(cardRef, field, value) =>
        setDoc((current) => ({ ...current, rows: current.rows.map((row) => (row.id === cardRef ? { ...row, fields: { ...row.fields, [field]: value } } : row)) }))
      }
      onAddRow={() => undefined}
      onRemoveRow={() => undefined}
      onReplaceRows={(rows) => setDoc((current) => ({ ...current, rows }))}
      onAddField={(field) => setDoc((current) => applyEdit(current, { v: 'addField', field }))}
      onRemoveField={(field) => setDoc((current) => applyEdit(current, { v: 'removeField', field }))}
    />
  )
}

// The box the table scrolls in, and a frame let through so anything the scroll queued has run.
const boxOf = (container: HTMLElement) => container.querySelector('.byd-data-scroll')!
const frame = async () => act(async () => { await new Promise((done) => requestAnimationFrame(() => done(null))) })

describe('what the card table re-measures (#46)', () => {
  it('measures once when it opens, and not again for any amount of scrolling', async () => {
    const { container } = render(<Table doc={projectDoc()} />)
    await frame()
    expect(measured).toHaveBeenCalledTimes(1)

    const box = boxOf(container)
    for (let i = 0; i < 5; i++) {
      fireEvent.scroll(box)
      await frame()
    }

    // Nothing. A scroll moves the box, and a box cannot tell a column how wide to be.
    expect(measured).toHaveBeenCalledTimes(1)
  })

  // A width is handed out in proportion to what each column asked for, so a value that grows by a
  // character takes a pixel or two off every other text column and moves every boundary to their
  // right — including the one the caret is standing at. Re-fitting on the keystroke therefore
  // moves the cell being typed in, under the hand that is typing in it. The table already holds
  // the row order still while a cell is being edited, for the same reason; the widths are held
  // the same way, and settle when the caret leaves.
  it('holds every width still while a cell is being typed in, however many characters go in', async () => {
    render(<Table doc={projectDoc()} />)
    await frame()
    const before = measured.mock.calls.length

    const cell = screen.getByLabelText('dragon title') as HTMLInputElement
    fireEvent.focus(cell)
    for (const upto of ['D', 'Dr', 'Dra', 'Drak', 'Drake', 'Draken', 'Drakens']) {
      fireEvent.change(cell, { target: { value: upto } })
      await frame()
    }

    // Seven keystrokes, seven new documents, and not one new width.
    expect(cell.value).toBe('Drakens')
    expect(measured.mock.calls.length).toBe(before)
  })

  it('settles them the moment the caret leaves that cell, so the deck is measured after the edit', async () => {
    render(<Table doc={projectDoc()} />)
    await frame()
    const before = measured.mock.calls.length
    const cell = screen.getByLabelText('dragon title') as HTMLInputElement
    fireEvent.focus(cell)
    for (const upto of ['D', 'Dr', 'Drakens', 'Drakens hemliga namn']) {
      fireEvent.change(cell, { target: { value: upto } })
      await frame()
    }
    fireEvent.blur(cell)
    await frame()

    // One measurement for the whole edit, and it is the one after it: what the deck now says.
    expect(measured.mock.calls.length).toBe(before + 1)
    expect(measured.mock.calls.at(-1)![1].title).toContain('Drakens hemliga namn')
  })

  it('is a real condition: a column made in the head is a new width, and that is measured', async () => {
    render(<Table doc={projectDoc()} />)
    await frame()
    const before = measured.mock.calls.length

    fireEvent.click(screen.getByRole('button', { name: 'Nytt fält' }))
    fireEvent.change(screen.getByLabelText('Namn'), { target: { value: 'kostnad' } })
    fireEvent.submit(screen.getByLabelText('Namn').closest('form')!)
    await frame()

    // Exactly one pass: the deck has a column it did not have, so the table has to be told how
    // wide everything is again — once, not once per frame.
    expect(measured.mock.calls.length).toBe(before + 1)
  })
})
