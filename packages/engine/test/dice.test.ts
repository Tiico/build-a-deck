import { describe, expect, it } from 'vitest'
import { DICE, activityOf, replay } from '../src/index.js'
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
