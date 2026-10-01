// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { TemplateCanvas } from '../src/editor/TemplateCanvas.js'
import { projectDoc } from './project-doc.js'
import type { ProjectDoc } from '../src/editor/types.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// The property panel folds (#478, beslut 2026-09-27, variant A, revising L25): a plain rectangle
// was 907 px in a column of 683, with all of Effekter under the fold. Every section's head is a
// button that carries the section's value while it is closed, so nothing is hidden without being
// said; Layout and the shape's own section stand open from the start, and what is open is
// remembered for the whole editor rather than per element. «Typsnitt i spelet» is the game's and
// not a layer's, so it stands in the panel only while no layer is chosen.

function open(selected: string | null = 'frame', onOpenFonts: () => void = vi.fn()) {
  const doc: ProjectDoc = projectDoc()
  render(
    <TemplateCanvas
      doc={doc}
      face="front"
      row="dragon"
      selectedElement={selected}
      onSelectElement={vi.fn()}
      onPatch={vi.fn()}
      onCallOff={vi.fn()}
      onReplaceFace={vi.fn()}
      onRemove={vi.fn()}
      onAdd={vi.fn()}
      onPlaceIcon={vi.fn()}
      onReorder={vi.fn()}
      onLock={vi.fn()}
      onRename={vi.fn()}
      onSelectFace={vi.fn()}
      group={null}
      onSelectGroup={vi.fn()}
      onGroupColumn={vi.fn()}
      onAddField={vi.fn()}
      onReset={vi.fn()}
      onOpenFonts={onOpenFonts}
    />,
  )
}

// A section's head, and not the rail's tool of the same name.
const head = (name: RegExp) => {
  const found = screen.getAllByRole('button', { name }).filter((b) => b.closest('.byd-props-sec-head'))
  const [only, ...more] = found
  if (!only || more.length > 0) throw new Error(`${found.length} section heads match ${name}`)
  return only
}

describe('the property panel folds (#478)', () => {
  beforeEach(() => localStorage.clear())

  it('stands with Layout and the shape open, and says what a closed section holds', () => {
    open()
    expect(head(/^Layout/).getAttribute('aria-expanded')).toBe('true')
    expect(head(/^Form/).getAttribute('aria-expanded')).toBe('true')
    const fill = head(/^Fyllning/)
    expect(fill.getAttribute('aria-expanded')).toBe('false')
    expect(fill.textContent).toContain('#f4ead8')
    expect(head(/^Linje/).textContent).toContain('0,5 mm')
    expect(screen.queryByLabelText('Fyllning', { selector: 'input' })).toBeNull()
  })

  it('opens a section on a press, and keeps it open for the next layer chosen', async () => {
    const user = userEvent.setup()
    open()
    await user.click(head(/^Fyllning/))
    expect(head(/^Fyllning/).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByLabelText('Fyllning', { selector: 'input' })).toBeTruthy()
    cleanup()
    open('frame')
    expect(head(/^Fyllning/).getAttribute('aria-expanded')).toBe('true')
  })

  // The typefaces stood here while no layer was chosen (#478); they are Speltema's since L57
  // (#630), and the panel with no layer says where they went instead of showing them.
  it('says where the game s typefaces are while no layer is chosen, and shows no shelf', () => {
    const onOpenFonts = vi.fn()
    open(null, onOpenFonts)
    expect(screen.queryByRole('list', { name: 'Typsnitt i spelet' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Spelets typsnitt finns i Speltema/ }))
    expect(onOpenFonts).toHaveBeenCalled()
    cleanup()
    open()
    expect(screen.queryByRole('button', { name: /Spelets typsnitt finns i Speltema/ })).toBeNull()
  })
})
