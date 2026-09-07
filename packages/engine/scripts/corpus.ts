import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Applied, Snapshot } from '@byd/protocol'
import { CARD_STANDARD_63x88, TypeRegistry, initialState, project, replay, type SetupDef } from '../src/index.js'

// The replay corpus (DRIFT §7): anonymised real logs with what every viewer saw at the end.
// `record` builds an entry; the test in test/corpus.test.ts is the gate on every commit.
//
//   pnpm --filter @byd/engine corpus <name> <export.json|http://…/sessions/:id/export>
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

export function anonymise(log: readonly Applied[]): Applied[] {
  const names = new Map<string, string>()
  const nameFor = (seat: string) => {
    if (!names.has(seat)) names.set(seat, `Spelare ${names.size + 1}`)
    return names.get(seat) ?? seat
  }
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

export function record(name: string, version: string, setup: SetupDef, rawLog: readonly Applied[], registry: TypeRegistry): CorpusEntry {
  const log = anonymise(rawLog)
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
  const registry = new TypeRegistry([CARD_STANDARD_63x88])
  const load = async (): Promise<{ version: string; setup: SetupDef; log: Applied[] }> => {
    if (/^https?:/.test(source)) {
      const res = await fetch(source)
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
