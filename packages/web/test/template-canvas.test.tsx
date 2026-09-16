// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { TemplateCanvas } from '../src/editor/TemplateCanvas.js'
import { projectDoc } from './project-doc.js'
import { layerIds, layerNames, layerPick, layerRow, layerRows } from './layers.js'
import type { ProjectDoc } from '../src/editor/types.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

describe('TemplateCanvas (A as the template mode)', () => {
  it('lists layers top-most first, previews the selected row with the selected element outlined, and patches through the property panel', () => {
    const doc = projectDoc()
    const onSelectElement = vi.fn()
    const onPatch = vi.fn()
    render(<TemplateCanvas doc={doc} face="front" row="dragon" selectedElement="title" onSelectElement={onSelectElement} onPatch={onPatch} onCallOff={vi.fn()} onRemove={vi.fn()} onAdd={vi.fn()} onPlaceIcon={vi.fn()} onReorder={vi.fn()} onLock={vi.fn()} onRename={vi.fn()} onSelectFace={vi.fn()} onReplaceFace={vi.fn()} group={null} onSelectGroup={vi.fn()} onGroupColumn={vi.fn()} onAddField={vi.fn()} onReset={vi.fn()} onFontFile={async () => 'Typsnitt'} onFontLicence={vi.fn()} onRemoveFont={vi.fn()} />)

    expect(layerIds()).toEqual(['body', 'title', 'frame'])
    expect(layerRow('title').getAttribute('aria-selected')).toBe('true')
    fireEvent.click(layerPick('body'))
    expect(onSelectElement).toHaveBeenCalledWith('body')

    expect(screen.getByText('Drake')).toBeTruthy()
    expect([...document.querySelectorAll('style')].map((s) => s.textContent).join('\n')).toContain('[data-element="title"]{outline')

    const size = screen.getByLabelText(/storlek/i) as HTMLInputElement
    expect(size.value).toBe('14')
    fireEvent.change(size, { target: { value: '16' } })
    // A control written into many times over for one thing hands a token in with every write, so
    // the whole of it is one step back (L14); which token it is belongs to the stack, not here.
    expect(onPatch).toHaveBeenCalledWith('title', { font: { family: 'sans-serif', sizePt: 16, weight: 700 } }, expect.any(String))

    fireEvent.change(screen.getByLabelText(/^x/i), { target: { value: '7' } })
    expect(onPatch).toHaveBeenCalledWith('title', { x: 7 }, expect.any(String))
    fireEvent.change(screen.getByLabelText(/fält/i), { target: { value: 'body' } })
    expect(onPatch).toHaveBeenCalledWith('title', { bind: { field: 'body' } }, undefined)
  })
})

describe('the layer list by keyboard (UX-04)', () => {
  it('is a grid of layers: each says what it is called and whether it is locked, and the selection follows focus', async () => {
    const user = userEvent.setup()
    const onSelectElement = vi.fn()
    render(<TemplateCanvas doc={projectDoc()} face="front" row="dragon" selectedElement="title" onSelectElement={onSelectElement} onPatch={vi.fn()} onCallOff={vi.fn()} onRemove={vi.fn()} onAdd={vi.fn()} onPlaceIcon={vi.fn()} onReorder={vi.fn()} onLock={vi.fn()} onRename={vi.fn()} onSelectFace={vi.fn()} onReplaceFace={vi.fn()} group={null} onSelectGroup={vi.fn()} onGroupColumn={vi.fn()} onAddField={vi.fn()} onReset={vi.fn()} onFontFile={async () => 'Typsnitt'} onFontLicence={vi.fn()} onRemoveFont={vi.fn()} />)

    expect(layerNames()).toEqual(['body', 'title', 'frame'])
    expect(layerRows().map((l) => l.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false'])
    expect(layerRows().map((l) => (l.querySelector('.byd-layer-pick') as HTMLElement).getAttribute('tabindex'))).toEqual(['-1', '0', '-1'])

    // The crown is the canvas's first stops since #129 — which column makes the groups, the fold
    // over the properties and the face switch, one stop each — then the tool rail (#18), and then
    // the grid, on the selected layer, where the arrows move the selection with the focus.
    for (let i = 0; i < 5; i++) await user.tab()
    expect(document.activeElement).toBe(layerPick('title'))
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(layerPick('frame'))
    expect(onSelectElement).toHaveBeenLastCalledWith('frame')
    await user.keyboard('{Home}')
    expect(document.activeElement).toBe(layerPick('body'))
    expect(onSelectElement).toHaveBeenLastCalledWith('body')
    await user.keyboard('{End}')
    expect(onSelectElement).toHaveBeenLastCalledWith('frame')
  })
})

describe('the layer list while the template changes under the keyboard (UX-04)', () => {
  it('keeps focus on the layer being moved, leaves it alone when one is added, and hands it to a neighbour when it is removed', async () => {
    const user = userEvent.setup()
    const onSelectElement = vi.fn()
    const canvas = (doc: ProjectDoc) => <TemplateCanvas doc={doc} face="front" row="dragon" selectedElement="title" onSelectElement={onSelectElement} onPatch={vi.fn()} onCallOff={vi.fn()} onRemove={vi.fn()} onAdd={vi.fn()} onPlaceIcon={vi.fn()} onReorder={vi.fn()} onLock={vi.fn()} onRename={vi.fn()} onSelectFace={vi.fn()} onReplaceFace={vi.fn()} group={null} onSelectGroup={vi.fn()} onGroupColumn={vi.fn()} onAddField={vi.fn()} onReset={vi.fn()} onFontFile={async () => 'Typsnitt'} onFontLicence={vi.fn()} onRemoveFont={vi.fn()} />
    const { rerender } = render(canvas(projectDoc()))
    const named = () => layerNames()

    // Past the crown (#129) and the tool rail (#18): the list's one tab stop is the selected layer,
    // and the list is read top-most first.
    for (let i = 0; i < 5; i++) await user.tab()
    const title = layerPick('title')
    expect(document.activeElement).toBe(title)
    expect(named()).toEqual(['body', 'title', 'frame'])

    // Moved to the top of the card: the same layer keeps the focus and the tab stop.
    const reordered = projectDoc()
    const front = reordered.template.faces['front']!
    const [frame, titleEl, bodyEl] = front.base
    front.base = [titleEl!, bodyEl!, frame!]
    rerender(canvas(reordered))
    expect(named()).toEqual(['frame', 'body', 'title'])
    expect(document.activeElement).toBe(title)
    expect(title.getAttribute('tabindex')).toBe('0')

    // A new layer arrives above it: focus stays where the reader left it.
    const added = structuredClone(reordered)
    added.template.faces['front']!.base.push({ ...frame!, id: 'accent' })
    rerender(canvas(added))
    expect(named()).toEqual(['accent', 'frame', 'body', 'title'])
    expect(document.activeElement).toBe(layerPick('title'))
    expect(layerPick('accent').getAttribute('tabindex')).toBe('-1')

    // The focused layer is deleted: the layer that took its place takes the focus and the selection.
    const removed = structuredClone(added)
    const remaining = removed.template.faces['front']!
    remaining.base = remaining.base.filter((e) => e.id !== 'title')
    rerender(canvas(removed))
    expect(named()).toEqual(['accent', 'frame', 'body'])
    expect(document.activeElement).toBe(layerPick('body'))
    expect(onSelectElement).toHaveBeenLastCalledWith('body')
  })
})

// The properties folded away, and remembered that way (#129). At 1024 the column held its 280 px
// whether or not anything was selected, and the card was left 456 px of a 1024 px desk. It folds
// when the designer asks and not otherwise — the prototype's other answer, a column that folds
// itself whenever nothing is selected, changes the card's width every time she clicks beside an
// element, and the card moves under the pointer that is working on it.
describe('folding the properties away (#129)', () => {
  const canvas = () => (
    <TemplateCanvas doc={projectDoc()} face="front" row="dragon" selectedElement="title" onSelectElement={vi.fn()} onPatch={vi.fn()} onCallOff={vi.fn()} onRemove={vi.fn()} onAdd={vi.fn()} onPlaceIcon={vi.fn()} onReorder={vi.fn()} onLock={vi.fn()} onRename={vi.fn()} onSelectFace={vi.fn()} onReplaceFace={vi.fn()} group={null} onSelectGroup={vi.fn()} onGroupColumn={vi.fn()} onAddField={vi.fn()} onReset={vi.fn()} onFontFile={async () => 'Typsnitt'} onFontLicence={vi.fn()} onRemoveFont={vi.fn()} />
  )
  const properties = () => screen.queryByRole('heading', { name: /egenskaper/i })

  it('takes the column away when asked, gives it back when asked, and is the same the next time the editor is opened', async () => {
    localStorage.clear()
    const user = userEvent.setup()
    const first = render(canvas())
    expect(properties()).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /fäll ihop egenskaperna/i }))
    expect(properties()).toBeNull()
    // With a layer selected and the column folded: folding is hers to undo, and a column that comes
    // and goes with the selection is the answer this one was chosen over.
    expect(screen.getByRole('button', { name: /visa egenskaperna/i }).getAttribute('aria-expanded')).toBe('false')

    // The next visit to the editor, which is a new mount reading what she left behind.
    first.unmount()
    const second = render(canvas())
    expect(properties()).toBeNull()

    await user.click(screen.getByRole('button', { name: /visa egenskaperna/i }))
    expect(properties()).toBeTruthy()
    second.unmount()
    render(canvas())
    expect(properties()).toBeTruthy()
  })
})
