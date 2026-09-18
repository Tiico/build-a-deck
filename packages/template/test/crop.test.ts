import { describe, expect, it } from 'vitest'
import { CARD_STANDARD_63x88 } from '@byd/engine'
import { compile, croppedMotif, type FaceTemplate } from '../src/index.js'

// A picture's own crop, drawn (#222, L22, beslut 2). The designer says once which part of a file
// is the picture, and every card drawn from that file shows that part — through the one compiler,
// the same one the table's textures and the print PDF come out of.
const icons = {}
const art = { kind: 'image' as const, id: 'art', x: 5, y: 4, w: 40, h: 30, bind: { field: 'art' } }
// The file: twice as wide as it is tall, with no air around anything.
const file = { w: 200, h: 100, trim: { left: 0, top: 0, right: 0, bottom: 0 } }

// Where the picture's file lies inside the frame, in millimetres, read back off the CSS the
// compiler emitted rather than out of the numbers that went into it.
function fileBox(css: string) {
  const rule = /\[data-element="art"\] \.byd-art\{([^}]*)\}/.exec(css)?.[1] ?? ''
  const said = Object.fromEntries(rule.split(';').filter(Boolean).map((d) => d.split(':')))
  const mm = (prop: string) => Number(String(said[prop] ?? '').replace('mm', ''))
  return { left: mm('left'), top: mm('top'), w: mm('width'), h: mm('height') }
}

// And where the cropped window itself lands, which is what the card actually shows.
function windowBox(css: string, crop: { x: number; y: number; w: number; h: number }) {
  const box = fileBox(css)
  return { x: box.left + crop.x * box.w, y: box.top + crop.y * box.h, w: crop.w * box.w, h: crop.h * box.h }
}

describe('a picture cropped once, drawn on every card that uses it (#222)', () => {
  it('shows the window the designer cut, filling the frame, without the element asking for anything', () => {
    // The middle half of a wide file: a square window out of a 200 × 100 picture.
    const crop = { x: 0.25, y: 0, w: 0.5, h: 1 }
    const face: FaceTemplate = { base: [art], variants: {} }
    const css = compile({ type: CARD_STANDARD_63x88, face, row: { art: 'a.png' }, icons, motifs: { 'a.png': croppedMotif(file, crop) } }).css

    // A square window covering a 40 × 30 frame is 40 × 40: as wide as the frame, and taller, so
    // it fills the frame's width and hangs 5 mm over each of its horizontal edges, cropped there.
    expect(windowBox(css, crop)).toEqual({ x: 0, y: -5, w: 40, h: 40 })
  })

  // Beslut 3: how large the motif sits in its ram is the template's question and stays with the
  // template. A cropped picture still meets the deck's measure — the measure is simply applied to
  // what the designer said the picture is, instead of to the air a machine guessed at.
  it('still meets the deck’s measure, taken on the window rather than on the file', () => {
    const square = { w: 400, h: 400, trim: { left: 0, top: 0, right: 0, bottom: 0 } }
    const crop = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 }
    const face: FaceTemplate = { base: [{ ...art, frame: { fill: 0.8, anchor: 'centre' as const } }], variants: {} }
    const css = compile({ type: CARD_STANDARD_63x88, face, row: { art: 'a.png' }, icons, motifs: { 'a.png': croppedMotif(square, crop) } }).css

    // Eight tenths of a 30 mm frame is 24 mm, and the measure centres it: 8 mm in from either
    // side of the 40 mm frame and 3 mm down from its top.
    expect(windowBox(css, crop)).toEqual({ x: 8, y: 3, w: 24, h: 24 })
  })

  // The guard on everything already in the tool: a picture nobody has cropped is drawn by exactly
  // the code that drew it yesterday, measured air and all.
  it('leaves a picture nobody has cropped to its frame, measured air and all', () => {
    const measured = { w: 200, h: 100, trim: { left: 20, top: 10, right: 20, bottom: 10 } }
    const face: FaceTemplate = { base: [{ ...art, fit: 'contain' as const }], variants: {} }
    const css = compile({ type: CARD_STANDARD_63x88, face, row: { art: 'a.png' }, icons, motifs: { 'a.png': measured } }).css

    expect(css).toContain('[data-element="art"] .byd-art{width:100%;height:100%;object-fit:contain;}')
  })
})
