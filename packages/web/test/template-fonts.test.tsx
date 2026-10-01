// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { TemplateCanvas } from '../src/editor/TemplateCanvas.js'
import { projectDoc } from './project-doc.js'
import type { ProjectDoc } from '../src/editor/types.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// The type a game is set in (B3): the family is chosen where the element is designed, and the
// file behind it belongs to the project, so a version prints as it was drawn.
function canvas(over: Partial<React.ComponentProps<typeof TemplateCanvas>> = {}) {
  const props = { ...bare(), ...over }
  render(<TemplateCanvas {...props} />)
  return props
}

function bare() {
  return {
    doc: projectDoc(),
    face: 'front',
    row: 'dragon',
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
    onSelectFace: vi.fn(),
    group: null,
    onSelectGroup: vi.fn(),
    onGroupColumn: vi.fn(),
    onAddField: vi.fn(),
    onReset: vi.fn(),
    onReplaceFace: vi.fn(),
  }
}

describe('choosing the type an element is set in (B3)', () => {
  it('offers the fonts the project has, and writes the chosen family onto the element', () => {
    const doc: ProjectDoc = { ...projectDoc(), fonts: { 'sans-serif': { stack: 'sans-serif' }, Rubrikserif: { stack: '"Rubrikserif", sans-serif', asset: `asset:${'a'.repeat(64)}` } } }
    const { onPatch } = canvas({ doc, selectedElement: 'title' })

    const pick = screen.getByLabelText(/^typsnitt$/i) as HTMLSelectElement
    expect([...pick.options].map((o) => o.value)).toEqual(['sans-serif', 'Rubrikserif'])
    expect(pick.value).toBe('sans-serif')
    fireEvent.change(pick, { target: { value: 'Rubrikserif' } })
    expect(onPatch).toHaveBeenCalledWith('title', { font: { family: 'Rubrikserif', sizePt: 14, weight: 700 } }, undefined)
  })

  it('keeps a family the project no longer names, rather than silently moving the element to another one', () => {
    const doc = projectDoc()
    doc.fonts = { Rubrikserif: { stack: '"Rubrikserif", sans-serif' } }
    canvas({ doc, selectedElement: 'title' })
    const pick = screen.getByLabelText(/^typsnitt$/i) as HTMLSelectElement
    expect([...pick.options].map((o) => o.value)).toContain('sans-serif')
    expect(pick.value).toBe('sans-serif')
  })

  it('draws the card in the font the project pinned, so the canvas shows what will be printed', () => {
    const doc: ProjectDoc = { ...projectDoc(), fonts: { 'sans-serif': { stack: '"Rubrikserif", sans-serif', asset: `asset:${'a'.repeat(64)}` } } }
    canvas({ doc, assetBase: 'http://server.test' })
    const css = [...document.querySelectorAll('style')].map((s) => s.textContent).join('\n')
    expect(css).toContain('@font-face')
    expect(css).toContain('http://server.test/assets/' + 'a'.repeat(64))
    expect(css).toContain('font-family:"Rubrikserif", sans-serif')
  })
})
