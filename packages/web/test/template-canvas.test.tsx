// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { TemplateCanvas } from '../src/editor/TemplateCanvas.js'
import { projectDoc } from './project-doc.js'

describe('TemplateCanvas (A as the template mode)', () => {
  it('lists layers top-most first, previews the selected row with the selected element outlined, and patches through the property panel', () => {
    const doc = projectDoc()
    const onSelectElement = vi.fn()
    const onPatch = vi.fn()
    render(<TemplateCanvas doc={doc} face="front" row="dragon" selectedElement="title" onSelectElement={onSelectElement} onPatch={onPatch} />)

    const layers = within(screen.getByRole('list', { name: /lager/i })).getAllByRole('listitem')
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
