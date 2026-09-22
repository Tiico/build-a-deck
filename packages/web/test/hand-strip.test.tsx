// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { HandStrip } from '../src/player/HandStrip.js'
import { buildScene } from './scene.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

describe('HandStrip', () => {
  it("shows the seat's own cards by name in hand order, and nothing from anywhere else", () => {
    const { view } = buildScene()
    render(<HandStrip view={view('A')} selected={new Set()} onTap={() => undefined} onHold={() => undefined} onLift={() => undefined} onOpen={() => undefined} />)
    const cards = [...document.querySelectorAll('[data-hand-card]')]
    expect(cards.map((c) => c.textContent)).toEqual([expect.stringContaining('dragon'), expect.stringContaining('knight')])
    expect(screen.queryByText('wizard')).toBeNull()
  })
})

// What the card is called is the row's own title, with its capitals and its diacritics (#412).
// The id is the row's address and was never a word for a reader: a wizard-built deck slugs the
// title into it, and an imported one numbers it `c-001`.
describe('a card is called by its title (#412, A4)', () => {
  const named = (title?: string) => {
    const { view } = buildScene()
    const snapshot = view('A')
    return {
      ...snapshot,
      components: snapshot.components.map((c) => (c.zone === 'hand:A' ? { ...c, cardRef: 'bjornen', ...(title === undefined ? {} : { title }) } : c)),
    }
  }

  it('writes and speaks «Björnen» where the row id is `bjornen`', () => {
    render(<HandStrip view={named('Björnen')} selected={new Set()} onTap={() => undefined} onHold={() => undefined} onLift={() => undefined} onOpen={() => undefined} />)
    const card = document.querySelector('[data-hand-card]')!
    expect(card.textContent).toContain('Björnen')
    expect(card.getAttribute('aria-label')).toContain('Björnen')
    expect(card.textContent).not.toContain('bjornen')
    expect(card.getAttribute('aria-label')).not.toContain('bjornen')
  })

  it('falls back to the id for a deck whose rows carry no title, as it always did', () => {
    render(<HandStrip view={named()} selected={new Set()} onTap={() => undefined} onHold={() => undefined} onLift={() => undefined} onOpen={() => undefined} />)
    const card = document.querySelector('[data-hand-card]')!
    expect(card.textContent).toContain('bjornen')
    expect(card.getAttribute('aria-label')).toContain('bjornen')
  })
})

describe('gestures (K4)', () => {
  it('tap inspects, dragging up lifts, holding selects', () => {
    vi.useFakeTimers()
    const { view } = buildScene()
    const onTap = vi.fn()
    const onHold = vi.fn()
    const onLift = vi.fn()
    render(<HandStrip view={view('A')} selected={new Set()} onTap={onTap} onHold={onHold} onLift={onLift} onOpen={() => undefined} />)
    const card = document.querySelector('[data-hand-card]')!

    fireEvent.pointerDown(card, { clientX: 100, clientY: 500 })
    fireEvent.pointerUp(card, { clientX: 102, clientY: 498 })
    expect(onTap).toHaveBeenCalledTimes(1)
    expect(onTap.mock.calls[0]?.[0]).toMatchObject({ cardRef: 'dragon' })

    fireEvent.pointerDown(card, { clientX: 100, clientY: 500 })
    fireEvent.pointerMove(card, { clientX: 100, clientY: 440 })
    fireEvent.pointerUp(card, { clientX: 100, clientY: 440 })
    expect(onLift).toHaveBeenCalledTimes(1)
    expect(onTap).toHaveBeenCalledTimes(1)

    fireEvent.pointerDown(card, { clientX: 100, clientY: 500 })
    vi.advanceTimersByTime(500)
    fireEvent.pointerUp(card, { clientX: 100, clientY: 500 })
    expect(onHold).toHaveBeenCalledTimes(1)
    expect(onTap).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})

describe('textures in the hand (TUNN-SKIVA §5)', () => {
  it('shows the front image of a card whose hash is known, by name otherwise', () => {
    const { view } = buildScene()
    const snapshot = view('A')
    const hand = snapshot.components.filter((c) => c.zone === 'hand:A')
    const first = hand[0]!
    const second = hand[1]!
    const withFaces = { ...snapshot, components: snapshot.components.map((c) => (c.id === first.id ? { ...c, faces: { front: 'a'.repeat(64), back: 'b'.repeat(64) } } : c)) }
    render(<HandStrip view={withFaces} selected={new Set()} faces="http://faces.test" onTap={() => undefined} onHold={() => undefined} onLift={() => undefined} onOpen={() => undefined} />)
    const img = document.querySelector(`[data-hand-card="${first.id}"] img`) as HTMLImageElement
    expect(img.src).toBe(`http://faces.test/faces/${'a'.repeat(64)}`)
    expect(document.querySelector(`[data-hand-card="${second.id}"] img`)).toBeNull()
    expect(document.querySelector(`[data-hand-card="${second.id}"]`)!.textContent).toContain('knight')
  })
})

describe('a texture the phone is still waiting for (#10)', () => {
  it('holds the card open with its name, and says nothing about one the seat may not see', () => {
    const { view } = buildScene()
    const snapshot = view('A')
    const hand = snapshot.components.filter((c) => c.zone === 'hand:A')
    const mine = hand[0]!
    const notMine = hand[1]!
    const withFaces = {
      ...snapshot,
      components: snapshot.components.map((c) =>
        c.id === mine.id
          ? { ...c, faces: { front: 'a'.repeat(64) } }
          : c.id === notMine.id
            ? { ...c, cardRef: null, faces: { back: 'b'.repeat(64) } }
            : c,
      ),
    }
    render(<HandStrip view={withFaces} selected={new Set()} faces="http://faces.test" onTap={() => undefined} onHold={() => undefined} onLift={() => undefined} onOpen={() => undefined} />)

    expect(document.querySelector(`[data-hand-card="${mine.id}"] [data-texture="pending"]`)!.textContent).toContain('dragon')
    const opaque = document.querySelector(`[data-hand-card="${notMine.id}"] [data-texture="pending"]`)!
    expect(opaque.textContent).toMatch(/[Rr]enderas/)
    expect(opaque.textContent).not.toMatch(/knight/)
  })
})

// The hand card is a control, and a control cannot hold another (UX-37, #82): a screen reader
// does not reach a button inside a button, and browsers do not agree on what a press means. So
// a card in the strip carries no way back of its own; it is read by holding it up, and the
// held-up card carries the retry.
describe('a texture the phone has given up on (#82)', () => {
  it('leaves the card one control and nothing nested in it, and keeps the gestures', () => {
    vi.useFakeTimers()
    const { view } = buildScene()
    const snapshot = view('A')
    const mine = snapshot.components.find((c) => c.zone === 'hand:A')!
    const withFaces = { ...snapshot, components: snapshot.components.map((c) => (c.id === mine.id ? { ...c, faces: { front: 'a'.repeat(64) } } : c)) }
    const onTap = vi.fn()
    render(<HandStrip view={withFaces} selected={new Set()} faces="http://faces.test" onTap={onTap} onHold={() => undefined} onLift={() => undefined} onOpen={() => undefined} />)
    const img = () => document.querySelector(`[data-hand-card="${mine.id}"] img`) as HTMLImageElement
    for (let i = 0; i <= 8; i++) {
      fireEvent.error(img())
      act(() => vi.advanceTimersByTime(1500 * (i + 1)))
    }
    const card = document.querySelector(`[data-hand-card="${mine.id}"]`)!
    expect(card.querySelector('[data-texture="failed"]')).not.toBeNull()

    expect(document.querySelectorAll('button button, button [role="button"], [role="button"] button')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: /försök igen/i })).toBeNull()

    // What the finger does is untouched: a tap on the lost card still holds it up.
    fireEvent.pointerDown(card, { clientX: 100, clientY: 500 })
    fireEvent.pointerUp(card, { clientX: 102, clientY: 498 })
    expect(onTap).toHaveBeenCalledTimes(1)
    expect(onTap.mock.calls[0]?.[0]).toMatchObject({ id: mine.id })
    vi.useRealTimers()
  })
})

describe('a hand with nothing in it (UX-16)', () => {
  it('points at the draw pile, and steps aside the moment a card arrives', () => {
    const { view } = buildScene()
    const dealt = view('A')
    const empty = { ...dealt, components: dealt.components.filter((c) => c.zone !== 'hand:A') }
    const props = { selected: new Set<string>(), onTap: () => undefined, onHold: () => undefined, onLift: () => undefined, onOpen: () => undefined }
    const { rerender } = render(<HandStrip view={empty} {...props} />)
    expect(document.querySelectorAll('[data-hand-card]')).toHaveLength(0)
    expect(screen.getByText(/Tom hand/).textContent).toBe('Tom hand. Dra ett kort ur draghögen.')

    rerender(<HandStrip view={dealt} {...props} />)
    expect(screen.queryByText(/Tom hand/)).toBeNull()
    expect(document.querySelectorAll('[data-hand-card]')).toHaveLength(2)
  })
})
