import { describe, expect, it } from 'vitest'
import { applyRecipe, emptySetup } from '@byd/server/doc'
import { previewOf } from '../src/setup/preview.js'

describe('the preview of a setup (B5): the table as the screen would show it before anyone sat down', () => {
  it('has every zone, a deck of placeholder cards face down in the deck zone, and each seat\'s counters at their start values', () => {
    const setup = applyRecipe(emptySetup(), { players: 2, mine: true, discard: true, market: false, counters: [{ name: 'Poäng', start: 0 }, { name: 'Liv', start: 20 }] })
    const view = previewOf(setup)!
    expect(view.zones.map((z) => z.id).sort()).toEqual(setup.zones.map((z) => z.id).sort())
    expect(view.floor).toBe('table')
    const draw = view.zones.find((z) => z.id === 'draw')!
    expect(draw.kind === 'pile' && draw.mode === 'count' ? draw.count : 0).toBe(20)
    const tokens = view.components.filter((c) => c.type.id === 'token.counter')
    expect(tokens).toHaveLength(4)
    expect(tokens.filter((c) => c.zone === 'counters:B').map((c) => [c.cardRef, c.counter])).toEqual([['Poäng', 0], ['Liv', 20]])
  })

  it('is null for a setup the engine refuses, so the editor can say so instead of crashing', () => {
    const setup = applyRecipe(emptySetup(), { players: 1, mine: false, discard: false, market: false, counters: [] })
    const broken = { ...setup, zones: setup.zones.map((z) => (z.id === 'hand:A' ? { ...z, returnTo: 'nowhere' } : z)) }
    expect(previewOf(broken)).toBeNull()
    expect(previewOf(setup)).not.toBeNull()
  })
})
