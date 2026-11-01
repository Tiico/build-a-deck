import { describe, expect, it } from 'vitest'
import { BOARDS, STANDARD_TYPES, TypeRegistry, initialState, project, type DeckFacts } from '@byd/engine'
import type { FaceTemplate } from '@byd/template'
import type { RenderRequest } from '@byd/render/queue'
import { printExportOf, queueFaces } from '../src/faces.js'
import { printManifestOf } from '../src/print-files.js'
import { ProjectDoc, deckFromProject } from '../src/projects.js'
import { setupFromProject } from '../src/setup.js'
import { openingSetup } from '../src/recipe.js'

// Brädets yta som textur (#1479, E2, DRIFT §6): brädets mall i dokumentet ritas av den enda renderaren
// på samma väg som ett korts sida, som ett jobb nycklat på sitt innehåll, och hashen står i vyn så att
// filten kan hämta den. Ändrad bild är ny hash; samma bräde på fyra platser är en rendering.
const registry = new TypeRegistry(STANDARD_TYPES)
const square = BOARDS.find((b) => b.id === 'board.square457')!
const player = BOARDS.find((b) => b.id === 'board.player')!
const ref = (def: typeof square) => ({ id: def.id, version: def.version })
const ground = (fill: string): FaceTemplate => ({ base: [{ kind: 'shape', id: 'ground', x: -3, y: -3, w: 463, h: 463, shape: 'rect', fill }], variants: {} })

function docWith(fill: string): ProjectDoc {
  return ProjectDoc.parse({
    name: 'Brädspel',
    template: { faces: { front: { base: [], variants: {} }, back: { base: [], variants: {} } } },
    rows: [{ id: 'main', fields: { title: 'Ett kort som heter som brädet' } }],
    icons: {},
    setup: {
      ...openingSetup({ players: 4, counters: [] }),
      boards: [
        { id: 'main', type: ref(square), zone: 'table', faces: { front: ground(fill) } },
        { id: 'spelare', type: ref(player), role: 'mine', faces: { front: ground('#7a5c2e') } },
      ],
    },
  })
}

async function facts(doc: ProjectDoc): Promise<{ facts: DeckFacts; jobs: RenderRequest[] }> {
  const jobs: RenderRequest[] = []
  const out = await queueFaces(deckFromProject(doc), setupFromProject(doc), registry, 150, 0, (job) => {
    jobs.push(job)
    return Promise.resolve()
  })
  return { facts: { faces: out.faces, titles: out.titles, texts: out.texts, ownFaces: out.ownFaces }, jobs }
}

describe('brädets yta som textur (#1479)', () => {
  it('ritas som en textur i bordets upplösning, och hashen står i varje vy', async () => {
    const doc = docWith('#2f6b3a')
    const { facts: f, jobs } = await facts(doc)
    const hash = f.ownFaces?.['main']?.['front']
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    const job = jobs.find((j) => j.hash === hash)!
    // Filtens egen variant (beställarens beslut 2026-11-01, #1480): en JPEG i kvalitet 90, högst 2048 px
    // på den långa sidan och aldrig tätare än ett korts 150 DPI.
    expect(job).toMatchObject({ kind: { kind: 'raster', format: 'jpg', quality: 90, widthPx: 2048, heightPx: 2048 }, priority: 'texture' })
    const player = jobs.find((j) => j.hash === f.ownFaces?.['spelare']?.['front'])!
    expect(player.kind).toEqual({ kind: 'raster', format: 'jpg', quality: 90, widthPx: Math.round((240 / 25.4) * 150), heightPx: Math.round((150 / 25.4) * 150) })
    // Sidan har brädets mått och inte kortets.
    expect(job.compiled.css).toContain('457mm')
    const state = initialState('v1', setupFromProject(doc), registry)
    for (const seat of ['A', 'C', null]) {
      const seen = project(state, registry, seat, f).components.find((c) => c.type.id === square.id)!
      expect(seen.faces).toEqual({ front: hash })
    }
  })

  it('ritar samma spelarbräde en gång för alla platser, och kortet som delar brädets namn som ett kort', async () => {
    const { facts: f, jobs } = await facts(docWith('#2f6b3a'))
    const own = f.ownFaces?.['spelare']?.['front']
    expect(jobs.filter((j) => j.hash === own)).toHaveLength(1)
    expect(f.titles?.['main']).toBe('Ett kort som heter som brädet')
    expect(f.faces?.['main']?.['front']).not.toBe(f.ownFaces?.['main']?.['front'])
  })

  it('ger ny hash när bilden ändras', async () => {
    const before = (await facts(docWith('#2f6b3a'))).facts.ownFaces?.['main']?.['front']
    const after = (await facts(docWith('#8a2b2b'))).facts.ownFaces?.['main']?.['front']
    expect(after).toMatch(/^[0-9a-f]{64}$/)
    expect(after).not.toBe(before)
  })

  // Brädets sidor går till tryck (#1488): ur brädets egen mall, ett per lagt bräde, och aldrig ur
  // kortet som råkar heta som brädet.
  it('trycker brädena ur sina egna mallar, och kortet som heter som brädet som ett kort', () => {
    const doc = docWith('#2f6b3a')
    const exported = printExportOf(deckFromProject(doc), setupFromProject(doc), registry, 0)
    expect(exported.hardware).toEqual([])
    const manifest = printManifestOf(deckFromProject(doc), setupFromProject(doc), registry)
    const boards = manifest.cards.filter((c) => c.type.id.startsWith('board.'))
    // The main board once, and a player board at every seat.
    expect(boards.map((c) => [c.cardRef, c.type.id])).toEqual([['main', 'board.square457'], ...doc.setup.seats.map(() => ['spelare', 'board.player'])])
    const card = manifest.cards.find((c) => c.type.id === 'card.standard.63x88' && c.cardRef === 'main')
    expect(card).toBeDefined()
    expect(Object.keys(boards[0]!.faces)).toEqual(['front'])
    expect(boards[0]!.faces['front']).not.toBe(card!.faces['front'])
    expect(exported.cards.filter((c) => c.cardRef === 'spelare')).toHaveLength(doc.setup.seats.length)
  })

  it('ger ett bräde utan mall ingen textur', async () => {
    const doc = docWith('#2f6b3a')
    const blank = { ...doc, setup: { ...doc.setup, boards: [{ id: 'main', type: ref(square), zone: 'table' }] } }
    const { facts: f } = await facts(blank)
    expect(f.ownFaces).toEqual({})
  })
})
