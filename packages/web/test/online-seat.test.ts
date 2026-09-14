import { describe, expect, it } from 'vitest'
import type { Snapshot } from '@byd/protocol'
import { seatRotation, seatTurn } from '../src/online/seat.js'

// The two rules that meet at the seat's own window (C5, C8, #76, #77): which edge is yours, and
// which way round the window wants the table. They agree on a phone and contradict each other in
// every landscape window, so the composition is a function with a name and is asked as one here,
// not only read off a screen.

const rect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h, rot: 0 })

// A landscape table with a hand at each of the four edges, which is what the wizard lays out.
const view = (): Snapshot =>
  ({
    floor: 'table',
    zones: [
      { id: 'table', kind: 'area', name: 'Spelyta', geometry: rect(-600, -400, 1200, 800) },
      { id: 'hand:S', kind: 'hand', name: 'Hand', owner: 'S', geometry: rect(-300, 320, 600, 100) },
      { id: 'hand:N', kind: 'hand', name: 'Hand', owner: 'N', geometry: rect(-300, -420, 600, 100) },
      { id: 'hand:W', kind: 'hand', name: 'Hand', owner: 'W', geometry: rect(-700, -150, 100, 300) },
      { id: 'hand:E', kind: 'hand', name: 'Hand', owner: 'E', geometry: rect(600, -150, 100, 300) },
    ],
    components: [],
    seats: [],
  }) as unknown as Snapshot

const PHONE = { w: 390, h: 844 }
const DESK = { w: 1280, h: 800 }

describe('seatRotation — which edge is yours (C5)', () => {
  it('puts each seat’s own edge at the bottom', () => {
    const v = view()
    expect([seatRotation(v, 'S'), seatRotation(v, 'N'), seatRotation(v, 'W'), seatRotation(v, 'E')]).toEqual([0, 180, 270, 90])
  })
})

describe('seatTurn — the seat’s edge and the window’s shape, composed (C5, C8, #77)', () => {
  it('keeps a side seat’s quarter turn where the window asks for one anyway', () => {
    const v = view()
    expect([seatTurn(v, 'W', PHONE), seatTurn(v, 'E', PHONE)]).toEqual([270, 90])
  })

  it('drops a side seat’s quarter turn in a landscape window, where it would starve the felt', () => {
    const v = view()
    expect([seatTurn(v, 'W', DESK), seatTurn(v, 'E', DESK)]).toEqual([0, 0])
  })

  it('leaves the half turns alone, since they do not change the table’s shape', () => {
    const v = view()
    for (const room of [PHONE, DESK]) expect([seatTurn(v, 'S', room), seatTurn(v, 'N', room)]).toEqual([0, 180])
  })

  it('reads the two shapes and not the window’s name: a portrait table turns for a desk', () => {
    const tall = view()
    tall.zones = tall.zones.map((z) => (z.id === 'table' ? { ...z, geometry: rect(-400, -600, 800, 1200) } : z))
    expect(seatTurn(tall, 'E', DESK)).toBe(90)
    expect(seatTurn(tall, 'E', PHONE)).toBe(0)
  })

  it('falls back on the seat’s own answer when there is no window to ask', () => {
    const v = view()
    expect(seatTurn(v, 'E', { w: 0, h: 0 })).toBe(90)
  })
})
