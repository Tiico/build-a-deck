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
  for (const z of next.zones) {
    const p = zonesBefore.get(z.id)
    if (!p || !deepEqual(p, z)) ops.push({ op: 'zone', view: z })
  }
  return { seq: next.seq, ops }
}

export function applyPatch(prev: Snapshot, patch: Patch): Snapshot {
  const components = new Map<string, VisibleComponentState>(prev.components.map((c) => [c.id, c]))
  const zones = new Map<string, ZoneView>(prev.zones.map((z) => [z.id, z]))
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
    }
  }
  return {
    seq: patch.seq,
    seat: prev.seat,
    zones: [...zones.values()].sort((a, b) => a.id.localeCompare(b.id)),
    components: orderComponents([...components.values()], [...zones.values()]),
  }
}

// Snapshots list components zone by zone in zone order; a patched snapshot must match that.
function orderComponents(components: VisibleComponentState[], zones: ZoneView[]): VisibleComponentState[] {
  const rank = new Map<string, number>()
  const sortedZones = [...zones].sort((a, b) => a.id.localeCompare(b.id))
  let n = 0
  const byId = new Map(components.map((c) => [c.id, c]))
  const out: VisibleComponentState[] = []
  for (const z of sortedZones) {
    if (z.mode === 'order') {
      for (const id of z.order) {
        const c = byId.get(id)
        if (c) {
          out.push(c)
          rank.set(id, n++)
        }
      }
    } else {
      for (const c of components) {
        if (c.zone === z.id && !rank.has(c.id)) {
          out.push(c)
          rank.set(c.id, n++)
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
