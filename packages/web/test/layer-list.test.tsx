// @vitest-environment jsdom
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { LayerList } from '../src/editor/LayerList.js'
import { template } from './project-doc.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

const base = template().faces['front']!.base
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
// The panel is a grid (L15): a row per layer, and what a layer is called is what its own cell
// says. The rows are read by that name.
const named = () => screen.getAllByRole('row').map((r) => (r.querySelector('.byd-layer-pick') as HTMLElement).textContent)
const pick = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}$`) })

describe('the layer list when the template changes under the keyboard', () => {
  it('moves focus to the layer that took the removed one’s place', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<Layers ids={['body', 'title', 'frame']} />)
    await user.tab()
    expect(document.activeElement).toBe(pick('title'))

    rerender(<Layers ids={['body', 'frame']} />)
    expect(named()).toEqual(['body', 'frame'])
    const frame = pick('frame')
    expect(document.activeElement).toBe(frame)
    expect(frame.closest('[role="row"]')?.getAttribute('aria-selected')).toBe('true')
    expect(frame.getAttribute('tabindex')).toBe('0')
  })

  it('keeps focus on the same layer when the order changes', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<Layers ids={['body', 'title', 'frame']} />)
    await user.tab()
    const title = pick('title')

    rerender(<Layers ids={['title', 'body', 'frame']} />)
    expect(named()).toEqual(['title', 'body', 'frame'])
    expect(document.activeElement).toBe(title)
    expect(title.getAttribute('tabindex')).toBe('0')
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(pick('body'))
  })

  it('leaves focus where it is when a layer is added', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<Layers ids={['title', 'frame']} />)
    await user.tab()
    const title = pick('title')

    rerender(<Layers ids={['body', 'title', 'frame']} />)
    expect(document.activeElement).toBe(title)
    expect(pick('body').getAttribute('tabindex')).toBe('-1')
  })
})

describe('moving a layer in the list itself', () => {
  it('keeps the moved layer focused and the plain arrows moving the focus', async () => {
    const user = userEvent.setup()
    render(<MovableLayers ids={['body', 'title', 'frame']} />)
    await user.tab()
    const title = pick('title')
    expect(document.activeElement).toBe(title)

    await user.keyboard('{Alt>}{ArrowUp}{/Alt}')
    expect(named()).toEqual(['title', 'body', 'frame'])
    expect(document.activeElement).toBe(title)

    // Without Alt the same key is the roving tabindex again, and only the focus moves.
    await user.keyboard('{ArrowDown}')
    expect(named()).toEqual(['title', 'body', 'frame'])
    expect(document.activeElement).toBe(pick('body'))
  })
})

// Renaming a layer (#478): the field opened with the caret after the old name, so typing a new
// one wrote «titleRubrik». The old name is marked, as every rename field marks it, so typing
// replaces it.
describe('renaming a layer (#478)', () => {
  it('opens with the old name marked, so what is typed replaces it', async () => {
    const user = userEvent.setup()
    const onRename = vi.fn()
    render(
      <>
        <h2 id="test-layers-heading">Lager</h2>
        <LayerList layers={layersOf(['body', 'title'])} selected="title" onSelect={vi.fn()} onReorder={vi.fn()} onRename={onRename} labelledBy="test-layers-heading" />
      </>,
    )
    pick('title').focus()
    await user.keyboard('{F2}')
    const field = document.querySelector('.byd-layer-rename') as HTMLInputElement
    expect(field.selectionStart).toBe(0)
    expect(field.selectionEnd).toBe(field.value.length)
    await user.keyboard('Rubrik{Enter}')
    expect(onRename.mock.calls.at(-1)?.[1]).toBe('Rubrik')
  })
})

// The drop line (#478): it is drawn over the row the layer is dropped on, and a layer dragged
// downward landed under that row instead — the line said one place and the layer went to another.
// It now lands where the line is, whichever way it was dragged.
describe('dropping a layer where the line is (#478)', () => {
  const row = (id: string) => document.querySelector(`[data-layer="${id}"]`) as HTMLElement
  const dragOnto = (from: string, to: string) => {
    fireEvent.dragStart(row(from))
    fireEvent.dragOver(row(to))
    expect(row(to).hasAttribute('data-over')).toBe(true)
    fireEvent.drop(row(to))
  }

  it('lands above the row it is dropped on when dragged down', () => {
    render(<MovableLayers ids={['body', 'title', 'frame']} />)
    dragOnto('body', 'frame')
    expect(named()).toEqual(['title', 'body', 'frame'])
  })

  it('and when dragged up', () => {
    render(<MovableLayers ids={['body', 'title', 'frame']} />)
    dragOnto('frame', 'body')
    expect(named()).toEqual(['frame', 'body', 'title'])
  })
})
