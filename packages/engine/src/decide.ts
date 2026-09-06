import type { Applied, ComponentId, Envelope, Intent, Outcome, ZoneId } from '@byd/protocol'
import { apply } from './apply.js'
import { handsReturnedBy } from './hands.js'
import type { IdSource, Rng } from './rng.js'
import { permutation } from './rng.js'
import { componentOf, must, zoneOf, type TableState } from './state.js'
import type { TypeRegistry } from './typedef.js'

// `decide` is the only place randomness enters. It validates an envelope against the
// current state and produces the `Applied` lines whose outcomes fully determine `apply`.
// Validation is structural (does the thing exist, is there enough of it) — never rules.
//
// An envelope is atomic (K3). Each intent is validated against a working state that
// already has the previous intents of the same envelope applied; the first failure
// rejects the whole envelope and nothing is returned.

export type DecideDeps = { rng: Rng; ids: IdSource; now(): string }
export type Decision = { ok: true; applied: Applied[] } | { ok: false; reason: string }

export function decide(state: TableState, registry: TypeRegistry, env: Envelope, deps: DecideDeps): Decision {
  if (state.ended) return { ok: false, reason: 'session has ended' }
  if (env.seat !== null && !state.seats[env.seat]) return { ok: false, reason: `unknown seat ${env.seat}` }

  const lines: Applied[] = []
  let working = state
  for (const [i, intent] of env.intents.entries()) {
    const problem = validate(working, registry, env.seat, intent)
    if (problem) return { ok: false, reason: env.intents.length > 1 ? `intent ${i}: ${problem}` : problem }
    const applied: Applied = { seq: working.seq + 1, batch: env.id, at: deps.now(), by: env.seat, intent }
    const outcome = decideOutcome(working, registry, intent, deps)
    if (outcome) applied.outcome = outcome
    lines.push(applied)
    working = apply(working, registry, applied)
  }
  return { ok: true, applied: lines }
}

function validate(state: TableState, registry: TypeRegistry, seat: string | null, it: Intent): string | null {
  const comp = (id: ComponentId) => (state.components[id] ? null : `unknown component ${id}`)
  const zone = (id: ZoneId) => (state.zones[id] ? null : `unknown zone ${id}`)
  const all = (checks: (string | null)[]) => checks.find((c) => c !== null) ?? null
  const def = (id: ComponentId) => registry.get(componentOf(state, id).type)

  switch (it.v) {
    case 'move':
      return all([comp(it.component), zone(it.to)])
    case 'rotate':
      return comp(it.component)
    case 'flip': {
      const c = comp(it.component)
      if (c) return c
      const d = def(it.component)
      if (!d.behaviours.flippable) return `${d.id} cannot be flipped`
      if (!d.faces.includes(it.face)) return `${d.id} has no face ${it.face}`
      return null
    }
    case 'stack': {
      const c = all([comp(it.component), comp(it.onto)])
      if (c) return c
      if (it.component === it.onto) return 'cannot stack a component onto itself'
      if (!def(it.component).behaviours.stackable) return `${def(it.component).id} cannot be stacked`
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
      } else if (it.x === undefined || it.y === undefined) {
        return 'split without a target needs x and y for the new pile'
      }
      if (it.at > zoneOf(state, it.pile).order.length) return `pile ${it.pile} has fewer than ${it.at} components`
      return null
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
      if (it.count > zoneOf(state, it.from).order.length) return `zone ${it.from} has fewer than ${it.count} components`
      return null
    }
    case 'deal': {
      const z = all([zone(it.from), ...it.to.map(zone)])
      if (z) return z
      if (it.to.includes(it.from)) return 'cannot deal from a zone into itself'
      const needed = it.each * it.to.length
      if (needed > zoneOf(state, it.from).order.length) return `zone ${it.from} has fewer than ${needed} components`
      return null
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
    case 'undo.self':
    case 'rewind.propose':
    case 'rewind.confirm':
    case 'version.change':
      return `${it.v} is not implemented in the thin slice`
  }
}

function decideOutcome(state: TableState, registry: TypeRegistry, it: Intent, deps: DecideDeps): Outcome | undefined {
  switch (it.v) {
    case 'shuffle':
      return shuffleOutcome(zoneOf(state, it.pile).order, deps)
    case 'roll': {
      const d = registry.get(componentOf(state, it.component).type)
      if (d.behaviours.rollable === false) throw new Error('validated rollable but definition disagrees')
      return { kind: 'roll', value: deps.rng.int(d.behaviours.rollable.faces) + 1 }
    }
    case 'seat.release': {
      const returned = handsReturnedBy(state, it.seat)
      if (!returned) return undefined
      return shuffleOutcome([...returned.pile.order, ...returned.handComponents], deps)
    }
    default:
      return undefined
  }
}

function shuffleOutcome(ids: readonly ComponentId[], deps: DecideDeps): Outcome {
  const rekey = ids.map((old) => [old, deps.ids.next()] as [ComponentId, ComponentId])
  const fresh = rekey.map(([, nu]) => nu)
  const order = permutation(ids.length, deps.rng).map((i) => must(fresh[i], 'permutation index out of range'))
  return { kind: 'shuffle', rekey, order }
}
