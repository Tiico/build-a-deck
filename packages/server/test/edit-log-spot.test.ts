import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryProjectStore } from '../src/index.js'
import { ProjectActor } from '../src/project-actor.js'
import type { ProjectDoc } from '../src/projects.js'
import type { Geometry } from '../src/recipe.js'
import { template } from './deck.js'
import { twoSeatSetup } from './fixture.js'

// Var en ny zon föds är en regel som har ändrats tre gånger (#443, #480, #881), och den ändras
// med en driftsättning. Regeln flyttas här i sidled för att stå för nästa ändring: det som ska
// visas är att loggen inte bryr sig — en rad som redan är skriven spelas upp där den lades (#894).
const shift = vi.hoisted(() => ({ by: 0 }))
vi.mock('../src/recipe.js', async (original) => {
  const real = await original<typeof import('../src/recipe.js')>()
  const moved = (g: Geometry | null): Geometry | null => (g === null ? null : { ...g, x: g.x + shift.by })
  return { ...real, newPileSpot: (s: Parameters<typeof real.newPileSpot>[0]) => moved(real.newPileSpot(s)), newAreaSpot: (s: Parameters<typeof real.newAreaSpot>[0]) => moved(real.newAreaSpot(s)) }
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
