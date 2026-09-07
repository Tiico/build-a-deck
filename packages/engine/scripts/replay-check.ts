// The restore rehearsal's proof (DRIFT §5): a session's log, as the restored database gives it
// back or as GET /sessions/:id/export does, replayed through the engine. A backup whose log
// does not replay is not a backup.
//   node … replay-check.ts < export.json      (also: replay-check.ts export.json)
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { Applied } from '@byd/protocol'
import { CARD_STANDARD_63x88, TypeRegistry, initialState, replay, type SetupDef } from '../src/index.js'

// The database export strips JSON nulls: a line by the table comes without `by`.
const Line = Applied.extend({ by: Applied.shape.by.default(null) })

export type Export = { msg?: string; session: { id: string; version: string; setup: SetupDef; log: unknown[] } }
export type Report = { msg: 'replayed'; session: string; lines: number; seq: number; components: number }

export function replayExport(input: Export): Report {
  const registry = new TypeRegistry([CARD_STANDARD_63x88])
  const log = input.session.log.map((l) => Line.parse(l))
  const state = replay(initialState(input.session.version, input.session.setup, registry), registry, log)
  return { msg: 'replayed', session: input.session.id, lines: log.length, seq: state.seq, components: Object.keys(state.components).length }
}

const entry = process.argv[1]
if (entry && import.meta.url === pathToFileURL(entry).href) {
  const source = process.argv[2] ?? '/dev/stdin'
  const input = JSON.parse(readFileSync(source, 'utf8')) as Export
  console.log(JSON.stringify(replayExport(input)))
}
