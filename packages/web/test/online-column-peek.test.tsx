// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render } from '@testing-library/react'
import type { VisibleComponentState } from '@byd/protocol'
import { HandColumn } from '../src/online/HandColumn.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// A card in the column lifted out to be read (#484 fynd 15, beslut B, prototyp 27). The column
// scrolls and so clips whatever reaches past it, and a rendered face writes its title into the
// picture at about 8 px; hover and keyboard focus therefore draw the card again, larger, out over
// the felt's edge, with its whole name. A picture for the eye only: the card itself is the control.
const card = (id: string, title: string): VisibleComponentState =>
  ({ id, type: { id: 'card.standard.63x88', version: 1 }, zone: 'hand:A', x: 0, y: 0, rot: 0, face: 'front', cardRef: title, title, faces: undefined }) as unknown as VisibleComponentState

describe('a card in the column, lifted to be read (#484)', () => {
  const hand = [card('c1', 'Stolen Goods of the Old West'), card('c2', 'Duel at Dawn')]

  it('draws the card out beside the column on hover, with its whole name, and takes it away again', () => {
    render(<HandColumn cards={hand} onPlay={() => undefined} onOpen={() => undefined} />)
    const el = document.querySelector('[data-hand-card="c1"]')!
    act(() => void fireEvent.pointerEnter(el, { pointerType: 'mouse' }))
    const peek = document.querySelector('.byd-col-peek') as HTMLElement
    expect(peek.getAttribute('aria-hidden')).toBe('true')
    expect(peek.textContent).toContain('Stolen Goods of the Old West')
    act(() => void fireEvent.pointerLeave(el, { pointerType: 'mouse' }))
    expect(document.querySelector('.byd-col-peek')).toBeNull()
  })

  it('draws nothing for a finger, which opens the card instead', () => {
    render(<HandColumn cards={hand} onPlay={() => undefined} onOpen={() => undefined} />)
    act(() => void fireEvent.pointerEnter(document.querySelector('[data-hand-card="c1"]')!, { pointerType: 'touch' }))
    expect(document.querySelector('.byd-col-peek')).toBeNull()
  })

  it('follows the keyboard from card to card', () => {
    render(<HandColumn cards={hand} onPlay={() => undefined} onOpen={() => undefined} />)
    act(() => void fireEvent.focus(document.querySelector('[data-hand-card="c2"]')!))
    expect(document.querySelector('.byd-col-peek')!.textContent).toContain('Duel at Dawn')
    act(() => void fireEvent.blur(document.querySelector('[data-hand-card="c2"]')!))
    expect(document.querySelector('.byd-col-peek')).toBeNull()
  })
})
