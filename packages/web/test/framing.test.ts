import { describe, expect, it } from 'vitest'
import type { ProjectDoc } from '@byd/server'
import type { Motif } from '@byd/template'
import { measuredSpots, objections, zoomThatFits } from '../src/editor/framing.js'
import { projectDoc } from './project-doc.js'

// The deck's measure as the editor has to talk about it (E1): which pictures it governs, and
// which files cannot answer it. The second is the point — no rule can conjure pixels that were
// never drawn, and a surface that hides that ships a silver edge on a printed card.
const withArt = (frame?: { fill: number; anchor: 'centre' | 'foot' }): ProjectDoc => {
  const base = projectDoc()
  return {
    ...base,
    template: {
      faces: {
        ...base.template.faces,
        front: {
          base: [...base.template.faces['front']!.base, { kind: 'image', id: 'art', x: 5, y: 4, w: 40, h: 30, bind: { field: 'art' }, ...(frame ? { frame } : {}) }],
          variants: {},
        },
      },
    },
    rows: base.rows.map((r) => ({ ...r, fields: { ...r.fields, art: `${r.id}.png` } })),
  }
}

// A file with air to spare, and one delivered cropped to its own drawing.
const roomy: Motif = { w: 200, h: 100, trim: { left: 60, top: 10, right: 60, bottom: 10 } }
const cropped: Motif = { w: 160, h: 120, trim: { left: 0, top: 0, right: 0, bottom: 0 } }

describe('the pictures the measure governs', () => {
  it('finds each image element the deck draws, with the frame’s own shape', () => {
    expect(measuredSpots(withArt({ fill: 0.8, anchor: 'centre' }))).toEqual([
      { face: 'front', id: 'art', field: 'art', ratio: 40 / 30, frame: { fill: 0.8, anchor: 'centre' } },
    ])
  })

  it('finds one that has no measure yet, because that is where a measure is given', () => {
    expect(measuredSpots(withArt())).toEqual([{ face: 'front', id: 'art', field: 'art', ratio: 40 / 30, frame: undefined }])
  })
})

describe('the files that cannot answer the measure', () => {
  const doc = withArt({ fill: 0.8, anchor: 'centre' })
  const motifs = (of: Record<string, Motif>) => of

  it('says nothing while every file has air to give', () => {
    expect(objections(doc, motifs({ 'dragon.png': roomy, 'knight.png': roomy, 'wizard.png': roomy }))).toEqual([])
  })

  it('names the card, the column and the fix when a file has none', () => {
    const found = objections(doc, motifs({ 'dragon.png': cropped, 'knight.png': roomy, 'wizard.png': roomy }))

    // The file is its own drawing, so at four fifths the window would be a quarter larger than
    // the file. The card draws its motif at the whole of the frame instead, and the fix says so.
    expect(found).toEqual([{ cardRef: 'dragon', field: 'art', code: 'short', drawnAt: 1, to: { zoom: 1.25 } }])
    // Zooming in makes the window smaller, so the answer is larger than one and not smaller.
    expect(zoomThatFits(cropped, { fill: 0.8, anchor: 'centre' }, 40 / 30)).toBe(1.25)
  })

  it('says nothing about a card whose picture nobody has measured yet', () => {
    // An unmeasured file is fitted as a file, so it is not failing a measure it was never given.
    expect(objections(doc, motifs({ 'knight.png': roomy }))).toEqual([])
  })

  it('says nothing at all while the template asks for no measure', () => {
    expect(objections(withArt(), motifs({ 'dragon.png': cropped }))).toEqual([])
  })

  it('counts a card that has already been put right as put right', () => {
    const fixed: ProjectDoc = { ...doc, framing: { 'dragon/art': { zoom: zoomThatFits(cropped, { fill: 0.8, anchor: 'centre' }, 40 / 30) } } }

    expect(objections(fixed, motifs({ 'dragon.png': cropped }))).toEqual([])
  })
})
