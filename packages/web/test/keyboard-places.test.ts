import { describe, expect, it } from 'vitest'
import type { Snapshot, VisibleComponentState } from '@byd/protocol'
import { intentsForPlace, isLoose, placesFor, thingsOn, type Thing } from '../src/table/keyboard.js'

// Where the address panel lets a card go (K16). A wizard table (C4) has, per seat, a private
// area and a zone that holds nothing but its counter; the counter is a component of its own type
// on that zone. None of that is a place for a card.
const CARD = { id: 'card.standard.63x88', version: 1 }
const COUNTER = { id: 'token.counter', version: 1 }
const rect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h, rot: 0 })
const counter = (id: string, zone: string): VisibleComponentState => ({ id, type: COUNTER, zone, face: 'front', x: 8, y: 8, rot: 0, cardRef: 'Poäng', counter: 0 } as unknown as VisibleComponentState)

function table(seat: string | null): Snapshot {
  return {
    seq: 1,
    seat,
    floor: 'table',
    seats: [
      { id: 'A', name: 'Ada', edge: 'S' },
      { id: 'B', name: 'Bo', edge: 'N' },
    ],
    zones: [
      { mode: 'order', id: 'table', kind: 'area', name: 'Spelyta', geometry: rect(-600, -400, 1200, 800), dynamic: false, order: ['loose'] },
      { mode: 'order', id: 'front:A', kind: 'area', name: 'Framför A', owner: 'A', geometry: rect(-250, 230, 500, 100), dynamic: false, order: [] },
      { mode: 'order', id: 'front:B', kind: 'area', name: 'Framför B', owner: 'B', geometry: rect(-250, -330, 500, 100), dynamic: false, order: [] },
      { mode: 'order', id: 'counters:A', kind: 'area', name: 'Räknare A', owner: 'A', geometry: rect(300, 230, 100, 100), dynamic: false, order: ['cA'] },
      { mode: 'order', id: 'counters:B', kind: 'area', name: 'Räknare B', owner: 'B', geometry: rect(300, -330, 100, 100), dynamic: false, order: ['cB'] },
      { mode: 'count', id: 'draw', kind: 'pile', name: 'Draghög', geometry: rect(-140, 0, 0, 0), dynamic: false, count: 5 },
      { mode: 'count', id: 'hand:A', kind: 'hand', name: 'Hand', owner: 'A', geometry: rect(-250, 340, 500, 60), dynamic: false, count: 2 },
      { mode: 'count', id: 'hand:B', kind: 'hand', name: 'Hand', owner: 'B', geometry: rect(-250, -400, 500, 60), dynamic: false, count: 2 },
    ],
    components: [{ id: 'loose', type: CARD, zone: 'table', face: 'front', x: 100, y: 100, rot: 0, cardRef: 'Torn' }, counter('cA', 'counters:A'), counter('cB', 'counters:B')],
    rewind: null,
    undo: null,
    ended: false,
  }
}

const labels = (seat: string | null) => placesFor(table(seat), new Set(['loose']), 'table').map((p) => p.label)

describe('the places a card can be addressed to (K16, C4)', () => {
  it('never offers a zone that holds nothing but counters, on the table or on the phone', () => {
    for (const seat of [null, 'A']) {
      expect(labels(seat)).not.toContain('Räknare A')
      expect(labels(seat)).not.toContain('Räknare B')
    }
  })

  it('never offers a counter as something to stack a card on', () => {
    for (const seat of [null, 'A']) expect(labels(seat).filter((l) => l.startsWith('På '))).toEqual([])
  })

  it("offers a seat its own private area and never another seat's, while the table itself sees both", () => {
    expect(labels('A')).toContain('Framför A')
    expect(labels('A')).not.toContain('Framför B')
    expect(labels(null)).toEqual(expect.arrayContaining(['Framför A', 'Framför B']))
  })

  it('still names the piles, the hands that are sat at, and the floor', () => {
    // A card leaving a hand: every place it can go, its own zone excepted.
    const fromHand = placesFor(table('A'), new Set(['h1']), 'hand:A').map((p) => p.label)
    expect(fromHand).toEqual(expect.arrayContaining(['Draghög', 'Bos hand', 'Framför A', 'Bordet', 'På Torn']))
    expect(fromHand).not.toContain('Min hand')
  })
})

// What the address then *sends* (#73). The filtering above settles which rows the panel shows; it
// does not settle what a row means once the thing addressed is a chip. A counter is `flippable:
// false`, so the flip that goes with a card into a public area (K11) had the whole envelope
// refused and the chip stayed where it was; and it is `stackable: false`, so "På <kort>" cannot
// mean for it what it means for a card. Neither case is reached by the filtering: a chip is still
// offered the table itself, and still offered every loose card on the felt.
describe('what a row of "Flytta till" sends a counter (C4, #73)', () => {
  const view = table('A')
  const chip = thingsOn(view).flatMap((x) => (x.kind === 'counter' ? [x] : []))[0]!
  const card = thingsOn(view).flatMap((x) => (x.kind === 'card' ? [x] : []))[0]!
  // The chip's own rows, so that the control below differs from the case in the one thing being
  // tested: same view, same row, a card instead of a counter.
  const rows = placesFor(view, new Set([chip.id]), chip.zone)
  const row = (label: string) => rows.find((p) => p.label === label)!
  const sent = (thing: Thing, label: string, moving: readonly string[]) => intentsForPlace(view, row(label), thing, moving).map((i) => i.v)

  it('is asked of rows a chip is really offered, so neither rule below is unreachable', () => {
    expect(isLoose(chip)).toBe(true)
    expect(rows.map((p) => p.label)).toEqual(expect.arrayContaining(['Bordet', 'På Torn']))
  })

  it('sends it into a public area by `move` alone, where a card is turned face up as well', () => {
    expect(sent(chip, 'Bordet', [chip.id])).toEqual(['move'])
    // The same row for a card, so that what is missing above is the counter and not the row.
    expect(sent(card, 'Bordet', [card.id])).toEqual(['move', 'flip'])
  })

  it('sends it into a card’s zone rather than onto the card, which a card is stacked onto', () => {
    expect(sent(chip, 'På Torn', [chip.id])).toEqual(['move'])
    // A second card sent onto the same one — the fixture holds a single loose card, so the one
    // travelling is named rather than drawn from the felt — so that the line above is a rule
    // about chips and not about the row.
    expect(sent(card, 'På Torn', ['another'])).toEqual(['stack'])
  })
})
