import { describe, expect, it } from 'vitest'
import { applyRecipe, emptySetup, recipeOf, type Recipe } from '@byd/server/doc'

const base: Recipe = { players: 3, mine: true, discard: true, market: false, counters: [{ name: 'Poäng', start: 0 }] }

describe('the recipe (B5): what the wizard laid out, as knobs the editor turns afterwards', () => {
  it('lays out seats, hands, areas in front, counters and the shared piles from an empty setup, and reads itself back', () => {
    const setup = applyRecipe(emptySetup(), base)
    expect(setup.seats).toEqual(['A', 'B', 'C'])
    expect(setup.floor).toBe('table')
    expect(setup.deckZone).toBe('draw')
    expect(setup.zones.map((z) => z.id)).toEqual(['table', 'draw', 'discard', 'mine:A', 'mine:B', 'mine:C', 'counters:A', 'counters:B', 'counters:C', 'hand:A', 'hand:B', 'hand:C'])
    expect(setup.zones.find((z) => z.id === 'hand:C')).toMatchObject({ kind: 'hand', owner: 'C', visibility: 'owner', returnTo: 'draw', geometry: { x: 540, y: -250, w: 60, h: 500 } })
    expect(setup.zones.find((z) => z.id === 'mine:A')).toMatchObject({ kind: 'area', owner: 'A', visibility: 'owner', shortcut: { label: 'Framför mig', at: 'top' } })
    expect(setup.zones.find((z) => z.id === 'counters:B')).toMatchObject({ kind: 'area', owner: 'B', visibility: 'all' })
    expect(setup.zones.find((z) => z.id === 'discard')?.shortcut).toEqual({ label: 'Kasta', at: 'top' })
    expect(setup.counters).toEqual([{ name: 'Poäng', start: 0 }])
    expect(recipeOf(setup)).toEqual(base)
  })

  it('changes the player count by laying the seats out again, and leaves free zones and renamed zones alone', () => {
    const three = applyRecipe(emptySetup(), base)
    const edited = {
      ...three,
      zones: three.zones.map((z) => (z.id === 'discard' ? { ...z, name: 'Påsen', shortcut: { label: 'I påsen', at: 'bottom' as const } } : z)).concat({ id: 'altar', kind: 'area', name: 'Altaret', visibility: 'all', geometry: { x: 0, y: 100, w: 200, h: 120, rot: 0 } }),
    }
    const two = applyRecipe(edited, { ...base, players: 2 })
    expect(two.seats).toEqual(['A', 'B'])
    expect(two.zones.some((z) => z.owner === 'C')).toBe(false)
    // Two players face each other: B moves from the north edge of a three-seat table to the same edge, A stays south.
    expect(two.zones.find((z) => z.id === 'hand:B')?.geometry).toEqual({ x: -250, y: -400, w: 500, h: 60, rot: 0 })
    expect(two.zones.find((z) => z.id === 'discard')).toMatchObject({ name: 'Påsen', shortcut: { label: 'I påsen', at: 'bottom' } })
    expect(two.zones.find((z) => z.id === 'altar')).toMatchObject({ name: 'Altaret', geometry: { x: 0, y: 100, w: 200, h: 120 } })
    expect(recipeOf(two)).toEqual({ ...base, players: 2 })
    // Four players: the fourth seat goes west.
    const four = applyRecipe(two, { ...base, players: 4 })
    expect(four.zones.find((z) => z.id === 'hand:D')?.geometry).toEqual({ x: -600, y: -250, w: 60, h: 500, rot: 0 })
    expect(four.zones.find((z) => z.id === 'mine:D')).toMatchObject({ owner: 'D' })
  })

  it('adds and removes the shared market, the discard pile, the areas in front, and the counters zones without moving anything else', () => {
    const three = applyRecipe(emptySetup(), base)
    const moved = { ...three, zones: three.zones.map((z) => (z.id === 'mine:A' ? { ...z, geometry: { ...z.geometry, x: -100 } } : z)) }
    const withMarket = applyRecipe(moved, { ...base, market: true })
    expect(withMarket.zones.find((z) => z.id === 'market')).toMatchObject({ kind: 'area', name: 'Marknad', visibility: 'all', shortcut: { label: 'Till marknaden', at: 'top' } })
    expect(withMarket.zones.find((z) => z.id === 'mine:A')?.geometry.x).toBe(-100)
    expect(recipeOf(withMarket).market).toBe(true)
    const bare = applyRecipe(withMarket, { ...base, market: false, discard: false, mine: false, counters: [] })
    expect(bare.zones.map((z) => z.id)).toEqual(['table', 'draw', 'hand:A', 'hand:B', 'hand:C'])
    expect(bare.counters).toEqual([])
    expect(recipeOf(bare)).toEqual({ ...base, market: false, discard: false, mine: false, counters: [] })
    // Counters come back with their zones.
    const counted = applyRecipe(bare, { ...base, discard: false, mine: false, counters: [{ name: 'Liv', start: 20 }] })
    expect(counted.zones.filter((z) => z.id.startsWith('counters:'))).toHaveLength(3)
    expect(counted.counters).toEqual([{ name: 'Liv', start: 20 }])
  })
})
