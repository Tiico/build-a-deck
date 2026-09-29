// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render } from '@testing-library/react'
import type { VisibleComponentState } from '@byd/protocol'
import { HandColumn } from '../src/online/HandColumn.js'
import { liftBox } from '../src/table/lift.js'
import { READ_CARD_MIN_PX } from '../src/online/fan.js'
import { DEFAULT_BODY_PT, SCREENS, textPxOnCard } from './legibility.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// A card in the hand's column, read (K26, #510 beslut B). The column's 112 px card carries its body
// at 5 px, and the 180 px peek it used to draw on hover at 8.6 (#484 fynd 15). Now hover, keyboard
// focus or a press lifts it up beside the column the way a card on the felt is lifted (#509): in the
// window's size, by `liftBox`. A second press — on the card or on the lift — opens the address
// panel, which a press used to open straight away; Enter still does (K16).
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

  it('a finger’s first press lifts the card and opens nothing; the second opens the panel', () => {
    const { el, onOpen } = column()
    press(el('c1'), 'touch')
    expect(lifted()?.getAttribute('data-lift')).toBe('c1')
    expect(onOpen).not.toHaveBeenCalled()
    press(el('c1'), 'touch')
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }))
    expect(lifted()).toBeNull()
  })

  it('a click keeps the card lifted after the mouse has left it, and a second click opens the panel', () => {
    const { el, onOpen } = column()
    act(() => void fireEvent.pointerEnter(el('c2'), { pointerType: 'mouse' }))
    press(el('c2'))
    act(() => void fireEvent.pointerLeave(el('c2'), { pointerType: 'mouse' }))
    expect(lifted()?.getAttribute('data-lift')).toBe('c2')
    expect(onOpen).not.toHaveBeenCalled()
    press(el('c2'))
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'c2' }))
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
