// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, within } from '@testing-library/react'
import { CARD_STANDARD_63x88, TOKEN_COUNTER, type SetupDef } from '@byd/engine'
import { TableRenderer } from '../src/table/TableRenderer.js'
import { TvChrome } from '../src/table/TvChrome.js'
import { tableOf } from './scene.js'
import { recipeSetup } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })
afterEach(cleanup)

// The room's television says each seat's words on one plate beside the seat's own zones (#573,
// beslut C, K26): its name, what its hand holds and its counters, at the floor's 24 px. The zone
// names a seat owns, the hand's badge at the rim and the counter's figure inside its chip were each
// drawn at 9–15 px; the plate says them once, where the room looks for the seat. The observer's
// screen is not the room's and keeps what it has.
function felt(players: number, handCards = 0): SetupDef {
  const base = recipeSetup(players, [{ name: 'Poäng', start: 3 }])
  const seats = base.seats.map((s) => (typeof s === 'string' ? s : (s as { id: string }).id))
  return {
    ...base,
    components: [
      ...base.components,
      // The chips the table puts in each seat's strip when it starts (C4).
      ...seats.map((s) => ({ type: { id: TOKEN_COUNTER.id, version: 1 }, cardRef: 'Poäng', zone: `counters:${s}`, face: 'front' as const, counter: 3, x: 8, y: 8 })),
      ...Array.from({ length: handCards }, (_, i) => ({ type: { id: CARD_STANDARD_63x88.id, version: 1 }, cardRef: `kort-${i}`, zone: 'hand:B', face: 'back' as const })),
    ],
  } as SetupDef
}

describe('the room’s television gives every seat a plate (#573, beslut C)', () => {
  it('draws one plate per seat with its name, its hand and its counter', () => {
    const table = tableOf(felt(4, 2))
    const view = table.view(null)
    const { container } = render(<TableRenderer view={view} mode="tv" scale={1} forTheRoom />)
    const plates = [...container.querySelectorAll<HTMLElement>('[data-seat-plate]')]
    expect(plates.map((p) => p.dataset['seatPlate'])).toEqual(view.seats.map((s) => s.id))
    const b = within(container.querySelector<HTMLElement>('[data-seat-plate="B"]')!)
    expect(b.getByText('2 kort på hand')).toBeTruthy()
    expect(b.getByText('Poäng 3')).toBeTruthy()
  })

  it('leaves off the words the plate says: the seat’s zone names, the hand’s badge and the chip’s figure', () => {
    const table = tableOf(felt(4, 2))
    const view = table.view(null)
    const { container } = render(<TableRenderer view={view} mode="tv" scale={1} forTheRoom />)
    const owned = view.zones.filter((z) => z.kind === 'area' && z.owner !== undefined)
    expect(owned.length).toBeGreaterThan(0)
    for (const z of owned) expect(container.querySelector(`[data-area="${CSS.escape(z.id)}"] > span`)).toBeNull()
    expect(container.querySelector('.byd-hand-count')).toBeNull()
    expect(container.querySelectorAll('.byd-token').length).toBeGreaterThan(0)
    expect(container.querySelector('.byd-token b')).toBeNull()
  })

  it('draws the plates under the cards, so a card played beside a seat is never covered', () => {
    const table = tableOf(felt(2))
    const view = table.view(null)
    const { container } = render(<TableRenderer view={view} mode="tv" scale={1} forTheRoom />)
    const plate = container.querySelector('[data-seat-plate]')!
    const card = container.querySelector('.byd-pile, .byd-card')!
    expect(plate.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('keeps today’s felt everywhere else: no plates, and the zone names, badges and figures stay', () => {
    const table = tableOf(felt(4, 2))
    const view = table.view(null)
    const { container } = render(<TableRenderer view={view} mode="tv" scale={1} />)
    expect(container.querySelector('[data-seat-plate]')).toBeNull()
    expect(container.querySelector('.byd-hand-count')).toBeTruthy()
    expect(container.querySelector('.byd-token b')).toBeTruthy()
  })

  it('drops the column’s seats on the room’s television, and keeps them for the observer', () => {
    const table = tableOf(felt(4))
    const view = table.view(null)
    const { container, unmount } = render(<TvChrome view={view} activity={[]} room><div /></TvChrome>)
    expect(container.querySelector('[data-tv]')!.hasAttribute('data-room')).toBe(true)
    expect(container.querySelector('.byd-tv-seats')).toBeNull()
    unmount()
    const observer = render(<TvChrome view={view} activity={[]}><div /></TvChrome>)
    expect(observer.container.querySelector('.byd-tv-seats')).toBeTruthy()
  })
})
