// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render } from '@testing-library/react'
import type { VisibleComponentState } from '@byd/protocol'
import { HandColumn } from '../src/online/HandColumn.js'
import { HandFan } from '../src/online/HandFan.js'
import { HandSpread } from '../src/online/HandSpread.js'

// The hand on /online sends nothing with a click (#1291, beställarens beslut A): a card is played by
// dragging it onto the table, and the one thing a click does to a card in the hand is turn it over
// (#1133). The mouse reads by resting on the card, so the click is free for it. A finger keeps the
// tap that reads and opens (#484 fynd 10, #510), since a finger has no hover to read with, and the
// keyboard keeps Enter for the address panel, because a keyboard cannot drag; Space and F turn.
const card = (id: string, title: string): VisibleComponentState =>
  ({ id, type: { id: 'card.standard.63x88', version: 1 }, zone: 'hand:A', x: 0, y: 0, rot: 0, face: 'front', cardRef: title, title, faces: undefined }) as unknown as VisibleComponentState
const hand = [card('c1', 'Stolen Goods'), card('c2', 'Duel at Dawn')]

const at = (x: number, y: number, pointerType: string) => ({ clientX: x, clientY: y, pointerId: 1, isPrimary: true, button: 0, pointerType })
const press = (el: Element, pointerType: string) => {
  act(() => void fireEvent.pointerDown(el, at(1200, 300, pointerType)))
  act(() => void fireEvent.pointerUp(el, at(1200, 300, pointerType)))
  act(() => void fireEvent.click(el, { detail: 1 }))
}
const lifted = () => document.querySelector('[data-lift]')
const cardEl = (id: string) => document.querySelector(`[data-hand-card="${id}"], [data-spread-card="${id}"]`)!

const shapes = {
  column: (onTurn = vi.fn(), onOpen = vi.fn()) => render(<HandColumn cards={hand} onPlay={vi.fn()} onTurn={onTurn} onOpen={onOpen} />),
  fan: (onTurn = vi.fn(), onOpen = vi.fn()) => render(<HandFan cards={hand} onPlay={vi.fn()} onTurn={onTurn} onOpen={onOpen} />),
  spread: (onTurn = vi.fn(), onOpen = vi.fn()) => render(<HandSpread cards={hand} onTurn={onTurn} onOpen={onOpen} onClose={vi.fn()} />),
}

describe('a click on a card in the hand on /online turns it and sends nothing (#1291)', () => {
  for (const [shape, mount] of Object.entries(shapes)) {
    it(`turns the card with a mouse, every click, in the ${shape}`, () => {
      const onTurn = vi.fn()
      const onOpen = vi.fn()
      mount(onTurn, onOpen)
      press(cardEl('c2'), 'mouse')
      press(cardEl('c2'), 'mouse')
      expect(onTurn.mock.calls.map(([c]) => (c as VisibleComponentState).id)).toEqual(['c2', 'c2'])
      expect(onOpen).not.toHaveBeenCalled()
    })

    it(`turns the card on Space and F, and opens the panel on Enter, in the ${shape}`, () => {
      const onTurn = vi.fn()
      const onOpen = vi.fn()
      mount(onTurn, onOpen)
      fireEvent.keyDown(cardEl('c1'), { key: ' ' })
      fireEvent.keyDown(cardEl('c1'), { key: 'f' })
      expect(onTurn).toHaveBeenCalledTimes(2)
      expect(onOpen).not.toHaveBeenCalled()
      fireEvent.keyDown(cardEl('c1'), { key: 'Enter' })
      expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }))
    })
  }

  it('reads the card the mouse rests on and keeps nothing lifted after it leaves, a click included', () => {
    shapes.column()
    act(() => void fireEvent.pointerEnter(cardEl('c1'), { pointerType: 'mouse' }))
    expect(lifted()?.getAttribute('data-lift')).toBe('c1')
    press(cardEl('c1'), 'mouse')
    expect(lifted()?.getAttribute('data-lift')).toBe('c1')
    act(() => void fireEvent.pointerLeave(cardEl('c1'), { pointerType: 'mouse' }))
    expect(lifted()).toBeNull()
  })

  // The lift says what the hand now answers to, since nothing on the card does (prototype A's line).
  it('says under the card it reads what a click and a drag do, and Space and Enter for the keyboard', () => {
    const { rerender } = render(<HandColumn cards={hand} onPlay={vi.fn()} onTurn={vi.fn()} onOpen={vi.fn()} />)
    const says = () => document.querySelector('[data-lift-says]')?.textContent ?? null
    act(() => void fireEvent.pointerEnter(cardEl('c1'), { pointerType: 'mouse' }))
    expect(says()).toBe('Klick vänder · dra till bordet spelar')
    rerender(<HandColumn cards={hand} turned={new Set(['c1'])} onPlay={vi.fn()} onTurn={vi.fn()} onOpen={vi.fn()} />)
    expect(says()).toBe('Klick vänder upp · dra till bordet spelar nedvänt')
    act(() => void fireEvent.pointerLeave(cardEl('c1'), { pointerType: 'mouse' }))
    expect(says()).toBeNull()
    act(() => void fireEvent.focus(cardEl('c2')))
    expect(says()).toBe('Mellanslag vänder · Enter öppnar handlingar')
  })

  it('leaves a finger the tap that reads and opens, and turns nothing', () => {
    const onTurn = vi.fn()
    const onOpen = vi.fn()
    shapes.fan(onTurn, onOpen)
    press(cardEl('c1'), 'touch')
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }))
    expect(onTurn).not.toHaveBeenCalled()
  })
})
