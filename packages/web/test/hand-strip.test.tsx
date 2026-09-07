// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { HandStrip } from '../src/player/HandStrip.js'
import { buildScene } from './scene.js'

describe('HandStrip', () => {
  it("shows the seat's own cards by name in hand order, and nothing from anywhere else", () => {
    const { view } = buildScene()
    render(<HandStrip view={view('A')} selected={new Set()} onTap={() => undefined} onHold={() => undefined} onLift={() => undefined} />)
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
    render(<HandStrip view={view('A')} selected={new Set()} onTap={onTap} onHold={onHold} onLift={onLift} />)
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
  it('shows the visible card name in the pending fallback', () => {
    const { view } = buildScene()
    const snapshot = view('A')
    const first = snapshot.components.find((c) => c.zone === 'hand:A')!
    const withFaces = { ...snapshot, components: snapshot.components.map((c) => (c.id === first.id ? { ...c, faces: { front: 'a'.repeat(64) } } : c)) }

    render(<HandStrip view={withFaces} selected={new Set()} faces="http://faces.test" onTap={() => undefined} onHold={() => undefined} onLift={() => undefined} />)

    expect(document.querySelector(`[data-hand-card="${first.id}"] .byd-texture-fallback strong`)?.textContent).toBe(first.cardRef)
  })

  it('shows the front image of a card whose hash is known, by name otherwise', () => {
    const { view } = buildScene()
    const snapshot = view('A')
    const hand = snapshot.components.filter((c) => c.zone === 'hand:A')
    const first = hand[0]!
    const second = hand[1]!
    const withFaces = { ...snapshot, components: snapshot.components.map((c) => (c.id === first.id ? { ...c, faces: { front: 'a'.repeat(64), back: 'b'.repeat(64) } } : c)) }
    render(<HandStrip view={withFaces} selected={new Set()} faces="http://faces.test" onTap={() => undefined} onHold={() => undefined} onLift={() => undefined} />)
    const img = document.querySelector(`[data-hand-card="${first.id}"] img`) as HTMLImageElement
    expect(img.src).toBe(`http://faces.test/faces/${'a'.repeat(64)}`)
    expect(document.querySelector(`[data-hand-card="${second.id}"] img`)).toBeNull()
    expect(document.querySelector(`[data-hand-card="${second.id}"]`)!.textContent).toContain('knight')
  })
})
