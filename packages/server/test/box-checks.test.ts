import { describe, expect, it } from 'vitest'
import { type BoxFace } from '@byd/engine'
import { type Element } from '@byd/template'
import { boxFaceOf, boxIssues, boxOf } from '../src/box.js'
import { applyEdit } from '../src/edits.js'
import { openingSetup } from '../src/recipe.js'
import type { ProjectDoc } from '../src/projects.js'

// #1459: Fysisk kontroll (E5) läste bara kortens ytor, så en text på 2 pt längs ryggen på en ritad
// låda gav ingen anmärkning, varken i editorn eller vid en beställning. Lådans ritade ytor prövas nu
// med samma regler som korten, med lådtypens egen `print` och varje ytas eget mått (`boxFaceSize`).
// Neutrala ytor och tomma ytor prövas inte: den neutrala är verktygets, och en tom yta har inget.

// 40 kort på 0,3 mm: lådan är 65 × 90 × 14 mm, så locket är 65 × 14 mm.
const game = (cards: number, faces?: Partial<Record<BoxFace, Element[]>>, name = 'Skogens råd'): ProjectDoc => ({
  name,
  template: { faces: { front: { base: [], variants: {} } } },
  rows: cards === 0 ? [] : [{ id: 'kort-1', fields: { title: 'Ek', antal: cards } }],
  icons: {},
  setup: openingSetup({ players: 2, counters: [] }),
  ...(faces ? { box: { type: { id: 'box.tuck', version: 1 }, faces: Object.fromEntries(Object.entries(faces).map(([face, base]) => [face, { base, variants: {} }])) } } : {}),
})
const LID_GROUND: Element = { kind: 'shape', id: 'ground', x: -3, y: -3, w: 71, h: 20, shape: 'rect', fill: '#2b3a4a' }
const text = (over: Partial<Extract<Element, { kind: 'text' }>> = {}): Element => ({ kind: 'text', id: 'egen', x: 5, y: 4, w: 55, h: 6, bind: { literal: 'SR' }, font: { family: 'sans-serif', sizePt: 9 }, color: '#f3ecdc', ...over })
const of = (doc: ProjectDoc, code: string) => boxIssues(doc).filter((i) => i.code === code)

describe('Fysisk kontroll prövar lådans ritade ytor (#1459)', () => {
  it('säger att en text på 2 pt på locket är för liten, med lådtypens golv och vilken yta', () => {
    const doc = game(40, { lid: [LID_GROUND, text({ font: { family: 'sans-serif', sizePt: 2 } })] })
    expect(boxOf(doc).size.depth).toBe(14)
    expect(of(doc, 'text-too-small')).toEqual([{ face: 'lid', element: 'egen', code: 'text-too-small', severity: 'error', values: { sizePt: 2, floor: 6 } }])
  })

  it('läser golvet ur textens skrift i lådtypens print', () => {
    const doc = game(40, { lid: [LID_GROUND, text({ bind: { literal: '森の評議会' }, font: { family: 'sans-serif', sizePt: 7 } })] })
    expect(of(doc, 'text-too-small')).toMatchObject([{ face: 'lid', severity: 'error', values: { sizePt: 7, floor: 8 } }])
  })

  // Samma text står fritt på ett kort på 63 × 88 mm, men på ett lock som är 14 mm djupt når den in i
  // skyddsmarginalen: ytan mäts i sitt eget mått.
  it('mäter skyddsmarginalen mot ytans eget mått', () => {
    const doc = game(40, { lid: [LID_GROUND, text({ y: 3, h: 9 })] })
    expect(of(doc, 'outside-safe-area')).toEqual([{ face: 'lid', element: 'egen', code: 'outside-safe-area', severity: 'warning', values: { safeMm: 3 } }])
  })

  it('säger att en bakgrund som når snittet men inte utfallet är ett fel', () => {
    const doc = game(40, { left: [{ kind: 'shape', id: 'ground', x: 0, y: 0, w: 14, h: 90, shape: 'rect', fill: '#2b3a4a' }] })
    expect(of(doc, 'short-of-bleed')).toEqual([{ face: 'left', element: 'ground', code: 'short-of-bleed', severity: 'error', values: { bleedMm: 3 } }])
  })

  it('prövar inte de neutrala ytorna, för någon lek på 0–108 kort', () => {
    for (let cards = 0; cards <= 108; cards++) expect(boxIssues(game(cards)), `${cards} kort`).toEqual([])
  })

  it('prövar inte en tom yta', () => {
    expect(boxIssues(game(40, { lid: [] }))).toEqual([])
  })

  it('prövar bara de ytor designern har ritat', () => {
    const doc = game(40, { lid: [LID_GROUND, text({ font: { family: 'sans-serif', sizePt: 2 } })] })
    expect(new Set(boxIssues(doc).map((i) => i.face))).toEqual(new Set(['lid']))
  })

  // Den första ändringen på en yta lägger den neutrala ytan i dokumentet (#1413). Den får inte i
  // samma stund bli ett fel som stoppar en order: bakgrunden når utfallet, och namnet står innanför
  // skyddsmarginalen och över golvet.
  it('ger inget fel på en yta designern just tagit över från den neutrala', () => {
    for (const name of ['Skogens råd', '森の評議会']) {
      for (const cards of [6, 13, 34, 40, 108]) {
        let doc = game(cards, undefined, name)
        for (const face of ['front', 'back', 'left', 'right', 'lid', 'bottom'] as const) doc = applyEdit(doc, { v: 'replaceFace', on: 'box', face, base: boxFaceOf(doc, face).template.base })
        expect(Object.keys(doc.box?.faces ?? {}), `${cards} kort`).toHaveLength(6)
        expect(
          boxIssues(doc).filter((i) => i.severity === 'error'),
          `${cards} kort, ${name}`,
        ).toEqual([])
      }
    }
  })
})
