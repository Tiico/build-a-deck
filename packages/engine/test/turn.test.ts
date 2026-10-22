import { describe, expect, it } from 'vitest'
import type { Snapshot } from '@byd/protocol'
import { Harness, CARD, CARDS, registry, twoSeatSetup } from './fixture.js'
import { applyPatch, diff, initialState, nextTurn, replay, validateSetup, type SetupDef } from '../src/index.js'

// Vems tur det är (K28, #1141): en markör som skickas vidare med `turn.give` och som aldrig
// hindrar någon (B5). Spelet säger om det går i tur och åt vilket håll; bordet håller reda på vem
// som har turen, och turordningen följer av var platserna sitter.

const rect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h, rot: 0 })

// Fyra platser vars ordning i uppställningen inte är ordningen runt bordet: A sitter nederst, B
// överst, C till vänster och D till höger. Medurs från A är alltså A, C, B, D.
function fourSeats(turns?: SetupDef['turns']): SetupDef {
  return {
    seats: ['A', 'B', 'C', 'D'],
    floor: 'table',
    ...(turns ? { turns } : {}),
    zones: [
      { id: 'draw', kind: 'pile', name: 'Draghög', visibility: 'none', geometry: { x: 0, y: 0, w: 0, h: 0, rot: 0 } },
      { id: 'table', kind: 'area', name: 'Spelyta', visibility: 'all', geometry: rect(-500, -500, 1000, 1000) },
      { id: 'hand:A', kind: 'hand', name: 'Hand', visibility: 'owner', owner: 'A', returnTo: 'draw', geometry: rect(-100, 400, 200, 80) },
      { id: 'hand:B', kind: 'hand', name: 'Hand', visibility: 'owner', owner: 'B', returnTo: 'draw', geometry: rect(-100, -480, 200, 80) },
      { id: 'hand:C', kind: 'hand', name: 'Hand', visibility: 'owner', owner: 'C', returnTo: 'draw', geometry: rect(-480, -100, 80, 200) },
      { id: 'hand:D', kind: 'hand', name: 'Hand', visibility: 'owner', owner: 'D', returnTo: 'draw', geometry: rect(400, -100, 80, 200) },
    ],
    components: CARDS.map((cardRef) => ({ type: CARD, cardRef, zone: 'draw', face: 'back' })),
  }
}

function seated(turns: SetupDef['turns'] = 'clockwise', ...seats: string[]): Harness {
  const h = new Harness(1, fourSeats(turns))
  for (const seat of seats) h.do(seat, { v: 'seat.claim', seat, name: `Spelare ${seat}` })
  return h
}

describe('ett spel utan turordning', () => {
  it('har ingen tur i projektionen, och verbet avvisas', () => {
    const h = new Harness()
    h.do('A', { v: 'seat.claim', seat: 'A', name: 'Ada' })
    expect(h.view('A').turn).toBeNull()
    const d = h.try('A', { v: 'turn.give', seat: 'A' })
    expect(d.ok).toBe(false)
  })
})

describe('turordningen', () => {
  it('går medurs runt bordet från uppställningens första plats, inte i uppställningens ordning', () => {
    expect(seated('clockwise').view(null).turn?.order).toEqual(['A', 'C', 'B', 'D'])
  })

  it('går åt andra hållet moturs', () => {
    expect(seated('counterclockwise').view(null).turn?.order).toEqual(['A', 'D', 'B', 'C'])
  })

  it('går längs kanten åt samma håll när två platser delar den', () => {
    const setup = fourSeats('clockwise')
    // B flyttar ned till A:s kant, till höger om A. Medurs längs nederkanten är från höger till
    // vänster, så B kommer före A: varvet är …, D, B, A, C, …
    setup.zones = setup.zones.map((z) => (z.id === 'hand:B' ? { ...z, geometry: rect(200, 400, 200, 80) } : z))
    const h = new Harness(1, setup)
    expect(h.view(null).turn?.order).toEqual(['A', 'C', 'D', 'B'])
  })
})

describe('vem som har turen', () => {
  it('är ingen på ett nytt bord, och den som sätter sig först tar den', () => {
    const h = seated()
    expect(h.view(null).turn).toMatchObject({ seat: null, at: null })
    const line = h.do('C', { v: 'seat.claim', seat: 'C', name: 'Cy' })
    expect(h.view(null).turn).toMatchObject({ seat: 'C', at: line.at })
    h.do('A', { v: 'seat.claim', seat: 'A', name: 'Ada' })
    expect(h.view(null).turn?.seat).toBe('C')
  })

  it('går dit `turn.give` säger, av vem som helst vid bordet, också bordets egen skärm', () => {
    const h = seated('clockwise', 'A', 'B', 'C')
    h.do('A', { v: 'turn.give', seat: 'C' })
    expect(h.view('B').turn?.seat).toBe('C')
    h.do(null, { v: 'turn.give', seat: 'B' })
    expect(h.view('A').turn?.seat).toBe('B')
  })

  it('går inte till en ledig plats eller en plats som inte finns', () => {
    const h = seated('clockwise', 'A', 'B')
    expect(h.try('A', { v: 'turn.give', seat: 'D' }).ok).toBe(false)
    expect(h.try('A', { v: 'turn.give', seat: 'Z' }).ok).toBe(false)
  })

  it('går till nästa upptagna plats när den som har turen lämnar bordet, och till ingen när bordet är tomt', () => {
    const h = seated('clockwise', 'A', 'B', 'D')
    h.do('A', { v: 'turn.give', seat: 'D' })
    h.do('D', { v: 'seat.release', seat: 'D' })
    expect(h.view(null).turn?.seat).toBe('A')
    h.do('B', { v: 'seat.release', seat: 'B' })
    expect(h.view(null).turn?.seat).toBe('A')
    h.do('A', { v: 'seat.release', seat: 'A' })
    expect(h.view(null).turn?.seat).toBeNull()
  })
})

describe('nästa plats', () => {
  it('är den första upptagna platsen efter turen, varvet runt', () => {
    const h = seated('clockwise', 'A', 'B', 'D')
    // Medurs är A, C, B, D, och C är ledig.
    expect(nextTurn(h.view(null))).toBe('B')
    h.do('A', { v: 'turn.give', seat: 'D' })
    expect(nextTurn(h.view(null))).toBe('A')
  })

  it('finns inte i ett spel utan turordning eller när ingen har turen', () => {
    expect(nextTurn(new Harness().view(null))).toBeNull()
    expect(nextTurn(seated().view(null))).toBeNull()
  })
})

describe('turen hör till sessionen och inte till handen', () => {
  it('är inget drag: bordet räknas inte som påbörjat', () => {
    const h = seated('clockwise', 'A', 'B')
    h.do('A', { v: 'turn.give', seat: 'B' })
    expect(h.view(null).played).toBe(false)
  })

  it('gör inte ett eget drag omstritt, och ångra lämnar turen där den står', () => {
    const h = seated('clockwise', 'A', 'B')
    h.do('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    h.do('A', { v: 'turn.give', seat: 'B' })
    expect(h.view('A').undo).toMatchObject({ contested: false })
    h.do('A', { v: 'undo.self' })
    expect(h.view(null).turn?.seat).toBe('B')
  })
})

describe('turen i loggen och på tråden', () => {
  it('spelas upp till samma tur och samma klocka', () => {
    const h = seated('clockwise', 'A', 'B')
    h.do('B', { v: 'turn.give', seat: 'B' })
    const again = replay(initialState('v1', fourSeats('clockwise'), registry), registry, h.log)
    expect(again.turn).toEqual(h.state.turn)
  })

  it('når en vy som får den i en patch', () => {
    const h = seated('clockwise', 'A', 'B')
    const before: Snapshot = h.view('B')
    h.do('A', { v: 'turn.give', seat: 'B' })
    const patch = diff(before, h.view('B'))
    expect(patch.ops).toContainEqual({ op: 'turn', turn: h.view('B').turn })
    expect(applyPatch(before, patch)).toEqual(h.view('B'))
  })

  it('är densamma för varje vy, för turen är ingen hemlighet', () => {
    const h = seated('clockwise', 'A', 'B')
    expect(h.view('A').turn).toEqual(h.view(null).turn)
    expect(h.view('B').turn).toEqual(h.view(null).turn)
  })

  it('avvisar en uppställning med en turordning som inte finns', () => {
    expect(() => validateSetup({ ...fourSeats(), turns: 'sideways' as never }, registry)).toThrow(/sideways/)
  })

  it('saknas för en uppställning skriven före turordningen fanns', () => {
    expect(initialState('v1', twoSeatSetup(), registry).turn).toBeNull()
  })
})
