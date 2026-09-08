// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { HandStrip } from '../src/player/HandStrip.js'
import { buildScene } from './scene.js'

describe('HandStrip', () => {
  it("shows the seat's own cards by name in hand order, and nothing from anywhere else", () => {
    const { view } = buildScene()
    render(<HandStrip view={view('A')} selected={new Set()} onTap={() => undefined} onHold={() => undefined} onLift={() => undefined} onOpen={() => undefined} />)
    const cards = [...document.querySelectorAll('[data-hand-card]')]
    expect(cards.map((c) => c.textContent)).toEqual([expect.stringContaining('dragon'), expect.stringContaining('knight')])
    expect(screen.queryByText('wizard')).toBeNull()
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
