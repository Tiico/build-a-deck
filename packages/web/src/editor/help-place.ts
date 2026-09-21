import { placeBox, type Anchor, type Placement, type Viewport, type Wants } from './placement.js'
import type { CSSProperties } from 'react'

// Where the help box goes: under the question mark while there is room below, above it when there
// is not, and hanging from its right edge when its left would run off the window (#229). The
// reading is `placeBox`'s; what differs from a slot's box is that this one is fixed to the window
// rather than to its own wrapper, because the wrapper stands inside columns that clip their
// overflow — the layer column is 220 px wide and the box is 260 — and a box clipped by the column
// it helps with is no help.
//
// Pure, and in a module of its own, so that a browser test can lay a box by it against a
// rectangle it has really measured — and so that the ring's side of the pattern can read it
// without pulling in the box's code and the box's stylesheet with it (#304).
export type HelpPlacement = Pick<Placement, 'y' | 'x'> & { style: CSSProperties }
const GAP = 6
// The width the stylesheet gives the box, said again here for a reading taken before the box has
// been laid out — a wish of nought fits anywhere, and that is exactly what the flip is asking.
export const HELP_WIDTH = 260

// What the box hangs from. Across, it is the question mark: the box's left edge is the ring's.
// Down, it is the whole row the question mark stands in when there is one — the heading or the
// line the help is about — so a box that flips upward over a line that wraps never lands on the
// words it explains. A question mark standing alone in a wider bar hangs the box from itself.
export const ROW = '.byd-help-row'
export function helpAnchor(ask: Anchor, row: Anchor | null): Anchor {
  if (!row) return ask
  const top = Math.min(ask.y, row.y)
  return { x: ask.x, y: top, w: ask.w, h: Math.max(ask.y + ask.h, row.y + row.h) - top }
}

export function helpPlacement(anchor: Anchor, wants: Wants, view: Viewport): HelpPlacement {
  const at = placeBox(anchor, { w: wants.w || HELP_WIDTH, h: wants.h }, view, { gap: GAP })
  const style: CSSProperties = { ['--byd-place-room' as string]: `${at.room}px` }
  if (at.y === 'down') style.top = `${anchor.y + anchor.h + GAP}px`
  else style.bottom = `${view.h - anchor.y + GAP}px`
  if (at.x === 'start') style.left = `${anchor.x}px`
  else style.right = `${view.w - (anchor.x + anchor.w)}px`
  return { y: at.y, x: at.x, style }
}
