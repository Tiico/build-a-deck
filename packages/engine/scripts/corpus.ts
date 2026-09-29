import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Applied, Snapshot } from '@byd/protocol'
import { TypeRegistry, initialState, project, replay, type SetupDef, STANDARD_TYPES } from '../src/index.js'

// The replay corpus (DRIFT §7): anonymised real logs with what every viewer saw at the end.
// `record` builds an entry; the test in test/corpus.test.ts is the gate on every commit.
//
//   pnpm --filter @byd/engine corpus <name> <export.json|http://…/sessions/:id/export>
//
// Over HTTP the export is read as the game's owner: the log carries every hand, so the server hands
// it only to an account the project lets open its tables (D3, C8), and the corpus takes only the
// owner's own tables (#540). Pass that account's session cookie as `BYD_COOKIE=byd_session=…`.
//
// What goes in is anonymised twice over: the people (`anonymise`) and the game (`anonymiseGame`),
// since the corpus is in a public repository.
//
// Anonymisation keeps the play (what moved where, which card) and drops the people: names,
// notes, who watched. Card refs stay — they are the game, and that is the open question in DRIFT.

export type CorpusEntry = {
  name: string
  recordedAt: string
  version: string
  setup: SetupDef
  // As recorded: lines keep the schema version they were written under, or none (version 0).
  log: unknown[]
  // Final projections keyed by viewer: a seat id, 'table', or 'observer'.
  expected: Record<string, Snapshot>
}

// Numbers what it is given in the order it first sees it: the same thing always gets the same
// pseudonym, and nothing about the pseudonym says what it stood for.
const numbered = (prefix: string) => {
  const seen = new Map<string, string>()
  return (key: string): string => {
    let name = seen.get(key)
    if (name === undefined) {
      name = `${prefix}${seen.size + 1}`
      seen.set(key, name)
    }
    return name
  }
}

// The people (DRIFT §7): who sat down, what was flagged and who watched. `nameFor` numbers the seats,
// and is shared with `anonymiseGame` so a name in a rewind's stored table is the same pseudonym.
export function anonymise(log: readonly Applied[], nameFor: (seat: string) => string = numbered('Spelare ')): Applied[] {
  return log.map((line) => {
    const it = line.intent
    if (it.v === 'seat.claim') return { ...line, intent: { ...it, name: nameFor(it.seat) } }
    if (it.v === 'flag') {
      return {
        ...line,
        intent: { v: 'flag', ...(it.note !== undefined ? { note: '(kommentar)' } : {}), ...(it.observer !== undefined ? { observer: 'Observatör' } : {}) },
      }
    }
    return line
  })
}

// The game (#540, beställarens beslut 2026-09-28): the repo is public, and a real log carries the
// designer's unpublished game. Every card's id becomes `kort-N` in the order it first appears; the
// columns a card is described in become `fält-N` and what they say `värde-N`, column by column, so a
// question asked of the cards (`which`) still finds the same cards; the zones', shortcuts' and
// actions' own words become `Zon N`, `Genväg N` and `Åtgärd N`. The zones' ids stay, because every
// intent and the engine itself address them. It walks the whole entry rather than naming its
// fields, because a rewind's outcome stores the table verbatim and the engine owns that shape.
export function anonymiseGame(setup: SetupDef, log: readonly Applied[], nameFor: (seat: string) => string = numbered('Spelare ')): { setup: SetupDef; log: Applied[] } {
  const card = numbered('kort-')
  const field = numbered('fält-')
  const values = new Map<string, (v: string) => string>()
  // A field is matched by its trimmed text and a question by what it says (`matches` in
  // `@byd/protocol`), so each is keyed the way it is compared.
  const valueOf = (column: string, value: string): string => {
    let of = values.get(column)
    if (!of) {
      of = numbered('värde-')
      values.set(column, of)
    }
    return of(value)
  }
  const zoneName = numbered('Zon ')
  const shortcut = numbered('Genväg ')
  const actionLabel = numbered('Åtgärd ')
  const actionId = numbered('åtgärd-')
  const cardsOf = (cards: Record<string, Record<string, unknown>>) =>
    Object.fromEntries(Object.entries(cards).map(([ref, cols]) => [card(ref), Object.fromEntries(Object.entries(cols).map(([f, v]) => [field(f), valueOf(f, String(v ?? '').trim())]))]))
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk)
    if (!value || typeof value !== 'object') return value
    const o = value as Record<string, unknown>
    // A question asked of the cards' columns.
    if (typeof o['field'] === 'string' && Array.isArray(o['is']) && Object.keys(o).length === 2) {
      const f = o['field']
      return { field: field(f), is: (o['is'] as unknown[]).map((v) => valueOf(f, String(v))) }
    }
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(o)) {
      if (k === 'cardRef' && typeof v === 'string') out[k] = card(v)
      else if (k === 'cards' && v && typeof v === 'object' && !Array.isArray(v)) out[k] = cardsOf(v as Record<string, Record<string, unknown>>)
      else out[k] = walk(v)
    }
    // A zone, wherever it stands: the setup's, or one in a rewind's stored table.
    if (typeof o['id'] === 'string' && typeof o['kind'] === 'string' && typeof o['visibility'] === 'string' && typeof o['name'] === 'string') out['name'] = zoneName(o['id'])
    // A shortcut, and a designer's own action.
    if (typeof o['label'] === 'string' && typeof o['at'] === 'string' && Object.keys(o).length === 2) out['label'] = shortcut(o['label'])
    if (typeof o['id'] === 'string' && typeof o['label'] === 'string' && Array.isArray(o['steps'])) {
      out['id'] = actionId(o['id'])
      out['label'] = actionLabel(o['label'])
    }
    // A seat with a name, in a rewind's stored table.
    if (typeof o['id'] === 'string' && typeof o['name'] === 'string' && Object.keys(o).length === 2) out['name'] = nameFor(o['id'])
    return out
  }
  // The setup first, so the pseudonyms follow the order the game itself lists its cards in.
  const game = walk(setup) as SetupDef
  return { setup: game, log: log.map((line) => walk(line) as Applied) }
}

export function record(name: string, version: string, rawSetup: SetupDef, rawLog: readonly Applied[], registry: TypeRegistry): CorpusEntry {
  const nameFor = numbered('Spelare ')
  const { setup, log } = anonymiseGame(rawSetup, anonymise(rawLog, nameFor), nameFor)
  const initial = initialState(version, setup, registry)
  const state = replay(initial, registry, log)
  const history = { stateAt: (seq: number) => replay(initial, registry, log.filter((l) => l.seq <= seq)), lines: () => log }
  const expected: Record<string, Snapshot> = {}
  for (const seat of setup.seats) expected[seat] = project(state, registry, seat, undefined, history)
  expected['table'] = project(state, registry, null, undefined, history)
  expected['observer'] = project(state, registry, null, undefined, history, true)
  return { name, recordedAt: new Date().toISOString(), version, setup, log, expected }
}

export function write(entry: CorpusEntry, dir: string): string {
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${entry.name}.json`)
  writeFileSync(file, JSON.stringify(entry, null, 2) + '\n')
  return file
}

const isMain = /(^|\/)corpus\.ts$/.test(process.argv[1] ?? '')
if (isMain) {
  const [name, source] = process.argv.slice(2)
  if (!name || !source) {
    console.error('usage: corpus <name> <export.json | http://host/sessions/:id/export>')
    process.exit(1)
  }
  const registry = new TypeRegistry(STANDARD_TYPES)
  const load = async (): Promise<{ version: string; setup: SetupDef; log: Applied[] }> => {
    if (/^https?:/.test(source)) {
      const cookie = process.env['BYD_COOKIE']
      const headers = cookie ? { headers: { cookie } } : {}
      // Only a table of a game the account owns goes into the corpus (#540, beställarens beslut):
      // the corpus is public, and until the terms say so nobody else's play is ours to publish.
      const at = /^(https?:\/\/[^/]+)\/sessions\/([^/]+)\/export$/.exec(source)
      if (!at) throw new Error('the URL is not a /sessions/:id/export')
      const [, base, session] = at
      const table = (await (await fetch(`${base}/sessions/${session}`, headers)).json()) as { project?: string }
      const games = (await (await fetch(`${base}/projects`, headers)).json()) as { id: string; role?: string }[]
      const game = table.project ? games.find((g) => g.id === table.project) : undefined
      if (game?.role !== 'owner') throw new Error('the table is not from a game this account owns; only the owner’s own tables go into the corpus')
      const res = await fetch(source, headers)
      if (!res.ok) throw new Error(`export failed: ${res.status}`)
      return (await res.json()) as { version: string; setup: SetupDef; log: Applied[] }
    }
    const { readFileSync } = await import('node:fs')
    return JSON.parse(readFileSync(source, 'utf8')) as { version: string; setup: SetupDef; log: Applied[] }
  }
  const exported = await load()
  const entry = record(name, exported.version, exported.setup, exported.log, registry)
  const file = write(entry, join(import.meta.dirname, '../../../corpus'))
  console.log(JSON.stringify({ msg: 'recorded', file, lines: entry.log.length }))
}
