// Where the felt says a refused drop (#682, beställarens beslut: raden E). D5 puts a refused act
// inline at the control that was refused, and on the felt the control is the place the hand let
// go: the plate stands beside it, and gives way to everything a player reads there — a card, a
// pile's top and its pill, a name, a count, the corner's buttons. It prefers breaking to a second
// line over covering any of them, and never lies on the drop it is about.
//
// The shape is the prototype's, measured in the built app at 1024, 1280 and 1920 with nothing
// covered (`docs/ux-audits/2026-10-17-bordslaget-text-och-kontroller/prototyper/matning/page.js`).
export type Box = { left: number; top: number; right: number; bottom: number }
// One width the plate may be given, and how large it is drawn at it.
export type Shape = { maxWidth: number; w: number; h: number }
export type Placed = { x: number; y: number; maxWidth: number; side: 'under' | 'över' | 'vänster' | 'höger' }

// Between the drop and the plate.
const GAP = 12
// The plate stays this far inside the room: the felt's rim is 30 px of wood.
const INSET = 36

const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))

export function besideDrop(anchor: Box, shapes: readonly Shape[], room: Box, obstacles: readonly Box[]): Placed {
  const cx = (anchor.left + anchor.right) / 2
  const cy = (anchor.top + anchor.bottom) / 2
  let best: (Placed & { hit: number }) | null = null
  for (const { maxWidth, w, h } of shapes) {
    const candidates: [Placed['side'], number, number][] = [
      ['under', cx - w / 2, anchor.bottom + GAP],
      ['över', cx - w / 2, anchor.top - GAP - h],
      ['vänster', anchor.left - GAP - w, cy - h / 2],
      ['höger', anchor.right + GAP, cy - h / 2],
      ['under', anchor.right - w, anchor.bottom + GAP],
      ['under', anchor.left, anchor.bottom + GAP],
      ['över', anchor.right - w, anchor.top - GAP - h],
      ['över', anchor.left, anchor.top - GAP - h],
    ]
    for (const [side, x0, y0] of candidates) {
      const x = Math.max(room.left + INSET, Math.min(x0, room.right - INSET - w))
      const y = Math.max(room.top + INSET, Math.min(y0, room.bottom - INSET - h))
      const r = { left: x, top: y, right: x + w, bottom: y + h }
      // Lying on the drop itself is the worst place there is: it is what the plate is about.
      const hit = obstacles.reduce((sum, o) => sum + overlap(r, o), 0) + overlap(r, anchor) * 4
      if (!best || hit < best.hit) best = { x, y, maxWidth, side, hit }
      if (hit === 0) return { x, y, maxWidth, side }
    }
  }
  if (!best) throw new Error('besideDrop needs at least one shape')
  const { hit: _hit, ...placed } = best
  return placed
}
