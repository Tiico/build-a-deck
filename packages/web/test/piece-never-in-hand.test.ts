import { describe, expect, it } from 'vitest'
import { CARD_STANDARD_63x88, DICE, TOKEN_COUNTER, type SetupDef } from '@byd/engine'
import { openingSetup } from '@byd/server/doc'
import type { Snapshot } from '@byd/protocol'
import { absoluteOf, dropIntents, type Drag } from '../src/table/drop.js'
import { handExtent, handRotation } from '../src/table/hand.js'
import { placesFor } from '../src/table/keyboard.js'
import { tableOf } from './scene.js'

// Material is never held (#1377, K32): a die or a counter let go over a hand lies on the felt under
// it, and the keyboard's «Flytta till» offers it no hand. A die that went into a hand was drawn by no
// screen and could not be taken out again.

function seated(kind: 'die' | 'counter') {
  const setup = openingSetup({ players: 2, counters: [] })
  const d6 = DICE.find((d) => d.id === 'die.d6')
  if (!d6) throw new Error('ingen d6')
  const def: SetupDef = {
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
    })),
    components: [
      ...Array.from({ length: 3 }, (_, i) => ({ type: { id: CARD_STANDARD_63x88.id, version: 1 }, cardRef: `kort-${i + 1}`, zone: 'hand:B', face: 'back' as const })),
      kind === 'die'
        ? { type: { id: d6.id, version: d6.version }, cardRef: 'd6', zone: 'table', face: 'front', counter: 1, x: 0, y: 0 }
        : { type: { id: TOKEN_COUNTER.id, version: TOKEN_COUNTER.version }, cardRef: 'Liv', zone: 'table', face: 'front', counter: 20, x: 0, y: 0 },
    ],
  }
  const table = tableOf(def)
  table.run(null, { v: 'seat.claim', seat: 'A', name: 'Nina' })
  table.run(null, { v: 'seat.claim', seat: 'B', name: 'Ola' })
  return table
}

const pieceOf = (view: Snapshot) => {
  const c = view.components.find((x) => x.zone === 'table')
  if (!c) throw new Error('ingen bit på filten')
  return c
}

describe.each(['die', 'counter'] as const)('a %s and a hand (#1377)', (kind) => {
  it('let go over a hand’s fan, it lies on the felt under the fan', () => {
    const table = seated(kind)
    const view = table.view('A')
    const piece = pieceOf(view)
    const hand = view.zones.find((z) => z.id === 'hand:B')!
    const floor = view.zones.find((z) => z.id === view.floor)!
    const fan = handExtent(hand, floor, handRotation(hand, floor, 'table'))
    if (!fan) throw new Error('handen ritar ingen solfjäder')
    const at = { x: fan.x + fan.w / 2, y: fan.y + fan.h / 2 }
    const grab = absoluteOf(view, piece)
    const target = kind === 'die' ? { kind: 'die' as const, id: piece.id } : { kind: 'counter' as const, id: piece.id }
    const drag: Drag = { target, ids: [], origin: { [piece.id]: grab }, grab, at }
    const intents = dropIntents(view, drag, 'table')
    expect(intents).toHaveLength(1)
    expect(intents[0]).toMatchObject({ v: 'move', component: piece.id })
    expect(view.zones.find((z) => 'to' in intents[0]! && z.id === intents[0].to)?.kind).not.toBe('hand')
    table.run('A', ...intents)
    expect(table.view('A').components.find((c) => c.id === piece.id)?.zone).not.toMatch(/^hand:/)
  })

  it('is offered no hand to be moved to', () => {
    const view = seated(kind).view('A')
    const piece = pieceOf(view)
    const places = placesFor(view, new Set([piece.id]), piece.zone)
    expect(places.length).toBeGreaterThan(0)
    expect(places.filter((p) => p.kind === 'hand')).toEqual([])
  })
})
