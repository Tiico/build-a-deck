// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { VisibleComponentState } from '@byd/protocol'
import { CardLook } from '../src/table/CardLook.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

const FRONT = 'a'.repeat(64)
const FACES = 'http://faces.test'
const card: VisibleComponentState = { id: 'c1', type: { id: 'card.standard.63x88', version: 1 }, zone: 'table', face: 'front', x: 0, y: 0, rot: 0, cardRef: 'wizard', faces: { front: FRONT } }

// "Titta" is the big, quiet view a card the keyboard names is read in, so a lost face offers its
// way back here (#10) and not on the felt card, which is a control (UX-37, #82).
describe('a lost card looked at from the keyboard (#82)', () => {
  it('carries the way back, and pressing it retries without closing the look', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    render(<CardLook card={card} faces={FACES} onClose={onClose} />)
    const img = () => document.querySelector('[data-inspect="c1"] img') as HTMLImageElement
    for (let i = 0; i <= 8; i++) {
      fireEvent.error(img())
      act(() => vi.advanceTimersByTime(1500 * (i + 1)))
    }
    const button = screen.getByRole('button', { name: 'Försök igen' })
    expect(document.querySelectorAll('button button, button [role="button"], [role="button"] button')).toHaveLength(0)

    // The look closes on a click anywhere in it; a click on the way back is not that click.
    act(() => {
      fireEvent.click(button)
    })
    expect(onClose).not.toHaveBeenCalled()
    expect(document.querySelector('[data-texture="pending"]')).not.toBeNull()
    expect(img().src).toBe(`${FACES}/faces/${FRONT}?retry=1&t=9`)

    // Stäng still closes.
    fireEvent.click(screen.getByRole('button', { name: 'Stäng' }))
    expect(onClose).toHaveBeenCalled()
    vi.useRealTimers()
  })
})
