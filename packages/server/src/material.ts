import { seatEdgeOf } from '@byd/engine'
import { CHIP_MM, DIE_MM, counterSpots, diceSpots, type Counter, type Die, type Geometry, type Setup, type Zone } from './recipe.js'

// Imported by the editor as well as the server, so this module stays free of anything Node.
// Where the game's material lies when a table is laid (#1292): the counters (C4) and the dice
// (K28), piece by piece, each with the line of the setup it comes from. The table is laid from
// this list (`setupFromProject`) and the editor's felt draws its handles from the same list, so
// the piece the designer takes hold of is the piece the players are dealt.
export type MaterialLine = { kind: 'die'; index: number } | { kind: 'counter'; index: number }
export type MaterialPiece = {
  line: MaterialLine
  zone: string
  // The seat whose area the piece lies in when its line lies in an area each seat has, so a drag
  // of any seat's copy can be read back from that seat's chair.
  seat: string | null
  // The top left corner in the zone's own millimetres, as the table is told it, and the size the
  // felt reserves for the piece.
  x: number
  y: number
  size: number
  faces?: number
  counter?: number
  name?: string
}

// A point said from seat A's chair, in the zone a seat at `edge` has (#1292): along the rim from
// the seat's left, and inwards from the far side, turned so that every seat finds its piece where
// A finds hers. A seat whose edge nobody knows reads the point as it is written.
export function seatPoint(at: { x: number; y: number }, zone: Geometry, edge: 'N' | 'E' | 'S' | 'W' | null): { x: number; y: number } {
  if (edge === 'N') return { x: zone.w - at.x, y: zone.h - at.y }
  if (edge === 'E') return { x: at.y, y: zone.h - at.x }
  if (edge === 'W') return { x: zone.w - at.y, y: at.x }
  return { x: at.x, y: at.y }
}

// Where `count` pieces `size` across lie in a zone around a point (#1292): a row a piece and a gap
// apart with its middle on the point, kept inside the zone, as the top left corners the table lays.
// Kept here and not in the recipe: the phone loads the recipe, and never lays a table.
export function piecesAt(at: { x: number; y: number }, zone: Geometry, count: number, size: number): { x: number; y: number }[] {
  const pitch = size * 1.3
  return Array.from({ length: Math.max(0, count) }, (_, i) => {
    const x = at.x + (i - (count - 1) / 2) * pitch - size / 2
    const y = at.y - size / 2
    return { x: Math.round(Math.max(0, Math.min(zone.w - size, x))), y: Math.round(Math.max(0, Math.min(zone.h - size, y))) }
  })
}

const zoneOf = (setup: Setup, id: string): Zone | undefined => setup.zones.find((z) => z.id === id)
const edgeOf = (setup: Setup, seat: string) => seatEdgeOf(setup.zones, setup.floor, seat)

export function layMaterial(setup: Setup): MaterialPiece[] {
  const pieces: MaterialPiece[] = []
  // A seat's counters live in its counters zone unless the designer put them in another of the
  // seat's areas, and where in that zone is the point they were dragged to. One without a point is
  // the recipe's answer (#89): one chip to a slot along the rim while there are one or two, one
  // pile once there is a third, counted among those of its zone without a point.
  const counters = setup.counters ?? []
  for (const seat of setup.seats) {
    const loose = new Map<string, number>()
    counters.forEach((c, index) => {
      const role = c.role ?? 'counters'
      const zone = zoneOf(setup, `${role}:${seat}`)
      if (!zone) return
      const n = loose.get(role) ?? 0
      if (c.at === undefined) loose.set(role, n + 1)
      const unplaced = counters.filter((o) => (o.role ?? 'counters') === role && o.at === undefined).length
      const at = c.at !== undefined ? piecesAt(seatPoint(c.at, zone.geometry, edgeOf(setup, seat)), zone.geometry, 1, CHIP_MM)[0] : counterSpots(zone.geometry, unplaced)[n]
      pieces.push({ line: { kind: 'counter', index }, zone: zone.id, seat, size: CHIP_MM, counter: c.start, name: c.name, ...(at ?? { x: 0, y: 0 }) })
    })
  }
  // The dice side by side in the area each is put in and clear of what stands in it (the floor's
  // piles, #1137) — or, for a line the designer dragged, in a row on the point it was dragged to.
  // A die put in a zone that is gone lies nowhere.
  const byZone = new Map<string, { index: number; faces: number; seat: string | null }[]>()
  const put = (zone: string, index: number, faces: number, count: number, seat: string | null) => byZone.set(zone, [...(byZone.get(zone) ?? []), ...Array.from({ length: count }, () => ({ index, faces, seat }))])
  const placed = (zoneId: string, index: number, faces: number, count: number, at: { x: number; y: number }, seat: string | null) => {
    const zone = zoneOf(setup, zoneId)
    if (!zone) return
    const point = seat === null ? at : seatPoint(at, zone.geometry, edgeOf(setup, seat))
    for (const spot of piecesAt(point, zone.geometry, count, DIE_MM)) pieces.push({ line: { kind: 'die', index }, zone: zoneId, seat, size: DIE_MM, faces, ...spot })
  }
  ;(setup.dice ?? []).forEach((d, index) => {
    if (d.role !== undefined) {
      for (const seat of setup.seats) {
        if (d.at) placed(`${d.role}:${seat}`, index, d.faces, d.count, d.at, seat)
        else put(`${d.role}:${seat}`, index, d.faces, d.count, seat)
      }
    } else if (d.zone !== undefined) {
      const count = d.perSeat ? d.count * setup.seats.length : d.count
      if (d.at) placed(d.zone, index, d.faces, count, d.at, null)
      else put(d.zone, index, d.faces, count, null)
    }
  })
  for (const [zoneId, dice] of byZone) {
    const zone = zoneOf(setup, zoneId)
    if (!zone) continue
    const spots = diceSpots(zone.geometry, dice.length, setup.zones.filter((z) => z.id !== zoneId))
    dice.forEach((d, i) => pieces.push({ line: { kind: 'die', index: d.index }, zone: zoneId, seat: d.seat, size: DIE_MM, faces: d.faces, ...(spots[i] ?? { x: 0, y: 0 }) }))
  }
  return pieces
}

// Which family an area belongs to (#175): `mine:A` is the role `mine` at seat A. An area the
// designer added and gave an owner is one zone at one seat, not the same zone at every seat.
export function roleOf(zone: Pick<Zone, 'id' | 'owner'>): string | null {
  if (zone.owner === undefined) return null
  const at = zone.id.lastIndexOf(':')
  if (at <= 0) return null
  return zone.id.slice(at + 1) === zone.owner ? zone.id.slice(0, at) : null
}

// The point a seat at `edge` sees in its own zone, said from seat A's chair again: `seatPoint`
// backwards, so a copy dragged at any seat moves every seat's copy the same way.
export function chairPoint(at: { x: number; y: number }, zone: Geometry, edge: 'N' | 'E' | 'S' | 'W' | null): { x: number; y: number } {
  if (edge === 'N') return { x: zone.w - at.x, y: zone.h - at.y }
  if (edge === 'E') return { x: zone.h - at.y, y: at.x }
  if (edge === 'W') return { x: at.y, y: zone.w - at.x }
  return { x: at.x, y: at.y }
}

// Where a piece whose middle is at `center` on the felt now lies (#1292, beslut A): in the
// innermost area under it, at that point. An area of a seat's family makes the line every seat's,
// said from seat A's chair; any other area holds it as the one zone it is. A counter is every
// seat's by nature, so it lies only in a family's area, and a die that counts per seat keeps
// counting so. Null when nothing under the point can hold this line, and the drag leaves it be.
export function placeLine(setup: Setup, line: MaterialLine, center: { x: number; y: number }): Die | Counter | null {
  const areas = setup.zones.filter((z) => z.kind === 'area' && contains(z.geometry, center))
  const area = areas.sort((a, b) => a.geometry.w * a.geometry.h - b.geometry.w * b.geometry.h)[0]
  if (!area) return null
  const role = roleOf(area)
  const local = { x: Math.round(center.x - area.geometry.x), y: Math.round(center.y - area.geometry.y) }
  const at = role !== null && area.owner !== undefined ? chairPoint(local, area.geometry, edgeOf(setup, area.owner)) : local
  if (line.kind === 'counter') {
    const c = setup.counters?.[line.index]
    if (!c || role === null) return null
    const { role: _role, at: _at, ...rest } = c
    return { ...rest, ...(role !== 'counters' ? { role } : {}), at }
  }
  const d = setup.dice?.[line.index]
  if (!d) return null
  const { zone: _zone, role: _role, at: _at, perSeat, ...rest } = d
  if (role !== null) return { ...rest, role, at }
  const seated = d.role !== undefined || perSeat === true
  return { ...rest, zone: area.id, ...(seated ? { perSeat: true } : {}), at }
}

const contains = (g: Geometry, p: { x: number; y: number }): boolean => p.x >= g.x && p.y >= g.y && p.x <= g.x + g.w && p.y <= g.y + g.h
