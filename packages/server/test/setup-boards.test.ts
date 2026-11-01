import { describe, expect, it } from 'vitest'
import { BOARDS, initialState, project, TypeRegistry, STANDARD_TYPES } from '@byd/engine'
import type { FaceTemplate } from '@byd/template'
import { setupFromProject } from '../src/setup.js'
import { ProjectDoc, ProjectSetup } from '../src/projects.js'
import { openingSetup, type Setup } from '../src/recipe.js'

// Brädet i dokumentet (#1479): dokumentet bär brädet som lådan bär sina ytor, en mall per sida (L91),
// och var det ligger på filten. Ett huvudbräde ligger i en yta alla delar, ett spelarbräde i en yta
// varje plats har (beställarens beslut 7 i #1470). Det läggs först, så att allt annat ligger på det.
const four = (patch: Partial<Setup>): Pick<ProjectDoc, 'rows' | 'setup'> => ({
  rows: [{ id: 'ess', fields: { title: 'Ess' } }],
  setup: ProjectSetup.parse({ ...openingSetup({ players: 4, counters: [{ name: 'Liv', start: 20 }] }), ...patch }),
})
const ref = (id: string) => {
  const def = BOARDS.find((b) => b.id === id)!
  return { id: def.id, version: def.version }
}
const face: FaceTemplate = { base: [{ kind: 'shape', id: 'ground', x: -3, y: -3, w: 463, h: 463, shape: 'rect', fill: '#2f6b3a' }], variants: {} }
const boardsOf = (setup: ReturnType<typeof setupFromProject>) => setup.components.filter((c) => c.type.id.startsWith('board.'))
const registry = new TypeRegistry(STANDARD_TYPES)

describe('brädet i dokumentet (#1479)', () => {
  it('lägger huvudbrädet först, på punkten setupen säger, med brädet som cardRef', () => {
    const setup = setupFromProject(four({ boards: [{ id: 'main', type: ref('board.square457'), zone: 'table', at: { x: 600, y: 400 }, faces: { front: face } }] }))
    expect(setup.components[0]).toEqual({ type: ref('board.square457'), cardRef: 'main', zone: 'table', face: 'front', x: 600 - 457 / 2, y: 400 - 457 / 2, rot: 0 })
    expect(boardsOf(setup)).toHaveLength(1)
    // Allt annat ligger på det: korten och räknarna kommer efter.
    expect(setup.components.slice(1).some((c) => c.type.id.startsWith('board.'))).toBe(false)
    expect(setup.components.length).toBeGreaterThan(1)
  })

  it('lägger ett bräde utan punkt mitt i sin yta', () => {
    const setup = setupFromProject(four({ boards: [{ id: 'main', type: ref('board.rect610'), zone: 'table' }] }))
    expect(boardsOf(setup)[0]).toMatchObject({ zone: 'table', x: 600 - 610 / 2, y: 400 - 457 / 2, rot: 0 })
  })

  it('ger varje plats ett spelarbräde i sin yta, vänt mot platsens kant', () => {
    const setup = setupFromProject(four({ boards: [{ id: 'spelare', type: ref('board.player'), role: 'mine' }] }))
    const laid = boardsOf(setup)
    expect(laid.map((b) => [b.zone, b.cardRef, b.rot])).toEqual([
      ['mine:A', 'spelare', 0],
      ['mine:B', 'spelare', 180],
      ['mine:C', 'spelare', 270],
      ['mine:D', 'spelare', 90],
    ])
    // Mitt i ytan, som brädet står innan det vrids.
    expect(laid[0]).toMatchObject({ x: 365 / 2 - 120, y: 50 - 75 })
    expect(laid[2]).toMatchObject({ x: 50 - 120, y: 365 / 2 - 75 })
    // Spelarbräden först, före varje kort.
    expect(setup.components.slice(0, 4).every((c) => c.type.id === 'board.player')).toBe(true)
  })

  it('läggs på ett bord som motorn tar emot, och som säger brädet på rätt punkt i varje vy', () => {
    const setup = setupFromProject(four({ boards: [{ id: 'main', type: ref('board.square457'), zone: 'table', at: { x: 600, y: 400 } }] }))
    const state = initialState('v1', setup, registry)
    expect(state.zones['table']!.order[0]).toBe(Object.values(state.components).find((c) => c.cardRef === 'main')!.id)
    for (const seat of ['A', null]) {
      const seen = project(state, registry, seat).components.find((c) => c.type.id === 'board.square457')!
      expect(seen).toMatchObject({ zone: 'table', cardRef: 'main', face: 'front', x: 371.5, y: 171.5, rot: 0 })
    }
  })

  it('tar bara brädtyper som finns, en yta eller en yta per plats, och ett namn per bräde', () => {
    const base = four({}).setup
    const ok = { id: 'main', type: ref('board.square457'), zone: 'table' }
    expect(() => ProjectSetup.parse({ ...base, boards: [ok] })).not.toThrow()
    expect(() => ProjectSetup.parse({ ...base, boards: [{ ...ok, type: { id: 'die.d6', version: 1 } }] })).toThrow()
    expect(() => ProjectSetup.parse({ ...base, boards: [{ ...ok, type: { id: 'board.square457', version: 9 } }] })).toThrow()
    expect(() => ProjectSetup.parse({ ...base, boards: [{ id: 'main', type: ref('board.square457') }] })).toThrow()
    expect(() => ProjectSetup.parse({ ...base, boards: [{ ...ok, role: 'mine' }] })).toThrow()
    expect(() => ProjectSetup.parse({ ...base, boards: [ok, { ...ok, type: ref('board.player') }] })).toThrow()
    expect(() => ProjectSetup.parse({ ...base, boards: [{ ...ok, faces: { back: face } }] })).toThrow()
  })

  it('lägger ingenting för ett bräde vars yta inte finns längre', () => {
    const setup = setupFromProject(four({ boards: [{ id: 'main', type: ref('board.square457'), zone: 'borta' }] }))
    expect(boardsOf(setup)).toEqual([])
  })

  it('läser ett dokument utan bräde tillbaka orört', () => {
    const before = four({}).setup
    expect(before).not.toHaveProperty('boards')
    expect(ProjectSetup.parse(JSON.parse(JSON.stringify(before)))).toEqual(before)
    expect(boardsOf(setupFromProject(four({})))).toEqual([])
  })

  it('läser ett dokument med bräde tillbaka som det skrevs', () => {
    const doc = four({ boards: [{ id: 'main', type: ref('board.square457'), zone: 'table', at: { x: 10, y: 20 }, faces: { front: face } }] })
    expect(ProjectSetup.parse(JSON.parse(JSON.stringify(doc.setup)))).toEqual(doc.setup)
  })
})
