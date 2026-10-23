import { describe, expect, it } from 'vitest'
import { CARD_STANDARD_63x88, type SetupDef } from '@byd/engine'
import { openingSetup } from '@byd/server/doc'
import type { Snapshot } from '@byd/protocol'
import { playIntents } from '../src/player/play.js'
import { tableOf } from './scene.js'

// A card turned over in the hand is played face down wherever it goes (#1133, beställarens beslut
// A): K11 turns a played card face up in a public zone, and its follow-up asked for a second
// choice for games that play cards face down. The turn itself is the hand's own memory and sends
// nothing; what it changes is what the play sends.
//
// Run through the engine and read off `project`, because what a seat is told is the whole point:
// the other seat is told a card lies there and never which, and the seat that played it knows it
// only where it lies in front of her (#483's rule for her own card turned down there; B6 elsewhere).

const CARD = () => ({ id: CARD_STANDARD_63x88.id, version: 1 })

function felt(face: 'front' | 'back'): SetupDef {
  const setup = openingSetup({ players: 2, counters: [] })
  return {
    seats: setup.seats,
    floor: setup.floor,
    zones: setup.zones.map((z) => ({
      id: z.id,
      kind: z.kind,
      name: z.name,
      visibility: z.visibility,
      geometry: z.geometry,
      ...(z.owner ? { owner: z.owner } : {}),
      ...(z.returnTo ? { returnTo: z.returnTo } : {}),
      ...(z.shortcut ? { shortcut: z.shortcut } : {}),
    })),
    components: ['kort-1', 'kort-2'].map((cardRef) => ({ type: CARD(), cardRef, zone: 'hand:A', face })),
  }
}

function playOne(zone: string, face: 'front' | 'back', turned: boolean) {
  const table = tableOf(felt(face))
  table.run(null, { v: 'seat.claim', seat: 'A', name: 'Ada' })
  table.run(null, { v: 'seat.claim', seat: 'B', name: 'Bo' })
  const view = table.view('A')
  const card = view.components.find((c) => c.zone === 'hand:A')!
  const intents = playIntents(view, [card], zone, undefined, 'top', turned ? new Set([card.id]) : new Set())
  table.run('A', ...intents)
  const seen = (v: Snapshot) => v.components.find((c) => c.id === card.id)
  return { intents, card, ada: seen(table.view('A')), bo: seen(table.view('B')), raw: table.state().components[card.id]! }
}

describe('a card turned over in the hand (#1133)', () => {
  it('lies face down in a public pile, and nobody is told which card it is', () => {
    for (const face of ['front', 'back'] as const) {
      const { raw, ada, bo } = playOne('discard', face, true)
      expect(raw.zone).toBe('discard')
      expect(raw.face).toBe('back')
      expect(bo?.cardRef ?? null, 'Bo is not told').toBeNull()
      expect(ada?.cardRef ?? null, 'and nor is Ada, away from her own area (B6)').toBeNull()
    }
  })

  it('lies face down in front of her, where she alone still knows it (#483)', () => {
    const { raw, ada, bo } = playOne('mine:A', 'front', true)
    expect(raw.zone).toBe('mine:A')
    expect(raw.face).toBe('back')
    expect(ada?.cardRef, 'Ada knows her own card').toBe('kort-1')
    expect(bo?.cardRef ?? null, 'Bo does not').toBeNull()
  })

  it('turns face down while it is still in the hand, so the card is never face up in a public zone', () => {
    const { intents, card } = playOne('discard', 'front', true)
    expect(intents[0]).toEqual({ v: 'flip', component: card.id, face: 'back' })
    expect(intents.some((i) => i.v === 'flip' && i.face === 'front')).toBe(false)
  })

  it('sends no flip at all when the card already lies face down', () => {
    const { intents, card } = playOne('discard', 'back', true)
    expect(intents).toEqual([{ v: 'move', component: card.id, to: 'discard' }])
  })

  it('leaves a card that was not turned to K11: face up in a public zone', () => {
    const { raw, bo } = playOne('discard', 'back', false)
    expect(raw.face).toBe('front')
    expect(bo?.cardRef).toBe('kort-1')
  })

  it('goes into a hidden pile face down, as any card does', () => {
    const { raw } = playOne('draw', 'front', true)
    expect(raw.zone).toBe('draw')
    expect(raw.face).toBe('back')
  })
})
