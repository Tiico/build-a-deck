import { describe, expect, it } from 'vitest'
import { CARD_STANDARD_63x88, STANDARD_TYPES, TILE_HEX, TypeRegistry } from '@byd/engine'
import type { FaceTemplate, Template } from '@byd/template'
import { applyEdit } from '../src/edits.js'
import { queueFaces } from '../src/faces.js'
import { changeOf, revertOf } from '../src/undo.js'
import { deckFromProject, ProjectDoc } from '../src/projects.js'
import { openingSetup } from '../src/recipe.js'
import { setupFromProject } from '../src/setup.js'

// Spelet bär mer än en lek (#1484, beställarens beslut 8 i #1470): sjuttiotvå landskapsbrickor ur en
// egen mall och en egen tabell, bredvid kortens. Dokumentets egen lek är den det alltid haft
// (`template`, `rows`, `columns`), och en lek till står i `decks` med typ, mall, rader, kolumnordning
// och högen den börjar i.
const registry = new TypeRegistry(STANDARD_TYPES)
const CARD = { id: CARD_STANDARD_63x88.id, version: CARD_STANDARD_63x88.version }
const HEX = { id: TILE_HEX.id, version: TILE_HEX.version }
const text = (id: string, field: string): FaceTemplate['base'][number] => ({ kind: 'text', id, x: 4, y: 10, w: 40, h: 8, bind: { field }, font: { family: 'sans-serif', sizePt: 9 }, color: '#111' })
const cards: Template = { faces: { front: { base: [text('t', 'title')], variants: {} }, back: { base: [], variants: {} } } }
const lands: Template = { faces: { front: { base: [text('t', 'title'), text('r', 'resurs')], variants: {} }, back: { base: [{ kind: 'shape', id: 'bg', x: 0, y: 0, w: 52, h: 60, shape: 'rect', fill: '#264' }], variants: {} } } }
const bag = { id: 'bag', kind: 'pile' as const, name: 'Påsen', visibility: 'none' as const, geometry: { x: 300, y: 0, w: 0, h: 0, rot: 0 } }

// A game written before there was more than one deck, exactly as it was stored.
const older = (): unknown => ({
  name: 'Skogens herrar',
  template: cards,
  rows: [
    { id: 'dragon', fields: { title: 'Drake', antal: 2 } },
    { id: 'knight', fields: { title: 'Riddare' } },
  ],
  columns: ['title', 'antal'],
  icons: {},
  setup: openingSetup({ players: 2, counters: [] }),
})
const withTiles = (): ProjectDoc => {
  const doc = ProjectDoc.parse(older())
  return ProjectDoc.parse({
    ...doc,
    setup: { ...doc.setup, zones: [...doc.setup.zones, bag] },
    decks: [
      {
        id: 'landskap',
        name: 'Landskap',
        type: HEX,
        template: lands,
        rows: [
          { id: 'skog', fields: { title: 'Skog', resurs: 'trä', antal: 3 } },
          { id: 'sjo', fields: { title: 'Sjö', resurs: 'fisk' } },
        ],
        columns: ['title', 'resurs', 'antal'],
        zone: 'bag',
      },
    ],
  })
}

describe('ett spel med fler lekar (#1484)', () => {
  it('läser ett dokument skrivet före lekarna tillbaka orört, och lägger samma bord som förut', () => {
    const doc = ProjectDoc.parse(older())
    expect(doc).toEqual(older())
    expect(doc).not.toHaveProperty('decks')
    expect(setupFromProject(doc).components).toEqual([
      { type: CARD, cardRef: 'dragon', zone: 'draw', face: 'back' },
      { type: CARD, cardRef: 'dragon', zone: 'draw', face: 'back' },
      { type: CARD, cardRef: 'knight', zone: 'draw', face: 'back' },
    ])
    expect(deckFromProject(doc)).toEqual({ template: cards, rows: { dragon: { title: 'Drake', antal: 2 }, knight: { title: 'Riddare' } }, icons: {} })
  })

  it('lägger kortleken i draghögen och brickleken i sin hög, var lek med sin typ', () => {
    const setup = setupFromProject(withTiles())
    const where = setup.components.map((c) => `${c.zone} ${c.type.id} ${c.cardRef}`)
    expect(where).toEqual([
      'draw card.standard.63x88 dragon',
      'draw card.standard.63x88 dragon',
      'draw card.standard.63x88 knight',
      `bag ${HEX.id} landskap:skog`,
      `bag ${HEX.id} landskap:skog`,
      `bag ${HEX.id} landskap:skog`,
      `bag ${HEX.id} landskap:sjo`,
    ])
    for (const c of setup.components) expect(c.face).toBe('back')
    // Brickans rad kan frågas som kortets (B5): det den säger i sina egna kolumner.
    expect(setup.cards?.['landskap:skog']).toEqual({ title: 'Skog', resurs: 'trä', antal: '3' })
  })

  it('ritar varje lek med sin mall: brickan får brickans texturer, titel och text', async () => {
    const doc = withTiles()
    const out = await queueFaces(deckFromProject(doc), setupFromProject(doc), registry, 72, 0, () => Promise.resolve())
    expect(out.titles).toMatchObject({ dragon: 'Drake', 'landskap:skog': 'Skog', 'landskap:sjo': 'Sjö' })
    expect(out.texts['landskap:skog']).toEqual(['trä'])
    expect(out.texts['dragon'] ?? []).toEqual([])
    const skog = out.faces['landskap:skog']!
    const sjo = out.faces['landskap:sjo']!
    expect(skog['front']).not.toBe(sjo['front'])
    // Brickornas baksida är lekens egen och inte kortens.
    expect(skog['back']).toBe(sjo['back'])
    expect(skog['back']).not.toBe(out.faces['dragon']!['back'])
  })

  it('låter en zons fråga gälla den lek den är ställd mot (K21)', () => {
    const doc = withTiles()
    const lake = { id: 'lake', kind: 'area' as const, name: 'Sjöarna', visibility: 'all' as const, geometry: { x: 0, y: 0, w: 200, h: 100, rot: 0 }, fill: [{ field: 'resurs', is: ['fisk'] }], fillDeck: 'landskap' }
    const asked = ProjectDoc.parse({ ...doc, setup: { ...doc.setup, zones: [...doc.setup.zones, lake] } })
    const where = setupFromProject(asked).components.filter((c) => c.zone === 'lake').map((c) => c.cardRef)
    expect(where).toEqual(['landskap:sjo'])
  })

  it('vägrar en lek av en typ som inte är ett kort eller en bricka, två lekar med samma namn, och en lek som heter som markörerna', () => {
    const doc = withTiles()
    const deck = doc.decks![0]!
    expect(() => ProjectDoc.parse({ ...doc, decks: [{ ...deck, type: { id: 'die.d6', version: 1 } }] })).toThrow()
    expect(() => ProjectDoc.parse({ ...doc, decks: [deck, deck] })).toThrow()
    expect(() => ProjectDoc.parse({ ...doc, decks: [{ ...deck, id: 'marker' }] })).toThrow()
    // Vid bordet går varje rad under ett namn: ett kort får inte heta som en annan leks rad.
    expect(() => ProjectDoc.parse({ ...doc, rows: [...doc.rows, { id: 'landskap:skog', fields: {} }] })).toThrow()
  })
})

// Lekarna redigeras som en lista (`setDecks`), som markörerna: en lek till, en ändrad mall eller en
// ändrad rad i en annan lek är en version och ett steg tillbaka (B4). Var lekarna redigeras i editorn
// är #1487.
describe('lekarna redigeras som en lista (#1484)', () => {
  const plain = (): ProjectDoc => ProjectDoc.parse({ ...(older() as object), setup: { ...(older() as ProjectDoc).setup, zones: [...(older() as ProjectDoc).setup.zones, bag] } })
  const tiles = () => withTiles().decks!

  it('skriver listan, tar bort den när den sista leken går, och vägrar en lek dokumentet inte kan bära', () => {
    const next = applyEdit(plain(), { v: 'setDecks', decks: tiles() })
    expect(next.decks).toEqual(tiles())
    expect(applyEdit(next, { v: 'setDecks', decks: [] })).not.toHaveProperty('decks')
    expect(() => applyEdit(plain(), { v: 'setDecks', decks: [{ ...tiles()[0]!, type: { id: 'die.d6', version: 1 } }] })).toThrow()
  })

  it('går att ångra', () => {
    const before = applyEdit(plain(), { v: 'setDecks', decks: tiles() })
    const renamed = applyEdit(before, { v: 'setDecks', decks: [{ ...tiles()[0]!, rows: [{ id: 'skog', fields: { title: 'Granskog' } }] }] })
    const back = revertOf(changeOf(before, renamed), renamed)
    if (!back.ok || !back.edit) throw new Error('no step back')
    expect(applyEdit(renamed, back.edit).decks).toEqual(before.decks)
  })
})
