// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

  it('says which families are the game’s, and offers the rest of the catalog after them (L57, #634)', () => {
    const doc: ProjectDoc = { ...projectDoc(), fonts: { 'sans-serif': { stack: 'sans-serif' }, Rubrikserif: { stack: '"Rubrikserif", sans-serif' } } }
    canvas({ doc, selectedElement: 'title', onCatalogFont: vi.fn(async () => 'Cinzel') })
    const pick = screen.getByLabelText(/^typsnitt$/i) as HTMLSelectElement
    const game = pick.querySelector('optgroup')!
    expect(game.label).toBe('Spelets typsnitt')
    expect([...game.querySelectorAll('option')].map((o) => o.value)).toEqual(['sans-serif', 'Rubrikserif'])
    const last = pick.options[pick.options.length - 1]!
    expect(last.textContent).toBe('Fler typsnitt…')
    expect(last.parentElement).toBe(pick)
  })

  it('opens the catalog from «Fler typsnitt…» without changing the layer, and the chosen family is brought home and set on it (#634)', async () => {
    const onCatalogFont = vi.fn(async () => 'Cinzel')
    const { onPatch } = canvas({ selectedElement: 'title', onCatalogFont })
    const pick = screen.getByLabelText(/^typsnitt$/i) as HTMLSelectElement
    fireEvent.change(pick, { target: { value: pick.options[pick.options.length - 1]!.value } })
    expect(onPatch).not.toHaveBeenCalled()
    expect(pick.value).toBe('sans-serif')
    const hits = await screen.findByRole('list', { name: /träffar/i })
    const first = hits.querySelector('li')!
    const family = first.getAttribute('data-family')!
    fireEvent.click(first.querySelector('button')!)
    await waitFor(() => expect(onPatch).toHaveBeenCalledWith('title', { font: { family: 'Cinzel', sizePt: 14, weight: 700 } }, undefined))
    expect(onCatalogFont).toHaveBeenCalledWith(expect.objectContaining({ family }))
    expect(screen.queryByRole('dialog', { name: /google fonts/i })).toBeNull()
  })

  it('sets a family the game already holds straight from the catalog, without fetching it again (#634)', async () => {
    const onCatalogFont = vi.fn(async () => 'never')
    const doc: ProjectDoc = { ...projectDoc(), fonts: { 'sans-serif': { stack: 'sans-serif' }, Lora: { stack: '"Lora", serif' } } }
    const { onPatch } = canvas({ doc, selectedElement: 'title', onCatalogFont })
    const pick = screen.getByLabelText(/^typsnitt$/i) as HTMLSelectElement
    fireEvent.change(pick, { target: { value: pick.options[pick.options.length - 1]!.value } })
    fireEvent.change(await screen.findByRole('searchbox'), { target: { value: 'Lora' } })
    const taken = await waitFor(() => {
      const button = screen.getByRole('list', { name: /träffar/i }).querySelector<HTMLButtonElement>('li[data-family="Lora"] button')
      if (!button) throw new Error('no Lora yet')
      return button
    })
    expect(taken.disabled).toBe(false)
    fireEvent.click(taken)
    await waitFor(() => expect(onPatch).toHaveBeenCalledWith('title', { font: { family: 'Lora', sizePt: 14, weight: 700 } }, undefined))
    expect(onCatalogFont).not.toHaveBeenCalled()
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
