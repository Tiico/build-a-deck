import { describe, expect, it } from 'vitest'
import { DICE, PIECES, STANDARD_TYPES, TOKEN_COUNTER, TypeRegistry, isMaterial, project, replay, type ComponentTypeDef } from '../src/index.js'
import { CARD, Harness, registry, twoSeatSetup } from './fixture.js'

// The wooden pieces (#1471, #1470): a meeple, a cube and a disc, each a type of its own in one family
// as the dice are (beställarens beslut 3, 2026-10-28). Nothing is printed on them, and each has one
// face — except the meeple, which may be laid down: `flip` between standing and lying (beslut 4).
const ref = (def: ComponentTypeDef) => ({ id: def.id, version: def.version })
const piece = (id: string) => PIECES.find((p) => p.id === id)!

function withPieces() {
  const setup = twoSeatSetup()
  PIECES.forEach((p, i) => setup.components.push({ type: ref(p), cardRef: 'A', zone: 'table', face: p.contentFace, x: i * 30, y: 0 }))
  return setup
}
const idOf = (h: Harness, type: string) => Object.values(h.state.components).find((c) => c.type.id === type)!.id

describe('the wooden pieces (#1471)', () => {
  it('are standard types: a meeple, a cube and a disc', () => {
    expect(PIECES.map((p) => p.id)).toEqual(['piece.meeple', 'piece.cube', 'piece.disc'])
    for (const p of PIECES) expect(STANDARD_TYPES).toContain(p)
    expect(piece('piece.meeple').physical.shape).toBe('figure')
  })

  it('refuses to stack, shuffle or roll any of them, with the type in the reason', () => {
    const h = new Harness(1, withPieces())
    h.do(null, { v: 'draw', from: 'draw', to: 'table', count: 1 })
    for (const p of PIECES) {
      const id = idOf(h, p.id)
      expect(h.try('A', { v: 'stack', component: id, onto: h.top('table') })).toEqual({ ok: false, reason: expect.stringContaining(p.id) })
      expect(h.try('A', { v: 'roll', component: id })).toEqual({ ok: false, reason: expect.stringContaining(p.id) })
    }
    h.do('A', { v: 'move', component: idOf(h, 'piece.meeple'), to: 'discard', index: 0 })
    expect(h.try('A', { v: 'shuffle', pile: 'discard' })).toEqual({ ok: false, reason: expect.stringContaining('piece.meeple') })
  })

  it('refuses to flip a cube or a disc, which have one face', () => {
    const h = new Harness(1, withPieces())
    for (const id of ['piece.cube', 'piece.disc']) {
      expect(h.try('A', { v: 'flip', component: idOf(h, id), face: 'back' })).toEqual({ ok: false, reason: expect.stringContaining(id) })
    }
  })

  it('lays a meeple down with flip and stands it up again, and lying it is the same meeple to everyone', () => {
    const h = new Harness(1, withPieces())
    const meeple = idOf(h, 'piece.meeple')
    h.do('B', { v: 'flip', component: meeple, face: 'lying' })
    for (const seat of ['A', 'B', null]) {
      const seen = h.view(seat).components.find((c) => c.id === meeple)!
      expect(seen).toMatchObject({ face: 'lying', cardRef: 'A' })
    }
    h.do('A', { v: 'flip', component: meeple, face: 'standing' })
    expect(replay(h.initial, registry, h.log).components[meeple]!.face).toBe('standing')
  })

  // A meeple's `cardRef` is its seat (L11), and a row of the deck may share the word: the piece is
  // still no card, and is never called by the row's title or drawn with its faces.
  it('is never named or drawn as a card whose row shares its seat', () => {
    const h = new Harness(1, withPieces())
    const meeple = idOf(h, 'piece.meeple')
    const deck = { titles: { A: 'Ess' }, texts: { A: ['Ett ess'] }, faces: { A: { front: 'f', back: 'b' } } }
    const seen = project(h.state, registry, 'A', deck).components.find((c) => c.id === meeple)!
    expect(seen.cardRef).toBe('A')
    expect(seen).not.toHaveProperty('title')
    expect(seen).not.toHaveProperty('text')
    expect(seen).not.toHaveProperty('faces')
  })

  it('moves a piece across the table', () => {
    const h = new Harness(1, withPieces())
    for (const p of PIECES) expect(h.try('A', { v: 'move', component: idOf(h, p.id), to: 'table', x: 300, y: 40 }).ok).toBe(true)
  })
})

// K32, declared in the type (#1471): whether a type may be held is what it says of itself, and not
// a guess from whether it rolls or counts.
describe('a type that is never held (#1471, K32)', () => {
  it('is what the type declares: the counter, the dice and the pieces, and never the card', () => {
    for (const def of [TOKEN_COUNTER, ...DICE, ...PIECES]) expect(def.behaviours.holdable, def.id).toBe(false)
    expect(isMaterial(registry.get(CARD))).toBe(false)
    for (const def of [TOKEN_COUNTER, ...DICE, ...PIECES]) expect(isMaterial(def), def.id).toBe(true)
  })

  it('is read off the declaration: a rolling type that declares nothing is held, a still one that declares it is not', () => {
    const d6 = DICE.find((d) => d.id === 'die.d6')!
    const { holdable: _gone, ...behaviours } = d6.behaviours
    const looseDie: ComponentTypeDef = { ...d6, id: 'die.loose', behaviours }
    const stone: ComponentTypeDef = { ...piece('piece.cube'), id: 'piece.stone' }
    const reg = new TypeRegistry([...STANDARD_TYPES, looseDie, stone])
    expect(isMaterial(reg.get(ref(looseDie)))).toBe(false)
    expect(isMaterial(reg.get(ref(stone)))).toBe(true)
  })

  it('refuses a meeple in a hand by move, draw, deal, split and version.change', () => {
    const h = new Harness(1, withPieces())
    const meeple = idOf(h, 'piece.meeple')
    expect(h.try('A', { v: 'move', component: meeple, to: 'hand:A' })).toEqual({ ok: false, reason: 'piece.meeple cannot be held in a hand' })
    h.do('A', { v: 'move', component: meeple, to: 'draw', index: 0 })
    expect(h.try('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 }).ok).toBe(false)
    expect(h.try('A', { v: 'deal', from: 'draw', to: ['hand:A', 'hand:B'], each: 1 }).ok).toBe(false)
    expect(h.try('A', { v: 'split', pile: 'draw', at: 1, to: 'hand:A' }).ok).toBe(false)
    const m = piece('piece.meeple')
    expect(h.try(null, { v: 'version.change', to: 'v2', components: [{ type: ref(m), cardRef: 'A', zone: 'hand:A', face: 'standing', x: 0, y: 0 }] }).ok).toBe(false)
    // A card is held as before.
    h.do('A', { v: 'move', component: meeple, to: 'table', x: 0, y: 0 })
    expect(h.try('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 }).ok).toBe(true)
  })
})
