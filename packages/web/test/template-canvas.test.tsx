// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { TemplateCanvas } from '../src/editor/TemplateCanvas.js'
import { projectDoc } from './project-doc.js'
import type { ProjectDoc } from '../src/editor/types.js'

describe('TemplateCanvas (A as the template mode)', () => {
  it('lists layers top-most first, previews the selected row with the selected element outlined, and patches through the property panel', () => {
    const doc = projectDoc()
    const onSelectElement = vi.fn()
    const onPatch = vi.fn()
    render(<TemplateCanvas doc={doc} face="front" row="dragon" selectedElement="title" onSelectElement={onSelectElement} onPatch={onPatch} onRemove={vi.fn()} onAdd={vi.fn()} onReorder={vi.fn()} />)

    const layers = within(screen.getByRole('listbox', { name: /lager/i })).getAllByRole('option')
    expect(layers.map((l) => l.getAttribute('data-layer'))).toEqual(['body', 'title', 'frame'])
    expect(layers[1]!.getAttribute('aria-selected')).toBe('true')
    fireEvent.click(layers[0]!)
    expect(onSelectElement).toHaveBeenCalledWith('body')

    expect(screen.getByText('Drake')).toBeTruthy()
    expect([...document.querySelectorAll('style')].map((s) => s.textContent).join('\n')).toContain('[data-element="title"]{outline')

    const size = screen.getByLabelText(/storlek/i) as HTMLInputElement
    expect(size.value).toBe('14')
    fireEvent.change(size, { target: { value: '16' } })
    expect(onPatch).toHaveBeenCalledWith('title', { font: { family: 'sans-serif', sizePt: 16, weight: 700 } })

    fireEvent.change(screen.getByLabelText(/^x/i), { target: { value: '7' } })
    expect(onPatch).toHaveBeenCalledWith('title', { x: 7 })
    fireEvent.change(screen.getByLabelText(/fält/i), { target: { value: 'body' } })
    expect(onPatch).toHaveBeenCalledWith('title', { bind: { field: 'body' } })
  })
})

describe('the layer list by keyboard (UX-04)', () => {
  it('is a single-select listbox: every layer says its type and name, and the selection follows focus', async () => {
    const user = userEvent.setup()
    const onSelectElement = vi.fn()
    render(<TemplateCanvas doc={projectDoc()} face="front" row="dragon" selectedElement="title" onSelectElement={onSelectElement} onPatch={vi.fn()} onRemove={vi.fn()} onAdd={vi.fn()} onReorder={vi.fn()} />)

    const list = screen.getByRole('listbox', { name: /lager/i })
    const layers = within(list).getAllByRole('option')
    expect(layers.map((l) => l.textContent)).toEqual(['text body', 'text title', 'shape frame'])
    expect(layers.map((l) => l.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false'])
    expect(layers.map((l) => l.getAttribute('tabindex'))).toEqual(['-1', '0', '-1'])

    // The tool rail is the canvas's first stop (#18); the list is the next, on the selected
    // layer, and the arrows move the selection with the focus.
    await user.tab()
    await user.tab()
    expect(document.activeElement).toBe(layers[1])
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(layers[2])
    expect(onSelectElement).toHaveBeenLastCalledWith('frame')
    await user.keyboard('{Home}')
    expect(document.activeElement).toBe(layers[0])
    expect(onSelectElement).toHaveBeenLastCalledWith('body')
    await user.keyboard('{End}')
    expect(onSelectElement).toHaveBeenLastCalledWith('frame')
  })
})

describe('the layer list while the template changes under the keyboard (UX-04)', () => {
  it('keeps focus on the layer being moved, leaves it alone when one is added, and hands it to a neighbour when it is removed', async () => {
    const user = userEvent.setup()
    const onSelectElement = vi.fn()
    const canvas = (doc: ProjectDoc) => <TemplateCanvas doc={doc} face="front" row="dragon" selectedElement="title" onSelectElement={onSelectElement} onPatch={vi.fn()} onRemove={vi.fn()} onAdd={vi.fn()} onReorder={vi.fn()} />
    const { rerender } = render(canvas(structuredClone(projectDoc())))
    // The property panel has `option` elements of its own, so the layers are read inside the list.
    const list = () => within(screen.getByRole('listbox', { name: /lager/i }))
    const option = (name: string) => list().getByRole('option', { name })
    const named = () => list().getAllByRole('option').map((o) => o.textContent)

    // Past the tool rail (#18): the list's one tab stop is the selected layer, and the list is
    // read top-most first.
    await user.tab()
    await user.tab()
    const title = option('text title')
    expect(document.activeElement).toBe(title)
    expect(named()).toEqual(['text body', 'text title', 'shape frame'])

    // Moved to the top of the card: the same layer keeps the focus and the tab stop.
    const reordered = structuredClone(projectDoc())
    const front = reordered.template.faces['front']!
    const [frame, titleEl, bodyEl] = front.base
    front.base = [titleEl!, bodyEl!, frame!]
    rerender(canvas(reordered))
    expect(named()).toEqual(['shape frame', 'text body', 'text title'])
    expect(document.activeElement).toBe(title)
    expect(title.getAttribute('tabindex')).toBe('0')

    // A new layer arrives above it: focus stays where the reader left it.
    const added = structuredClone(reordered)
    added.template.faces['front']!.base.push({ ...frame!, id: 'accent' })
    rerender(canvas(added))
    expect(named()).toEqual(['shape accent', 'shape frame', 'text body', 'text title'])
    expect(document.activeElement).toBe(option('text title'))
    expect(option('shape accent').getAttribute('tabindex')).toBe('-1')

    // The focused layer is deleted: the layer that took its place takes the focus and the selection.
    const removed = structuredClone(added)
    const remaining = removed.template.faces['front']!
    remaining.base = remaining.base.filter((e) => e.id !== 'title')
    rerender(canvas(removed))
    expect(named()).toEqual(['shape accent', 'shape frame', 'text body'])
    expect(document.activeElement).toBe(option('text body'))
    expect(onSelectElement).toHaveBeenLastCalledWith('body')
  })
})
