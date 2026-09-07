// @vitest-environment jsdom
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { LayerList } from '../src/editor/LayerList.js'
import { template } from './project-doc.js'

const base = template.faces['front']!.base
// The layers a test wants, by id, in the order the list shows them.
function Layers({ ids }: { ids: string[] }) {
  const [selected, setSelected] = useState<string | null>('title')
  return (
    <>
      <h2 id="test-layers-heading">Lager</h2>
      <LayerList layers={layersOf(ids)} selected={selected} onSelect={setSelected} onReorder={vi.fn()} labelledBy="test-layers-heading" />
    </>
  )
}

// The same list, but holding the order itself: a move is reported out and comes back as a new
// order, the way the template does it.
function MovableLayers({ ids }: { ids: string[] }) {
  const [order, setOrder] = useState(ids)
  const reorder = (id: string, to: number) =>
    setOrder((was) => {
      const next = was.filter((other) => other !== id)
      next.splice(to, 0, id)
      return next
    })
  return (
    <>
      <h2 id="test-layers-heading">Lager</h2>
      <LayerList layers={layersOf(order)} selected="title" onSelect={vi.fn()} onReorder={reorder} labelledBy="test-layers-heading" />
    </>
  )
}

const layersOf = (ids: string[]) => ids.map((id) => base.find((e) => e.id === id)!)
const named = () => screen.getAllByRole('option').map((o) => o.textContent)

describe('the layer list when the template changes under the keyboard', () => {
  it('moves focus to the layer that took the removed one’s place', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<Layers ids={['body', 'title', 'frame']} />)
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('option', { name: 'text title' }))

    rerender(<Layers ids={['body', 'frame']} />)
    expect(named()).toEqual(['text body', 'shape frame'])
    const frame = screen.getByRole('option', { name: 'shape frame' })
    expect(document.activeElement).toBe(frame)
    expect(frame.getAttribute('aria-selected')).toBe('true')
    expect(frame.getAttribute('tabindex')).toBe('0')
  })

  it('keeps focus on the same layer when the order changes', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<Layers ids={['body', 'title', 'frame']} />)
    await user.tab()
    const title = screen.getByRole('option', { name: 'text title' })

    rerender(<Layers ids={['title', 'body', 'frame']} />)
    expect(named()).toEqual(['text title', 'text body', 'shape frame'])
    expect(document.activeElement).toBe(title)
    expect(title.getAttribute('tabindex')).toBe('0')
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(screen.getByRole('option', { name: 'text body' }))
  })

  it('leaves focus where it is when a layer is added', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<Layers ids={['title', 'frame']} />)
    await user.tab()
    const title = screen.getByRole('option', { name: 'text title' })

    rerender(<Layers ids={['body', 'title', 'frame']} />)
    expect(document.activeElement).toBe(title)
    expect(screen.getByRole('option', { name: 'text body' }).getAttribute('tabindex')).toBe('-1')
  })
})

describe('moving a layer in the list itself', () => {
  it('keeps the moved layer focused and the plain arrows moving the focus', async () => {
    const user = userEvent.setup()
    render(<MovableLayers ids={['body', 'title', 'frame']} />)
    await user.tab()
    const title = screen.getByRole('option', { name: 'text title' })
    expect(document.activeElement).toBe(title)

    await user.keyboard('{Alt>}{ArrowUp}{/Alt}')
    expect(named()).toEqual(['text title', 'text body', 'shape frame'])
    expect(document.activeElement).toBe(title)

    // Without Alt the same key is the roving tabindex again, and only the focus moves.
    await user.keyboard('{ArrowDown}')
    expect(named()).toEqual(['text title', 'text body', 'shape frame'])
    expect(document.activeElement).toBe(screen.getByRole('option', { name: 'text body' }))
  })
})
