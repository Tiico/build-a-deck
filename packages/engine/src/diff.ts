import type { Op, Patch, Snapshot, VisibleComponentState, ZoneView } from '@byd/protocol'

// Patches are computed between two projections *for the same seat*.
// The client applies them with `applyPatch`; `applyPatch(prev, diff(prev, next))` must equal `next`.

export function diff(prev: Snapshot, next: Snapshot): Patch {
  if (prev.seat !== next.seat) throw new Error('cannot diff snapshots for different seats')
  const ops: Op[] = []
  const before = new Map(prev.components.map((c) => [c.id, c]))
  const after = new Map(next.components.map((c) => [c.id, c]))

  for (const [id, c] of after) {
    const p = before.get(id)
    if (!p || !deepEqual(p, c)) ops.push({ op: 'upsert', state: c })
  }
  for (const id of before.keys()) {
    if (!after.has(id)) ops.push({ op: 'remove', component: id })
  }
  const zonesBefore = new Map(prev.zones.map((z) => [z.id, z]))
  const zonesAfter = new Set(next.zones.map((z) => z.id))
  for (const z of next.zones) {
    const p = zonesBefore.get(z.id)
    if (!p || !deepEqual(p, z)) ops.push({ op: 'zone', view: z })
  }
  for (const id of zonesBefore.keys()) {
    if (!zonesAfter.has(id)) ops.push({ op: 'zoneRemove', zone: id })
  }
  const seatsBefore = new Map(prev.seats.map((s) => [s.id, s]))
  for (const s of next.seats) {
    const p = seatsBefore.get(s.id)
    if (!p || !deepEqual(p, s)) ops.push({ op: 'seat', seat: s })
  }
  if (!deepEqual(prev.rewind, next.rewind)) ops.push({ op: 'rewind', proposal: next.rewind })
  return { seq: next.seq, ops }
}

export function applyPatch(prev: Snapshot, patch: Patch): Snapshot {
  const components = new Map<string, VisibleComponentState>(prev.components.map((c) => [c.id, c]))
  const zones = new Map<string, ZoneView>(prev.zones.map((z) => [z.id, z]))
  // Seats keep the setup's order; a patch only ever changes who sits there.
  const seats = prev.seats.map((s) => ({ ...s }))
  let rewind = prev.rewind
  for (const op of patch.ops) {
    switch (op.op) {
      case 'upsert':
        components.set(op.state.id, op.state)
        break
      case 'remove':
        components.delete(op.component)
        break
      case 'zone':
        zones.set(op.view.id, op.view)
        break
      case 'zoneRemove':
        zones.delete(op.zone)
        break
      case 'seat': {
        const i = seats.findIndex((s) => s.id === op.seat.id)
        if (i >= 0) seats[i] = op.seat
        else seats.push(op.seat)
        break
      }
      case 'rewind':
        rewind = op.proposal
        break
    }
  }
  const sortedZones = [...zones.values()].sort((a, b) => a.id.localeCompare(b.id))
  return {
    seq: patch.seq,
    seat: prev.seat,
    floor: prev.floor,
    seats,
    zones: sortedZones,
    components: orderComponents([...components.values()], sortedZones),
    rewind,
  }
}

// Snapshots list components zone by zone in zone order; a patched snapshot must match that.
function orderComponents(components: VisibleComponentState[], sortedZones: ZoneView[]): VisibleComponentState[] {
  const placed = new Set<string>()
  const byId = new Map(components.map((c) => [c.id, c]))
  const out: VisibleComponentState[] = []
  for (const z of sortedZones) {
    if (z.mode === 'order') {
      for (const id of z.order) {
        const c = byId.get(id)
        if (c && !placed.has(id)) {
          out.push(c)
          placed.add(id)
        }
      }
    } else {
      for (const c of components) {
        if (c.zone === z.id && !placed.has(c.id)) {
          out.push(c)
          placed.add(c.id)
        }
      }
    }
  }
  return out
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]))
  }
  const ka = Object.keys(a as object)
  const kb = Object.keys(b as object)
  if (ka.length !== kb.length) return false
  return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
}
