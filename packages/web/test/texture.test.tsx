// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { VisibleComponentState } from '@byd/protocol'
import { Texture } from '../src/table/Texture.js'
import { contrastRatio, cssCustomProperties } from '../src/player/contrast.js'

const FRONT = 'a'.repeat(64)
const BACK = 'b'.repeat(64)
const FACES = 'http://faces.test'

const base = { id: 'c1', type: { id: 'card.standard.63x88', version: 1 }, zone: 'table', x: 0, y: 0, rot: 0 }
const faceUp: VisibleComponentState = { ...base, face: 'front', cardRef: 'wizard', faces: { front: FRONT, back: BACK } }
// What the server sends for a card this seat may not see: no identity, and no front hash.
const faceDown: VisibleComponentState = { ...base, face: 'back', cardRef: null, faces: { back: BACK } }

// The render farm is behind, or the job died: after the bounded ladder of retries the browser
// would be left with its own broken-image icon, which says nothing to a player.
function exhaust(img: () => HTMLImageElement) {
  for (let i = 0; i <= 8; i++) {
    fireEvent.error(img())
    act(() => vi.advanceTimersByTime(1500 * (i + 1)))
  }
}

describe('a texture that is still being rendered', () => {
  it('names a card the seat may see, and never names one it may not', () => {
    const shown = render(<Texture faces={FACES} c={faceUp} />)
    expect(shown.container.querySelector('[data-texture="pending"]')!.textContent).toMatch(/wizard/)

    const hidden = render(<Texture faces={FACES} c={faceDown} />)
    const fallback = hidden.container.querySelector('[data-texture="pending"]')!
    expect(fallback.textContent).toMatch(/[Rr]enderas/)
    expect(fallback.textContent).not.toMatch(/wizard/)
  })

  // Both states are read by people who are not developers, so they are sentences about the card
  // and never about the machinery: no "textur", no "hash", no "job".
  it('speaks about the card, in whole Swedish sentences', () => {
    const waiting = render(<Texture faces={FACES} c={faceUp} />)
    expect(waiting.container.querySelector('[data-texture="pending"] i')!.textContent).toBe('Kortet renderas…')

    vi.useFakeTimers()
    const lost = render(<Texture faces={FACES} c={faceUp} />)
    exhaust(() => lost.container.querySelector('img') as HTMLImageElement)
    expect(lost.container.querySelector('[data-texture="failed"] i')!.textContent).toBe('Bilden kunde inte laddas')
    vi.useRealTimers()
  })
})

// A card's face can change under it — the same component flipped, or a new revision of the
// deck. Keeping the <img> and only swapping `src` leaves the browser showing the decoded old
// bitmap until the new one arrives, so the card lies for a frame. A fresh element cannot.
describe('a texture that is replaced by another', () => {
  it('mounts a new image for a new face, so the old one is never shown under the new src', () => {
    const OTHER = 'c'.repeat(64)
    const { container, rerender } = render(<Texture faces={FACES} c={faceUp} />)
    const first = container.querySelector('img') as HTMLImageElement
    fireEvent.load(first)
    expect(first.getAttribute('data-state')).toBe('ready')

    rerender(<Texture faces={FACES} c={{ ...faceUp, faces: { front: OTHER, back: BACK } }} />)
    const second = container.querySelector('img') as HTMLImageElement
    expect(second).not.toBe(first)
    expect(second.src).toBe(`${FACES}/faces/${OTHER}`)
    expect(second.getAttribute('data-state')).toBe('pending')
    expect(container.querySelector('[data-texture="pending"]')).not.toBeNull()
  })
})

describe('a texture that arrives', () => {
  it('swaps in the finished image without remounting it, so nothing moves', () => {
    const { container } = render(<Texture faces={FACES} c={faceUp} />)
    const img = container.querySelector('img') as HTMLImageElement
    expect(img.getAttribute('data-state')).toBe('pending')

    fireEvent.load(img)

    expect(container.querySelector('img')).toBe(img)
    expect(img.src).toBe(`${FACES}/faces/${FRONT}`)
    expect(img.getAttribute('data-state')).toBe('ready')
    expect(container.querySelector('[data-texture]')).toBeNull()
  })
})

describe('a texture that never arrives', () => {
  it('says so in Swedish, keeps naming a card the seat may see, and retries when asked', () => {
    vi.useFakeTimers()
    const { container } = render(<Texture faces={FACES} c={faceUp} />)
    const img = () => container.querySelector('img') as HTMLImageElement
    exhaust(img)

    const failed = container.querySelector('[data-texture="failed"]')!
    expect(failed.textContent).toMatch(/wizard/)
    expect(failed.textContent).toMatch(/kunde inte/i)

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /försök igen/i }))
    })
    expect(container.querySelector('[data-texture="pending"]')).not.toBeNull()
    // The ask reaches the render queue: a job that died is only revived by `retry=1`.
    expect(img().src).toBe(`${FACES}/faces/${FRONT}?retry=1&t=9`)
    vi.useRealTimers()
  })

  it('waits its way up the ladder without asking for a fresh render', () => {
    vi.useFakeTimers()
    const { container } = render(<Texture faces={FACES} c={faceUp} />)
    const img = () => container.querySelector('img') as HTMLImageElement
    // Waiting is not asking: the queue must not be given work while it is still doing it.
    for (let i = 0; i < 3; i++) {
      fireEvent.error(img())
      act(() => vi.advanceTimersByTime(1500 * (i + 1)))
      expect(img().src).toBe(`${FACES}/faces/${FRONT}?t=${i + 1}`)
    }
    vi.useRealTimers()
  })

  it('never names a card the seat may not see', () => {
    vi.useFakeTimers()
    const { container } = render(<Texture faces={FACES} c={faceDown} />)
    exhaust(() => container.querySelector('img') as HTMLImageElement)

    const failed = container.querySelector('[data-texture="failed"]')!
    expect(failed.textContent).toMatch(/kunde inte/i)
    expect(failed.textContent).not.toMatch(/wizard/)
    vi.useRealTimers()
  })
})

describe('the palette the state is drawn in', () => {
  // The state has to be read on a TV across a room and on a phone in a lit kitchen, so it is
  // held to the same bar as the player view: AA against the ground it sits on.
  // (jsdom replaces the global URL, which node:fs will not take, so the path is joined.)
  const css = readFileSync(join(import.meta.dirname, '..', 'src/table/texture.css'), 'utf8')
  const tokens = cssCustomProperties(css)
  const token = (name: string) => {
    const value = tokens.get(name)
    if (!value) throw new Error(`texture.css declares no ${name}`)
    return value
  }

  it.each([
    { what: "the waiting card's name", ink: '--byd-texture-ink', on: '--byd-texture-bg' },
    { what: 'the waiting status', ink: '--byd-texture-quiet', on: '--byd-texture-bg' },
    { what: 'the waiting status over the sweep', ink: '--byd-texture-quiet', on: '--byd-texture-sweep' },
    { what: "the failed card's name", ink: '--byd-texture-fail-ink', on: '--byd-texture-fail-bg' },
    { what: 'the failure status', ink: '--byd-texture-fail-quiet', on: '--byd-texture-fail-bg' },
    { what: 'the retry label', ink: '--byd-texture-fail-ink', on: '--byd-texture-button-bg' },
  ])('gives $what AA contrast', ({ ink, on }) => {
    expect(contrastRatio(token(ink), token(on))).toBeGreaterThanOrEqual(4.5)
  })
})
