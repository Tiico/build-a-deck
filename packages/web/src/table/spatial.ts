// Where an arrow key goes on the felt (K16, #572, beställarens beslut D): to the thing the reader
// sees in that direction, and never the other way. The felt is two-dimensional to the eye, and a
// list sorted row by row in the table's own millimetres sent ArrowRight across the table and
// ArrowDown upward — 30 % of arrows at four seats and 34 % at eight went against their own
// direction, the table turned for a seat on /online most of all.
//
// The rule, measured against three others on real felts before it was chosen (prototype
// `proto/572-pilarna`): the nearest thing within 45° of the arrow; when there is none, the nearest
// thing ahead at all, with the distance to the side counted twice. It never goes backward and it
// never leaves an arrow doing nothing while something lies that way. It is not reversible: the
// arrow back does not always return to where the reader came from, which a two-dimensional
// layout cannot promise.
//
// Everything here is in the screen's own coordinates, y downward: the caller asks where each thing
// is drawn, so a felt turned for its seat is already turned.
export type Spot = { key: string; x: number; y: number }
export type Arrow = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown'

const WAY: Record<Arrow, { x: number; y: number }> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
}
// How far ahead a thing must stand to be ahead at all. Two things drawn on the same spot are not
// one another's next, and nor are two drawn level: the discard and the draw pile lie side by side a
// couple of pixels apart in height, and ArrowDown from one crossed to the other (#572). A pile's
// own lift on focus is a few pixels too, so the edge is a finger's width of eye, not a pixel.
const AHEAD_PX = 8

export function nextInDirection(spots: readonly Spot[], from: string, arrow: Arrow): string | null {
  const here = spots.find((s) => s.key === from)
  if (!here) return null
  const way = WAY[arrow]
  let cone: { key: string; d: number } | null = null
  let ahead: { key: string; d: number } | null = null
  for (const s of spots) {
    if (s.key === from) continue
    const dx = s.x - here.x
    const dy = s.y - here.y
    const main = dx * way.x + dy * way.y
    if (main <= AHEAD_PX) continue
    const side = Math.abs(dx * way.y - dy * way.x)
    if (side <= main) {
      const d = Math.hypot(main, side)
      if (!cone || d < cone.d) cone = { key: s.key, d }
    }
    const score = main + 2 * side
    if (!ahead || score < ahead.d) ahead = { key: s.key, d: score }
  }
  return (cone ?? ahead)?.key ?? null
}
