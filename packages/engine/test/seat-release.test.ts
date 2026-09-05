import { describe, expect, it } from 'vitest'
import { Harness, inZone, zoneView } from './fixture.js'

describe('seat.release', () => {
  it('shuffles the hand back into its pile and frees the seat', () => {
    const h = new Harness(5)
    h.do(null, { v: 'seat.claim', seat: 'A', name: 'Ada' })
    h.do(null, { v: 'seat.claim', seat: 'B', name: 'Bo' })
    h.do('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 3 })
    h.do('B', { v: 'draw', from: 'draw', to: 'hand:B', count: 2 })
    const bHand = [...h.zone('hand:B')]

    const applied = h.do('A', { v: 'seat.release', seat: 'A' })

    expect(applied.outcome?.kind).toBe('shuffle')
    expect(h.state.seats['A']!.name).toBeNull()
    expect(h.zone('hand:A')).toEqual([])
    expect(h.zone('draw')).toHaveLength(8)
    expect(h.zone('draw').every((id) => id.startsWith('r'))).toBe(true)
    expect(h.zone('hand:B')).toEqual(bHand)
    expect(inZone(h.view('B'), 'hand:B').every((c) => c.cardRef !== null)).toBe(true)
    expect(zoneView(h.view(null), 'draw')).toMatchObject({ count: 8 })
  })

  it('does not shuffle the pile when the released hand is empty', () => {
    const h = new Harness()
    h.do(null, { v: 'seat.claim', seat: 'A', name: 'Ada' })
    const before = [...h.zone('draw')]
    const applied = h.do('A', { v: 'seat.release', seat: 'A' })
    expect(applied.outcome).toBeUndefined()
    expect(h.zone('draw')).toEqual(before)
  })
})
