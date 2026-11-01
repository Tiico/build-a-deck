import { describe, expect, it } from 'vitest'
import { STANDARD_TYPES, TILE_COIN, TypeRegistry } from '@byd/engine'
import type { FaceTemplate } from '@byd/template'
import { printExportOf, queueFaces } from '../src/faces.js'
import { printManifestOf } from '../src/print-files.js'
import { markerRef } from '../src/material.js'
import { deckFromProject, ProjectDoc } from '../src/projects.js'
import { openingSetup } from '../src/recipe.js'
import { setupFromProject } from '../src/setup.js'

// Markörens ytor (#1483) ritas av den enda renderaren (E2) som ett korts, ur markörens egna mallar,
// en gång per innehållshash och inte en gång per exemplar: trettio mynt är två texturer.
const registry = new TypeRegistry(STANDARD_TYPES)
const COIN = { id: TILE_COIN.id, version: TILE_COIN.version }
const face = (text: string): FaceTemplate => ({
  base: [{ kind: 'text', id: 'ord', x: 2, y: 10, w: 21, h: 5, bind: { literal: text }, font: { family: 'sans-serif', sizePt: 8 }, color: '#111' }],
  variants: {},
})
const cardFace = (text: string): FaceTemplate => ({
  base: [{ kind: 'text', id: 'titel', x: 5, y: 5, w: 50, h: 8, bind: { field: 'title' }, font: { family: 'sans-serif', sizePt: 9 }, color: '#000' }, { kind: 'text', id: 'ord', x: 5, y: 20, w: 50, h: 8, bind: { literal: text }, font: { family: 'sans-serif', sizePt: 9 }, color: '#000' }],
  variants: {},
})
const game = (front: string): ProjectDoc => {
  const opening = openingSetup({ players: 2, counters: [] })
  return ProjectDoc.parse({
    name: 'Myntspel',
    template: { faces: { front: cardFace('kortets framsida'), back: cardFace('kortets baksida') } },
    // A row that shares the marker's word must not be drawn with the marker's faces, nor it with its.
    rows: [{ id: 'mynt', fields: { title: 'Myntkortet' } }],
    icons: {},
    setup: { ...opening, markers: [{ id: 'mynt', name: 'Mynt', type: COIN, faces: { front: face(front), back: face('Banken') }, count: 30, zone: 'table' }] },
  })
}
const faces = (doc: ProjectDoc) => queueFaces(deckFromProject(doc), setupFromProject(doc), registry, 72, 0, () => Promise.resolve())

describe('markörens texturer (#1483)', () => {
  it('ger de trettio mynten samma två texturer, renderade en gång', async () => {
    const doc = game('1 guld')
    const out = await faces(doc)
    const coin = out.faces[markerRef('mynt')]
    expect(Object.keys(coin ?? {}).sort()).toEqual(['back', 'front'])
    // Kortet och myntet: fyra sidor, fyra jobb, oavsett trettio exemplar.
    expect(out.hashes).toHaveLength(4)
    expect(new Set(out.hashes).size).toBe(4)
    expect(out.titles[markerRef('mynt')]).toBe('Mynt')
    expect(out.titles['mynt']).toBe('Myntkortet')
    // Kortet ritas ur kortets mall och myntet ur sitt: ingen hash delas.
    expect(Object.values(out.faces['mynt'] ?? {})).not.toContain(coin?.['front'])
  })

  it('ger en ändrad framsida ny hash för alla, och baksidan står kvar', async () => {
    const before = (await faces(game('1 guld'))).faces[markerRef('mynt')]
    const after = (await faces(game('5 guld'))).faces[markerRef('mynt')]
    expect(after?.['front']).not.toBe(before?.['front'])
    expect(after?.['back']).toBe(before?.['back'])
  })

  // Markörerna går till tryck (#1488): en post per exemplar, som ett korts kopior, och en bild per sida.
  it('trycker varje markör som ett exemplar, och de identiska sidorna en gång', () => {
    const doc = game('1 guld')
    const exported = printExportOf(deckFromProject(doc), setupFromProject(doc), registry, 0)
    const coins = exported.cards.filter((c) => c.cardRef === markerRef('mynt'))
    expect(coins.length).toBe(doc.setup.markers?.[0]?.count)
    expect(new Set(coins.map((c) => JSON.stringify(c.faces))).size).toBe(1)
    expect(Object.keys(coins[0]!.faces).sort()).toEqual(['back', 'front'])
    expect(exported.cards.filter((c) => c.cardRef === 'mynt')).toHaveLength(1)
    const manifest = printManifestOf(deckFromProject(doc), setupFromProject(doc), registry)
    expect(manifest.cards.filter((c) => c.cardRef === markerRef('mynt')).every((c) => c.type.id.startsWith('tile.'))).toBe(true)
  })

  it('ritar en sida utan mall som en tom sida i stället för att vägra bordet', async () => {
    const doc = game('1 guld')
    const bare = { ...doc, setup: { ...doc.setup, markers: doc.setup.markers?.map(({ faces: _faces, ...m }) => m) } }
    const coin = (await faces(bare)).faces[markerRef('mynt')]
    expect(Object.keys(coin ?? {}).sort()).toEqual(['back', 'front'])
  })
})
