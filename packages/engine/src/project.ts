import type { Activity, Applied, RewindProposal, SeatId, Snapshot, TablePreview, VisibleComponentState, ZoneView } from '@byd/protocol'

import { undoTarget, type History } from './decide.js'
import { componentOf, type ComponentInstance, type TableState, type Zone } from './state.js'
import type { TypeRegistry } from './typedef.js'
import { canSeeFace, canSeeZoneOrder, faceUpOnTop } from './visibility.js'

// A log line as every view may see it. The outcome never leaves the server: a shuffle's
// re-keying says exactly where each card went, which no one at a physical table knows.
export function projectActivity(line: Applied): Activity {
  const { seq, batch, at, by, intent } = line
  return { seq, batch, at, by, intent }
}

// Projects the authoritative state into what one seat is allowed to know.
// This is the only path from state to wire. Nothing else may serialise components.

// Texture hashes per card and face, computed by whoever compiled the deck. Optional: a session
// without textures projects without faces.
export type FaceHashes = Record<string, Record<string, string>>

// With a `history` the view also learns what undo means for its seat, and — while a rewind is
// proposed — how the table looked at the target, projected for this same view (B, C).
// `observer` (C8) sees every hand and every hidden pile; the view is still seatless.
export function project(state: TableState, registry: TypeRegistry, seat: SeatId | null, faces?: FaceHashes, history?: History, observer = false): Snapshot {
  const { zones, components } = projectTable(state, registry, seat, faces, observer)
  const seats = state.setup.seats.map((id) => ({ id, name: state.seats[id]?.name ?? null }))
  let rewind: RewindProposal | null = state.rewind
  if (rewind && history) {
    const preview: TablePreview = projectTable(history.stateAt(rewind.toSeq), registry, seat, faces, observer)
    rewind = { ...rewind, preview }
  }
  const undo = seat !== null && history ? undoTarget(history.lines(), seat) : null
  return { seq: state.seq, seat, floor: state.setup.floor, seats, zones, components, rewind, undo, ended: state.ended }
}

function projectTable(state: TableState, registry: TypeRegistry, seat: SeatId | null, faces?: FaceHashes, observer = false): TablePreview {
  const zones: ZoneView[] = []
  const components: VisibleComponentState[] = []

  const sortedZones = Object.values(state.zones).sort((a, b) => a.id.localeCompare(b.id))
  for (const z of sortedZones) {
    if (canSeeZoneOrder(z, seat, observer)) {
      zones.push({ mode: 'order', ...zoneBase(z), order: [...z.order] })
      for (const id of z.order) components.push(view(state, registry, componentOf(state, id), seat, faces, observer))
    } else {
      const top = z.order[0] === undefined ? undefined : componentOf(state, z.order[0])
      const shownTop = top !== undefined && faceUpOnTop(state, registry, top)
      zones.push({ mode: 'count', ...zoneBase(z), count: z.order.length, ...(shownTop ? { top: top.id } : {}) })
      // A component the seat was explicitly granted knowledge of still appears, even though its
      // position inside the zone does not; so does the face-up top of a pile (K15), whose position
      // the zone view names.
      for (const id of z.order) {
        const c = componentOf(state, id)
        if (grantedTo(c, seat) || (shownTop && c === top)) components.push(view(state, registry, c, seat, faces, observer))
      }
    }
  }
  return { zones, components }
}

function zoneBase(z: Zone) {
  return {
    id: z.id,
    kind: z.kind,
    name: z.name,
    geometry: { ...z.geometry },
    dynamic: z.dynamic,
    ...(z.owner !== undefined ? { owner: z.owner } : {}),
  }
}

function grantedTo(c: ComponentInstance, seat: SeatId | null): boolean {
  if (c.publicOverride) return true
  return seat !== null && (c.shownTo.includes(seat) || c.peekedBy.includes(seat))
}

function view(state: TableState, registry: TypeRegistry, c: ComponentInstance, seat: SeatId | null, faces?: FaceHashes, observer = false): VisibleComponentState {
  const visible = canSeeFace(state, registry, c, seat, observer)
  const v: VisibleComponentState = {
    id: c.id,
    type: c.type,
    zone: c.zone,
    face: c.face,
    x: c.x,
    y: c.y,
    rot: c.rot,
    cardRef: visible ? c.cardRef : null,
  }
  if (c.counter !== undefined) v.counter = c.counter
  const hashes = faces?.[c.cardRef]
  if (hashes) {
    const def = registry.get(c.type)
    const out: Record<string, string> = {}
    for (const [face, hash] of Object.entries(hashes)) {
      if (face === def.contentFace && !visible) continue
      out[face] = hash
    }
    v.faces = out
  }
  return v
}
