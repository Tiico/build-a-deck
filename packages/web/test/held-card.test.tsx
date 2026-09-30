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

// The card held up large is what a tap on the phone reads (K8, #507): its heading is what a screen reader
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

// One action reads a card (K26, #506 beslut 2; #507 beslut A): the card held up is the reader for
// the whole row it was lifted from, so the next card is one step away and never three presses.
describe('the card held up walks the row it was lifted from (#507)', () => {
  const row: VisibleComponentState[] = ['c1', 'c2', 'c3'].map((id, i) => ({ ...card, id, cardRef: `kort-${i + 1}`, title: `Kort ${i + 1}` }))

  function hold(start = 'c1') {
    const shown: string[] = []
    const onClose = vi.fn()
    const at = { id: start }
    const view = render(<HeldCard card={row.find((c) => c.id === at.id)!} row={row} onStep={(c) => { shown.push(c.id); at.id = c.id }} onClose={onClose} />)
    const again = () => view.rerender(<HeldCard card={row.find((c) => c.id === at.id)!} row={row} onStep={(c) => { shown.push(c.id); at.id = c.id }} onClose={onClose} />)
    return { shown, onClose, again }
  }

  it('says where in the row it is, and steps by its arrows without being put down', () => {
    const { shown, onClose, again } = hold('c2')
    expect(screen.getByText('2 av 3')).toBeTruthy()
    const next = screen.getByRole('button', { name: 'Nästa kort' })
    // A press on an arrow is not the touch that puts the card down (UX-30).
    fireEvent.pointerDown(next)
    fireEvent.click(next)
    again()
    expect(shown).toEqual(['c3'])
    expect(onClose).not.toHaveBeenCalled()
    expect((screen.getByRole('button', { name: 'Nästa kort' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Föregående kort' }))
    expect(shown).toEqual(['c3', 'c2'])
  })

  it('steps by the arrow keys', () => {
    const { shown } = hold('c1')
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' })
    expect(shown).toEqual(['c2'])
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowLeft' })
    // From c1, which the test did not re-render: the step is from the card shown, and it has none before it.
    expect(shown).toEqual(['c2'])
  })

  // Put down on its own click and not on the pointerup before it: a card gone at pointerup hands
  // the trailing click to whatever lay under the finger, which on the phone is the verbs (UX-30).
  it('steps by a swipe across the card, and a tap on the card still puts it down', () => {
    const { shown, onClose } = hold('c2')
    const face = document.querySelector('[data-inspect="c2"]')!
    const touch = (from: number, to: number) => {
      fireEvent.pointerDown(face, { clientX: from, clientY: 200 })
      fireEvent.pointerUp(face, { clientX: to, clientY: 204 })
      fireEvent.click(face, { clientX: to, clientY: 204 })
    }
    touch(300, 180)
    expect(shown).toEqual(['c3'])
    touch(100, 220)
    expect(shown).toEqual(['c3', 'c1'])
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.pointerDown(face, { clientX: 150, clientY: 200 })
    fireEvent.pointerUp(face, { clientX: 152, clientY: 201 })
    expect(onClose, 'still up between the pointerup and its click').not.toHaveBeenCalled()
    fireEvent.click(face)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // The tap that opened it ends in a click, and that click lands where the finger was — which on a
  // phone is the middle of the screen, where the card now is. It is the opening tap's, not a tap on
  // the card, so the card stays up: it is put down only by a touch that began on it.
  it('stays up through the click that ends the tap that opened it', () => {
    const { onClose } = hold('c2')
    fireEvent.click(document.querySelector('[data-inspect="c2"]')!)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('draws no arrows for a card that is alone in its row', () => {
    render(<HeldCard card={row[0]!} row={[row[0]!]} onStep={() => undefined} onClose={() => undefined} />)
    expect(screen.queryByRole('button', { name: 'Nästa kort' })).toBeNull()
    expect(screen.queryByText('1 av 1')).toBeNull()
  })
})

// The texture is a picture, and what the card prints is heard when it is held up to be read (#551,
// K27): the name stays the title, and the printed words are the reader's description.
describe('the card held up reads out what it prints (#551)', () => {
  const described = () => {
    const id = screen.getByRole('dialog').getAttribute('aria-describedby')
    return id === null ? null : [...document.getElementById(id)!.querySelectorAll('p')].map((p) => p.textContent)
  }

  it('describes the reader with the printed lines, each ended as a sentence, and its name stays the title', () => {
    render(<HeldCard card={{ ...card, title: 'Duel', text: ['Playcard', 'Utmana en spelare på duell.', 'Guld'] }} onClose={() => undefined} />)
    expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('Duel')
    expect(described()).toEqual(['Playcard.', 'Utmana en spelare på duell.', 'Guld.'])
  })

  it('reads the next card when the row is walked', () => {
    const row: VisibleComponentState[] = [{ ...card, id: 'c1', title: 'Duel', text: ['Guld'] }, { ...card, id: 'c2', title: 'Duel', text: ['Koppar'] }]
    const { rerender } = render(<HeldCard card={row[0]!} row={row} onStep={() => undefined} onClose={() => undefined} />)
    expect(described()).toEqual(['Guld.'])
    rerender(<HeldCard card={row[1]!} row={row} onStep={() => undefined} onClose={() => undefined} />)
    expect(described()).toEqual(['Koppar.'])
  })

  it('has no description for a card that prints nothing more, or whose words the view was not told', () => {
    const { unmount } = render(<HeldCard card={{ ...card, text: [] }} onClose={() => undefined} />)
    expect(described()).toBeNull()
    unmount()
    render(<HeldCard card={card} onClose={() => undefined} />)
    expect(described()).toBeNull()
  })
})
