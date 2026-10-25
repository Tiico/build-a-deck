import { NOTE_MAX, PHYSICAL_VERBS, REDACTED, SCHEMA_VERSION, type Applied, type ComponentId, type ComponentRef, type Envelope, type Intent, type Outcome, type UndoMeaning, type ZoneId } from '@byd/protocol'
import { apply } from './apply.js'
import { handsReturnedBy } from './hands.js'
import { sees } from './project.js'
import type { IdSource, Rng } from './rng.js'
import { permutation } from './rng.js'
import { reach } from './reach.js'
import { componentOf, must, resolveRef, zoneOf, type Table, type TableState, bottomOf } from './state.js'
import { isMaterial, type TypeRegistry } from './typedef.js'

// `decide` is the only place randomness enters. It validates an envelope against the
// current state and produces the `Applied` lines whose outcomes fully determine `apply`.
// Validation is structural (does the thing exist, is there enough of it) — never rules.
//
// An envelope is atomic (K3). Each intent is validated against a working state that
// already has the previous intents of the same envelope applied; the first failure
// rejects the whole envelope and nothing is returned.

// What decide draws on besides the state: randomness, ids, the clock, and the log so far.
export type Sources = { rng: Rng; ids: IdSource; now(): string }
export type History = {
  // The state right after line `seq` was applied; 0 is the initial state.
  stateAt(seq: number): TableState
  // Every committed line, in order.
  lines(): readonly Applied[]
}
export type DecideDeps = Sources & { history: History }
export type Decision = { ok: true; applied: Applied[] } | { ok: false; reason: string }

export function decide(state: TableState, registry: TypeRegistry, env: Envelope, deps: DecideDeps): Decision {
  if (state.ended) return { ok: false, reason: 'session has ended' }
  if (env.seat !== null && !state.seats[env.seat]) return { ok: false, reason: `unknown seat ${env.seat}` }
  // The envelope id becomes the batch: two envelopes sharing one would merge in the log.
  if (deps.history.lines().some((l) => l.batch === env.id)) return { ok: false, reason: `envelope id ${env.id} was already used` }

  const lines: Applied[] = []
  let working = state
  for (const [i, intent] of env.intents.entries()) {
    const problem = validate(working, registry, env.seat, intent) ?? validateRewind(state, env, intent, deps.history)
    if (problem) return { ok: false, reason: env.intents.length > 1 ? `intent ${i}: ${problem}` : problem }
    const applied: Applied = { schemaVersion: SCHEMA_VERSION, seq: working.seq + 1, batch: env.id, at: deps.now(), by: env.seat, intent }
    const outcome = decideOutcome(working, registry, intent, deps, env)
    if (outcome) applied.outcome = outcome
    lines.push(applied)
    working = apply(working, registry, applied)
  }
  return { ok: true, applied: lines }
}

// The notepad's bounds (#1131): a row says something and is at most what a flag's note may be, and
// the pad holds a hundred rows — more than a game asks anyone to keep in their head, and few enough
// that the whole pad travels in one patch.
const NOTES_MAX = 100
function noteText(text: string): string | null {
  if (text.trim().length === 0) return 'a note says something'
  return text.length > NOTE_MAX ? `a note is at most ${NOTE_MAX} characters` : null
}

function validate(state: TableState, registry: TypeRegistry, seat: string | null, it: Intent): string | null {
  const comp = (id: ComponentId) => (state.components[id] ? null : `unknown component ${id}`)
  const zone = (id: ZoneId) => (state.zones[id] ? null : `unknown zone ${id}`)
  const all = (checks: (string | null)[]) => checks.find((c) => c !== null) ?? null
  const note = (id: string) => (state.notes.some((n) => n.id === id) ? null : `unknown note ${id}`)
  const def = (id: ComponentId) => registry.get(componentOf(state, id).type)
  // A pile named as a source (K15) must exist, be a pile, and have a top to give.
  const ref = (r: ComponentRef): string | null => {
    if (typeof r === 'string') return comp(r)
    const z = zone(r.top)
    if (z) return z
    if (zoneOf(state, r.top).kind !== 'pile') return `zone ${r.top} is not a pile`
    return zoneOf(state, r.top).order.length > 0 ? null : `pile ${r.top} is empty`
  }
  // The side cards land on when they are moved in bulk. The same gate `flip` keeps, asked of
  // every card that is about to move: a side the type does not have is not a side to lie on.
  const landsOn = (moving: readonly ComponentId[], face: string | undefined): string | null => {
    if (face === undefined) return null
    const without = moving.find((id) => !def(id).faces.includes(face))
    return without === undefined ? null : `${def(without).id} has no face ${face}`
  }

  // Material is never held (#1377, K32): a piece that rolls or keeps a count lies on the table, and
  // a hand is a row of cards that no screen draws a die or a chip in. Read off what the type
  // declares, as every other refusal here is.
  const held = (to: ZoneId, moving: readonly ComponentId[]): string | null => {
    if (zoneOf(state, to).kind !== 'hand') return null
    const piece = moving.find((id) => isMaterial(def(id)))
    return piece === undefined ? null : `${def(piece).id} cannot be held in a hand`
  }

  switch (it.v) {
    case 'move':
      return all([comp(it.component), zone(it.to)]) ?? held(it.to, [it.component])
    case 'rotate':
      return comp(it.component)
    case 'flip': {
      const c = ref(it.component)
      if (c) return c
      const d = def(resolveRef(state, it.component))
      if (!d.behaviours.flippable) return `${d.id} cannot be flipped`
      if (!d.faces.includes(it.face)) return `${d.id} has no face ${it.face}`
      return null
    }
    case 'stack': {
      const c = all([ref(it.component), comp(it.onto)])
      if (c) return c
      const id = resolveRef(state, it.component)
      if (id === it.onto) return 'cannot stack a component onto itself'
      if (!def(id).behaviours.stackable) return `${def(id).id} cannot be stacked`
      if (!def(it.onto).behaviours.stackable) return `${def(it.onto).id} cannot be stacked on`
      return null
    }
    case 'split': {
      const z = zone(it.pile)
      if (z) return z
      if (zoneOf(state, it.pile).kind !== 'pile') return `zone ${it.pile} is not a pile`
      if (it.to !== undefined) {
        const t = zone(it.to)
        if (t) return t
        if (it.pile === it.to) return 'cannot split a pile onto itself'
        // A row is laid beside the pile it came out of (#1203); a zone has its own way of
        // holding what is put into it.
        if (it.row !== undefined) return 'a row is laid beside its pile and takes no target'
      } else if (it.x === undefined || it.y === undefined) {
        return 'split without a target needs x and y for the new pile'
      }
      const taken = reach(state, it.pile, it.which, it.at)
      if (typeof taken === 'string') return taken
      return (it.to === undefined ? null : held(it.to, taken)) ?? landsOn(taken, it.face)
    }
    case 'shuffle': {
      const z = zone(it.pile)
      if (z) return z
      const notShufflable = zoneOf(state, it.pile).order.find((id) => !def(id).behaviours.shufflable)
      return notShufflable ? `${def(notShufflable).id} cannot be shuffled` : null
    }
    case 'draw': {
      const z = all([zone(it.from), zone(it.to)])
      if (z) return z
      if (it.from === it.to) return 'cannot draw from a zone into itself'
      const taken = reach(state, it.from, it.which, it.count)
      if (typeof taken === 'string') return taken
      return held(it.to, taken) ?? landsOn(taken, it.face)
    }
    case 'deal': {
      const z = all([zone(it.from), ...it.to.map(zone)])
      if (z) return z
      if (it.to.includes(it.from)) return 'cannot deal from a zone into itself'
      const needed = it.each * it.to.length
      if (needed > zoneOf(state, it.from).order.length) return `zone ${it.from} has fewer than ${needed} components`
      const dealt = zoneOf(state, it.from).order.slice(0, needed)
      return all(it.to.map((to) => held(to, dealt))) ?? landsOn(dealt, it.face)
    }
    case 'roll': {
      const c = comp(it.component)
      if (c) return c
      return def(it.component).behaviours.rollable ? null : `${def(it.component).id} cannot be rolled`
    }
    case 'setCounter': {
      const c = comp(it.component)
      if (c) return c
      return def(it.component).behaviours.counter ? null : `${def(it.component).id} has no counter`
    }
    case 'peek':
      if (seat === null) return 'a table connection cannot peek: there is no one to grant knowledge to'
      return all(it.components.map(comp))
    case 'showTo':
      return all([...it.components.map(comp), ...it.seats.map((s) => (state.seats[s] ? null : `unknown seat ${s}`))])
    case 'reveal':
      return all(it.components.map(comp))
    case 'movePile': {
      const z = all([zone(it.pile), zone(it.to)])
      if (z) return z
      if (zoneOf(state, it.pile).kind !== 'pile') return `zone ${it.pile} is not a pile`
      if (zoneOf(state, it.to).kind !== 'area') return `zone ${it.to} is not an area`
      return null
    }
    case 'seat.claim': {
      const s = state.seats[it.seat]
      if (!s) return `unknown seat ${it.seat}`
      // What a masked name says (#1276) is nobody's name, so nobody sits down under it.
      if (it.name.trim() === REDACTED) return 'the placeholder of a masked name is nobody’s name'
      return s.name === null ? null : `seat ${it.seat} is already claimed`
    }
    case 'seat.release': {
      const s = state.seats[it.seat]
      if (!s) return `unknown seat ${it.seat}`
      if (s.name === null) return `seat ${it.seat} is not claimed`
      if (seat !== null && seat !== it.seat) return 'only the seat itself or the table may release a seat'
      return null
    }
    case 'setup.reset':
    case 'session.end':
      return null
    case 'flag':
      if (it.note !== undefined && it.note.length > 280) return 'a flag note is at most 280 characters'
      // The card a flag is about is one the flagger can see (#1142): naming any other would let a
      // flag probe for ids no view was given. The observer is seatless and sees every hand (C8).
      if (it.component !== undefined && !sees(state, registry, seat, it.component, seat === null && it.observer !== undefined)) return `no component ${it.component} in view`
      return null
    case 'turn.give': {
      // Refused only where it cannot mean anything (K30, B5): who gives it, and when, is never
      // the table's to judge.
      if (!state.setup.turns) return 'this game does not go in turns'
      const s = state.seats[it.seat]
      if (!s) return `unknown seat ${it.seat}`
      return s.name === null ? `seat ${it.seat} is free` : null
    }
    case 'note.add':
      if (state.notes.length >= NOTES_MAX) return `the notepad holds at most ${NOTES_MAX} notes`
      return noteText(it.text)
    case 'note.edit':
      return note(it.note) ?? noteText(it.text)
    case 'note.check':
    case 'note.remove':
      return note(it.note)
    case 'version.change': {
      for (const spec of it.components) {
        if (!state.zones[spec.zone]) return `unknown zone ${spec.zone}`
        if (!registry.has(spec.type)) return `unknown component type ${spec.type.id}@${spec.type.version}`
        if (!registry.get(spec.type).faces.includes(spec.face)) return `${spec.type.id} has no face ${spec.face}`
        if (state.zones[spec.zone]?.kind === 'hand' && isMaterial(registry.get(spec.type))) return `${spec.type.id} cannot be held in a hand`
      }
      return null
    }
    case 'undo.self':
    case 'rewind.propose':
    case 'rewind.confirm':
    case 'rewind.reject':
      // Checked against the log, not the working state: see validateRewind.
      return null
  }
}

// Rewinds (B) are about the log, so they cannot share an envelope with anything else, and
// they are validated against the committed state rather than a working one.
function validateRewind(state: TableState, env: Envelope, it: Intent, history: History): string | null {
  if (it.v !== 'undo.self' && it.v !== 'rewind.propose' && it.v !== 'rewind.confirm' && it.v !== 'rewind.reject') return null
  if (env.intents.length > 1) return `${it.v} must be the only intent in its envelope`
  switch (it.v) {
    case 'undo.self': {
      const target = undoTarget(history.lines(), env.seat)
      if (target === null) return 'nothing to undo'
      if (target.contested) return 'someone else has acted since: propose a rewind instead'
      return null
    }
    case 'rewind.propose':
      return it.toSeq < state.seq ? null : `cannot rewind to ${it.toSeq}: the table is at ${state.seq}`
    case 'rewind.confirm': {
      if (!state.rewind || state.rewind.id !== it.proposal) return `no open rewind proposal ${it.proposal}`
      if (state.rewind.by === env.seat) return 'a rewind must be confirmed by someone else at the table'
      return null
    }
    case 'rewind.reject':
      return state.rewind && state.rewind.id === it.proposal ? null : `no open rewind proposal ${it.proposal}`
  }
}

// The lines still in effect on the table: a restore takes everything after its target out of
// the story, and neither talking about a rewind, sitting down or leaving, passing the turn nor
// writing in the notepad is play.
const NOT_PLAY = new Set(['rewind.propose', 'rewind.reject', 'seat.claim', 'seat.release', 'flag', 'turn.give', 'note.add', 'note.edit', 'note.check', 'note.remove'])
export function effectiveLines(log: readonly Applied[]): Applied[] {
  const out: Applied[] = []
  let cutoff = Infinity
  for (const line of log.toReversed()) {
    if (line.seq > cutoff) continue
    const o = line.outcome
    if (o?.kind === 'restore') {
      cutoff = o.toSeq
      continue
    }
    if (NOT_PLAY.has(line.intent.v)) continue
    out.unshift(line)
  }
  return out
}

// The moves of a game as it stands (#1010): the lines still in effect that are play on the table.
// A version changed under the table, a reset and the ending are lines in effect, but none of them
// is a move anyone made; this is what «drag n av N» counts.
export function movesOf(log: readonly Applied[]): Applied[] {
  return effectiveLines(log).filter((line) => PHYSICAL_VERBS.includes(line.intent.v))
}

// Where undo.self would take the table: before the seat's last batch still in effect — and
// whether someone else has acted since, which makes it a matter for a rewind proposal.
//
// The table (seat null) takes back only its own moves (#682, K13): the felt's own screen plays as
// the table, but the host's «Uppdatera» and a reset are written by nobody in particular too, and
// those are not moves the felt made. They are never what the felt undoes, and one written since
// the felt's last move means that move is no longer the felt's alone to take back.
export function undoTarget(log: readonly Applied[], seat: string | null): UndoMeaning {
  const lines = effectiveLines(log)
  const own = (l: Applied) => l.by === seat && (seat !== null || PHYSICAL_VERBS.includes(l.intent.v))
  const last = lines.findLast(own)
  if (!last) return null
  const batch = lines.filter((l) => l.batch === last.batch)
  const first = must(batch[0], 'a batch has a first line')
  return { toSeq: first.seq - 1, contested: lines.some((l) => l.seq > last.seq && !own(l)) }
}

function decideOutcome(state: TableState, registry: TypeRegistry, it: Intent, deps: DecideDeps, env: Envelope): Outcome | undefined {
  switch (it.v) {
    case 'undo.self': {
      const target = undoTarget(deps.history.lines(), env.seat)
      if (!target || target.contested) throw new Error('validated undo.self but no target')
      return restoreOutcome(state, registry, target.toSeq, deps)
    }
    case 'rewind.confirm':
      return restoreOutcome(state, registry, must(state.rewind, 'validated rewind.confirm without a proposal').toSeq, deps)
    case 'shuffle': {
      const pile = zoneOf(state, it.pile)
      return shuffleOutcome(pile.order, deps, bottomOf(state, pile))
    }
    case 'roll': {
      const d = registry.get(componentOf(state, it.component).type)
      if (d.behaviours.rollable === false) throw new Error('validated rollable but definition disagrees')
      return { kind: 'roll', value: deps.rng.int(d.behaviours.rollable.faces) + 1 }
    }
    case 'seat.release': {
      const returned = handsReturnedBy(state, it.seat)
      if (!returned) return undefined
      // The hand goes on top and the pile is shuffled (C9); a bottom card, in the pile or in the
      // hand on its way home, lies last (K23).
      const ids = [...returned.pile.order, ...returned.handComponents]
      const home = returned.pile.bottom?.cardRef
      const bottom = home === undefined ? undefined : [...ids].reverse().find((id) => state.components[id]?.cardRef === home)
      return shuffleOutcome(ids, deps, bottom)
    }
    default:
      return undefined
  }
}

// The table as it was after `toSeq`, with every hidden pile that has lost a card since then
// shuffled: a card that left a face-down pile was seen, and putting it back on top in a known
// place would be knowledge no physical rewind grants.
function restoreOutcome(current: TableState, registry: TypeRegistry, toSeq: number, deps: DecideDeps): Outcome {
  const then = deps.history.stateAt(toSeq)
  const table: Table = { zones: then.zones, components: then.components }
  for (const pile of Object.values(then.zones)) {
    if (pile.kind !== 'pile' || pile.visibility !== 'none' || pile.order.length === 0) continue
    const now = new Set(current.zones[pile.id]?.order ?? [])
    if (pile.order.every((id) => now.has(id))) continue
    const outcome = shuffleOutcome(pile.order, deps, bottomOf(then, pile))
    const shuffled = apply(
      { ...then, zones: table.zones, components: table.components, seq: then.seq },
      registry,
      { schemaVersion: SCHEMA_VERSION, seq: then.seq + 1, batch: 'restore', at: '', by: null, intent: { v: 'shuffle', pile: pile.id }, outcome },
    )
    table.zones = shuffled.zones
    table.components = shuffled.components
  }
  return { kind: 'restore', toSeq, table }
}

// Every card is re-keyed, the bottom card too (K23): it may not be tracked through a shuffle any
// more than the others. Only its place is fixed — the permutation is drawn over the rest, and
// the outcome's `order` says so in full, which is what replays it identically (D4).
function shuffleOutcome(ids: readonly ComponentId[], deps: DecideDeps, keepLast?: ComponentId): Outcome {
  const rekey = ids.map((old) => [old, deps.ids.next()] as [ComponentId, ComponentId])
  const fresh = new Map(rekey)
  const mixed = ids.filter((id) => id !== keepLast)
  const order = permutation(mixed.length, deps.rng).map((i) => must(fresh.get(must(mixed[i], 'permutation index out of range')), 'unkeyed card'))
  if (keepLast !== undefined && fresh.has(keepLast)) order.push(must(fresh.get(keepLast), 'unkeyed bottom card'))
  return { kind: 'shuffle', rekey, order }
}
