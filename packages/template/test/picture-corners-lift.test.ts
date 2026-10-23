import { describe, expect, it } from 'vitest'
import { Template, liftTemplate, type Element } from '../src/index.js'

// A game made before #1224 (#1238): the starter frames gave the picture square corners and its
// plate 2 mm, and that is what every such game holds, in its newest version and in every version
// before it. Versions are never rewritten (B4), so the corners are lifted on the way in, by the
// same door every stored template comes through, and only where the frame's own geometry still
// stands untouched. A picture the designer moved, resized or rounded is the designer's, and keeps
// what it has.

// The classic frame's front as #1224's parent commit wrote it, trimmed to what the lift reads and
// one element it must leave alone.
const classicBefore = (): Element[] => [
  { kind: 'shape', id: 'paper', name: 'Papper', x: -3, y: -3, w: 69, h: 94, shape: 'rect', fill: '#f4ead8' },
  { kind: 'shape', id: 'frame', name: 'Ram', x: 3, y: 3, w: 57, h: 82, shape: 'rect', stroke: '#3a2a1a', strokeMm: 0.6, radiusMm: 3 },
  { kind: 'shape', id: 'artbg', name: 'Bildplatta', x: 4, y: 4, w: 55, h: 36, shape: 'rect', fill: '#e6d9c2', radiusMm: 2 },
  { kind: 'image', id: 'art', name: 'Bild', x: 4, y: 4, w: 55, h: 36, bind: { field: 'Bild' }, fit: 'cover' },
  { kind: 'text', id: 'title', name: 'Titel', x: 5, y: 42, w: 53, h: 9, bind: { field: 'title' }, font: { family: 'Alegreya', sizePt: 13, weight: 800 }, color: '#1c1c1c' },
]
const darkBefore = (): Element[] => [
  { kind: 'shape', id: 'frame', name: 'Papper', x: -3, y: -3, w: 69, h: 94, shape: 'rect', fill: '#1b1d23' },
  { kind: 'shape', id: 'artbg', name: 'Bildplatta', x: 3, y: 3, w: 57, h: 48, shape: 'rect', fill: '#2a2d36', radiusMm: 2 },
  { kind: 'image', id: 'art', name: 'Bild', x: 3, y: 3, w: 57, h: 48, bind: { field: 'Bild' }, fit: 'cover' },
  { kind: 'shape', id: 'plate', name: 'Platta', x: 3, y: 53, w: 57, h: 32, shape: 'rect', fill: '#2a2d36', radiusMm: 2 },
]
const template = (front: Element[], variants: Record<string, unknown> = {}) => ({ faces: { front: { base: front, variants }, back: { base: [], variants: {} } } })
const lifted = (front: Element[], variants: Record<string, unknown> = {}) => Template.parse(liftTemplate(template(front, variants))).faces['front']!
const el = (base: Element[], id: string) => base.find((e) => 'id' in e && e.id === id) as Record<string, unknown>
const replace = (base: Element[], id: string, change: Record<string, unknown>): Element[] => base.map((e) => ('id' in e && e.id === id ? ({ ...e, ...change } as Element) : e))

describe('a starter frame from before #1224, read through the door (#1238)', () => {
  it('rounds the classic picture and its plate round the line’s inner corner, and leaves the rest as it was', () => {
    const face = lifted(classicBefore())
    expect(el(face.base, 'art')).toMatchObject({ radiusMm: 2.3 })
    expect(el(face.base, 'artbg')).toMatchObject({ radiusMm: 2.3 })
    const untouched = (base: Element[]) => base.filter((e) => !['art', 'artbg'].includes((e as { id: string }).id))
    expect(untouched(face.base)).toEqual(untouched(classicBefore()))
  })

  it('rounds the dark frame’s picture as its plate is', () => {
    const face = lifted(darkBefore())
    expect(el(face.base, 'art')).toMatchObject({ radiusMm: 2 })
    expect(el(face.base, 'artbg')).toMatchObject({ radiusMm: 2 })
    expect(el(face.base, 'plate')).toEqual(el(darkBefore(), 'plate'))
  })

  it('leaves a picture the designer moved, resized or rounded as the designer left it', () => {
    for (const [what, change] of [
      ['moved', { x: 5 }],
      ['resized', { h: 40 }],
      ['rounded', { radiusMm: 1 }],
      ['squared on purpose', { radiusMm: 0 }],
    ] as const) {
      const before = replace(classicBefore(), 'art', change)
      expect(lifted(before).base, what).toEqual(before)
    }
  })

  it('leaves the picture square where the frame round it is no longer the frame’s', () => {
    for (const [what, id, change] of [
      ['the plate moved', 'artbg', { y: 5 }],
      ['the plate rounded otherwise', 'artbg', { radiusMm: 4 }],
      ['the line rounded otherwise', 'frame', { radiusMm: 5 }],
      ['the line drawn thicker', 'frame', { strokeMm: 1 }],
      ['the line moved', 'frame', { x: 2 }],
    ] as const) {
      const before = replace(classicBefore(), id, change)
      expect(lifted(before).base, what).toEqual(before)
    }
    // Without its plate, a picture has nothing to follow.
    const bare = classicBefore().filter((e) => (e as { id: string }).id !== 'artbg')
    expect(lifted(bare).base).toEqual(bare)
  })

  it('rounds a variant’s copy of the untouched picture too, and nothing else of the variant', () => {
    const art = el(classicBefore(), 'art')
    const face = lifted(classicBefore(), { hjälte: { override: [{ ...art, bind: { field: 'Porträtt' } }, { ...art, id: 'other' }] } })
    const override = face.variants['hjälte']!.override!
    expect(el(override, 'art')).toMatchObject({ radiusMm: 2.3, bind: { field: 'Porträtt' } })
    expect(el(override, 'other')).not.toHaveProperty('radiusMm')
  })

  it('is the same read twice, and leaves a game made after #1224 exactly as it is', () => {
    const once = liftTemplate(template(classicBefore()))
    expect(liftTemplate(once)).toEqual(once)
    expect(liftTemplate(template(darkBefore()))).toEqual(liftTemplate(liftTemplate(template(darkBefore()))))
  })

  it('reads a whole stored project, which is what the server hands it', () => {
    const stored = { name: 'Västern', template: template(classicBefore()), rows: [] }
    const out = liftTemplate(stored)
    expect(el(out.template.faces.front.base, 'art')).toMatchObject({ radiusMm: 2.3 })
    expect(out.name).toBe('Västern')
    // The stored value itself is not touched: the door reads, it never writes back.
    expect(el(stored.template.faces.front.base, 'art')).not.toHaveProperty('radiusMm')
  })
})
