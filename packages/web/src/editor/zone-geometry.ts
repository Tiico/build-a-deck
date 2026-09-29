import type { Geometry, Zone } from '@byd/server/doc'

// Where a zone may stand and how small it may be, asked by every way a zone is moved or sized: the
// drag, the arrows on its handle and the fields over the felt (#480, #579, #554). One answer for
// all of them, so a place typed in is held exactly where a place dragged to would have been.

// The least a zone with a size may be, in millimetres.
export const MIN_MM = 40
// One step of the arrows, on the handle and in the fields; Shift takes five.
export const NUDGE_MM = 10

// Half of a zone stays on the table (#480, beslut 2026-09-27): its middle is held inside the floor,
// and a pile, which is a point, is held inside it whole. `held` says whether it had to be.
export function onTableOf(floor: Geometry | undefined, zone: Zone, g: Geometry): { geometry: Geometry; held: boolean } {
  if (!floor) return { geometry: g, held: false }
  const half = zone.kind === 'pile' ? { w: 0, h: 0 } : { w: g.w / 2, h: g.h / 2 }
  const x = Math.min(floor.x + floor.w, Math.max(floor.x, g.x + half.w)) - half.w
  const y = Math.min(floor.y + floor.h, Math.max(floor.y, g.y + half.h)) - half.h
  const held = x !== g.x || y !== g.y
  return { geometry: held ? { ...g, x: Math.round(x), y: Math.round(y) } : g, held }
}

// A zone grown or shrunk from its top left corner, never under the least size. A pile has no size.
export function sizedBy(zone: Zone, g: Geometry, dw: number, dh: number): Geometry {
  if (zone.kind === 'pile') return g
  return { ...g, w: Math.max(MIN_MM, g.w + dw), h: Math.max(MIN_MM, g.h + dh) }
}
