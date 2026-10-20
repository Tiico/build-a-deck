import { CARD_STANDARD_63x88 } from '@byd/engine'
import { DEFAULT_LINE_HEIGHT, PT_TO_MM, placedElements, placedTexts, type FaceTemplate, type Row } from '@byd/template'
import { readingWidth } from '../legibility.js'

// The theme proof's crop (#741, beställarens val A 2026-10-04). A tile in Speltema shows the
// game's first card in the theme, but four whole cards in a row draw the body text at ~8 px, and
// the body family is half of what a theme is chosen for (L57). So a tile draws a crop of the card:
// from its top — the title band — down to the first lines of its prose, at the size where that
// prose reaches K26's floor, centred on the prose box. The box is read off the template (L43), so
// a template whose text stands elsewhere is cropped on its own text and not on the sample's
// millimetres.

// What is shown of the prose: three whole lines, and the next one fading out.
export const CROP_LINES = 3
// The least air beside the prose box when the tile is too narrow for the reading size.
export const CROP_AIR_PX = 8

const PX_PER_MM = 96 / 25.4
const CARD_MM = CARD_STANDARD_63x88.physical.widthMm

// `color` is the ink the prose is printed in, which the cut's line is drawn in (#830).
export type ProseBox = { element: string; x: number; y: number; w: number; h: number; sizePt: number; lineHeight: number; color: string }

// The first prose text the row prints (L43: the column's own answer to whether it is prose), with
// words in it — an empty box is no text to judge a family by.
export function proseBoxOf(face: FaceTemplate, row: Row, prose: readonly string[]): ProseBox | null {
  const wanted = new Set(prose)
  for (const { el, x, y } of placedTexts(face, row)) {
    if (!('field' in el.bind) || !wanted.has(el.bind.field)) continue
    const value = row[el.bind.field]
    if (value === null || value === undefined || String(value).trim() === '') continue
    return { element: el.id, x, y, w: el.w, h: el.h, sizePt: el.font.sizePt, lineHeight: el.font.lineHeight ?? DEFAULT_LINE_HEIGHT, color: el.color }
  }
  return null
}

// What a card that prints no prose is cropped on: its top, its whole width as the box, and the
// first lines a body text of the sample's grade would take.
export const CARD_TOP: ProseBox = { element: '', x: 0, y: 0, w: CARD_MM, h: CARD_STANDARD_63x88.physical.heightMm, sizePt: 8.5, lineHeight: DEFAULT_LINE_HEIGHT, color: '#000' }

// The cut (#830, beställarens val C 2026-10-04): the paper between the title band and the prose is
// taken away when there is enough of it, and a thin dashed line stands where it was. Each piece
// keeps this much air beside what it shows, and a gap smaller than `CUT_MIN_MM` is no gap.
export const CUT_AIR_MM = 1.5
export const CUT_MIN_MM = 3

// Where the title band ends: under the lowest thing the row draws above the prose, plus the air —
// a text in its own first line (a title is written on one), anything else in its whole height.
// What lies behind the prose box, a frame or the card's ground, is the paper and not the band; a
// text the row leaves empty draws nothing. Never below the prose box's top, so a picture that
// reaches down beside the prose holds the band there and nothing is cut.
export function bandEndOf(face: FaceTemplate, row: Row, box: ProseBox): number {
  let lowest = 0
  for (const { el, x, y } of placedElements(face, row)) {
    if (el.id === box.element || y >= box.y) continue
    if (x <= box.x && y <= box.y && x + el.w >= box.x + box.w && y + el.h >= box.y + box.h) continue
    if (el.kind !== 'shape' && 'field' in el.bind) {
      const value = row[el.bind.field]
      if (value === null || value === undefined || String(value).trim() === '') continue
    }
    const atTop = el.kind === 'text' && (el.valign === undefined || el.valign === 'top')
    const height = atTop ? Math.min(el.h, el.font.sizePt * PT_TO_MM * (el.font.lineHeight ?? DEFAULT_LINE_HEIGHT)) : el.h
    lowest = Math.max(lowest, y + height)
  }
  return Math.min(box.y, lowest + CUT_AIR_MM)
}

// A stretch of the card the crop shows: `from` px below the card's top, `height` px of it.
export type Piece = { from: number; height: number }

// `pieces` are shown one under the other on one paper; `cut` is where the dashed line stands, in
// px from the crop's top, or null when nothing was cut. `fade` is the height the last line fades
// over, 0 when nothing fades.
export type Crop = { zoom: number; width: number; left: number; height: number; fade: number; pieces: Piece[]; cut: number | null }

// What is known of the card as it was rendered: how many lines the prose is set in (counted from
// the rendered text, E6) and where the title band ends (`bandEndOf`). Without the lines the crop
// shows three and fades a fourth, as if there were more; without the band it is not cut.
export type Shown = { lines?: number | undefined; bandEnd?: number | undefined }

// How the card is drawn in a tile `roomPx` wide: the zoom at which prose fitted to `sizePt` reaches
// the desk's floor (K26's `readingWidth`), unless the prose box and its air do not fit the tile at
// that size, and then as large as they do. The crop is the tile's width or the card's, whichever
// is less, so nothing past the card's edge is shown. `left` puts the box's middle on the crop's
// as far as the card still covers the crop. A tile not yet measured (0) gets the reading size.
//
// The prose's piece reaches to the end of its lines, three at most, with the air under the last;
// when there are more, to the end of the fourth, which fades (`fade`). It starts at the card's top,
// unless the gap between the band and the prose is `CUT_MIN_MM` or more: then the band is a piece
// of its own and the prose's starts `CUT_AIR_MM` above its box.
export function cropOf(box: ProseBox, sizePt: number, roomPx: number, shown: Shown = {}): Crop {
  const reading = readingWidth(0, sizePt, 'desk') / (CARD_MM * PX_PER_MM)
  const fits = roomPx > 0 ? (roomPx - 2 * CROP_AIR_PX) / (box.w * PX_PER_MM) : Infinity
  const zoom = Math.max(0, Math.min(reading, fits))
  const k = PX_PER_MM * zoom
  const card = CARD_MM * k
  const width = roomPx > 0 ? Math.min(roomPx, card) : card
  const centred = width / 2 - (box.x + box.w / 2) * k
  const line = sizePt * PT_TO_MM * box.lineHeight
  const counted = shown.lines !== undefined && shown.lines > 0 ? shown.lines : undefined
  const more = counted === undefined || counted > CROP_LINES
  const end = more ? box.y + (CROP_LINES + 1) * line : box.y + counted * line + 2 * CUT_AIR_MM
  const bandEnd = shown.bandEnd ?? 0
  const bodyStart = Math.max(bandEnd, box.y - CUT_AIR_MM)
  const cuts = shown.bandEnd !== undefined && bodyStart - bandEnd >= CUT_MIN_MM
  const pieces = cuts ? [{ from: 0, height: bandEnd * k }, { from: bodyStart * k, height: (end - bodyStart) * k }] : [{ from: 0, height: end * k }]
  return {
    zoom,
    width,
    left: Math.min(0, Math.max(width - card, centred)),
    height: pieces.reduce((sum, p) => sum + p.height, 0),
    fade: more ? line * k : 0,
    pieces,
    cut: cuts ? bandEnd * k : null,
  }
}

// How many lines a rendered text is set in: the fragments of its words and its inline pictures, a
// run that starts within the upper half of the line before it standing on that line (an icon set a
// little lower is not a new line). Not the range's own rects, which hold each paragraph's whole
// box as well. Zero where nothing is laid out.
export function linesIn(el: Element): number {
  const doc = el.ownerDocument
  const found: DOMRect[] = []
  const walk = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  for (let node = walk.nextNode(); node; node = walk.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) {
      const range = doc.createRange()
      range.selectNodeContents(node)
      found.push(...range.getClientRects())
    } else if ((node as Element).localName === 'img' || (node as Element).localName === 'svg') found.push(...(node as Element).getClientRects())
  }
  const rects = found.filter((r) => r.width > 0 && r.height > 0).sort((a, b) => a.top - b.top)
  let lines = 0
  let top = -Infinity
  let bottom = -Infinity
  for (const r of rects) {
    if (r.top < top + (bottom - top) / 2) {
      bottom = Math.max(bottom, r.bottom)
      continue
    }
    lines++
    top = r.top
    bottom = r.bottom
  }
  return lines
}
