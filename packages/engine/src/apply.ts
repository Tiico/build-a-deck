import type { Applied, ComponentId, ComponentSpec, Outcome, SeatId, ZoneId } from '@byd/protocol'
import { restoredTable } from './restore.js'
import { handsReturnedBy } from './hands.js'
import { materialise } from './setup.js'
import {
  cloneState,
  componentOf,
  must,
  resolveRef,
  withoutKey,
  zoneOf,
  type ComponentInstance,
  type TableState,
  type Zone,
} from './state.js'
import type { TypeRegistry } from './typedef.js'
import { clearOverrides } from './visibility.js'

// `apply` is pure and total over valid logs: given the same state and the same `Applied`,
// it yields the same state. All randomness has already been fixed in `applied.outcome`.
// Dynamic pile ids derive from `seq`, so they need no outcome to replay.

export function apply(prev: TableState, _registry: TypeRegistry, applied: Applied): TableState {
  if (applied.seq !== prev.seq + 1) throw new Error(`seq gap: expected ${prev.seq + 1}, got ${applied.seq}`)
  const state = cloneState(prev)
  state.seq = applied.seq
  const it = applied.intent

  switch (it.v) {
    case 'move': {
      const pos: Partial<{ x: number; y: number; rot: number }> = {}
      if (it.x !== undefined) pos.x = it.x
      if (it.y !== undefined) pos.y = it.y
      if (it.rot !== undefined) pos.rot = it.rot
      relocate(state, it.component, it.to, it.index ?? 0, pos)
      break
    }
    case 'rotate':
      componentOf(state, it.component).rot = it.rot
      break
    case 'flip':
      componentOf(state, resolveRef(state, it.component)).face = it.face
      break
    case 'stack': {
      const component = resolveRef(state, it.component)
      const onto = componentOf(state, it.onto)
      const target = zoneOf(state, onto.zone)
      if (target.kind === 'area') {
        // Two loose cards become a pile where the lower one lies (K1). Zone geometry is in table
        // coordinates; a component's x/y are relative to its zone.
        const pile = createPile(state, `z${applied.seq}`, target, { x: target.geometry.x + onto.x, y: target.geometry.y + onto.y, rot: onto.rot })
        detach(state, onto.id)
        attach(state, onto.id, pile.id, 0)
        detach(state, component)
        attach(state, component, pile.id, 0)
      } else {
        detach(state, component)
        const idx = zoneOf(state, onto.zone).order.indexOf(onto.id)
        attach(state, component, onto.zone, idx)
      }
      break
    }
    case 'split': {
      if (it.to !== undefined) {
        takeTop(state, it.pile, it.to, it.at)
      } else {
        const source = zoneOf(state, it.pile)
        const parent = zoneOf(state, source.parent ?? state.setup.floor)
        const pile = createPile(state, `z${applied.seq}`, parent, {
          x: must(it.x, 'split needs x'),
          y: must(it.y, 'split needs y'),
          rot: source.geometry.rot,
        })
        takeTop(state, it.pile, pile.id, it.at)
      }
      break
    }
    case 'shuffle':
      applyShuffle(state, it.pile, must(applied.outcome, 'shuffle requires an outcome'))
      break
    case 'draw':
      takeTop(state, it.from, it.to, it.count)
      break
    case 'deal':
      for (let round = 0; round < it.each; round++) {
        for (const target of it.to) takeTop(state, it.from, target, 1)
      }
      break
    case 'roll': {
      const o = must(applied.outcome, 'roll requires an outcome')
      if (o.kind !== 'roll') throw new Error('roll outcome has wrong kind')
      componentOf(state, it.component).counter = o.value
      break
    }
    case 'setCounter':
      componentOf(state, it.component).counter = it.value
      break
    case 'peek': {
      const seat = must(applied.by, 'peek requires a seat')
      for (const id of it.components) addUnique(componentOf(state, id).peekedBy, seat)
      break
    }
    case 'showTo':
      for (const id of it.components) {
        const c = componentOf(state, id)
        for (const s of it.seats) addUnique(c.shownTo, s)
      }
      break
    case 'reveal':
      for (const id of it.components) componentOf(state, id).publicOverride = true
      break
    case 'movePile': {
      const pile = zoneOf(state, it.pile)
      pile.geometry = { ...pile.geometry, x: it.x, y: it.y, rot: it.rot ?? pile.geometry.rot }
      pile.parent = it.to
      break
    }
    case 'seat.claim':
      must(state.seats[it.seat], `unknown seat ${it.seat}`).name = it.name
      break
    case 'seat.release': {
      must(state.seats[it.seat], `unknown seat ${it.seat}`).name = null
      const returned = handsReturnedBy(state, it.seat)
      if (returned) {
        for (const hand of returned.hands) {
          for (const id of [...hand.order]) {
            detach(state, id)
            attach(state, id, returned.pile.id, 0)
          }
        }
        applyShuffle(state, returned.pile.id, must(applied.outcome, 'seat.release with cards requires an outcome'))
      }
      break
    }
    case 'setup.reset': {
      const m = materialise(state.setup, state.nextId)
      state.zones = m.zones
      state.components = m.components
      state.nextId = m.nextId
      break
    }
    case 'session.end':
      state.ended = true
      break
    case 'flag':
      // A flagged moment (G3) is a mark in the log; the table is untouched.
      break
    case 'version.change':
      changeVersion(state, it.to, it.components)
      break
    case 'rewind.propose':
      state.rewind = { id: applied.batch, toSeq: it.toSeq, by: applied.by }
      break
    case 'rewind.reject':
      state.rewind = null
      break
    case 'undo.self':
    case 'rewind.confirm': {
      // The outcome already holds the table as restored and reshuffled (decide did that);
      // seats, version and setup are the session's and stay.
      const table = restoredTable(must(applied.outcome, `${it.v} requires a restore outcome`))
      state.zones = table.zones
      state.components = table.components
      state.rewind = null
      break
    }
  }
  settle(state)
  return state
}

function addUnique(list: SeatId[], seat: SeatId): void {
  if (!list.includes(seat)) list.push(seat)
}

function detach(state: TableState, id: ComponentId): void {
  const c = componentOf(state, id)
  const from = zoneOf(state, c.zone)
  const i = from.order.indexOf(id)
  if (i >= 0) from.order.splice(i, 1)
}

// Inserting into a zone other than the one the component came from clears its overrides:
// knowledge granted in a place does not travel with the component (B6). A pile squares its
// cards (K1): whatever a card was turned to, in a pile it lies as the pile does.
function attach(state: TableState, id: ComponentId, zoneId: ZoneId, index: number, keepOverrides = false): void {
  const c = componentOf(state, id)
  const to = zoneOf(state, zoneId)
  const idx = Math.max(0, Math.min(index, to.order.length))
  to.order.splice(idx, 0, id)
  if (c.zone !== zoneId) {
    if (!keepOverrides) clearOverrides(c)
    if (to.kind !== 'area') {
      c.x = 0
      c.y = 0
    }
  }
  if (to.kind === 'pile') c.rot = to.geometry.rot
  c.zone = zoneId
}

function relocate(
  state: TableState,
  id: ComponentId,
  zoneId: ZoneId,
  index: number,
  pos: Partial<{ x: number; y: number; rot: number }>,
): void {
  detach(state, id)
  attach(state, id, zoneId, index)
  const c = componentOf(state, id)
  if (pos.x !== undefined) c.x = pos.x
  if (pos.y !== undefined) c.y = pos.y
  // A rotation asked for on the way into a pile is the pile's to decide (K1).
  if (pos.rot !== undefined && zoneOf(state, zoneId).kind !== 'pile') c.rot = pos.rot
}

// Moves the top `count` components of `from` onto the top of `to`, preserving their order.
function takeTop(state: TableState, from: ZoneId, to: ZoneId, count: number): void {
  const taken = zoneOf(state, from).order.slice(0, count)
  for (const id of taken.toReversed()) {
    detach(state, id)
    attach(state, id, to, 0)
  }
}

// A dynamic pile inherits the visibility of the area it is created in (K1).
function createPile(state: TableState, id: ZoneId, parent: Zone, at: { x: number; y: number; rot: number }): Zone {
  if (state.zones[id]) throw new Error(`zone ${id} already exists`)
  const pile: Zone = {
    id,
    kind: 'pile',
    name: parent.name,
    visibility: parent.visibility,
    geometry: { x: at.x, y: at.y, w: 0, h: 0, rot: at.rot },
    order: [],
    dynamic: true,
    parent: parent.id,
  }
  if (parent.owner !== undefined) pile.owner = parent.owner
  state.zones[id] = pile
  return pile
}

// The deck follows the project (C7): per cardRef, missing copies are added face down at the
// bottom of the zone the spec names, surplus copies are removed — from that zone first, then
// from wherever they lie — and everything else stays exactly where it is.
function changeVersion(state: TableState, to: string, components: readonly ComponentSpec[]): void {
  const wanted = new Map<string, ComponentSpec[]>()
  for (const spec of components) wanted.set(spec.cardRef, [...(wanted.get(spec.cardRef) ?? []), spec])
  const have = new Map<string, ComponentInstance[]>()
  for (const c of Object.values(state.components)) have.set(c.cardRef, [...(have.get(c.cardRef) ?? []), c])

  for (const [cardRef, instances] of have) {
    const specs = wanted.get(cardRef) ?? []
    const surplus = instances.length - specs.length
    if (surplus <= 0) continue
    const home = specs[0]?.zone
    const ordered = [...instances.filter((c) => c.zone === home), ...instances.filter((c) => c.zone !== home)]
    for (const c of ordered.slice(0, surplus)) {
      detach(state, c.id)
      state.components = withoutKey(state.components, c.id)
    }
  }
  for (const [cardRef, specs] of wanted) {
    const missing = specs.length - (have.get(cardRef)?.length ?? 0)
    for (let i = 0; i < missing; i++) {
      const spec = specs[i] ?? specs[0]
      if (!spec) continue
      const id = `c${state.nextId++}`
      const inst: ComponentInstance = {
        id,
        type: spec.type,
        cardRef,
        zone: spec.zone,
        face: spec.face,
        x: spec.x ?? 0,
        y: spec.y ?? 0,
        rot: spec.rot ?? 0,
        shownTo: [],
        peekedBy: [],
        publicOverride: false,
      }
      if (spec.counter !== undefined) inst.counter = spec.counter
      state.components[id] = inst
      zoneOf(state, spec.zone).order.push(id)
    }
  }
  state.version = to
  state.setup = { ...state.setup, components: [...components] }
}

// A dynamic pile with one component left is no pile: the card returns to the parent area
// where the pile stood, keeping whatever knowledge was granted about it — it never moved.
function settle(state: TableState): void {
  for (const zone of Object.values(state.zones)) {
    if (!zone.dynamic || zone.order.length > 1) continue
    const parentId = zone.parent ?? state.setup.floor
    const last = zone.order[0]
    if (last !== undefined) {
      detach(state, last)
      attach(state, last, parentId, 0, true)
      const c = componentOf(state, last)
      const parent = zoneOf(state, parentId)
      c.x = zone.geometry.x - parent.geometry.x
      c.y = zone.geometry.y - parent.geometry.y
      c.rot = zone.geometry.rot
    }
    state.zones = withoutKey(state.zones, zone.id)
  }
}

function applyShuffle(state: TableState, pileId: ZoneId, outcome: Outcome): void {
  if (outcome.kind !== 'shuffle') throw new Error('shuffle outcome has wrong kind')
  const pile = zoneOf(state, pileId)
  const present = new Set(pile.order)
  const rekey = new Map(outcome.rekey)
  if (rekey.size !== present.size || ![...present].every((id) => rekey.has(id))) {
    throw new Error(`shuffle outcome does not cover pile ${pileId}`)
  }
  const next: Record<ComponentId, ComponentInstance> = {}
  for (const [id, c] of Object.entries(state.components)) {
    const fresh = rekey.get(id)
    if (fresh === undefined) {
      next[id] = c
      continue
    }
    const moved = { ...c, id: fresh }
    clearOverrides(moved)
    next[fresh] = moved
  }
  state.components = next
  const freshSet = new Set(rekey.values())
  if (outcome.order.length !== freshSet.size || !outcome.order.every((id) => freshSet.has(id))) {
    throw new Error('shuffle outcome order does not match its rekey')
  }
  pile.order = [...outcome.order]
}
