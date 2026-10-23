import { describe, expect, it } from 'vitest'
import { setupFromProject } from '../src/setup.js'
import { ProjectSetup, type ProjectDoc } from '../src/projects.js'
import { DIE_MM, openingSetup, type Geometry } from '../src/recipe.js'

// En hög är en punkt i dokumentet och en kortrygg på filten, med namnet och bordslägets handtag i
// ett band under den (#480, #881): så mycket filt ska en tärning lämna åt den.
const rectOf = (x: number, y: number, w: number, h: number): Geometry => ({ x, y, w, h, rot: 0 })
const pileWithName = (g: Geometry): Geometry => rectOf(g.x - 63 / 2 - 50, g.y - 88 / 2, 63 + 100, 88 + 97)
// Mellanrummet två tärningar håller till varandra, 0,3 av en tärning, håller en tärning också till en granne.
const apart = (g: Geometry): Geometry => rectOf(g.x - 0.3 * DIE_MM + 0.5, g.y - 0.3 * DIE_MM + 0.5, g.w + 0.6 * DIE_MM - 1, g.h + 0.6 * DIE_MM - 1)
const overlaps = (a: Geometry, b: Geometry): boolean => Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) && Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y)
const inside = (a: Geometry, b: Geometry): boolean => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h

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

  // Filtens mitt är där drag- och kasthögen står, så en rad tärningar mitt på golvet låg ovanpå
  // högarna: i #1137:s bild låg en d4 på draghögen och en d20 i kasthögens kontur. Tärningarna
  // läggs därför på ledig filt, utanför varje annan zon och utanför högens kortrygg och bandet
  // under den där namnet och handtaget ritas.
  it('lägger golvets tärningar fritt från högarna, deras namn och platsernas ytor', () => {
    const doc = { rows: [], setup: { ...openingSetup({ players: 4, counters: [{ name: 'Poäng', start: 0 }] }), dice: [{ faces: 4, count: 1, zone: 'table' }, { faces: 6, count: 2, zone: 'table' }, { faces: 8, count: 1, zone: 'table' }, { faces: 10, count: 1, zone: 'table' }, { faces: 12, count: 1, zone: 'table' }, { faces: 20, count: 1, zone: 'table' }] } } as Pick<ProjectDoc, 'rows' | 'setup'>
    const setup = setupFromProject(doc)
    const floor = setup.zones.find((z) => z.id === 'table')!.geometry
    const dice = diceOf(setup).map((d) => rectOf(floor.x + (d.x ?? NaN), floor.y + (d.y ?? NaN), DIE_MM, DIE_MM))
    expect(dice).toHaveLength(7)
    const taken = setup.zones.filter((z) => z.id !== 'table').map((z) => (z.kind === 'pile' ? pileWithName(z.geometry) : z.geometry))
    for (const die of dice) {
      expect(inside(die, floor)).toBe(true)
      for (const t of taken) expect(overlaps(apart(die), t)).toBe(false)
    }
    // Samma bord varje gång.
    expect(diceOf(setupFromProject(doc))).toEqual(diceOf(setup))
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
