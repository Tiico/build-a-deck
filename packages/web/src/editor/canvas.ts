// The geometry of editing the template on the canvas (#18, L3). Millimetres are the template's
// own unit, so everything here speaks millimetres. Framework-free, like the table's `sorting`,
// `filtering` and `selection`, so the canvas itself stays a thin consumer of it.
import type { Element } from './types.js'

// The keyboard's two steps: a nudge for the eye, a step for the layout.
export const NUDGE_MM = 0.5
export const STEP_MM = 5

export type Point = { x: number; y: number }

// Where an arrow key takes a box, as the patch the template is given: one axis, so a nudge is
// the smallest change the document can record. Nothing if the key is not an arrow.
export function arrowMove(at: Point, key: string, shift: boolean): { x: number } | { y: number } | null {
  const step = shift ? STEP_MM : NUDGE_MM
  switch (key) {
    case 'ArrowLeft':
      return { x: round(at.x - step) }
    case 'ArrowRight':
      return { x: round(at.x + step) }
    case 'ArrowUp':
      return { y: round(at.y - step) }
    case 'ArrowDown':
      return { y: round(at.y + step) }
    default:
      return null
  }
}

// Millimetres are written into the document, so they are kept to a tenth: a long walk with the
// arrow keys must not leave 12.299999999999999 behind.
export function round(mm: number): number {
  return Math.round(mm * 10) / 10
}

export type ElementKind = 'text' | 'image' | 'icons' | 'shape'
export type CardSize = { widthMm: number; heightMm: number }

// The four kinds a designer can add from the canvas, in the order the tool rail reads them, with
// the Swedish name of each. The vocabulary is the template model's (L1) — no new kinds here.
export const TOOLS: readonly { kind: ElementKind; name: string; glyph: string }[] = [
  { kind: 'text', name: 'Text', glyph: 'T' },
  { kind: 'image', name: 'Bild', glyph: '▣' },
  { kind: 'icons', name: 'Ikonrad', glyph: '●●' },
  { kind: 'shape', name: 'Form', glyph: '◻' },
]

const SIZES: Record<ElementKind, { w: number; h: number }> = {
  text: { w: 40, h: 10 },
  image: { w: 40, h: 30 },
  icons: { w: 24, h: 6 },
  shape: { w: 30, h: 20 },
}

// A new element of a kind: in the middle of the card, so it is seen the moment it is there, with
// a free id and the deck's first field to show. Everything else is a default the property panel
// can change; nothing here is a decision the designer cannot take back.
export function newElement(kind: ElementKind, opts: { taken: readonly string[]; field?: string | undefined; card: CardSize }): Element {
  const { w, h } = SIZES[kind]
  const box = { id: freeId(kind, opts.taken), x: round((opts.card.widthMm - w) / 2), y: round((opts.card.heightMm - h) / 2), w, h }
  const bind = opts.field ? { field: opts.field } : { literal: kind === 'text' ? 'Ny text' : '' }
  switch (kind) {
    case 'text':
      return { kind, ...box, bind, font: { family: 'sans-serif', sizePt: 10 }, color: '#111111' }
    case 'image':
      return { kind, ...box, bind, fit: 'contain' }
    case 'icons':
      return { kind, ...box, bind, iconMm: 5, gapMm: 1 }
    case 'shape':
      return { kind, ...box, shape: 'rect', fill: '#d9d2c4' }
  }
}

function freeId(kind: ElementKind, taken: readonly string[]): string {
  for (let n = 1; ; n++) if (!taken.includes(`${kind}-${n}`)) return `${kind}-${n}`
}

export type Box = { x: number; y: number; w: number; h: number }

// A grab in progress: the box as it was when the pointer went down, where it went down, and how
// many millimetres a pixel is worth on this screen. The card is drawn at whatever zoom the stage
// wants, so the scale is measured from the card itself and never assumed.
export type Grab = { box: Box; at: Point; mmPerPx: number }

// Where a grabbed box has been dragged to. Pixels only ever become millimetres here.
export function movedTo(grab: Grab, to: Point): Point {
  return { x: round(grab.box.x + (to.x - grab.at.x) * grab.mmPerPx), y: round(grab.box.y + (to.y - grab.at.y) * grab.mmPerPx) }
}

// The corners the selection is resized by. Only corners: an edge handle on a 10 mm-high text box
// is a target too small to hit, and the property panel is there for one measure at a time.
export const HANDLES = ['nw', 'ne', 'sw', 'se'] as const
export type Handle = (typeof HANDLES)[number]

// No element is ever dragged smaller than this; a box that cannot be seen cannot be grabbed back.
export const MIN_MM = 2

// Where a corner drags the box to. The two edges the corner holds move, the two opposite ones
// stay, and neither pair passes the other: a box turned inside out is never what was meant.
export function resizedTo(grab: Grab, to: Point, handle: Handle): Box {
  const dx = (to.x - grab.at.x) * grab.mmPerPx
  const dy = (to.y - grab.at.y) * grab.mmPerPx
  const { x, y, w, h } = grab.box
  const left = handle === 'nw' || handle === 'sw' ? Math.min(x + dx, x + w - MIN_MM) : x
  const right = handle === 'ne' || handle === 'se' ? Math.max(x + w + dx, x + MIN_MM) : x + w
  const top = handle === 'nw' || handle === 'ne' ? Math.min(y + dy, y + h - MIN_MM) : y
  const bottom = handle === 'sw' || handle === 'se' ? Math.max(y + h + dy, y + MIN_MM) : y + h
  return { x: round(left), y: round(top), w: round(right - left), h: round(bottom - top) }
}

// How near a line has to be before an element takes it. A millimetre is about a pixel of print
// and several on screen: near enough to help, far enough that 0,5 mm by keyboard still stands.
export const SNAP_MM = 1

// The lines drawn while an element is dragged, in card millimetres: a vertical one at `x`, a
// horizontal one at `y`, or none.
export type Guides = { x: number | null; y: number | null }
export type Placement = { at: Point; guides: Guides }

// Where a dragged box settles, and what it lined up with. Each of its three lines in an axis —
// near edge, middle, far edge — is offered every other element's edges and the card's own middle
// (variant A). The nearest line inside a millimetre wins; nothing else moves the box.
export function snapped(box: Box, at: Point, others: readonly Box[], card: CardSize): Placement {
  const x = align(at.x, box.w, [...others.flatMap((o) => [o.x, o.x + o.w]), card.widthMm / 2])
  const y = align(at.y, box.h, [...others.flatMap((o) => [o.y, o.y + o.h]), card.heightMm / 2])
  return { at: { x: x.at, y: y.at }, guides: { x: x.guide, y: y.guide } }
}

function align(value: number, size: number, targets: readonly number[]): { at: number; guide: number | null } {
  let best: { away: number; at: number; guide: number } | null = null
  for (const offset of [0, size / 2, size]) {
    for (const target of targets) {
      const away = Math.abs(value + offset - target)
      if (away < SNAP_MM && (!best || away < best.away)) best = { away, at: round(target - offset), guide: target }
    }
  }
  return best ? { at: best.at, guide: best.guide } : { at: round(value), guide: null }
}

// The zoom the stage draws the card at, and the air it keeps around it.
export const STAGE_SCALE = 2.6
const STAGE_AIR = 24

// How much bigger or smaller the card has to be drawn to fit the room the stage has. The card is
// measured as it is drawn, so the answer is a factor on the zoom it already has and nothing here
// needs to know what a millimetre is on this screen. A whole card must be visible: the canvas is
// where the layout is judged, and a card cut off at the bottom cannot be judged.
export function fitScale(scale: number, drawn: { w: number; h: number }, room: { w: number; h: number }): number {
  if (drawn.w <= 0 || drawn.h <= 0 || room.w <= 0 || room.h <= 0) return scale
  const fits = Math.min((room.w - STAGE_AIR) / drawn.w, (room.h - STAGE_AIR) / drawn.h)
  return Math.min(6, Math.max(0.5, scale * fits))
}
