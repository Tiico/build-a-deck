import { projectTilted } from './geometry.js'

export type Size = { w: number; h: number }

// Scale (px per mm) that fits the whole table inside the container with `margin` px around
// it, without ever enlarging past 1:1 — a bigger screen shows a bigger table only up to life size.
export function fitScale(table: Size, container: Size, margin = 0): number {
  const w = Math.max(0, container.w - 2 * margin)
  const h = Math.max(0, container.h - 2 * margin)
  return Math.min(1, w / table.w, h / table.h)
}

// The least air the felt ever leaves between itself and the frame that holds it. The table's
// wooden rim is drawn in the frame's own pixels, outside the millimetres the fit measures, so a
// felt that came closer would have its own frame cut; the TV's chrome leaves the same air (K9).
export const LEAST_AIR_PX = 44

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
// through the same tilt the stylesheet draws, stand at least `LEAST_AIR_PX` inside the frame, and
// never larger than life size. The answer is searched for rather than solved, because the
// projection depends on the wood's own size and so on the scale being looked for.
export function feltScale(table: Size, container: Size): number {
  if (table.w <= 0 || table.h <= 0 || container.w <= 0 || container.h <= 0) return 0
  const fits = (scale: number): boolean => {
    const wood = { w: table.w * scale + 2 * WOOD_RIM_PX, h: table.h * scale + 2 * WOOD_RIM_PX }
    const layout = { frame: container, wood: { left: (container.w - wood.w) / 2, top: (container.h - wood.h) / 2, w: wood.w, h: wood.h } }
    const corners = [
      { x: -wood.w / 2, y: -wood.h / 2 },
      { x: wood.w / 2, y: -wood.h / 2 },
      { x: -wood.w / 2, y: wood.h / 2 },
      { x: wood.w / 2, y: wood.h / 2 },
    ].map((p) => projectTilted(layout, p))
    const xs = corners.map((p) => p.x)
    const ys = corners.map((p) => p.y)
    return Math.min(...xs) >= LEAST_AIR_PX && Math.max(...xs) <= container.w - LEAST_AIR_PX && Math.min(...ys) >= LEAST_AIR_PX && Math.max(...ys) <= container.h - LEAST_AIR_PX
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
