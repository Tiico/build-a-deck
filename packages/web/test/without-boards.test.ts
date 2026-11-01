import { describe, expect, it } from 'vitest'
import { BOARDS, STANDARD_TYPES, TypeRegistry, initialState, project } from '@byd/engine'
import { applyRecipe, openingSetup, recipeOf, setupFromProject } from '@byd/server/doc'
import { isBoard, withoutBoards } from '../src/components.js'

// Brädet är inget på bordet att räkna, lägga bredvid, namnge eller lista på telefonen (#1480, C2):
// en plats «Framför» med sitt spelarbräde i och inget annat håller inga kort.
const registry = new TypeRegistry(STANDARD_TYPES)
const ref = (id: string) => ({ id, version: BOARDS.find((b) => b.id === id)!.version })

function scene() {
  const opening = { ...openingSetup({ players: 2, counters: [] }), boards: [{ id: 'main', type: ref('board.square457'), zone: 'table' }, { id: 'spelare', type: ref('board.player'), role: 'mine' }] }
  const setup = setupFromProject({ rows: [{ id: 'ess', fields: {} }], setup: applyRecipe(opening, recipeOf(opening)) })
  setup.components.push({ type: { id: 'card.standard.63x88', version: 1 }, cardRef: 'ess', zone: 'table', face: 'front', x: 10, y: 10 })
  return project(initialState('v', setup, registry), registry, 'A')
}

describe('bordet utan sina bräden (#1480)', () => {
  it('tar bort bräden ur komponenterna och ur varje zons ordning, och lämnar resten', () => {
    const view = scene()
    expect(view.components.filter(isBoard)).toHaveLength(3)
    const without = withoutBoards(view)
    expect(without.components.filter(isBoard)).toEqual([])
    expect(without.components).toHaveLength(view.components.length - 3)
    const floor = without.zones.find((z) => z.id === 'table')!
    expect(floor.mode === 'order' ? floor.order.length : floor.count).toBe(1)
    const mine = without.zones.find((z) => z.id === 'mine:A')!
    expect(mine.mode === 'order' ? mine.order : mine.count).toEqual(mine.mode === 'order' ? [] : 0)
  })

  it('ger ett bord utan bräde tillbaka som samma objekt', () => {
    const view = project(initialState('v', setupFromProject({ rows: [], setup: openingSetup({ players: 2, counters: [] }) }), registry), registry, 'A')
    expect(withoutBoards(view)).toBe(view)
  })
})
