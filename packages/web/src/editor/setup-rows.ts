import { createContext } from 'react'
import { counterId, type Counter, type Die, type Setup, type Zone } from '@byd/server/doc'
import type { T } from '../i18n/index.js'
import { nameOf, templateOf } from './zone-name.js'

// What the list in Bord's column is made of, apart from the rows themselves: which zones cannot
// go, which belong to a family (#175), and whether the whole thing is being read or written. The
// felt asks the same questions, so they live here and not in either surface.

// Why a zone cannot be taken away, in the words that say what to do instead — or nothing at all,
// which means it can go. One rule, read by the list, by the felt's Delete and by the actor, so the
// three never disagree about what the table cannot be without.
export function fixed(setup: Setup, zone: Zone, t: T): string | null {
  if (zone.id === setup.floor) return t('setup.fixed.floor')
  if (zone.kind === 'hand') return t('setup.fixed.hand')
  if (zone.id === setup.deckZone) return t('setup.fixed.deck')
  return null
}

// Whether the table is read rather than written (#489): what a zone is stays there to read, and
// nothing in it takes a keystroke.
export const Reading = createContext(false)

// Vilken zonfamilj en zon hör till, eller ingen (#175). En zon är per plats när dess id är rollen
// och platsen — `hand:A`, `mine:A`, `counters:A` — och platsen är den som äger zonen. En zon
// designern själv lagt till och gett en ägare heter `yta-3` och hamnar därför aldrig i en familj:
// den är en zon vid en plats, inte samma zon vid var sin.
export function familyRole(zone: Zone): string | null {
  if (zone.owner === undefined) return null
  const at = zone.id.lastIndexOf(':')
  if (at <= 0) return null
  return zone.id.slice(at + 1) === zone.owner ? zone.id.slice(0, at) : null
}

// Namnmallen och ordgränsregeln bor i `zone-name.ts`: rutorna i `ZoneActions` ställer samma
// fråga om samma namn (#255), och två kopior av uttrycket är ett fel som väntar.

// En zonfamilj: samma zon vid var sin plats. `first` är den zon som står först i dokumentet — den
// familjen tar sin plats i listan efter, och den raden läser sitt slag och sitt «fast» ur. `differ`
// är de platser vars namn inte följer familjens mall: en upplysning på raden, inte en lista som
// öppnar sig själv.
export type Family = { role: string; name: string; first: Zone; zones: Zone[]; differ: Zone[] }
export type Row = { kind: 'family'; family: Family } | { kind: 'zone'; zone: Zone }

// Listans rader ur bordets zoner, i dokumentets egen ordning: en familj tar den plats dess första
// zon hade. Listan grupperar; modellen aldrig — filten ritar var och en av dem för sig.
export function rowsOf(zones: Zone[]): Row[] {
  const rows: Row[] = []
  const at = new Map<string, Family>()
  for (const zone of zones) {
    const role = familyRole(zone)
    const family = role === null ? undefined : at.get(role)
    if (family) {
      family.zones.push(zone)
      continue
    }
    if (role === null) {
      rows.push({ kind: 'zone', zone })
      continue
    }
    const made: Family = { role, name: '', first: zone, zones: [zone], differ: [] }
    at.set(role, made)
    rows.push({ kind: 'family', family: made })
  }
  return rows.map((row) => (row.kind === 'family' ? { kind: 'family', family: settle(row.family) } : row))
}

// Vilken mall familjen står för, och vilka platser som avviker från den: den mall flest platser
// delar, och vid lika den som står först i dokumentet.
function settle(family: Family): Family {
  const counts = new Map<string, number>()
  for (const zone of family.zones) {
    const template = templateOf(zone)
    counts.set(template, (counts.get(template) ?? 0) + 1)
  }
  let best = templateOf(family.first)
  for (const [template, n] of counts) if (n > (counts.get(best) ?? 0)) best = template
  return { ...family, name: nameOf(best) || family.first.name, differ: family.zones.filter((zone) => templateOf(zone) !== best) }
}

// The kinds a die can be (K28): the registry's six, by their sides.
export const DIE_FACES = [4, 6, 8, 10, 12, 20] as const satisfies readonly Die['faces'][]
// Where a die can lie (#1139), as the zone picker's values: `zone:<id>` for an area every seat
// shares, `role:<role>` for an area each seat has. Hands and piles are no place for a die.
export type DiePlace = { value: string; name: string }
export function diePlaces(setup: Setup): { table: DiePlace[]; seats: DiePlace[] } {
  const table = setup.zones.filter((z) => z.kind === 'area' && z.owner === undefined).map((z) => ({ value: `zone:${z.id}`, name: z.name }))
  const seats = rowsOf(setup.zones).flatMap((row) => (row.kind === 'family' && row.family.first.kind === 'area' ? [{ value: `role:${row.family.role}`, name: row.family.name }] : []))
  return { table, seats }
}
export const placeOf = (die: Die): string => (die.role !== undefined ? `role:${die.role}` : `zone:${die.zone ?? ''}`)
// A die moved to another place keeps what its count meant: «per spelare» in a seat's area is
// «per spelare» on the table too, and a seat's area has no other meaning to carry back. The point
// it was dragged to was a point in the old zone (#1292), so the new one lays it where it finds room.
export function movedTo(die: Die, value: string): Die {
  const { zone: _zone, role: _role, at: _at, perSeat, ...rest } = die
  if (value.startsWith('role:')) return { ...rest, role: value.slice('role:'.length) }
  const seated = die.role !== undefined || perSeat === true
  return { ...rest, zone: value.slice('zone:'.length), ...(seated ? { perSeat: true } : {}) }
}

// A new counter: the first is the score, the rest are lives — under a name no counter has yet, the
// way new piles get one (#480). Two «Liv» were two «LIV» on the phone and the TV (#713). Born from
// an area family's ＋ it carries that role (K31); from the counters zone it carries none.
export function newCounter(counters: readonly Counter[], t: T, role?: string): Counter {
  const [base, start] = counters.length === 0 ? [t('counter.score'), 0] : [t('counter.life'), 20]
  const taken = new Set(counters.map((c) => c.name))
  let name = base
  for (let n = 2; taken.has(name); n++) name = `${base} ${n}`
  // And an id no counter has, which the rules name it by however it is renamed later (#708).
  const ids = new Set(counters.map(counterId))
  let id = counterId({ name })
  for (let n = 2; ids.has(id); n++) id = `${counterId({ name })}-${n}`
  return { id, name, start, ...(role !== undefined ? { role } : {}) }
}
