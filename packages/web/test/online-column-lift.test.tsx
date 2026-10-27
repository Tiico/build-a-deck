// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render } from '@testing-library/react'
import type { VisibleComponentState } from '@byd/protocol'
import { HandColumn } from '../src/online/HandColumn.js'
import { liftBox } from '../src/table/lift.js'
import { READ_CARD_MIN_PX } from '../src/online/fan.js'
import { DEFAULT_BODY_PT, SCREENS, textPxOnCard } from './legibility.js'

// A card in the hand's column, read (K26, #510 beslut B). The column's 112 px card carries its body
// at 5 px, and the 180 px peek it used to draw on hover at 8.6 (#484 fynd 15). Now hover, keyboard
// focus or a finger's press lifts it up beside the column the way a card on the felt is lifted
// (#509): in the window's size, by `liftBox`. A finger's second press — on the card or on the lift —
// opens the address panel, which a press used to open straight away; Enter still does (K16). A
// mouse's click turns the card instead (#1291, `online-hand-turn.test.tsx`).
const card = (id: string, title: string): VisibleComponentState =>
  ({ id, type: { id: 'card.standard.63x88', version: 1 }, zone: 'hand:A', x: 0, y: 0, rot: 0, face: 'front', cardRef: title, title, faces: undefined }) as unknown as VisibleComponentState

const at = (x: number, y: number, pointerType = 'mouse') => ({ clientX: x, clientY: y, pointerId: 1, isPrimary: true, button: 0, pointerType })
const press = (el: Element, pointerType = 'mouse') => {
  fireEvent.pointerDown(el, at(1200, 300, pointerType))
  fireEvent.pointerUp(el, at(1200, 300, pointerType))
}
const lifted = () => document.querySelector('[data-lift]') as HTMLElement | null

function column(onOpen = vi.fn(), onPlay = vi.fn()) {
  const hand = [card('c1', 'Stolen Goods of the Old West'), card('c2', 'Duel at Dawn')]
  render(<HandColumn cards={hand} onPlay={onPlay} onOpen={onOpen} />)
  const el = (id: string) => document.querySelector(`[data-hand-card="${id}"]`)!
  return { el, onOpen, onPlay }
}

describe('a card in the column, read with one action (K26, #510)', () => {
  it('lifts the card beside the column on hover, in the size the felt lifts one, and puts it down on leaving', () => {
    const { el } = column()
    const c1 = el('c1')
    c1.getBoundingClientRect = () => new DOMRect(1150, 200, 112, 156)
    act(() => void fireEvent.pointerEnter(c1, { pointerType: 'mouse' }))
    const look = lifted()!
    expect(look.getAttribute('data-lift')).toBe('c1')
    const box = liftBox({ left: 1150, right: 1262, top: 200, bottom: 356 }, { w: window.innerWidth, h: window.innerHeight })
    expect({ w: look.style.width, left: look.style.left }).toEqual({ w: `${box.w}px`, left: `${box.left}px` })
    act(() => void fireEvent.pointerLeave(c1, { pointerType: 'mouse' }))
    expect(lifted()).toBeNull()
  })

  // What Chromium sent in the CI run that kept a lift up (#1325), reproduced in a real browser by
  // holding the faces and answering them under a mouse that rests on the card. The words «Laddar
  // kortet…» stood under the pointer and were taken away when the face arrived; Chromium had not
  // looked again at what was under the mouse when the next move came, so it sent the `pointerout`
  // to the words that were gone, where React's listener never hears it, and the `pointerover` on
  // what the mouse went to named the card as where it came from. React leaves a card on the
  // `pointerout` alone, and lets an over from a node it knows pass, so the card was never left.
  it('puts the card down when the mouse arrives elsewhere, even when the leaving went to a node that is gone (#1325)', () => {
    const { el } = column()
    const c1 = el('c1')
    act(() => void fireEvent.pointerOver(c1, { pointerType: 'mouse', relatedTarget: document.body }))
    expect(lifted()?.getAttribute('data-lift')).toBe('c1')
    const gone = document.createElement('span')
    act(() => void fireEvent.pointerOut(gone, { pointerType: 'mouse', relatedTarget: document.body }))
    const elsewhere = document.body.appendChild(document.createElement('aside'))
    act(() => void fireEvent.pointerOver(elsewhere, { pointerType: 'mouse', relatedTarget: c1 }))
    expect(lifted()).toBeNull()
    elsewhere.remove()
  })

  it('a finger’s first press lifts the card and opens nothing; the second opens the panel', () => {
    const { el, onOpen } = column()
    press(el('c1'), 'touch')
    expect(lifted()?.getAttribute('data-lift')).toBe('c1')
    expect(onOpen).not.toHaveBeenCalled()
    press(el('c1'), 'touch')
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }))
    expect(lifted()).toBeNull()
  })

  it('a press on the lifted card opens the panel for it', () => {
    const { el, onOpen } = column()
    press(el('c1'), 'touch')
    const look = lifted()!
    fireEvent.pointerDown(look, at(700, 300, 'touch'))
    fireEvent.click(look, { ...at(700, 300, 'touch'), detail: 1 })
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }))
  })

  it('pressing another card moves the lift to it', () => {
    const { el, onOpen } = column()
    press(el('c1'), 'touch')
    press(el('c2'), 'touch')
    expect(lifted()?.getAttribute('data-lift')).toBe('c2')
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('follows the keyboard from card to card, and Enter still opens the panel at once (K16)', () => {
    const { el, onOpen } = column()
    act(() => void fireEvent.focus(el('c2')))
    expect(lifted()?.getAttribute('data-lift')).toBe('c2')
    fireEvent.keyDown(el('c2'), { key: 'Enter' })
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'c2' }))
    act(() => void fireEvent.blur(el('c2')))
    expect(lifted()).toBeNull()
  })

  it('a card carried out to be played is not lifted to be read', () => {
    const { el, onPlay } = column()
    const c1 = el('c1')
    act(() => void fireEvent.pointerEnter(c1, { pointerType: 'mouse' }))
    fireEvent.pointerDown(c1, at(1200, 300))
    fireEvent.pointerMove(c1, at(900, 305))
    expect(lifted()).toBeNull()
    fireEvent.pointerUp(c1, at(900, 305))
    expect(onPlay).toHaveBeenCalled()
    expect(lifted()).toBeNull()
  })

  it('Escape puts a card read by a press down', () => {
    const { el } = column()
    press(el('c1'), 'touch')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(lifted()).toBeNull()
  })
})

describe('«Visa alla» at the size a card is read at (K26, #510)', () => {
  it('draws the grid’s smallest card at the desk’s body floor for the wizard’s frames', () => {
    expect(textPxOnCard(DEFAULT_BODY_PT, READ_CARD_MIN_PX)).toBeGreaterThanOrEqual(SCREENS.desk.bodyPx.min)
  })
})
