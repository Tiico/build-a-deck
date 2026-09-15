import { describe, expect, it } from 'vitest'
import { applyRecipe, openingSetup, recipeOf, type Recipe } from '@byd/server/doc'

const base: Recipe = { players: 3, counters: [{ name: 'Poäng', start: 0 }] }

describe('the opening table (B5): what the wizard lays out before the designer touches anything', () => {
  it('seats them around a felt with hands, areas in front, counters and the two piles', () => {
    const setup = openingSetup(base)
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
})

describe('the seats knob (B5, reviderat): the one thing the recipe still turns', () => {
  it('changes the player count by laying the seats out again, and leaves every other zone alone', () => {
    const three = openingSetup(base)
    const edited = {
      ...three,
      zones: three.zones.map((z) => (z.id === 'discard' ? { ...z, name: 'Påsen', shortcut: { label: 'I påsen', at: 'bottom' as const } } : z)).concat({ id: 'altar', kind: 'area', name: 'Altaret', visibility: 'all', geometry: { x: 0, y: 100, w: 200, h: 120, rot: 0 } }),
    }
    const two = applyRecipe(edited, { ...base, players: 2 })
    expect(two.seats).toEqual(['A', 'B'])
    // Två spelare sitter mitt emot varandra: B flyttar sig, A står kvar i söder.
    expect(two.zones.find((z) => z.id === 'hand:B')?.geometry).toEqual({ x: -250, y: -400, w: 500, h: 60, rot: 0 })
    expect(two.zones.find((z) => z.id === 'discard')).toMatchObject({ name: 'Påsen', shortcut: { label: 'I påsen', at: 'bottom' } })
    expect(two.zones.find((z) => z.id === 'altar')).toMatchObject({ name: 'Altaret', geometry: { x: 0, y: 100, w: 200, h: 120 } })
    expect(recipeOf(two)).toEqual({ ...base, players: 2 })
  })

  // En plats som går tar sina zoner med sig — receptets och designerns egna, för en zon som hör
  // till en plats som inte längre sitter vid bordet hör till ingen.
  it('takes a departing seat’s zones with it, the designer’s own among them', () => {
    const three = openingSetup(base)
    const withOwn = { ...three, zones: [...three.zones, { id: 'bank', kind: 'pile' as const, name: 'C:s bank', visibility: 'owner' as const, owner: 'C', geometry: { x: 0, y: 0, w: 0, h: 0, rot: 0 } }] }
    const two = applyRecipe(withOwn, { ...base, players: 2 })
    expect(two.zones.some((z) => z.owner === 'C')).toBe(false)
    expect(two.zones.some((z) => z.id === 'bank')).toBe(false)
  })

  // Bordet är designerns (B5, reviderat): det som tagits bort kommer aldrig tillbaka, inte heller
  // när platsantalet vrids. Före detta var kryssen i panelen enda vägen, och de la tillbaka zonen.
  it('never puts back a zone the designer has taken away', () => {
    const three = openingSetup(base)
    const stripped = { ...three, zones: three.zones.filter((z) => z.id !== 'discard' && !z.id.startsWith('mine:')) }
    const four = applyRecipe(stripped, { ...base, players: 4 })
    expect(four.zones.some((z) => z.id === 'discard')).toBe(false)
    expect(four.zones.some((z) => z.id.startsWith('mine:'))).toBe(false)
    // Men platsen som tillkommer får det platserna redan har: en hand och en räknarzon.
    expect(four.zones.find((z) => z.id === 'hand:D')?.geometry).toEqual({ x: -600, y: -250, w: 60, h: 500, rot: 0 })
    expect(four.zones.find((z) => z.id === 'counters:D')).toMatchObject({ owner: 'D' })
    // Och en ny plats får inte det bara några platser har.
    const mixed = applyRecipe({ ...three, zones: three.zones.filter((z) => z.id !== 'mine:B') }, { ...base, players: 4 })
    expect(mixed.zones.filter((z) => z.id.startsWith('mine:')).map((z) => z.id)).toEqual(['mine:A', 'mine:C'])
  })

  it('reads the counters back, and lays the seat’s two zones out again when a counter is added', () => {
    const three = openingSetup(base)
    const two = applyRecipe(three, { players: 3, counters: [{ name: 'Poäng', start: 0 }, { name: 'Liv', start: 20 }] })
    expect(two.counters).toEqual([{ name: 'Poäng', start: 0 }, { name: 'Liv', start: 20 }])
    expect(recipeOf(two).counters).toHaveLength(2)
    // Räknarzonen växer längs kanten och Framför ger upp exakt lika mycket (#89).
    const counters = two.zones.find((z) => z.id === 'counters:A')!.geometry
    const mine = two.zones.find((z) => z.id === 'mine:A')!.geometry
    expect(counters.w).toBe(250)
    expect(mine.w).toBe(240)
  })
})
