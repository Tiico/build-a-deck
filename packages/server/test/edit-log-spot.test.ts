import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryProjectStore } from '../src/index.js'
import type { EditIntent } from '../src/edits.js'
import { ProjectActor } from '../src/project-actor.js'
import type { ProjectDoc } from '../src/projects.js'
import type { Geometry, Zone } from '../src/recipe.js'
import { template } from './deck.js'
import { twoSeatSetup } from './fixture.js'

// Var en ny zon föds är en regel som har ändrats tre gånger (#443, #480, #881), och den ändras
// med en driftsättning. Regeln flyttas här i sidled för att stå för nästa ändring: det som ska
// visas är att loggen inte bryr sig — en rad som redan är skriven spelas upp där den lades (#894).
const shift = vi.hoisted(() => ({ by: 0 }))
vi.mock('../src/recipe.js', async (original) => {
  const real = await original<typeof import('../src/recipe.js')>()
  const moved = (g: Geometry | null): Geometry | null => (g === null ? null : { ...g, x: g.x + shift.by })
  // Platsernas zoner och receptets uppställning flyttas på samma sätt (#895): det regeln lägger ut
  // hamnar i sidled, det den lämnar orört står kvar.
  const laid = (z: Zone): Zone => ({ ...z, geometry: moved(z.geometry)! })
  return {
    ...real,
    newPileSpot: (s: Parameters<typeof real.newPileSpot>[0]) => moved(real.newPileSpot(s)),
    newAreaSpot: (s: Parameters<typeof real.newAreaSpot>[0]) => moved(real.newAreaSpot(s)),
    seatZones: (...args: Parameters<typeof real.seatZones>) => real.seatZones(...args).map(laid),
    applyRecipe: (...args: Parameters<typeof real.applyRecipe>) => {
      const before = new Map(args[0].zones.map((z) => [z.id, z.geometry]))
      const after = real.applyRecipe(...args)
      return { ...after, zones: after.zones.map((z) => (JSON.stringify(before.get(z.id)) === JSON.stringify(z.geometry) ? z : laid(z))) }
    },
  }
})
afterEach(() => {
  shift.by = 0
})

const doc = (): ProjectDoc => {
  const { zones, seats, floor } = twoSeatSetup()
  return { name: 'Skogens herrar', template, rows: [{ id: 'dragon', fields: { title: 'Drake', antal: 2 } }], icons: {}, setup: { zones, seats, floor, deckZone: 'draw' } }
}
const geometryOf = (d: ProjectDoc, id: string): Geometry | undefined => d.setup.zones.find((z) => z.id === id)?.geometry

describe('a new zone in the edit log (#894, D3)', () => {
  it.each(['pile', 'area'] as const)('replays a %s to where it was laid, after the placement rule has changed', async (kind) => {
    const store = new MemoryProjectStore()
    await store.create('p1', doc())
    const live = (await ProjectActor.load('p1', store))!
    await live.edit({ v: 'addZone', id: 'ny', kind, name: 'Ny' })
    const laid = geometryOf(live.doc, 'ny')

    // En driftsättning senare, med en annan regel och en osparad svans.
    shift.by = 40
    const after = (await ProjectActor.load('p1', store))!
    expect(geometryOf(after.doc, 'ny')).toEqual(laid)
  })

  it('keeps the place an editor sent, so what the designer saw is what everyone gets', async () => {
    const store = new MemoryProjectStore()
    await store.create('p1', doc())
    const actor = (await ProjectActor.load('p1', store))!
    const seen = { x: 120, y: -40, w: 0, h: 0, rot: 0 }
    await actor.edit({ v: 'addZone', id: 'hog-1', kind: 'pile', name: 'Hög 1', geometry: seen })
    expect(geometryOf(actor.doc, 'hog-1')).toEqual(seen)
    expect((await store.readEdits('p1', 0))[0]?.intent).toMatchObject({ geometry: seen })
  })

  it('still replays a line written before the place was stored, by the rule of the day', async () => {
    const store = new MemoryProjectStore()
    await store.create('p1', doc())
    await store.appendEdits('p1', [{ seq: 1, at: '2026-10-01T00:00:00.000Z', intent: { v: 'addZone', id: 'hog-1', kind: 'pile', name: 'Hög 1' } }])
    const fresh = (await ProjectActor.load('p1', store))!
    const control = (await ProjectActor.load('p1', store))!
    expect(geometryOf(fresh.doc, 'hog-1')).toBeDefined()
    expect(geometryOf(fresh.doc, 'hog-1')).toEqual(geometryOf(control.doc, 'hog-1'))
  })
})

// Samma glapp för de två redigeringarna som lägger ut mer än en zon (#895): platsernas zoner och
// receptets uppställning, filtens storlek med (K18).
describe('the zones a seat edit and the recipe lay out, in the edit log (#895, D3)', () => {
  const geometries = (d: ProjectDoc) => Object.fromEntries(d.setup.zones.map((z) => [z.id, z.geometry]))

  it.each(['mine', 'counters'] as const)('replays the %s zones for every seat to where they were laid, after the rule has changed', async (role) => {
    const store = new MemoryProjectStore()
    await store.create('p1', doc())
    const live = (await ProjectActor.load('p1', store))!
    await live.edit({ v: 'addSeatZone', role, name: 'Zon {seat}' })
    expect(live.doc.setup.zones.some((z) => z.id === `${role}:A`)).toBe(true)
    const laid = geometries(live.doc)

    shift.by = 40
    const after = (await ProjectActor.load('p1', store))!
    expect(geometries(after.doc)).toEqual(laid)
  })

  it('replays a recipe turned to three seats to the table it laid, felt and all, after the rule has changed', async () => {
    const store = new MemoryProjectStore()
    await store.create('p1', doc())
    const live = (await ProjectActor.load('p1', store))!
    await live.edit({ v: 'setRecipe', recipe: { players: 3, counters: [] } })
    expect(live.doc.setup.seats).toEqual(['A', 'B', 'C'])
    const laid = geometries(live.doc)

    shift.by = 40
    const after = (await ProjectActor.load('p1', store))!
    expect(geometries(after.doc)).toEqual(laid)
  })

  // Svaret är bara det redigeringen flyttade eller lade: en zon en medredigerare flyttat innan
  // raden landade får stå där hon lade den.
  it('stores only what the recipe moved or made, so a zone nobody asked it about stays where it stands', async () => {
    const store = new MemoryProjectStore()
    await store.create('p1', doc())
    const actor = (await ProjectActor.load('p1', store))!
    await actor.edit({ v: 'setRecipe', recipe: { players: 3, counters: [] } })
    const line = (await store.readEdits('p1', 0))[0]?.intent
    expect(line).toMatchObject({ v: 'setRecipe', places: expect.objectContaining({ 'hand:C': expect.any(Object), table: expect.any(Object) }) })
    expect(Object.keys((line as { places: object }).places)).not.toContain('draw')
  })

  it.each<EditIntent>([
    { v: 'addSeatZone', role: 'mine', name: 'Framför {seat}' },
    { v: 'setRecipe', recipe: { players: 3, counters: [] } },
  ])('still replays a $v line written before the places were stored, by the rule of the day', async (intent) => {
    const store = new MemoryProjectStore()
    await store.create('p1', doc())
    await store.appendEdits('p1', [{ seq: 1, at: '2026-10-01T00:00:00.000Z', intent }])
    const today = geometries((await ProjectActor.load('p1', store))!.doc)
    shift.by = 40
    const moved = geometries((await ProjectActor.load('p1', store))!.doc)
    expect(moved).not.toEqual(today)
  })
})
