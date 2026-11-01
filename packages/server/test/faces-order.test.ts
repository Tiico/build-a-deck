import { describe, expect, it } from 'vitest'
import { BOARDS, STANDARD_TYPES, TypeRegistry } from '@byd/engine'
import type { RenderRequest } from '@byd/render/queue'
import { placesOf, queueFaces, REST_PLACE, seenOf } from '../src/faces.js'
import { ProjectDoc, deckFromProject } from '../src/projects.js'
import { setupFromProject } from '../src/setup.js'
import { openingSetup } from '../src/recipe.js'

// Ett bords texturer i sin egen ordning (#1546, beställarens beslut A 2026-11-01): det som syns när
// spelet startar först, alltså baksidorna, brädet och uppvända kort, och sedan resten av leken i
// högens ordning, översta först. Kön delar ut lägsta plats först, så varje bord får sitt synliga ritat
// innan något bord får resten av sin lek.
const registry = new TypeRegistry(STANDARD_TYPES)
const square = BOARDS.find((b) => b.id === 'board.square457')!
const text = (field: string) => ({ kind: 'text' as const, id: field, x: 4, y: 10, w: 50, h: 8, bind: { field }, font: { family: 'sans-serif', sizePt: 9 }, color: '#111' })

function game(): ProjectDoc {
  return ProjectDoc.parse({
    name: 'Ordningen',
    template: { faces: { front: { base: [text('title')], variants: {} }, back: { base: [{ kind: 'shape', id: 'bg', x: 0, y: 0, w: 63, h: 88, shape: 'rect', fill: '#234' }], variants: {} } } },
    rows: ['r1', 'r2', 'r3', 'r4'].map((id) => ({ id, fields: { title: `Kort ${id}` } })),
    icons: {},
    setup: {
      ...openingSetup({ players: 2, counters: [] }),
      boards: [{ id: 'main', type: { id: square.id, version: square.version }, zone: 'table', faces: { front: { base: [{ kind: 'shape', id: 'g', x: -3, y: -3, w: 463, h: 463, shape: 'rect', fill: '#2f6b3a' }], variants: {} } } }],
    },
  })
}

describe('ett bords texturer i sin egen ordning (#1546)', () => {
  it('numrerar det som syns vid starten före resten, och resten i högens ordning, översta först', async () => {
    const doc = game()
    const setup = setupFromProject(doc)
    // The last card lies face up on the discard: its front is seen from the start.
    const components = setup.components.map((c) => (c.cardRef === 'r4' ? { ...c, zone: 'discard', face: 'front' } : c))
    const jobs: RenderRequest[] = []
    const out = await queueFaces(deckFromProject(doc), { ...setup, components }, registry, 150, 0, async (job) => {
      jobs.push(job)
    })
    const place = (hash: string | undefined) => jobs.find((j) => j.hash === hash)?.order
    const front = (row: string) => place(out.faces[row]?.['front'])
    const seen = [place(out.ownFaces['main']?.['front']), place(out.faces['r1']?.['back']), front('r4')]
    const rest = [front('r1'), front('r2'), front('r3')]
    for (const p of [...seen, ...rest]) expect(p).toEqual(expect.any(Number))
    expect(Math.max(...(seen as number[]))).toBeLessThan(Math.min(...(rest as number[])))
    expect(rest).toEqual([...(rest as number[])].sort((a, b) => a - b))
    // The seen ones from 0, so every table's seen textures go before any table's rest.
    expect([...(seen as number[])].sort((a, b) => a - b)).toEqual([0, 1, 2])
    // And the start waits for exactly those (beslut A): what is seen when the game starts.
    expect(seenOf({ ...setup, components }, out.faces, out.ownFaces).sort()).toEqual([out.ownFaces['main']?.['front'], out.faces['r1']?.['back'], out.faces['r4']?.['front']].sort())
  })

  it('numrerar resten efter djupet i varje hög, så att två högar ritas uppifrån sida vid sida', async () => {
    const doc = game()
    const setup = setupFromProject(doc)
    // A second pile, face down too: the cards r3 and r4 lie there, r3 on top.
    const zones = [...setup.zones, { id: 'bag', kind: 'pile' as const, name: 'Påsen', visibility: 'none' as const, geometry: { x: 300, y: 0, w: 0, h: 0, rot: 0 } }]
    const components = setup.components.map((c) => (c.cardRef === 'r3' || c.cardRef === 'r4' ? { ...c, zone: 'bag' } : c))
    const jobs: RenderRequest[] = []
    const out = await queueFaces(deckFromProject(doc), { ...setup, zones, components }, registry, 150, 0, async (job) => {
      jobs.push(job)
    })
    const front = (row: string) => jobs.find((j) => j.hash === out.faces[row]?.['front'])?.order
    expect([front('r1'), front('r2'), front('r3'), front('r4')]).toEqual([REST_PLACE, REST_PLACE + 1, REST_PLACE, REST_PLACE + 1])
  })

  it('ger högens nya ordning efter en blandning, så att det som dras härnäst ritas först', async () => {
    const doc = game()
    const setup = setupFromProject(doc)
    const out = await queueFaces(deckFromProject(doc), setup, registry, 150, 0, async () => undefined)
    // Shuffled: r4 on top now, r1 at the bottom.
    const shuffled = { ...setup, components: [...setup.components].reverse() }
    const places = new Map(placesOf(shuffled, out.faces).map((p) => [p.hash, p.order]))
    const front = (row: string) => places.get(out.faces[row]?.['front'] ?? '')
    expect([front('r4'), front('r3'), front('r2'), front('r1')]).toEqual([REST_PLACE, REST_PLACE + 1, REST_PLACE + 2, REST_PLACE + 3])
  })
})
