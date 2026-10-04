import { CARD_STANDARD_63x88 } from '@byd/engine'
import { DEFAULT_LINE_HEIGHT, PT_TO_MM, placedTexts, type FaceTemplate, type Row } from '@byd/template'
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

export type ProseBox = { element: string; x: number; y: number; w: number; h: number; sizePt: number; lineHeight: number }

// The first prose text the row prints (L43: the column's own answer to whether it is prose), with
// words in it — an empty box is no text to judge a family by.
export function proseBoxOf(face: FaceTemplate, row: Row, prose: readonly string[]): ProseBox | null {
  const wanted = new Set(prose)
  for (const { el, x, y } of placedTexts(face, row)) {
    if (!('field' in el.bind) || !wanted.has(el.bind.field)) continue
    const value = row[el.bind.field]
    if (value === null || value === undefined || String(value).trim() === '') continue
    return { element: el.id, x, y, w: el.w, h: el.h, sizePt: el.font.sizePt, lineHeight: el.font.lineHeight ?? DEFAULT_LINE_HEIGHT }
  }
  return null
}

// What a card that prints no prose is cropped on: its top, its whole width as the box, and the
// first lines a body text of the sample's grade would take.
export const CARD_TOP: ProseBox = { element: '', x: 0, y: 0, w: CARD_MM, h: CARD_STANDARD_63x88.physical.heightMm, sizePt: 8.5, lineHeight: DEFAULT_LINE_HEIGHT }

export type Crop = { zoom: number; width: number; left: number; height: number; fade: number }

// How the card is drawn in a tile `roomPx` wide: the zoom at which prose fitted to `sizePt` reaches
// the desk's floor (K26's `readingWidth`), unless the prose box and its air do not fit the tile at
// that size, and then as large as they do. The crop is the tile's width or the card's, whichever
// is less, so nothing past the card's edge is shown. `left` puts the box's middle on the crop's
// as far as the card still covers the crop; `height` reaches from the card's top to the end of
// the shown lines plus the one that fades (`fade`). A tile not yet measured (0) gets the reading
// size.
export function cropOf(box: ProseBox, sizePt: number, roomPx: number): Crop {
  const reading = readingWidth(0, sizePt, 'desk') / (CARD_MM * PX_PER_MM)
  const fits = roomPx > 0 ? (roomPx - 2 * CROP_AIR_PX) / (box.w * PX_PER_MM) : Infinity
  const zoom = Math.max(0, Math.min(reading, fits))
  const k = PX_PER_MM * zoom
  const card = CARD_MM * k
  const width = roomPx > 0 ? Math.min(roomPx, card) : card
  const centred = width / 2 - (box.x + box.w / 2) * k
  const line = sizePt * PT_TO_MM * box.lineHeight * k
  return { zoom, width, left: Math.min(0, Math.max(width - card, centred)), height: box.y * k + (CROP_LINES + 1) * line, fade: line }
}
