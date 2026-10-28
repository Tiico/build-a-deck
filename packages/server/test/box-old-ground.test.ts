import { describe, expect, it } from 'vitest'
import { type Element } from '@byd/template'
import { boxFaceOf, boxIssues } from '../src/box.js'
import { boxPrintOf } from '../src/box-print.js'
import { openingSetup } from '../src/recipe.js'
import { ProjectDoc, deckFromProject, liftDoc } from '../src/projects.js'

// #1463: före #1459 slutade den neutrala lådans grund vid snittet. En yta designern tog över då
// (#1413) bär den grunden i dokumentet, och sedan #1459 prövar Fysisk kontroll lådans ytor: ytan fick
// ett utfallsfel och en beställning vägrades, utan att designern gjort något. Den gamla neutrala
// grunden, orörd, lyfts när dokumentet läses (DRIFT §7), i samma dörr som mallens andra uppkastare,
// så att historiken aldrig skrivs om. En grund designern själv har flyttat eller krympt prövas som förut.

// 40 kort: lådan är 65 × 90 × 14 mm.
const game = (front?: Element[]): ProjectDoc => ({
  name: 'Skogens råd',
  template: { faces: { front: { base: [], variants: {} } } },
  rows: [{ id: 'kort-1', fields: { title: 'Ek', antal: 40 } }],
  icons: {},
  setup: openingSetup({ players: 2, counters: [] }),
  ...(front ? { box: { type: { id: 'box.tuck', version: 1 }, faces: { front: { base: front, variants: {} } } } } : {}),
})
// Den neutrala framsidan som #1413–#1458 skrev in i dokumentet när designern tog över den.
const OLD_GROUND: Element = { kind: 'shape', id: 'ground', x: 0, y: 0, w: 65, h: 90, shape: 'rect', fill: '#2b3a4a' }
const TITLE = (): Element => {
  const title = boxFaceOf(game(), 'front').template.base.find((e) => e.id === 'title')
  if (!title) throw new Error('the neutral front has a title')
  return title
}
const ground = (doc: ProjectDoc) => doc.box?.faces?.front?.base.find((e) => e.id === 'ground')
const bleedOf = (doc: ProjectDoc) => boxIssues(doc).filter((i) => i.code === 'short-of-bleed')

describe('en yta som togs över före #1459 (#1463)', () => {
  it('har inget utfallsfel när dokumentet läses', () => {
    const old = game([OLD_GROUND, TITLE()])
    expect(bleedOf(old)).toHaveLength(1)
    const read = liftDoc(old)
    expect(bleedOf(read)).toEqual([])
    expect(boxIssues(read).filter((i) => i.severity === 'error')).toEqual([])
    expect(ground(read)).toEqual({ ...OLD_GROUND, x: -3, y: -3, w: 71, h: 96 })
  })

  it('lyfts till den grund en ny yta får, och ger samma tryckfil', async () => {
    const neutral = boxFaceOf(game(), 'front').template.base
    const taken = (base: Element[]) => liftDoc(game(base.map((e) => (e.id === 'ground' ? { ...e, fill: '#2b3a4a' } : e))))
    const now = taken(neutral)
    const before = taken([OLD_GROUND, TITLE()])
    expect(before.box).toEqual(now.box)
    const hashes = async (doc: ProjectDoc) => (await boxPrintOf(doc, deckFromProject(doc), 0)).jobs.map((j) => [j.file, j.job.hash])
    expect(await hashes(before)).toEqual(await hashes(now))
  })

  it('skriver inte om dokumentet den läser', () => {
    const old = game([OLD_GROUND])
    const copy = structuredClone(old)
    liftDoc(old)
    expect(old).toEqual(copy)
  })

  it('prövar en grund designern har krympt, flyttat eller ändrat som förut', () => {
    for (const touched of [
      { ...OLD_GROUND, w: 60 },
      { ...OLD_GROUND, h: 80 },
      { ...OLD_GROUND, x: 0.5, w: 64.5 },
      { ...OLD_GROUND, stroke: '#000000', strokeMm: 0.5 },
      { ...OLD_GROUND, id: 'egen' },
    ] satisfies Element[]) {
      const read = liftDoc(game([touched]))
      expect(read.box?.faces?.front?.base[0], JSON.stringify(touched)).toEqual(touched)
      expect(bleedOf(read), JSON.stringify(touched)).toHaveLength(1)
    }
  })

  it('lyfter bara den första grunden på ytan, där den neutrala ytan lade den', () => {
    const read = liftDoc(game([{ ...OLD_GROUND, id: 'ruta', w: 10, h: 10 }, OLD_GROUND]))
    expect(read.box?.faces?.front?.base[1]).toEqual(OLD_GROUND)
  })

  it('är fortfarande ett giltigt dokument', () => {
    expect(() => ProjectDoc.parse(liftDoc(game([OLD_GROUND, TITLE()])))).not.toThrow()
  })
})
