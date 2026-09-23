import { SessionIntent, type Applied, type ComponentId, type ComponentSpec, type Outcome, type SeatId, type ZoneId } from '@byd/protocol'
import type { CardQuery } from '@byd/protocol'
import { reach } from './reach.js'
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
  type Zone, bottomOf } from './state.js'
import type { TypeRegistry } from './typedef.js'
import { clearOverrides } from './visibility.js'

// `apply` is pure and total over valid logs: given the same state and the same `Applied`,
// it yields the same state. All randomness has already been fixed in `applied.outcome`.
// Dynamic pile ids derive from `seq`, so they need no outcome to replay.

// Which verbs are the session's and not the hand's. Read off the schema rather than written out
// again, so the two cannot drift: a verb added to `SessionIntent` is a session verb here the same
// day, and one added to the physical set counts as play without anybody remembering to say so.
const SESSION_VERBS: ReadonlySet<string> = new Set(SessionIntent.options.map((o) => o.shape.v.value))

export function apply(prev: TableState, _registry: TypeRegistry, applied: Applied): TableState {
  if (applied.seq !== prev.seq + 1) throw new Error(`seq gap: expected ${prev.seq + 1}, got ${applied.seq}`)
  const state = cloneState(prev)
  state.seq = applied.seq
  const it = applied.intent
  // Somebody touched a card here (#452). Sitting down is not playing: a seat is the session's
  // and not the game's, which is the whole reason `seq` could not answer this.
  if (!SESSION_VERBS.has(it.v)) state.played = true

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
      const taken = reached(state, it.pile, it.which, it.at)
      if (it.to !== undefined) {
        take(state, taken, it.to)
      } else {
        const source = zoneOf(state, it.pile)
        const parent = zoneOf(state, source.parent ?? state.setup.floor)
        const pile = createPile(state, `z${applied.seq}`, parent, {
          x: must(it.x, 'split needs x'),
          y: must(it.y, 'split needs y'),
          rot: source.geometry.rot,
        })
        take(state, taken, pile.id)
      }
      turn(state, taken, it.face)
      break
    }
    case 'shuffle':
      applyShuffle(state, it.pile, must(applied.outcome, 'shuffle requires an outcome'))
      break
    case 'draw': {
      const drawn = reached(state, it.from, it.which, it.count)
      take(state, drawn, it.to)
      turn(state, drawn, it.face)
      break
    }
    case 'deal': {
      const dealt = zoneOf(state, it.from).order.slice(0, it.each * it.to.length)
      for (let round = 0; round < it.each; round++) {
        for (const target of it.to) takeTop(state, it.from, target, 1)
      }
      turn(state, dealt, it.face)
      break
    }
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
      // Bordet står som uppställningen lade det, så ingenting ligger ute att lägga tillbaka
      // (#452). Att fråga «korten som ligger ute går tillbaka» vid ett bord där inga kort ligger
      // ute är att fråga om ingenting.
      state.played = false
      break
    }
    case 'session.end':
      state.ended = true
      break
    case 'flag':
      // A flagged moment (G3) is a mark in the log; the table is untouched.
      break
    case 'version.change':
      changeVersion(state, it.to, it.components, it.cards)
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
  let idx = Math.max(0, Math.min(index, to.order.length))
  // The pile's bottom card lies last (K23): coming home it goes under everything, wherever it
  // was asked to go, and nothing else is laid under it while it lies there.
  if (to.bottom !== undefined && to.kind === 'pile') {
    if (c.cardRef === to.bottom.cardRef && c.zone !== zoneId) idx = to.order.length
    else if (c.cardRef !== to.bottom.cardRef && idx === to.order.length && to.order.length > 0 && bottomOf(state, to) === to.order[to.order.length - 1]) idx = to.order.length - 1
  }
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
// Which side the cards that were just moved end up lying on (`face` on split, draw and deal).
// Said nothing, they keep the side they had, which is what every line written before the field
// existed means; the cards are named by the ids they had *before* the move, because that is the
// only moment the top of the source pile is knowable.
// What the line reaches for, by the one rule `decide` used to let it through. A refusal here
// would mean the two disagreed, which is a broken log and not a rejected move.
function reached(state: TableState, pile: ZoneId, which: CardQuery | undefined, count: number): ComponentId[] {
  const found = reach(state, pile, which, count)
  if (typeof found === 'string') throw new Error(found)
  return found
}

function turn(state: TableState, moved: readonly ComponentId[], face: string | undefined): void {
  if (face === undefined) return
  for (const id of moved) componentOf(state, id).face = face
}

function takeTop(state: TableState, from: ZoneId, to: ZoneId, count: number): void {
  take(state, zoneOf(state, from).order.slice(0, count), to)
}

// Moving named cards into a zone, keeping the order they were named in. `takeTop` is this with
// the top so many named; a question (`which`) names cards that need not lie together.
function take(state: TableState, ids: readonly ComponentId[], to: ZoneId): void {
  for (const id of [...ids].reverse()) {
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
function changeVersion(state: TableState, to: string, components: readonly ComponentSpec[], cards: Record<string, Record<string, string>> | undefined): void {
  // What the rows say now. A line written before this field existed carries none, and leaves the
  // index it found — which is what such a line meant, since no question could be asked then.
  if (cards !== undefined) state.setup = { ...state.setup, cards }
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
