import { describe, expect, it } from 'vitest'
import { CARD_STANDARD_63x88 } from '@byd/engine'
import { Template, compile, liftTemplate } from '../src/index.js'

// `anchor` is retired (#221, L22, beslut 3). Where in its window a drawing stands was the
// template answering a question about the picture, and a picture that carries its own crop has
// already answered it. What stays is `fill` — how large the drawing is drawn — because that is a
// question about the frame, and the frame is the template's.
//
// Retiring it is a schema change with a migration and not a silent divergence, so both halves are
// held here: a document written today cannot carry an anchor at all, and a document written
// before today is lifted out of the shape that could.

const art = { kind: 'image', id: 'art', x: 5, y: 4, w: 40, h: 30, bind: { field: 'art' } }
// A template exactly as it is stored in documents written before the retirement.
const stored = (anchor: 'centre' | 'foot') => ({ faces: { front: { base: [{ ...art, frame: { fill: 0.8, anchor } }], variants: {} } } })
const file = (box: { x: number; y: number; w: number; h: number }) => ({ w: 1000, h: 1000, trim: { left: box.x, top: box.y, right: 1000 - box.x - box.w, bottom: 1000 - box.y - box.h } })
// A drawing no wider than its frame, and one wider than it — the two cases a ground line told
// apart, because only a window held by its width has vertical air left over to place.
const TALL = file({ x: 300, y: 200, w: 200, h: 400 })
const WIDE = file({ x: 100, y: 400, w: 800, h: 300 })

const drawnFrom = (template: unknown, motif: { w: number; h: number; trim: Record<string, number> }) => {
  const face = Template.parse(liftTemplate(template)).faces['front']
  if (!face) throw new Error('no front')
  const css = compile({ type: CARD_STANDARD_63x88, face, row: { art: 'a.png' }, icons: {}, motifs: { 'a.png': motif as never } }).css
  return /\[data-element="art"\] \.byd-art\{([^}]*)\}/.exec(css)?.[1]
}

describe('a measure without an anchor (#221, beslut 3)', () => {
  it('refuses a template that still names one, rather than quietly dropping it', () => {
    expect(() => Template.parse(stored('centre'))).toThrow()
  })

  it('lifts a stored template out of the shape that carried one, keeping the measure', () => {
    const lifted = Template.parse(liftTemplate(stored('foot')))
    const el = lifted.faces['front']?.base[0]

    expect(el?.kind === 'image' && el.frame).toEqual({ fill: 0.8 })
  })

  it('leaves a template that never carried one exactly as it stands', () => {
    const plain = { faces: { front: { base: [{ ...art, frame: { fill: 0.5 } }], variants: {} } } }

    expect(liftTemplate(plain)).toEqual(plain)
  })

  // The proof that the migration is one: the numbers below were drawn by the code that still had
  // an anchor, out of these very files, and the lifted document draws them again.
  it('draws the card a centred measure drew, to the millimetre', () => {
    expect(drawnFrom(stored('centre'), TALL)).toBe('left:-4mm;top:-9mm;width:60mm;height:60mm;')
    expect(drawnFrom(stored('centre'), WIDE)).toBe('left:0mm;top:-7mm;width:40mm;height:40mm;')
  })

  it('draws the card a ground line drew wherever the drawing was not wider than its frame', () => {
    // A window held by its height has no air left over, so the ground line and the centre were
    // already the same placement. Every such card comes through the migration untouched.
    expect(drawnFrom(stored('foot'), TALL)).toBe('left:-4mm;top:-9mm;width:60mm;height:60mm;')
  })

  it('centres the one case a ground line did move, which is the departure the migration makes', () => {
    // A drawing wider than its frame left vertical air over, and the ground line put all of it
    // above the drawing instead of splitting it. That is what is retired: such a card is now
    // centred like every other, and the card that truly wants the old placement says so on its
    // own row, which is what the exception is for.
    expect(drawnFrom(stored('foot'), WIDE)).toBe(drawnFrom(stored('centre'), WIDE))
  })
})
