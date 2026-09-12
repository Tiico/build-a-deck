import type { Point } from './geometry.js'

// The ring of verbs opens around the hand (K14), which means a hand near an edge of the window
// would put half its verbs outside it — and the verb it puts straight above the pointer is Vänd,
// the one the whole gesture exists for. While the ring only answered a hold that was rare enough
// to go unnoticed; a click meets it every time a card lies near the rim.
//
// So the centre is pulled in just far enough that the whole ring fits, and not a pixel further:
// anywhere with room around it, the ring still opens exactly where the hand let go.

// The circle the buttons sit on, and how wide one is. Both are drawn in `table.css`; the browser
// test in `table-layout.test.tsx` measures the real stylesheet against these numbers so they
// cannot drift apart in silence.
export const RING_RADIUS = 82
export const RING_BUTTON = 66
// How far the ring reaches from its own centre in every direction.
export const RING_REACH = RING_RADIUS + RING_BUTTON / 2
// A verb flush against the edge of the screen is inside it and still looks trapped, so the ring
// keeps a little air outside itself as well.
export const RING_AIR = 12
// The room the ring needs around its centre, which is what the edges are measured against.
export const RING_MARGIN = RING_REACH + RING_AIR

export type WindowSize = { w: number; h: number }

// A window with less room than the ring needs has no good answer, only a least bad one: centring
// it loses the same amount on both sides, where clamping would drop one whole verb off one edge.
const pull = (v: number, span: number): number => (span < RING_MARGIN * 2 ? span / 2 : Math.min(Math.max(v, RING_MARGIN), span - RING_MARGIN))

export function ringCentre(at: Point, window: WindowSize): Point {
  return { x: pull(at.x, window.w), y: pull(at.y, window.h) }
}
