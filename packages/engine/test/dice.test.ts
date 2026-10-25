import { describe, expect, it } from 'vitest'
import { DICE, TOKEN_COUNTER, activityOf, replay } from '../src/index.js'
import { Harness, registry, twoSeatSetup } from './fixture.js'

// A die is a component type of its own (B1, #1136): one per number of sides, d4 to d20, each
// `rollable` with its faces. The roll is decided on the server and written as a result (D4).
function withDice(...faces: number[]) {
  const setup = twoSeatSetup()
  for (const [i, n] of faces.entries()) {
    const type = DICE.find((d) => d.behaviours.rollable !== false && d.behaviours.rollable.faces === n)!
    setup.components.push({ type: { id: type.id, version: type.version }, cardRef: `d${n}-${i}`, zone: 'table', face: 'front', x: i * 30, y: 0, counter: 1 })
  }
  return setup
}

describe('dice (#1136)', () => {
  it('has a die for every polyhedron a table uses, each rolling its own number of sides', () => {
    expect(DICE.map((d) => [d.id, d.behaviours.rollable])).toEqual([
      ['die.d4', { faces: 4 }],
      ['die.d6', { faces: 6 }],
      ['die.d8', { faces: 8 }],
      ['die.d10', { faces: 10 }],
      ['die.d12', { faces: 12 }],
      ['die.d20', { faces: 20 }],
    ])
  })

  it('rolls a d6 to a side it has, and replays the log to the same values', () => {
    const h = new Harness(7, withDice(6))
    const die = Object.values(h.state.components).find((c) => c.type.id === 'die.d6')!
    const values = Array.from({ length: 40 }, () => {
      const line = h.do('A', { v: 'roll', component: die.id })
      return line.outcome?.kind === 'roll' ? line.outcome.value : NaN
    })
    expect(values.every((v) => v >= 1 && v <= 6)).toBe(true)
    expect(new Set(values).size).toBe(6)
    expect(h.state.components[die.id]!.counter).toBe(values.at(-1))
    expect(replay(h.initial, registry, h.log).components[die.id]!.counter).toBe(values.at(-1))
  })

  it('rolls several dice in one envelope, and the activity carries each value', () => {
    const h = new Harness(2, withDice(6, 6))
    const dice = Object.values(h.state.components).filter((c) => c.type.id === 'die.d6').map((c) => c.id)
    const lines = h.batch('A', ...dice.map((component) => ({ v: 'roll' as const, component })))
    expect(new Set(lines.map((l) => l.batch)).size).toBe(1)
    const told = activityOf(h.log)
    expect(told.map((l) => l.rolled)).toEqual(lines.map((l) => (l.outcome?.kind === 'roll' ? l.outcome.value : undefined)))
    // A shuffle's outcome stays out of every view; only a roll's value is told.
    expect(told[0]).not.toHaveProperty('outcome')
  })

  it('refuses to roll a card', () => {
    const h = new Harness(1, withDice(6))
    const card = h.zone('draw')[0]!
    h.do(null, { v: 'draw', from: 'draw', to: 'table', count: 1 })
    expect(h.try('A', { v: 'roll', component: h.top('table') }).ok).toBe(false)
    expect(card).toBeTruthy()
  })
})

// Material is never held (#1377, K32): a die or a counter lies on the table. Put in a hand, it was
// drawn by no screen — the phone draws a hand as a row of cards — and nobody could take it out.
describe('material in a hand (#1377)', () => {
  const pieces = () => {
    const setup = withDice(6)
    setup.components.push({ type: { id: TOKEN_COUNTER.id, version: TOKEN_COUNTER.version }, cardRef: 'counter-0', zone: 'table', face: 'front', x: 90, y: 0, counter: 3 })
    return setup
  }
  const idOf = (h: Harness, type: string) => Object.values(h.state.components).find((c) => c.type.id === type)!.id

  it('refuses to move a die or a counter into a hand, and still moves either across the table', () => {
    const h = new Harness(1, pieces())
    for (const type of ['die.d6', TOKEN_COUNTER.id]) {
      const id = idOf(h, type)
      const refused = h.try('A', { v: 'move', component: id, to: 'hand:A' })
      expect(refused).toEqual({ ok: false, reason: expect.stringMatching(/cannot be held in a hand/) })
      expect(h.try('A', { v: 'move', component: id, to: 'table', x: 200, y: 10 }).ok).toBe(true)
    }
  })

  it('refuses to draw, deal or split a die out of a pile into a hand', () => {
    const h = new Harness(1, pieces())
    h.do('A', { v: 'move', component: idOf(h, 'die.d6'), to: 'draw', index: 0 })
    expect(h.try('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 }).ok).toBe(false)
    expect(h.try('A', { v: 'deal', from: 'draw', to: ['hand:A', 'hand:B'], each: 1 }).ok).toBe(false)
    expect(h.try('A', { v: 'split', pile: 'draw', at: 1, to: 'hand:A' }).ok).toBe(false)
    // A card is held as before.
    h.do('A', { v: 'move', component: idOf(h, 'die.d6'), to: 'table', x: 0, y: 0 })
    expect(h.try('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 }).ok).toBe(true)
  })

  it('refuses a version that lays a die in a hand', () => {
    const h = new Harness(1, pieces())
    const d6 = DICE.find((d) => d.id === 'die.d6')!
    const refused = h.try(null, { v: 'version.change', to: 'v2', components: [{ type: { id: d6.id, version: d6.version }, cardRef: 'd6-1', zone: 'hand:A', face: 'front', x: 0, y: 0 }] })
    expect(refused.ok).toBe(false)
  })
})
