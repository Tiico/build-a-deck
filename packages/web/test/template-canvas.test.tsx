// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { TemplateCanvas } from '../src/editor/TemplateCanvas.js'
import { projectDoc } from './project-doc.js'
import type { ProjectDoc } from '../src/editor/types.js'

describe('TemplateCanvas (A as the template mode)', () => {
  it('exposes each layer as a named, focusable selection control', () => {
    const onSelectElement = vi.fn()
    render(<TemplateCanvas doc={projectDoc()} face="front" row="dragon" selectedElement="title" onSelectElement={onSelectElement} onPatch={vi.fn()} />)

    const title = screen.getByRole('button', { name: 'text title' })
    expect(title.getAttribute('aria-pressed')).toBe('true')
    title.focus()
    expect(document.activeElement).toBe(title)

    const body = screen.getByRole('button', { name: 'text body' })
    expect(body.getAttribute('aria-pressed')).toBe('false')
    body.click()
    expect(onSelectElement).toHaveBeenCalledWith('body')
  })

  it('keeps layer focus by identity across additions and reordering, then moves it to a neighbour after removal', () => {
    const onSelectElement = vi.fn()
    const renderCanvas = (doc: ProjectDoc) => (
      <TemplateCanvas doc={doc} face="front" row="dragon" selectedElement="title" onSelectElement={onSelectElement} onPatch={vi.fn()} />
    )
    const { rerender } = render(renderCanvas(structuredClone(projectDoc())))
    screen.getByRole('button', { name: 'text title' }).focus()

    const reordered = structuredClone(projectDoc())
    const [frame, title, body] = reordered.template.faces['front']!.base
    reordered.template.faces['front']!.base = [title!, body!, frame!]
    rerender(renderCanvas(reordered))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'text title' }))

    const added = structuredClone(reordered)
    added.template.faces['front']!.base.push({ ...frame!, id: 'accent' })
    rerender(renderCanvas(added))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'text title' }))

    const removed = structuredClone(added)
    removed.template.faces['front']!.base = removed.template.faces['front']!.base.filter((element) => element.id !== 'title')
    rerender(renderCanvas(removed))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'text body' }))
    expect(onSelectElement).toHaveBeenLastCalledWith('body')
  })

  it('lists layers top-most first, previews the selected row with the selected element outlined, and patches through the property panel', () => {
    const doc = projectDoc()
    const onSelectElement = vi.fn()
    const onPatch = vi.fn()
    render(<TemplateCanvas doc={doc} face="front" row="dragon" selectedElement="title" onSelectElement={onSelectElement} onPatch={onPatch} />)

    const layers = within(screen.getByRole('list', { name: /lager/i })).getAllByRole('listitem')
    expect(layers.map((l) => l.getAttribute('data-layer'))).toEqual(['body', 'title', 'frame'])
    expect(within(layers[1]!).getByRole('button').getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(within(layers[0]!).getByRole('button'))
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
