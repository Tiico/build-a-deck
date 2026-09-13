import { describe, expect, it } from 'vitest'
import type { ProjectDoc } from '@byd/server'
import { applyRecipe, emptySetup, setupFromProject } from '@byd/server/doc'
import { previewOf } from '../src/setup/preview.js'

describe('the preview of a setup (B5): the table as the screen would show it before anyone sat down', () => {
  it('has every zone, a deck of placeholder cards face down in the deck zone, and each seat\'s counters at their start values', () => {
    const setup = applyRecipe(emptySetup(), { players: 2, mine: true, discard: true, market: false, counters: [{ name: 'Poäng', start: 0 }, { name: 'Liv', start: 20 }] })
    const view = previewOf({ rows: [], setup })!
    expect(view.zones.map((z) => z.id).sort()).toEqual(setup.zones.map((z) => z.id).sort())
    expect(view.floor).toBe('table')
    const tokens = view.components.filter((c) => c.type.id === 'token.counter')
    expect(tokens).toHaveLength(4)
    expect(tokens.filter((c) => c.zone === 'counters:B').map((c) => [c.cardRef, c.counter])).toEqual([['Poäng', 0], ['Liv', 20]])
  })

  it('is null for a setup the engine refuses, so the editor can say so instead of crashing', () => {
    const setup = applyRecipe(emptySetup(), { players: 1, mine: false, discard: false, market: false, counters: [] })
    const broken = { ...setup, zones: setup.zones.map((z) => (z.id === 'hand:A' ? { ...z, returnTo: 'nowhere' } : z)) }
    expect(previewOf({ rows: [], setup: broken })).toBeNull()
    expect(previewOf({ rows: [], setup })).not.toBeNull()
  })
})

describe('the deck the preview deals is the deck the table gets (L4, L5, #85)', () => {
  const setup = applyRecipe(emptySetup(), { players: 2, mine: false, discard: true, market: false, counters: [] })
  const drawCount = (rows: ProjectDoc['rows']) => {
    const draw = previewOf({ rows, setup })!.zones.find((z) => z.id === 'draw')!
    return draw.kind === 'pile' && draw.mode === 'count' ? draw.count : -1
  }

  it('counts every row antal times, a row without antal once, the way the server builds the table', () => {
    const rows = [
      { id: 'drake', fields: { title: 'Drake', antal: 2 } },
      { id: 'riddare', fields: { title: 'Riddare', antal: 3 } },
      { id: 'trollkarl', fields: { title: 'Trollkarl' } },
    ]
    expect(drawCount(rows)).toBe(setupFromProject({ rows, setup }).components.filter((c) => c.zone === 'draw').length)
    expect(drawCount(rows)).toBe(6)
  })

  it('shows 0 for a deck without rows', () => {
    expect(drawCount([])).toBe(0)
  })
})
