import type { ZoneView } from '@byd/protocol'

export type Drop = { zone: string; x: number; y: number }

// Where a point on the table lands (K2): the smallest area or hand whose rectangle contains
// it, else the floor. Zones may overlap: the smallest wins, and between equals the one listed
// first in the setup. Piles are points and never hit — dropping onto a pile is `stack`, decided
// by hit-testing the card on top, not by geometry.
export function zoneAt(zones: readonly ZoneView[], floor: string, x: number, y: number): Drop {
  let best: ZoneView | null = null
  for (const z of zones) {
    if (z.kind === 'pile') continue
    const g = z.geometry
    if (x < g.x || y < g.y || x > g.x + g.w || y > g.y + g.h) continue
    if (!best || g.w * g.h < best.geometry.w * best.geometry.h) best = z
  }
  const target = best ?? zones.find((z) => z.id === floor)
  if (!target) throw new Error(`floor ${floor} is not among the zones`)
  return { zone: target.id, x: x - target.geometry.x, y: y - target.geometry.y }
}
