// @vitest-environment jsdom
// A control inside a control is invalid HTML, and a screen reader does not reach the inner one
// (UX-37, #82). A card is a control on most surfaces, so the one thing a card face used to carry
// — the way back from a lost texture — is what would nest. Every player surface is stood up here
// with every texture lost, and searched for a control with a control above it.
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { Snapshot } from '@byd/protocol'
import { HandStrip } from '../src/player/HandStrip.js'
import { MineStrip } from '../src/player/SeatExtras.js'
import { HeldCard } from '../src/player/HeldCard.js'
import { CardLook } from '../src/table/CardLook.js'
import { HandFan } from '../src/online/HandFan.js'
import { HandSpread } from '../src/online/HandSpread.js'
import { TableRenderer } from '../src/table/TableRenderer.js'
import { feltLabels } from '../src/table/keyboard.js'
import { buildScene } from './scene.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

const FACES = 'http://faces.test'
const NESTED = 'button button, button [role="button"], [role="button"] button, [role="button"] [role="button"]'
const noop = (): undefined => undefined

// The scene with a face for every card, so each one has a texture to lose.
function withFaces(snapshot: Snapshot): Snapshot {
  return { ...snapshot, components: snapshot.components.map((c) => ({ ...c, faces: c.cardRef === null ? { back: 'b'.repeat(64) } : { front: 'a'.repeat(64), back: 'b'.repeat(64) } })) }
}

// Every texture on the page runs out its ladder of retries and gives up.
function loseEveryTexture() {
  for (let i = 0; i <= 8; i++) {
    for (const img of document.querySelectorAll('img')) fireEvent.error(img)
    act(() => vi.advanceTimersByTime(1500 * (i + 1)))
  }
  expect(document.querySelectorAll('[data-texture="failed"]').length).toBeGreaterThan(0)
}

// A sweep that found no controls at all would prove nothing.
function expectNoNestedControl() {
  expect(document.querySelectorAll('button, [role="button"]').length).toBeGreaterThan(0)
  expect(document.querySelectorAll(NESTED)).toHaveLength(0)
}

describe('no control sits inside a control, on any player surface (UX-37, #82)', () => {
  it('the phone: the hand strip, the cards in front of the seat, and the card held up', () => {
    vi.useFakeTimers()
    const { view } = buildScene()
    const snapshot = withFaces(view('A'))
    const hand = snapshot.components.filter((c) => c.zone === 'hand:A')
    // The scene seats nobody in front of an area, so one is laid in front of A and a card put on it.
    const table = snapshot.zones.find((z) => z.id === 'table')!
    const front = { ...snapshot, zones: [...snapshot.zones, { ...table, id: 'mine:A', name: 'Framför A', owner: 'A' }], components: snapshot.components.map((c) => (c.id === hand[0]!.id ? { ...c, zone: 'mine:A' } : c)) }
    render(
      <>
        <HandStrip view={snapshot} selected={new Set()} faces={FACES} onTap={noop} onHold={noop} onLift={noop} onOpen={noop} />
        <MineStrip view={front} faces={FACES} onFlip={noop} onTake={noop} onPlay={noop} />
        <HeldCard card={hand[1]!} faces={FACES} onClose={noop} />
      </>,
    )
    loseEveryTexture()
    expectNoNestedControl()
    // The way back is on the held-up card, and on the cards in front of the seat, and nowhere else.
    expect(screen.getAllByRole('button', { name: 'Försök igen' })).toHaveLength(2)
    vi.useRealTimers()
  })

  it('the felt with the keyboard on it, the ring, and the card held up by "Titta"', () => {
    vi.useFakeTimers()
    const { view, faceUp } = buildScene()
    const snapshot = withFaces(view(null))
    const labels = feltLabels(snapshot)
    const keyboard = { labels, itemProps: () => ({ tabIndex: -1, ref: noop, onKeyDown: noop, onFocus: noop }), onActivate: noop }
    render(<TableRenderer view={snapshot} mode="tv" scale={1} faces={FACES} onAct={noop} keyboard={keyboard} />)
    loseEveryTexture()
    expectNoNestedControl()

    const client = (mmX: number, mmY: number) => ({ clientX: mmX + 500, clientY: mmY + 300, pointerId: 1, isPrimary: true, button: 0 })
    fireEvent.pointerDown(document.querySelector(`[data-component="${faceUp}"]`)!, client(-390, -240))
    act(() => vi.advanceTimersByTime(400))
    expect(document.querySelector('[data-radial]')).not.toBeNull()
    expectNoNestedControl()

    fireEvent.pointerUp(screen.getByRole('button', { name: 'Titta' }), client(-390, -300))
    expect(document.querySelector('[data-inspect]')).not.toBeNull()
    loseEveryTexture()
    expectNoNestedControl()
    expect(screen.getAllByRole('button', { name: 'Försök igen' })).toHaveLength(1)
    vi.useRealTimers()
  })

  it('the keyboard\'s look at a card', () => {
    vi.useFakeTimers()
    const { view } = buildScene()
    const card = withFaces(view('A')).components.find((c) => c.zone === 'hand:A')!
    render(<CardLook card={card} faces={FACES} onClose={noop} />)
    loseEveryTexture()
    expectNoNestedControl()
    vi.useRealTimers()
  })

  it('online: the fan and the whole hand spread out', () => {
    vi.useFakeTimers()
    const { view } = buildScene()
    const hand = withFaces(view('A')).components.filter((c) => c.zone === 'hand:A')
    render(
      <>
        <HandFan cards={hand} faces={FACES} onPlay={noop} onOpen={noop} />
        <HandSpread cards={hand} faces={FACES} onOpen={noop} onClose={noop} />
      </>,
    )
    loseEveryTexture()
    expectNoNestedControl()
    expect(screen.queryByRole('button', { name: 'Försök igen' })).toBeNull()
    vi.useRealTimers()
  })
})
