import { projectTilted, type Point, type Rotation, type TiltLayout } from './geometry.js'

export type Size = { w: number; h: number }

// The finger's own measure: a thing a finger is meant to land on is 44 × 44 pixels on the
// screen. On the screen and not on the felt's plane — see `tiltShrink`.
export const TOUCH_PX = 44

// Scale (px per mm) that fits the whole table inside the container with `margin` px around
// it, without ever enlarging past 1:1 — a bigger screen shows a bigger table only up to life size.
export function fitScale(table: Size, container: Size, margin = 0): number {
  const w = Math.max(0, container.w - 2 * margin)
  const h = Math.max(0, container.h - 2 * margin)
  return Math.min(1, w / table.w, h / table.h)
}

// Whether the felt is turned a quarter to meet the window it is shown in (C5, C8, #76).
//
// A table is drawn in a shape of its own — the wizard's is wider than it is tall — and a window
// has a shape of its own too. When the two disagree, the felt fitted upright is bounded by the
// short side of the window and leaves the long one empty: a landscape table in a portrait phone
// drew 294 x 197 of a 390 x 844 screen and a card's short side came to 15 px. Turned a quarter
// the table's long side runs down the screen instead, the felt fills the width, and nothing is
// hidden, clipped or gestured for.
//
// The answer is therefore read off the two shapes and never written down per surface: a window
// whose orientation agrees with the table's is already the right way round. It is the observer's
// rule (C8) and not every surface's — a seat's own felt is turned by where that seat sits (C5),
// and the table's own screen is a TV that is landscape by construction (K9).
export function turnToFit(table: Size, frame: Size): Rotation {
  if (table.w <= 0 || table.h <= 0 || frame.w <= 0 || frame.h <= 0) return 0
  return table.w >= table.h === frame.w >= frame.h ? 0 : 90
}

// The air the two fits leave between the table and the frame that holds it, in the frame's own
// pixels. There are two numbers because there are two reasons, and one number for two reasons is
// how the TV came to spend a quarter of a phone on nothing (#76).
//
// In table mode the felt lies on its wood and the wood stands on the dark (K9): the air is the
// table's share of the room it is in, and 44 px is what that has always been.
export const WOOD_AIR_PX = 44
// On a TV the wood has no rim at all — `.byd-table-frame[data-mode='tv'] .byd-table-wood` is
// `padding: 0` — so nothing of the table's own furniture is drawn outside the millimetres the fit
// measures. One thing is: a hand's count, which hangs past its hand in the frame's pixels rather
// than in the felt's millimetres and is about 18 × 22 of them. That is the whole of what this air
// is for, so it is a pill's width and no more. At 44 it was 23 % of a 390 px window given to
// nothing, and the observer's felt was a fifth of her phone (C8, L12); 8 px clipped the pills.
// `observer-viewport.test.tsx` reads the pills back off the drawn page, so the number cannot be
// cut again without the clipping being seen.
export const TV_AIR_PX = 20

// The rim the wood draws around the felt, in the frame's own pixels. It is `table.css`'s padding
// on `.byd-table-wood`, and the fit has to know it because the rim is drawn outside every
// millimetre the felt is measured in.
export const WOOD_RIM_PX = 30

// Scale (px per mm) for the felt in table mode (K9, reviderat 2026-09-12).
//
// The felt is tilted, and a tilt changes the shape that has to pass into the frame: the near edge
// is pushed out and down by the perspective and the far one drawn in. Measuring the *untilted*
// rectangle and letting `rotateX` shrink it afterwards — which is what two fifths of the frame's
// area did — spends the difference on nothing. What is drawn then lands under the share that was
// decided, and the rest of the screen is empty dark: at 1280 × 800 that was a third of the screen
// and a card 38 px across, against the TV's 51.
//
// So the felt is simply as large as the frame can hold: the four corners of the wood, projected
// through the same tilt the stylesheet draws, stand at least `WOOD_AIR_PX` inside the frame, and
// never larger than life size. The answer is searched for rather than solved, because the
// projection depends on the wood's own size and so on the scale being looked for.
export function feltScale(table: Size, container: Size): number {
  if (table.w <= 0 || table.h <= 0 || container.w <= 0 || container.h <= 0) return 0
  const fits = (scale: number): boolean => {
    const layout = woodLayout(table, container, scale)
    const wood = layout.wood
    const corners = [
      { x: -wood.w / 2, y: -wood.h / 2 },
      { x: wood.w / 2, y: -wood.h / 2 },
      { x: -wood.w / 2, y: wood.h / 2 },
      { x: wood.w / 2, y: wood.h / 2 },
    ].map((p) => projectTilted(layout, p))
    const xs = corners.map((p) => p.x)
    const ys = corners.map((p) => p.y)
    return Math.min(...xs) >= WOOD_AIR_PX && Math.max(...xs) <= container.w - WOOD_AIR_PX && Math.min(...ys) >= WOOD_AIR_PX && Math.max(...ys) <= container.h - WOOD_AIR_PX
  }
  if (fits(1)) return 1
  let lo = 0
  let hi = 1
  // Twenty-four halvings put the answer inside a ten-thousandth of a millimetre's worth of scale.
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (fits(mid)) lo = mid
    else hi = mid
  }
  return lo
}

// The wood as the stylesheet lays it out in a frame at this scale: the felt with its rim round
// it, centred in the frame. It is what `feltScale` searches with, and what anything that has to
// know how a place on the felt lands on the screen projects through.
export function woodLayout(felt: Size, container: Size, scale: number): TiltLayout {
  const wood = { w: felt.w * scale + 2 * WOOD_RIM_PX, h: felt.h * scale + 2 * WOOD_RIM_PX }
  return { frame: container, wood: { left: (container.w - wood.w) / 2, top: (container.h - wood.h) / 2, w: wood.w, h: wood.h } }
}

// The side of a square on the wood plane at `p` (px from the wood's centre) whose projection
// on the screen still holds an upright `want` × `want` square inside it. A square set to 44 in
// the felt's plane is not 44 on the screen under `rotateX(13deg)` in a perspective: it measured
// 43.3 × 41.2 at 1280 × 800 (#67), the far edge leans further than the near one and a taller
// felt further still, since the perspective is 1600 px whatever the window — and off the centre
// line the projection is slanted as well as shrunk, so a corner of the finger's square can fall
// outside a shape that is merely tall and wide enough. The answer is searched for through the
// same projection the stylesheet draws, and `counter-touch.test.tsx` reads it back in Chromium
// off the drawn shape, never off the number set here.
export function leaningSquare(layout: TiltLayout, p: Point, want: number): number {
  let side = want
  // The projection is close to affine over a finger's width, so each round lands within a
  // hundredth of a pixel of the last; three are plenty.
  for (let i = 0; i < 3; i++) {
    const inner = inscribed(layout, p, side)
    side *= want / Math.min(inner.w, inner.h)
  }
  return side
}

// The largest upright box inside the projection of a square of `side` at `p`.
function inscribed(layout: TiltLayout, p: Point, side: number): Size {
  const h = side / 2
  const [tl, tr, bl, br] = [
    { x: p.x - h, y: p.y - h },
    { x: p.x + h, y: p.y - h },
    { x: p.x - h, y: p.y + h },
    { x: p.x + h, y: p.y + h },
  ].map((c) => projectTilted(layout, c)) as [Point, Point, Point, Point]
  return { w: Math.min(tr.x, br.x) - Math.max(tl.x, bl.x), h: Math.min(bl.y, br.y) - Math.max(tl.y, tr.y) }
}
