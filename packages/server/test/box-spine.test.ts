import { describe, expect, it } from 'vitest'
import { boxFaceSize } from '@byd/engine'
import type { Element } from '@byd/template'
import { applyEdit } from '../src/edits.js'
import { boxFaceOf, boxOf } from '../src/box.js'
import { openingSetup } from '../src/recipe.js'
import { ProjectDoc } from '../src/projects.js'

// Namnet längs ryggen (#1431). En riktig tuckbox bär spelets namn längs sina smala sidor, vridet en
// kvarts varv, så att det går att läsa i en hylla. Den neutrala lådans sidor gör likadant, med
// bokstävernas överkant mot framsidan på båda: när lådan ligger med framsidan upp läses namnet från
// vilken sida man än står vid.
const game = (rows = 108): ProjectDoc => ({
  name: 'Skogens råd',
  template: { faces: { front: { base: [], variants: {} } } },
  rows: [{ id: 'kort-1', fields: { title: 'Ek', antal: rows } }],
  icons: {},
  setup: openingSetup({ players: 2, counters: [] }),
})
const nameOn = (doc: ProjectDoc, face: 'left' | 'right' | 'front' | 'lid') => {
  const text = boxFaceOf(doc, face).template.base.find((e) => e.kind === 'text')
  if (text?.kind !== 'text') throw new Error(`no name on ${face}`)
  return text
}

describe('den neutrala lådans sidor bär namnet längs ryggen (#1431)', () => {
  it('vrider namnet ett kvarts varv, med överkanten mot framsidan', () => {
    // Nätet läser vänster sida, framsida, höger sida: framsidan står till höger om den vänstra sidan
    // och till vänster om den högra.
    expect(nameOn(game(), 'left').rotationDeg).toBe(90)
    expect(nameOn(game(), 'right').rotationDeg).toBe(-90)
  })

  it('låter namnet löpa längs hela ryggen och inte tvärs över den', () => {
    for (const face of ['left', 'right'] as const) {
      const text = nameOn(game(), face)
      const { widthMm, heightMm } = boxFaceSize(face, boxOf(game()).size)
      // Lådan står upprätt, så ryggen är ytans höjd: namnet får nästan hela.
      expect(text.h).toBeGreaterThan(heightMm * 0.85)
      expect(text.y + text.h).toBeLessThanOrEqual(heightMm)
      expect(text.x + text.w).toBeLessThanOrEqual(widthMm)
      expect(text.bind).toEqual({ literal: 'Skogens råd' })
      expect(text.fit).toBe('shrink')
    }
  })

  it('tar bokstävernas höjd ur ryggens bredd, så att en tjock lek ger ett större namn', () => {
    const thick = nameOn(game(120), 'left').font.sizePt
    const thin = nameOn(game(40), 'left').font.sizePt
    expect(thick).toBeGreaterThan(thin)
    // Större än de 14 pt namnet stod i vågrätt på en lek av 108 kort.
    expect(nameOn(game(), 'left').font.sizePt).toBeGreaterThan(14)
  })

  it('låter framsidan och locket stå upprätt som förut', () => {
    expect(nameOn(game(), 'front').rotationDeg).toBeUndefined()
    expect(nameOn(game(), 'lid').rotationDeg).toBeUndefined()
  })
})

describe('en vriden text i en ritad yta (#1431)', () => {
  it('bär sin vridning genom redigeringen och dokumentet, på lådan som på kortet', () => {
    const spine: Element = { kind: 'text', id: 'rygg', x: 3, y: 3, w: 28, h: 84, bind: { literal: 'Skogens råd' }, font: { family: 'Georgia', sizePt: 20 }, color: '#f3e7c9' }
    const drawn = applyEdit(game(), { v: 'addElement', on: 'box', face: 'left', element: spine })
    const turned = applyEdit(drawn, { v: 'patchElement', on: 'box', face: 'left', id: 'rygg', patch: { rotationDeg: -90 } })
    expect(turned.box?.faces?.left?.base[0]).toMatchObject({ id: 'rygg', rotationDeg: -90 })
    expect(ProjectDoc.parse(turned).box?.faces?.left?.base[0]).toMatchObject({ rotationDeg: -90 })
    const card = applyEdit(game(), { v: 'addElement', face: 'front', element: spine })
    expect(applyEdit(card, { v: 'patchElement', face: 'front', id: 'rygg', patch: { rotationDeg: 90 } }).template.faces['front']?.base[0]).toMatchObject({ rotationDeg: 90 })
  })
})
