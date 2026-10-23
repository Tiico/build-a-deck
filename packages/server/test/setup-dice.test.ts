import { describe, expect, it } from 'vitest'
import { setupFromProject } from '../src/setup.js'
import { ProjectSetup, type ProjectDoc } from '../src/projects.js'

// Tärningarna hör till spelets setup (K5, #1136): designern säger vilka sorter, hur många och var,
// och bordet föds med dem där, var och en med en giltig sida upp. Antalet kan följa spelarna
// (#1139): «2 d6 per spelare» i en yta varje plats har ger varje plats två i sin egen yta, och i en
// delad yta ger det två gånger antalet platser där.
const area = { x: -500, y: -300, w: 1000, h: 600, rot: 0 }
const front = { x: 0, y: 0, w: 300, h: 100, rot: 0 }
const doc = (dice: unknown): Pick<ProjectDoc, 'rows' | 'setup'> => ({
  rows: [],
  setup: ProjectSetup.parse({
    zones: [
      { id: 'draw', kind: 'pile', name: 'Draghög', visibility: 'none', geometry: { x: 0, y: 0, w: 0, h: 0, rot: 0 } },
      { id: 'table', kind: 'area', name: 'Spelyta', visibility: 'all', geometry: area },
      { id: 'front:A', kind: 'area', name: 'Framför', visibility: 'all', owner: 'A', geometry: front },
      { id: 'front:B', kind: 'area', name: 'Framför', visibility: 'all', owner: 'B', geometry: front },
      { id: 'front:C', kind: 'area', name: 'Framför', visibility: 'all', owner: 'C', geometry: front },
    ],
    seats: ['A', 'B', 'C'],
    floor: 'table',
    deckZone: 'draw',
    dice,
  }),
})
const diceOf = (setup: ReturnType<typeof setupFromProject>) => setup.components.filter((c) => c.type.id.startsWith('die.'))
const tally = (setup: ReturnType<typeof setupFromProject>) =>
  diceOf(setup).reduce<Record<string, number>>((n, d) => ({ ...n, [`${d.zone} ${d.type.id}`]: (n[`${d.zone} ${d.type.id}`] ?? 0) + 1 }), {})

describe('setupens tärningar (#1136)', () => {
  it('lägger ett fast antal av en sort i en yta, med en sida upp', () => {
    const setup = setupFromProject(doc([{ faces: 6, count: 2, zone: 'table' }, { faces: 20, count: 1, zone: 'table' }]))
    expect(tally(setup)).toEqual({ 'table die.d6': 2, 'table die.d20': 1 })
    expect(diceOf(setup).every((d) => d.face === 'front' && d.counter === 1)).toBe(true)
  })

  it('ger varje plats sitt antal i sin egen yta när raden gäller en yta per plats', () => {
    const setup = setupFromProject(doc([{ faces: 6, count: 2, role: 'front' }]))
    expect(tally(setup)).toEqual({ 'front:A die.d6': 2, 'front:B die.d6': 2, 'front:C die.d6': 2 })
  })

  it('lägger antalet gånger platserna i en delad yta när raden är per spelare', () => {
    const setup = setupFromProject(doc([{ faces: 6, count: 2, perSeat: true, zone: 'table' }]))
    expect(tally(setup)).toEqual({ 'table die.d6': 6 })
  })

  it('lägger tärningarna bredvid varandra inne i ytan, inte på samma punkt', () => {
    const setup = setupFromProject(doc([{ faces: 6, count: 1, zone: 'table' }, { faces: 8, count: 1, zone: 'table' }, { faces: 4, count: 1, zone: 'table' }]))
    const at = diceOf(setup).map((d) => [d.x ?? NaN, d.y ?? NaN] as const)
    expect(new Set(at.map(([x, y]) => `${x},${y}`)).size).toBe(3)
    for (const [x, y] of at) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(area.w)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(area.h)
    }
  })

  it('tar bara sorter som finns, och en rad säger antingen en yta eller en yta per plats', () => {
    const base = doc([]).setup
    expect(() => ProjectSetup.parse({ ...base, dice: [{ faces: 7, count: 1, zone: 'table' }] })).toThrow()
    expect(() => ProjectSetup.parse({ ...base, dice: [{ faces: 6, count: 1 }] })).toThrow()
    expect(() => ProjectSetup.parse({ ...base, dice: [{ faces: 6, count: 1, zone: 'table', role: 'front' }] })).toThrow()
    expect(() => ProjectSetup.parse({ ...base, dice: [{ faces: 6, count: 0, zone: 'table' }] })).toThrow()
  })

  it('lägger inga tärningar i en yta som inte finns', () => {
    expect(diceOf(setupFromProject(doc([{ faces: 6, count: 1, zone: 'saknas' }, { faces: 6, count: 1, role: 'saknas' }])))).toEqual([])
  })
})
