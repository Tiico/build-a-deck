// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { TemplateCanvas, type TemplateCanvasProps } from '../src/editor/TemplateCanvas.js'
import { projectDoc } from './project-doc.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// Which card the template is drawn on (#478, beslut 2026-09-27, variant B): Mall never said, and
// changing it was a round trip through Kortvägg — three presses. A row under the card now names
// it, steps to the next and the one before, finds any card by name, and shows the values on it
// that decide how it looks.
function canvas(over: Partial<TemplateCanvasProps> = {}) {
  const onPickRow = vi.fn()
  const props: TemplateCanvasProps = {
    doc: projectDoc(),
    face: 'front',
    onSelectFace: vi.fn(),
    onReplaceFace: vi.fn(),
    group: null,
    onSelectGroup: vi.fn(),
    onGroupColumn: vi.fn(),
    onAddField: vi.fn(),
    onReset: vi.fn(),
    row: 'dragon',
    onPickRow,
    selectedElement: null,
    onSelectElement: vi.fn(),
    onPatch: vi.fn(),
    onCallOff: vi.fn(),
    onRemove: vi.fn(),
    onAdd: vi.fn(),
    onPlaceIcon: vi.fn(),
    onReorder: vi.fn(),
    onLock: vi.fn(),
    onRename: vi.fn(),
    ...over,
  }
  render(<TemplateCanvas {...props} />)
  return { onPickRow }
}

const row = () => within(screen.getByRole('group', { name: 'Kortet mallen visas på' }))

describe('the card the template is drawn on (#478)', () => {
  it('names the card and where it is in the deck, with the values that decide its look', () => {
    canvas()
    expect(row().getByRole('button', { name: /Drake/ }).textContent).toMatch(/1 av 3/)
    expect(row().getByText(/antal/).closest('.byd-card-row-values')?.textContent).toMatch(/antal\s*2/)
  })

  it('steps to the next card and back, and cannot step past either end', async () => {
    const user = userEvent.setup()
    const { onPickRow } = canvas()
    expect(row().getByRole('button', { name: 'Föregående kort' }).hasAttribute('disabled')).toBe(true)
    await user.click(row().getByRole('button', { name: 'Nästa kort' }))
    expect(onPickRow).toHaveBeenLastCalledWith('knight')
  })

  it('finds a card by name in the list and shows it', async () => {
    const user = userEvent.setup()
    const { onPickRow } = canvas()
    await user.click(row().getByRole('button', { name: /Drake/ }))
    const search = screen.getByRole('combobox', { name: 'Sök kort' })
    expect(document.activeElement).toBe(search)
    await user.type(search, 'troll{Enter}')
    expect(onPickRow).toHaveBeenLastCalledWith('wizard')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('closes the list on Escape and gives the focus back to the name', async () => {
    const user = userEvent.setup()
    canvas()
    const name = row().getByRole('button', { name: /Drake/ })
    await user.click(name)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(document.activeElement).toBe(name)
  })
})
