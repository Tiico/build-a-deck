// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { VisibleComponentState } from '@byd/protocol'
import { HeldCard } from '../src/player/HeldCard.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

const FRONT = 'a'.repeat(64)
const FACES = 'http://faces.test'
const card: VisibleComponentState = { id: 'c1', type: { id: 'card.standard.63x88', version: 1 }, zone: 'hand:A', face: 'front', x: 0, y: 0, rot: 0, cardRef: 'dragon', faces: { front: FRONT } }

// The card in the strip is a control and carries no way back of its own (UX-37, #82); the card
// held up after a tap is the phone's one big, quiet surface, so the way back lives here.
describe('a lost card held up on the phone (#82)', () => {
  it('carries the way back, and pressing it retries without putting the card down', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    render(<HeldCard card={card} faces={FACES} onClose={onClose} />)
    const img = () => document.querySelector('[data-inspect="c1"] img') as HTMLImageElement
    for (let i = 0; i <= 8; i++) {
      fireEvent.error(img())
      act(() => vi.advanceTimersByTime(1500 * (i + 1)))
    }
    expect(document.querySelector('[data-texture="failed"]')!.textContent).toContain('dragon')
    const button = screen.getByRole('button', { name: 'Försök igen' })
    expect(document.querySelectorAll('button button, button [role="button"], [role="button"] button')).toHaveLength(0)

    // A thumb is a pointerdown, a pointerup and then a click. The phone puts the held card down
    // on the next touch (UX-30), and a press on the way back must not be that touch.
    act(() => {
      fireEvent.pointerDown(button, { clientX: 10, clientY: 10 })
    })
    act(() => {
      fireEvent.pointerUp(button, { clientX: 10, clientY: 10 })
    })
    act(() => {
      fireEvent.click(button)
    })
    expect(onClose).not.toHaveBeenCalled()
    expect(document.querySelector('[data-texture="pending"]')).not.toBeNull()
    // The ask reaches the render queue: a job that died is only revived by `retry=1` (#10).
    expect(img().src).toBe(`${FACES}/faces/${FRONT}?retry=1&t=9`)

    // A touch anywhere else still puts the card down.
    fireEvent.pointerDown(document.querySelector('.byd-inspect')!)
    expect(onClose).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})

// The card held up large is the phone's «Läs valt kort» (K8): its heading is what a screen reader
// says the moment it opens, so it says what the card is called and not what the row is keyed on
// (#412).
describe('the card held up says its title (#412)', () => {
  const bjornen: VisibleComponentState = { ...card, cardRef: 'bjornen', title: 'Björnen' }

  it('names the heading and the word beside the picture with the title', () => {
    render(<HeldCard card={bjornen} onClose={() => undefined} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-label')).toBe('Björnen')
    expect(document.querySelector('[data-inspect="c1"] span')!.textContent).toBe('Björnen')
  })

  it('falls back to the id for a row with no title', () => {
    render(<HeldCard card={{ ...card, cardRef: 'bjornen' }} onClose={() => undefined} />)
    expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('bjornen')
  })
})

it('offers a keyboard way back from reading and returns focus to its opener', () => {
  const opener = document.createElement('button')
  document.body.append(opener)
  opener.focus()
  const close = vi.fn()
  const { unmount } = render(<HeldCard card={card} onClose={close} />)
  const back = screen.getByRole('button', { name: 'Stäng' })
  expect(document.activeElement).toBe(back)
  fireEvent.keyDown(back, { key: 'Escape' })
  expect(close).toHaveBeenCalledOnce()
  unmount()
  expect(document.activeElement).toBe(opener)
  opener.remove()
})
