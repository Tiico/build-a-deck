import { randomUUID } from 'node:crypto'
import { REDACTED, type Applied } from '@byd/protocol'
import { redactLine } from '@byd/engine'
import type { GuestRecord } from './store.js'
import type { SurveyRecord } from './surveys.js'

// Erasure in the store (#1279, G6, väg A): the personal fields of the lines a person wrote are
// masked where they lie, her admission keeps its row under the masked name, and her survey goes —
// or, when the retention takes it, keeps its numbers and loses its words. The game is the same game
// (D4), since only `PERSONAL_FIELDS` change and `redactLine` keeps that they are there.
//
// Three things can be erased:
// - one admission (`guest`): the seat or the watch a guest bought with a name, and what she wrote
//   from it;
// - a table (`table`): every admission at it, and every line;
// - a game (`game`): every table started from it, while the sessions and their bearer stay for the
//   quotas (#1196).
//
// Every erasure is written in the ledger (`erasures`) in the transaction that does it: what, which
// id and when, and never a name. A restore to a point before it is put right by running the ledger
// again (`replayLedger`, DRIFT §5, RUNBOOK §6), and running it again changes nothing.

// Why: an erasure asked for (the operator's script for a guest through Kontakt, F5, and later the
// guest's and the account's own ways, #1280, #1281); the retention, twelve months after a table
// ended (F4); and a game taken away (F4).
export type ErasureReason = 'request' | 'retention' | 'removed'
// One admission is named by its table, its seat (null for an observer) and the moment it was given:
// a token's hash changes when an account goes back to the table (#690), and those three never do.
export type Erasure =
  | { kind: 'guest'; session: string; seat: string | null; issuedAt: string }
  | { kind: 'table'; session: string }
  | { kind: 'game'; project: string }
export type LedgerEntry = Erasure & { id: string; at: string; reason: ErasureReason }
// What an erasure changed, counted: never what it changed from.
export type Erased = { sessions: string[]; lines: number; guests: number; surveys: number }

export type ErasureStore = {
  // Applies the entries in one transaction and writes each in the ledger, once per id: an entry
  // whose id is already there is applied again and not written twice.
  erase(entries: readonly LedgerEntry[]): Promise<Erased>
  // The ledger, oldest first.
  ledger(): Promise<LedgerEntry[]>
  // The admissions the retention takes (F4): never claimed, not yet masked, at a table whose log
  // ended before `endedBefore`.
  retained(endedBefore: string): Promise<Extract<Erasure, { kind: 'guest' }>[]>
  // The games taken away whose tables were never erased: started from a project that is no longer
  // there, with no `game` entry in the ledger.
  orphans(): Promise<string[]>
  // Told the tables every erasure masked, wherever it ran: the app's own, and the operator's script
  // in another process, which Postgres tells about with a notification when it commits. What the app
  // does with it is read the loaded tables again (`TableHost.reload`). Resolves with the way to stop.
  listen(fn: (sessions: string[]) => void): Promise<() => Promise<void>>
}

export const entry = (erasure: Erasure, reason: ErasureReason, at: Date = new Date()): LedgerEntry => ({ ...erasure, id: randomUUID(), at: at.toISOString(), reason })

// What one table holds of the people at it, as an erasure reads it.
export type TableData = { log: readonly Applied[]; guests: readonly GuestRecord[]; surveys: readonly SurveyRecord[] }
// What an erasure does to one table: which lines to mask (by seq), which admissions to rename (by
// index into `guests`), which surveys to drop (by index into `surveys`) and which to keep as what
// they become with their words taken.
export type Changes = { seqs: number[]; guests: number[]; drop: number[]; mask: { index: number; record: SurveyRecord }[] }

const sameGuest = (g: GuestRecord, seat: string | null, issuedAt: string): boolean => g.seat === seat && Date.parse(g.issuedAt) === Date.parse(issuedAt)
const masked = (name: string): boolean => name.startsWith(REDACTED)
// A survey answered under the admission: who answered is the admission's name (#1021).
const answeredBy = (s: SurveyRecord, g: GuestRecord): boolean => (g.kind === 'observer' ? s.observer === true && s.who === g.name : s.observer !== true && s.seat === g.seat && s.who === g.name)

// A seat taken and kept: from its `seat.claim` until it is left, with the lines written from it.
type Sitting = { seat: string; claim: Applied; lines: Applied[] }
function sittingsOf(log: readonly Applied[]): Sitting[] {
  const all: Sitting[] = []
  const open = new Map<string, Sitting>()
  for (const line of log) {
    const it = line.intent
    if (it.v === 'seat.claim') {
      const sitting = { seat: it.seat, claim: line, lines: [line] }
      open.set(it.seat, sitting)
      all.push(sitting)
      continue
    }
    if (line.by !== null) open.get(line.by)?.lines.push(line)
    if (it.v === 'seat.release') open.delete(it.seat)
  }
  return all
}

// Whose a sitting is. A seat has one live admission at a time (DRIFT §9), and a seat is taken through
// the token of the admission that is live when the claim is written: the admission whose life holds
// the claim is the one. A claim no admission's life holds — a clock that is not the table's — is
// the admissions' at that seat that bought it under the name it was taken by.
function ownersOf(sitting: Sitting, guests: readonly GuestRecord[]): GuestRecord[] {
  const at = Date.parse(sitting.claim.at)
  const atSeat = guests.filter((g) => g.kind === 'seat' && g.seat === sitting.seat)
  const live = atSeat.filter((g) => Date.parse(g.issuedAt) <= at && at < Math.min(Date.parse(g.expiresAt), g.revokedAt === undefined ? Infinity : Date.parse(g.revokedAt)))
  if (live.length > 0) return live
  const name = sitting.claim.intent.v === 'seat.claim' ? sitting.claim.intent.name : ''
  return atSeat.filter((g) => g.name === name)
}

// The lines that are the admission's own words: for a seat, the lines written from her sittings;
// for an observer, the flags stamped with her name (C8). With `keep`, a line that is also another
// admission's — one sitting both a claimed and an unclaimed admission could be — is left, so the
// retention never masks what an account keeps (F4).
function linesOf(log: readonly Applied[], guests: readonly GuestRecord[], g: GuestRecord, keep: (other: GuestRecord) => boolean): Applied[] {
  if (g.kind === 'observer') {
    const others = guests.filter((o) => o !== g && o.kind === 'observer' && o.name === g.name && keep(o))
    if (others.length > 0) return []
    return log.filter((l) => l.intent.v === 'flag' && l.by === null && l.intent.observer === g.name)
  }
  return sittingsOf(log)
    .filter((s) => {
      const owners = ownersOf(s, guests)
      return owners.includes(g) && !owners.some((o) => o !== g && keep(o))
    })
    .flatMap((s) => s.lines)
}

// What an erasure changes at one table. Only what is not masked yet is named, so running an
// erasure again names nothing.
export function changesAt(data: TableData, erasure: Erasure, reason: ErasureReason): Changes {
  const changed = (line: Applied) => redactLine(line) !== line
  if (erasure.kind !== 'guest') {
    return {
      seqs: data.log.filter(changed).map((l) => l.seq),
      guests: data.guests.flatMap((g, i) => (masked(g.name) ? [] : [i])),
      drop: data.surveys.map((_, i) => i),
      mask: [],
    }
  }
  const taken = data.guests.filter((g) => sameGuest(g, erasure.seat, erasure.issuedAt))
  // The retention keeps what a claimed admission is (F4); an erasure asked for takes hers whatever.
  const keep = reason === 'retention' ? (o: GuestRecord) => o.accountId !== undefined : () => false
  const seqs = new Set<number>()
  for (const g of taken) for (const line of linesOf(data.log, data.guests, g, keep)) if (changed(line)) seqs.add(line.seq)
  const answers = data.surveys.flatMap((s, index) => {
    const by = taken.find((g) => !masked(g.name) && answeredBy(s, g))
    return by ? [{ index, record: maskedSurvey(s, by) }] : []
  })
  return {
    seqs: [...seqs].sort((a, b) => a - b),
    guests: taken.flatMap((g) => (masked(g.name) ? [] : [data.guests.indexOf(g)])),
    drop: reason === 'retention' ? [] : answers.map((a) => a.index),
    mask: reason === 'retention' ? answers : [],
  }
}

// A survey kept by the retention (F4): its numbers stay, its words and its name go. An observer's
// answer is known by its name (#1021), one per name at a table, so a masked one is told apart by
// when her admission was given — a moment and nobody's name, and the same whichever order a ledger
// is run in.
export function maskedSurvey(s: SurveyRecord, by: GuestRecord): SurveyRecord {
  const who = s.observer ? `${REDACTED}${Date.parse(by.issuedAt)}` : REDACTED
  return { ...s, who, answers: { ...s.answers, change: '' } }
}

// A line's intent as it lies in the store, masked: the row is masked as it was written, so its
// schema version and everything else in it stay (DRIFT §7). The fields are the same in every
// version the engine lifts.
export function maskedIntent(line: Applied, stored: unknown): unknown {
  return redactLine({ ...line, intent: stored as Applied['intent'] }).intent
}

// Twelve months after the table ended (G6, F4), in calendar months.
export const GUEST_KEEP_MONTHS = 12
export function retentionCutoff(now: Date): Date {
  const cut = new Date(now.getTime())
  cut.setUTCMonth(cut.getUTCMonth() - GUEST_KEEP_MONTHS)
  return cut
}

type Projects = { remove(id: string): Promise<boolean> }

// The sweeper's share of the erasure (F4): the guests whose twelve months are over, and the tables
// of games taken away before their tables went with them — which is, on the first start after
// #1279, every game ever taken away, and afterwards only one whose erasure failed after the game
// went. Run again, it finds nothing. The line says how many, never who (DRIFT §8).
export async function sweepErasures(erasures: ErasureStore, now: Date): Promise<Erased & { retained: number; orphans: number }> {
  const retained = await erasures.retained(retentionCutoff(now).toISOString())
  const orphans = await erasures.orphans()
  const entries = [...retained.map((g) => entry(g, 'retention', now)), ...orphans.map((project) => entry({ kind: 'game', project }, 'removed', now))]
  const done = entries.length > 0 ? await erasures.erase(entries) : { sessions: [], lines: 0, guests: 0, surveys: 0 }
  console.log(JSON.stringify({ msg: 'erased', retained: retained.length, orphans: orphans.length, tables: done.sessions.length, lines: done.lines, guests: done.guests, surveys: done.surveys }))
  return { ...done, retained: retained.length, orphans: orphans.length }
}

// The ledger run again (DRIFT §5, RUNBOOK §6), after a restore to a point before some of it: each
// entry in the order it was made, a game the designer took away taken away once more, and every
// entry written back in the ledger it may be missing from. `entries` are the ledger as it was read before the restore; without
// them, the database's own.
export async function replayLedger(stores: { erasures: ErasureStore; projects?: Projects | null }, entries?: readonly LedgerEntry[]): Promise<Erased & { entries: number }> {
  const all = [...(entries ?? (await stores.erasures.ledger()))].sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id))
  const sum: Erased = { sessions: [], lines: 0, guests: 0, surveys: 0 }
  for (const e of all) {
    if (e.kind === 'game' && e.reason === 'removed' && stores.projects) await stores.projects.remove(e.project)
    const done = await stores.erasures.erase([e])
    sum.sessions = [...new Set([...sum.sessions, ...done.sessions])]
    sum.lines += done.lines
    sum.guests += done.guests
    sum.surveys += done.surveys
  }
  return { ...sum, entries: all.length }
}

// A ledger entry as one line of JSON, and back: what `erase ledger` writes before a restore and
// `erase replay --from` reads after it.
export function parseLedger(text: string): LedgerEntry[] {
  return text
    .split('\n')
    // A line that is no object is not the ledger's: pnpm's own heading above a script's output, or
    // a blank.
    .filter((l) => l.trim().startsWith('{'))
    .map((l): LedgerEntry => {
      // Also the lines `ops/restore.sh` writes from a restored database, which carry their `msg`
      // and leave an observer's empty seat out.
      const e = JSON.parse(l) as Record<string, unknown>
      const text = (k: string) => (typeof e[k] === 'string' ? (e[k] as string) : null)
      const id = text('id')
      const at = text('at')
      const reason = text('reason') as ErasureReason | null
      if (id === null || at === null || reason === null || !['request', 'retention', 'removed'].includes(reason)) throw new Error(`not a ledger line: ${l.slice(0, 80)}`)
      const session = text('session')
      const project = text('project')
      const issuedAt = text('issuedAt')
      if (e['kind'] === 'guest' && session !== null && issuedAt !== null) return { id, at, reason, kind: 'guest', session, seat: text('seat'), issuedAt }
      if (e['kind'] === 'table' && session !== null) return { id, at, reason, kind: 'table', session }
      if (e['kind'] === 'game' && project !== null) return { id, at, reason, kind: 'game', project }
      throw new Error(`not a ledger line: ${l.slice(0, 80)}`)
    })
}
