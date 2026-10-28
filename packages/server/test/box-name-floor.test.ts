import { describe, expect, it } from 'vitest'
import { type BoxFace } from '@byd/engine'
import { textFloorPt, type Element } from '@byd/template'
import { applyEdit } from '../src/edits.js'
import { boxFaceOf, boxOf } from '../src/box.js'
import { openingSetup } from '../src/recipe.js'
import { ProjectDoc } from '../src/projects.js'

// #1458: på en tunn låda blev spelets namn längs ryggen och på locket ungefär 0,6 mm högt. Den
// neutrala lådan skriver namnet på en yta bara när det blir minst så stort som E5:s textgolv för
// tryck, och golvet läses ur lådtypens `print` med namnets skrift, som Fysisk kontroll läser det.
// Annars är ytan bara lekens färg, och designern kan lägga en text där själv.
const game = (cards: number, name = 'Skogens råd'): ProjectDoc => ({
  name,
  template: { faces: { front: { base: [], variants: {} } } },
  rows: cards === 0 ? [] : [{ id: 'kort-1', fields: { title: 'Ek', antal: cards } }],
  icons: {},
  setup: openingSetup({ players: 2, counters: [] }),
})
const NAMED = ['front', 'left', 'right', 'lid'] as const satisfies readonly BoxFace[]
const nameOn = (doc: ProjectDoc, face: BoxFace) => boxFaceOf(doc, face).template.base.find((e) => e.kind === 'text')
const DECKS = Array.from({ length: 109 }, (_, cards) => cards)

describe('den neutrala lådan skriver inte namnet under textgolvet (#1458)', () => {
  it('skriver namnet bara där det blir minst så stort som golvet, för lekar på 0–108 kort', () => {
    for (const name of ['Skogens råd', '森の評議会']) {
      for (const cards of DECKS) {
        const doc = game(cards, name)
        const floor = textFloorPt(boxOf(doc).type.print, name)
        for (const face of NAMED) {
          const text = nameOn(doc, face)
          if (text?.kind === 'text') expect(text.font.sizePt, `${face}, ${cards} kort, ${name}`).toBeGreaterThanOrEqual(floor)
        }
      }
    }
  })

  // Gränsen är golvet och inget annat: den första leken som får namnet på en smal yta får det i
  // golvets storlek, och varje tjockare lek behåller det. Namnet växer med lådans djup.
  it('släpper namnet på ryggen och locket precis vid golvet, och tar det aldrig bort på en tjockare lek', () => {
    for (const name of ['Skogens råd', '森の評議会']) {
      const floor = textFloorPt(boxOf(game(0, name)).type.print, name)
      for (const face of ['left', 'right', 'lid'] as const) {
        const named = DECKS.map((cards) => nameOn(game(cards, name), face))
        const first = named.findIndex((text) => text !== undefined)
        expect(first, `${face}, ${name}`).toBeGreaterThan(0)
        expect(named.slice(first).every((text) => text !== undefined), `${face}, ${name}`).toBe(true)
        const text = named[first]
        expect(text?.kind === 'text' && text.font.sizePt, `${face}, ${name}`).toBe(Math.ceil(floor))
      }
    }
  })

  it('läser golvet ur namnets skrift: ett namn med ett högre golv behöver en tjockare låda', () => {
    const firstNamed = (name: string) => DECKS.findIndex((cards) => nameOn(game(cards, name), 'left') !== undefined)
    expect(firstNamed('森の評議会')).toBeGreaterThan(firstNamed('Skogens råd'))
  })

  it('lämnar den guidade startens låda med namnet på framsidan och bara färg på ryggen och locket', () => {
    const doc = game(6)
    expect(nameOn(doc, 'front')).toMatchObject({ bind: { literal: 'Skogens råd' } })
    for (const face of ['left', 'right', 'lid'] as const) expect(boxFaceOf(doc, face).template.base.map((e) => e.id), face).toEqual(['ground'])
  })

  it('skriver namnet på alla fyra ytorna på en lek av 108 kort, som förut', () => {
    for (const face of NAMED) expect(nameOn(game(108), face), face).toMatchObject({ bind: { literal: 'Skogens råd' } })
  })

  it('låter designern lägga en egen text på den tomma ryggen och det tomma locket', () => {
    const doc = game(6)
    for (const face of ['left', 'lid'] as const) {
      const own: Element = { kind: 'text', id: 'egen', x: 0.5, y: 2, w: 3, h: 20, bind: { literal: 'SR' }, font: { family: 'sans-serif', sizePt: 6 }, color: '#f3ecdc' }
      // Den första ändringen lägger den neutrala ytan i dokumentet, som editorn gör (#1413).
      const neutral = boxFaceOf(doc, face).template.base
      const drawn = applyEdit(doc, { v: 'compound', edits: [{ v: 'replaceFace', on: 'box', face, base: neutral }, { v: 'addElement', on: 'box', face, element: own }] })
      expect(boxFaceOf(drawn, face)).toMatchObject({ drawn: true, template: { base: [{ id: 'ground' }, { id: 'egen', bind: { literal: 'SR' } }] } })
      expect(() => ProjectDoc.parse(drawn)).not.toThrow()
    }
  })
})
