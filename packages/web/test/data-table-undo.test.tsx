// @vitest-environment jsdom
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { DataTable } from '../src/editor/DataTable.js'
import { passedToEditor } from '../src/editor/keys.js'
import type { ProjectDoc } from '../src/editor/types.js'
import { projectDoc } from './project-doc.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// Undo in a cell (#479, beslut 2026-09-27, variant C; L14): Ctrl+Z in a cell took one character
// back and outside it the whole visit; Escape put nothing back. Escape now gives the cell back what
// it had when it was entered; Ctrl+Z takes a word at a time, and once the cell has nothing left of
// its own, the press goes on to the editor's history.
function Editing() {
  const [doc, setDoc] = useState<ProjectDoc>(projectDoc())
  return (
    <DataTable
      doc={doc}
      selectedRow={null}
      onSelectRow={() => undefined}
      onCell={(cardRef, field, value) => setDoc((was) => ({ ...was, rows: was.rows.map((r) => (r.id === cardRef ? { ...r, fields: { ...r.fields, [field]: value } } : r)) }))}
      onAddRow={() => undefined}
      onRemoveRow={() => undefined}
      onReplaceRows={() => undefined}
      onAddField={() => undefined}
      onRemoveField={() => undefined}
      onMoveField={() => undefined}
    />
  )
}
const cell = () => screen.getByLabelText('knight title') as HTMLInputElement

describe('undo in a cell (#479)', () => {
  it('gives the cell back what it had on Escape', async () => {
    const user = userEvent.setup()
    render(<Editing />)
    await user.type(cell(), ' till häst')
    expect(cell().value).toBe('Riddare till häst')
    await user.keyboard('{Escape}')
    expect(cell().value).toBe('Riddare')
  })

  it('takes a word back at a time, and then hands the press to the editor', async () => {
    const user = userEvent.setup()
    render(<Editing />)
    await user.type(cell(), ' till häst')
    await user.keyboard('{Control>}z{/Control}')
    expect(cell().value).toBe('Riddare till ')
    await user.keyboard('{Control>}z{/Control}')
    expect(cell().value).toBe('Riddare ')
    await user.keyboard('{Control>}z{/Control}')
    expect(cell().value).toBe('Riddare')
    const passed: boolean[] = []
    const listen = (event: KeyboardEvent) => passed.push(passedToEditor(event))
    document.addEventListener('keydown', listen)
    try {
      await user.keyboard('{Control>}z{/Control}')
    } finally {
      document.removeEventListener('keydown', listen)
    }
    expect(passed).toContain(true)
    expect(cell().value).toBe('Riddare')
  })
})
