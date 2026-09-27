import { describe, expect, it } from 'vitest'
import { CARD_STANDARD_63x88 } from '@byd/engine'
import { keptOnCard } from '../src/editor/canvas.js'

// Where an element may be put (#478, beslut 2026-09-27, variant A): its middle stays on the card.
// It may hang half its width over any edge — a decoration cut by the knife is a design — but never
// more, so it can never be dragged, nudged or typed somewhere nobody can reach it again.
describe('an element s middle stays on the card (#478)', () => {
  const card = CARD_STANDARD_63x88.physical
  const box = { w: 20, h: 10 }

  it('leaves a place on the card alone', () => {
    expect(keptOnCard(box, { x: 5, y: 5 }, card)).toEqual({ at: { x: 5, y: 5 }, held: false })
  })

  it('lets it hang half over an edge, and no further', () => {
    expect(keptOnCard(box, { x: -10, y: 5 }, card)).toEqual({ at: { x: -10, y: 5 }, held: false })
    expect(keptOnCard(box, { x: -48.5, y: 5 }, card)).toEqual({ at: { x: -10, y: 5 }, held: true })
    expect(keptOnCard(box, { x: 70, y: 95 }, card)).toEqual({ at: { x: card.widthMm - 10, y: card.heightMm - 5 }, held: true })
  })
})
