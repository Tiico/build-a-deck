// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { TemplateCanvas } from '../src/editor/TemplateCanvas.js'
import { projectDoc } from './project-doc.js'
import type { ProjectDoc } from '../src/editor/types.js'

// The type a game is set in (B3): the family is chosen where the element is designed, and the
// file behind it belongs to the project, so a version prints as it was drawn.
function canvas(over: Partial<React.ComponentProps<typeof TemplateCanvas>> = {}) {
  const props = {
    doc: projectDoc(),
    face: 'front',
    row: 'dragon',
    selectedElement: 'title',
    onSelectElement: vi.fn(),
    onPatch: vi.fn(),
    onRemove: vi.fn(),
    onAdd: vi.fn(),
    onReorder: vi.fn(),
    onSelectFace: vi.fn(),
    group: null,
    onSelectGroup: vi.fn(),
    onGroupColumn: vi.fn(),
    onReset: vi.fn(),
    onFontFile: vi.fn(async () => 'Rubrikserif'),
    onFontLicence: vi.fn(),
    onRemoveFont: vi.fn(),
    ...over,
  }
  render(<TemplateCanvas {...props} />)
  return props
}

describe('choosing the type an element is set in (B3)', () => {
  it('offers the fonts the project has, and writes the chosen family onto the element', () => {
    const doc: ProjectDoc = { ...projectDoc(), fonts: { 'sans-serif': { stack: 'sans-serif' }, Rubrikserif: { stack: '"Rubrikserif", sans-serif', asset: `asset:${'a'.repeat(64)}` } } }
    const { onPatch } = canvas({ doc })

    const pick = screen.getByLabelText(/^typsnitt$/i) as HTMLSelectElement
    expect([...pick.options].map((o) => o.value)).toEqual(['sans-serif', 'Rubrikserif'])
    expect(pick.value).toBe('sans-serif')
    fireEvent.change(pick, { target: { value: 'Rubrikserif' } })
    expect(onPatch).toHaveBeenCalledWith('title', { font: { family: 'Rubrikserif', sizePt: 14, weight: 700 } })
  })

  it('keeps a family the project no longer names, rather than silently moving the element to another one', () => {
    const doc = projectDoc()
    doc.fonts = { Rubrikserif: { stack: '"Rubrikserif", sans-serif' } }
    canvas({ doc })
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

describe('the fonts the game carries (B3)', () => {
  it('says which of them travel to the printer and which do not', () => {
    const doc: ProjectDoc = { ...projectDoc(), fonts: { 'sans-serif': { stack: 'sans-serif' }, Rubrikserif: { stack: '"Rubrikserif", sans-serif', asset: `asset:${'a'.repeat(64)}` } } }
    canvas({ doc })
    const shelf = screen.getByRole('list', { name: /typsnitt i spelet/i })
    const rows = within(shelf).getAllByRole('listitem')
    expect(rows.map((r) => r.getAttribute('data-font'))).toEqual(['sans-serif', 'Rubrikserif'])
    expect(rows[0]!.textContent).toMatch(/följer inte med/i)
    expect(rows[1]!.textContent).toMatch(/följer med/i)
  })

  it('takes a font file into the game and states what it is licensed under', async () => {
    const doc: ProjectDoc = { ...projectDoc(), fonts: { Rubrikserif: { stack: '"Rubrikserif", sans-serif', asset: `asset:${'a'.repeat(64)}` } } }
    const { onFontFile, onFontLicence } = canvas({ doc })

    const file = new File([new Uint8Array([119, 79, 70, 50])], 'Rubrikserif.woff2', { type: 'font/woff2' })
    const upload = screen.getByLabelText(/ladda upp typsnitt/i) as HTMLInputElement
    fireEvent.change(upload, { target: { files: [file] } })
    await waitFor(() => expect(onFontFile).toHaveBeenCalledWith(file))

    // Only the designer knows the licence, so it is asked for beside the family, and both halves
    // are needed before anything is written (E4: a licence without a holder credits no one).
    fireEvent.change(screen.getByLabelText(/licens för rubrikserif/i), { target: { value: 'OFL-1.1' } })
    fireEvent.blur(screen.getByLabelText(/licens för rubrikserif/i))
    expect(onFontLicence).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText(/upphovsperson för rubrikserif/i), { target: { value: 'Typverket' } })
    fireEvent.blur(screen.getByLabelText(/upphovsperson för rubrikserif/i))
    expect(onFontLicence).toHaveBeenCalledWith('Rubrikserif', { licence: 'OFL-1.1', by: 'Typverket' })
  })

  it('lets a font that no card is set in go, and keeps one that is in use', () => {
    const doc: ProjectDoc = { ...projectDoc(), fonts: { 'sans-serif': { stack: 'sans-serif' }, Rubrikserif: { stack: '"Rubrikserif", sans-serif', asset: `asset:${'a'.repeat(64)}` } } }
    const { onRemoveFont } = canvas({ doc })
    const shelf = screen.getByRole('list', { name: /typsnitt i spelet/i })
    const rows = within(shelf).getAllByRole('listitem')
    // The template's text is set in sans-serif, so that one has no way out while it is used.
    expect(within(rows[0]!).queryByRole('button', { name: /ta bort/i })).toBeNull()
    fireEvent.click(within(rows[1]!).getByRole('button', { name: /ta bort/i }))
    expect(onRemoveFont).toHaveBeenCalledWith('Rubrikserif')
  })
})
