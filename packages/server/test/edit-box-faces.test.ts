import { describe, expect, it } from 'vitest'
import type { Element } from '@byd/template'
import { applyEdit, type EditIntent } from '../src/edits.js'
import { boxFaceOf, boxOf } from '../src/box.js'
import { openingSetup } from '../src/recipe.js'
import { changeOf, revertOf } from '../src/undo.js'
import { MemoryProjectStore } from '../src/index.js'
import { ProjectActor } from '../src/project-actor.js'
import { ProjectDoc } from '../src/projects.js'

// Fliken «Låda» (#1413): en yta på lådan redigeras med samma lager som ett kort i Mall, och genom
// samma redigeringar. `on: 'box'` säger att ytan som nämns är lådans och inte kortets; allt annat i
// redigeringen är kortets egen form. Det är så «samma mallsystem» blir sant i loggen också.
const front = (fill = '#25583b'): Element => ({ kind: 'shape', id: 'bakgrund', x: 0, y: 0, w: 63, h: 88, shape: 'rect', fill })
const game = (): ProjectDoc => ({
  name: 'Skogens råd',
  template: { faces: { front: { base: [], variants: {} }, back: { base: [front('#1d4a31')], variants: {} } } },
  rows: [{ id: 'kort-1', fields: { title: 'Ek', antal: 108 } }],
  icons: {},
  setup: openingSetup({ players: 2, counters: [] }),
})
const title: Element = { kind: 'text', id: 'titel', x: 6, y: 12, w: 53, h: 14, bind: { literal: 'Skogens råd' }, font: { family: 'Georgia', sizePt: 28 }, color: '#f3e7c9' }
const after = (doc: ProjectDoc, ...edits: EditIntent[]) => edits.reduce(applyEdit, doc)

describe('en yta på lådan redigeras som ett kort (#1413)', () => {
  it('får ett lager, och bara lådans yta ändras', () => {
    const doc = after(game(), { v: 'addElement', on: 'box', face: 'front', element: title })
    expect(doc.box).toEqual({ type: { id: 'box.tuck', version: 1 }, faces: { front: { base: [title], variants: {} } } })
    expect(doc.template).toEqual(game().template)
  })

  it('ändrar, flyttar och tar bort lager med kortets egna redigeringar', () => {
    const square: Element = { kind: 'shape', id: 'ruta', x: 0, y: 0, w: 10, h: 10, shape: 'rect' }
    const doc = after(
      game(),
      { v: 'addElement', on: 'box', face: 'lid', element: title },
      { v: 'addElement', on: 'box', face: 'lid', element: square },
      { v: 'patchElement', on: 'box', face: 'lid', id: 'titel', patch: { x: 4 } },
      { v: 'moveElement', on: 'box', face: 'lid', id: 'ruta', to: 0 },
    )
    expect(doc.box?.faces?.lid?.base.map((e) => e.id)).toEqual(['ruta', 'titel'])
    expect(doc.box?.faces?.lid?.base[1]).toMatchObject({ id: 'titel', x: 4 })
    const gone = applyEdit(doc, { v: 'removeElement', on: 'box', face: 'lid', id: 'ruta' })
    expect(gone.box?.faces?.lid?.base.map((e) => e.id)).toEqual(['titel'])
  })

  it('lägger en hel yta på en gång, som kortets baksidor', () => {
    const doc = applyEdit(game(), { v: 'replaceFace', on: 'box', face: 'back', base: [title] })
    expect(doc.box?.faces?.back).toEqual({ base: [title], variants: {} })
  })

  it('låter låsen och luften stå när en yta ritas', () => {
    const doc = after(game(), { v: 'lockBox', side: 'depth', mm: 34.5 }, { v: 'addElement', on: 'box', face: 'front', element: title })
    expect(doc.box).toMatchObject({ locked: { depth: 34.5 }, faces: { front: { base: [title] } } })
  })

  it('vägrar en yta lådan inte har, en grupp, och ett lager ytan inte har', () => {
    expect(() => applyEdit(game(), { v: 'addElement', on: 'box', face: 'spine', element: title })).toThrow(/spine/)
    expect(() => applyEdit(game(), { v: 'addElement', on: 'box', face: 'front', element: title, group: 'Djur' })).toThrow(/group/)
    expect(() => applyEdit(game(), { v: 'patchElement', on: 'box', face: 'front', id: 'titel', patch: { x: 1 } })).toThrow(/titel/)
  })

  it('läser lådans yta som kortets: ett lager som läggs två gånger vägras', () => {
    const doc = applyEdit(game(), { v: 'addElement', on: 'box', face: 'front', element: title })
    expect(() => applyEdit(doc, { v: 'addElement', on: 'box', face: 'front', element: title })).toThrow(/already/)
  })
})

describe('en yta som inte är ritad (#1406, beslut 5)', () => {
  it('är neutral: lekens färg och spelets namn, och inget mer', () => {
    const face = boxFaceOf(game(), 'front')
    expect(face.drawn).toBe(false)
    const shapes = face.template.base.filter((e) => e.kind === 'shape')
    const texts = face.template.base.filter((e) => e.kind === 'text')
    expect(shapes).toHaveLength(1)
    expect(shapes[0]).toMatchObject({ x: 0, y: 0, w: 65, h: 90, fill: '#1d4a31' })
    expect(texts).toHaveLength(1)
    expect(texts[0]).toMatchObject({ bind: { literal: 'Skogens råd' } })
  })

  it('bär namnet på framsidan, locket och sidorna, och bara färgen på baksidan och botten', () => {
    const named = (face: 'front' | 'back' | 'left' | 'right' | 'lid' | 'bottom') => boxFaceOf(game(), face).template.base.some((e) => e.kind === 'text')
    expect(['front', 'lid', 'left', 'right'].map((f) => named(f as 'front'))).toEqual([true, true, true, true])
    expect(named('back')).toBe(false)
    expect(named('bottom')).toBe(false)
  })

  it('står i ytans eget mått, som följer leken', () => {
    const side = boxFaceOf(game(), 'left').template.base.find((e) => e.kind === 'shape')
    expect(side).toMatchObject({ w: boxOf(game()).size.depth, h: 90 })
  })

  it('har en färg också för en lek utan bakgrund', () => {
    const plain = { ...game(), template: { faces: { front: { base: [], variants: {} } } } }
    const shape = boxFaceOf(plain, 'front').template.base.find((e) => e.kind === 'shape')
    expect(shape && 'fill' in shape && typeof shape.fill).toBe('string')
  })

  it('är designerns egen yta så snart den är ritad', () => {
    const doc = applyEdit(game(), { v: 'addElement', on: 'box', face: 'front', element: title })
    expect(boxFaceOf(doc, 'front')).toEqual({ drawn: true, template: { base: [title], variants: {} } })
  })
})

describe('lådans ytor i loggen (#1413, B4, D3)', () => {
  it('tas tillbaka ett steg i taget, utan att röra ett lås en annan satte', () => {
    const before = applyEdit(game(), { v: 'addElement', on: 'box', face: 'front', element: title })
    const moved = applyEdit(before, { v: 'patchElement', on: 'box', face: 'front', id: 'titel', patch: { y: 20 } })
    const now = applyEdit(moved, { v: 'lockBox', side: 'width', mm: 65 })
    const step = revertOf(changeOf(before, moved), now)
    if (!step.ok || !step.edit) throw new Error(`refused: ${JSON.stringify(step)}`)
    const back = applyEdit(now, step.edit)
    expect(back.box?.faces?.front?.base[0]).toMatchObject({ y: 12 })
    expect(back.box?.locked).toEqual({ width: 65 })
  })

  it('tar tillbaka den första ytan helt, så att lådan är neutral igen', () => {
    const drawn = applyEdit(game(), { v: 'addElement', on: 'box', face: 'front', element: title })
    const step = revertOf(changeOf(game(), drawn), drawn)
    if (!step.ok || !step.edit) throw new Error(`refused: ${JSON.stringify(step)}`)
    const back = applyEdit(drawn, step.edit)
    expect(back).not.toHaveProperty('box')
    expect(boxFaceOf(back, 'front').drawn).toBe(false)
  })

  it('spelas upp identiskt ur loggen och sparas som en version', async () => {
    const store = new MemoryProjectStore()
    await store.create('p1', game(), 'ada')
    const first = (await ProjectActor.load('p1', store))!
    await first.edit({ v: 'addElement', on: 'box', face: 'front', element: title }, 'ada')
    await first.edit({ v: 'patchElement', on: 'box', face: 'front', id: 'titel', patch: { x: 8 } }, 'ada')
    const again = (await ProjectActor.load('p1', store))!
    expect(again.doc).toEqual(first.doc)
    await first.save()
    const saved = await store.load('p1')
    expect(saved?.box?.faces?.front?.base[0]).toMatchObject({ id: 'titel', x: 8 })
    expect(() => ProjectDoc.parse(saved)).not.toThrow()
  })
})
