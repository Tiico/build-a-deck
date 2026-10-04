import { describe, expect, it } from 'vitest'
import { PT_TO_MM, type FaceTemplate } from '@byd/template'
import { CROP_AIR_PX, CROP_LINES, cropOf, proseBoxOf } from '../src/editor/theme-crop.js'

// The theme proof's crop (#741, beställarens val A 2026-10-04): the card from its top down to the
// first lines of its prose, at a size where that prose reaches K26's floor, centred on the prose
// box (L43) — read off the template, so any template is cropped on its own text.
const PX_PER_MM = 96 / 25.4
const font = (sizePt: number, lineHeight?: number) => ({ family: 'Inter', sizePt, ...(lineHeight ? { lineHeight } : {}) })
const text = (id: string, field: string, x: number, y: number, w: number, sizePt: number) => ({ kind: 'text' as const, id, x, y, w, h: 40, bind: { field }, font: font(sizePt), color: '#111' })
const face = (base: FaceTemplate['base']): FaceTemplate => ({ base, variants: {} })

describe('proseBoxOf (#741)', () => {
  it('is the first prose text the row prints, not the title nor an empty one', () => {
    const f = face([text('title', 'title', 5, 5, 53, 12), text('flav', 'flavour', 5, 15, 53, 8), text('rules', 'body', 5, 30, 40, 9), text('more', 'extra', 5, 60, 53, 9)])
    expect(proseBoxOf(f, { title: 'Drake', flavour: 'Doft', body: 'Gör något.', extra: 'Mer' }, ['body', 'extra'])).toMatchObject({ element: 'rules', x: 5, y: 30, w: 40, sizePt: 9, lineHeight: 1.25 })
    expect(proseBoxOf(f, { title: 'Drake', body: '', extra: 'Mer' }, ['body', 'extra'])?.element).toBe('more')
  })

  it('is nothing when the card prints no prose', () => {
    expect(proseBoxOf(face([text('title', 'title', 5, 5, 53, 12)]), { title: 'Drake' }, ['body'])).toBeNull()
  })
})

describe('cropOf (#741)', () => {
  const box = { element: 'rules', x: 5, y: 19, w: 53, h: 55, sizePt: 8.5, lineHeight: 1.25 }
  const bodyPx = (zoom: number, sizePt = box.sizePt) => sizePt * PT_TO_MM * PX_PER_MM * zoom

  it('sets the prose at 12 px when the tile has the room, centred on the prose box', () => {
    const crop = cropOf(box, box.sizePt, 400)
    expect(bodyPx(crop.zoom)).toBeCloseTo(12, 1)
    const centre = crop.left + (box.x + box.w / 2) * PX_PER_MM * crop.zoom
    expect(centre).toBeCloseTo(crop.width / 2, 6)
  })

  it('shrinks until the prose box keeps its air at each side when the tile is narrower', () => {
    const crop = cropOf(box, box.sizePt, 210)
    expect(box.w * PX_PER_MM * crop.zoom).toBeCloseTo(210 - 2 * CROP_AIR_PX, 6)
    expect(bodyPx(crop.zoom)).toBeLessThan(12)
  })

  it('reads the size the prose was fitted to, so a smaller text is drawn larger', () => {
    expect(bodyPx(cropOf(box, 7, 400).zoom, 7)).toBeCloseTo(12, 1)
  })

  it('reaches from the card’s top to the end of the last line it shows, the next one fading', () => {
    const crop = cropOf(box, box.sizePt, 400)
    const line = box.sizePt * PT_TO_MM * box.lineHeight * PX_PER_MM * crop.zoom
    expect(crop.height).toBeCloseTo(box.y * PX_PER_MM * crop.zoom + (CROP_LINES + 1) * line, 6)
    expect(crop.fade).toBeCloseTo(line, 6)
  })

  it('is never wider than the card, so the tile never shows past the card’s edge', () => {
    const crop = cropOf(box, box.sizePt, 400)
    const card = 63 * PX_PER_MM * crop.zoom
    expect(crop.width).toBeCloseTo(card, 6)
    expect(crop.left).toBeLessThanOrEqual(0)
    expect(crop.left + card).toBeGreaterThanOrEqual(crop.width - 1e-6)
    // An off-centre box in a narrow tile is still centred, as long as the card covers the crop.
    const narrow = cropOf({ ...box, x: 3, w: 40 }, box.sizePt, 150)
    expect(narrow.width).toBe(150)
    expect(narrow.left + (3 + 20) * PX_PER_MM * narrow.zoom).toBeCloseTo(75, 6)
  })

  it('draws at the reading size when the tile has not been measured yet', () => {
    expect(bodyPx(cropOf(box, box.sizePt, 0).zoom)).toBeCloseTo(12, 1)
  })
})
