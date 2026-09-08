// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { VisibleComponentState } from '@byd/protocol'
import { HandFan } from '../src/online/HandFan.js'

const base = { id: 'c1', type: { id: 'card.standard.63x88', version: 1 }, zone: 'hand:A', x: 0, y: 0, rot: 0 }
const mine: VisibleComponentState = { ...base, face: 'front', cardRef: 'dragon', faces: { front: 'a'.repeat(64) } }
const opaque: VisibleComponentState = { ...base, id: 'c2', face: 'back', cardRef: null, faces: { back: 'b'.repeat(64) } }

describe('a texture the online fan is still waiting for (#10)', () => {
  it('names the card the seat holds, and says nothing about one it may not see', () => {
    render(<HandFan cards={[mine, opaque]} faces="http://faces.test" onPlay={() => undefined} onOpen={() => undefined} />)

    expect(document.querySelector('[data-hand-card="c1"] [data-texture="pending"]')!.textContent).toContain('dragon')
    const hidden = document.querySelector('[data-hand-card="c2"] [data-texture="pending"]')!
    expect(hidden.textContent).toMatch(/[Rr]enderas/)
    expect(hidden.textContent).not.toMatch(/dragon/)
  })
})

describe('retrying a lost texture in the fan', () => {
  it('does not play the card the player only meant to reload', () => {
    vi.useFakeTimers()
    const onPlay = vi.fn()
    render(<HandFan cards={[mine]} faces="http://faces.test" onPlay={onPlay} onOpen={() => undefined} />)
    const img = () => document.querySelector('img') as HTMLImageElement
    for (let i = 0; i <= 8; i++) {
      fireEvent.error(img())
      act(() => vi.advanceTimersByTime(1500 * (i + 1)))
    }

    const button = screen.getByRole('button', { name: /försök igen/i })
    // One at a time, as a thumb produces them: a press that reached the fan would arm a drag.
    act(() => {
      fireEvent.pointerDown(button, { clientX: 10, clientY: 10 })
    })
    act(() => {
      fireEvent.pointerUp(button, { clientX: 10, clientY: 10 })
    })
    act(() => {
      fireEvent.click(button)
    })

    expect(onPlay).not.toHaveBeenCalled()
    expect(document.querySelector('[data-texture="pending"]')).not.toBeNull()
    vi.useRealTimers()
  })
})

// The band scrolls sideways and a card is played by dragging it up out of the fan (#24), so one
// press has to mean one of the two and can never mean both.
describe('scrolling the fan and playing a card out of it are told apart by direction (#24)', () => {
  const press = (el: Element, steps: [number, number][]) => {
    const [x0, y0] = steps[0]!
    act(() => {
      fireEvent.pointerDown(el, { clientX: x0, clientY: y0, pointerId: 1, isPrimary: true, button: 0 })
    })
    for (const [x, y] of steps.slice(1)) act(() => void fireEvent.pointerMove(el, { clientX: x, clientY: y, pointerId: 1 }))
    const [xn, yn] = steps.at(-1)!
    act(() => {
      fireEvent.pointerUp(el, { clientX: xn, clientY: yn, pointerId: 1 })
    })
  }
  const card = () => document.querySelector('[data-hand-card="c1"]')!

  it('plays a card the player dragged up out of the fan', () => {
    const onPlay = vi.fn()
    render(<HandFan cards={[mine]} faces="http://faces.test" onPlay={onPlay} onOpen={() => undefined} />)
    press(card(), [
      [200, 700],
      [204, 660],
      [210, 400],
    ])
    expect(onPlay).toHaveBeenCalledWith(mine, 210, 400)
  })

  it('plays nothing from a press that set off sideways, even when it swings up before it ends', () => {
    const onPlay = vi.fn()
    render(<HandFan cards={[mine]} faces="http://faces.test" onPlay={onPlay} onOpen={() => undefined} />)
    // A thumb dragging the fan along, then lifting away from the screen at an angle: the first
    // movement said scroll, and nothing later in the same press may take that back.
    press(card(), [
      [200, 700],
      [160, 698],
      [90, 690],
      [80, 300],
    ])
    expect(onPlay).not.toHaveBeenCalled()
  })

  it('plays nothing from a tap that never travelled at all', () => {
    const onPlay = vi.fn()
    render(<HandFan cards={[mine]} faces="http://faces.test" onPlay={onPlay} onOpen={() => undefined} />)
    press(card(), [
      [200, 700],
      [202, 703],
    ])
    expect(onPlay).not.toHaveBeenCalled()
  })
})
