import { describe, expect, it } from 'vitest'
import { Harness } from './fixture.js'

// Att lägga ut kort uppvända är en rörelse och inte två (K15:s skäl, tillämpat på antal i
// stället för på adressen): en klient kan inte säga "vänd det där kortet" om kortet ligger i en
// dold hög, eftersom id:t aldrig lämnar servern (B6). Därför säger verbet självt vilken sida
// korten ska ligga på när de landar, och motorn vänder dem när raden appliceras.
const faces = (h: Harness, zone: string): string[] => h.zone(zone).map((id) => h.state.components[id]!.face)

describe('att dela ut kort med en bestämd sida (K15)', () => {
  it('drar korten uppvända ur en dold hög, utan att klienten har sett ett enda id', () => {
    const h = new Harness()
    h.do(null, { v: 'draw', from: 'draw', to: 'table', count: 2, face: 'front' })
    expect(faces(h, 'table')).toEqual(['front', 'front'])
  })

  it('delar ut till varje hand nedvända, och lämnar korten som de låg när ingen sida sägs', () => {
    const h = new Harness()
    h.do(null, { v: 'deal', from: 'draw', to: ['hand:A', 'hand:B'], each: 1, face: 'front' })
    expect(faces(h, 'hand:A')).toEqual(['front'])
    expect(faces(h, 'hand:B')).toEqual(['front'])

    h.do(null, { v: 'deal', from: 'draw', to: ['hand:A'], each: 1 })
    expect(faces(h, 'hand:A')).toEqual(['back', 'front'])
  })

  it('lägger den avdelade högen uppvänd bredvid, och delningen är fortfarande en enda rad i loggen', () => {
    const h = new Harness()
    const line = h.do(null, { v: 'split', pile: 'draw', at: 3, x: 40, y: 0, face: 'front' })
    const [pile] = h.piles()
    expect(faces(h, pile!)).toEqual(['front', 'front', 'front'])
    expect(h.log.filter((l) => l.seq === line.seq)).toHaveLength(1)
  })
})

// Samma grind som `flip` redan har: en sida typen inte har finns inte att lägga korten på.
describe('en sida som inte finns', () => {
  it('avvisas innan något flyttas, precis som för flip', () => {
    const h = new Harness()
    expect(() => h.do(null, { v: 'draw', from: 'draw', to: 'table', count: 1, face: 'edge' })).toThrow(/edge/)
    expect(h.zone('draw')).toHaveLength(10)
  })
})
