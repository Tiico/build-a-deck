import { activityOf, movesOf } from '@byd/engine'
import type { Applied } from '@byd/protocol'
import type { GuestRecord, SessionRecord } from './store.js'
import type { SurveyRecord } from './surveys.js'

// What the designer reads after a playtest (#1010, G3): per table its answers, its flags and who
// was there; per version how many answered and how the answers fall, so two versions can be held
// against each other. Everything here is read off what the server keeps — the log, the surveys and
// the admissions — so the editor works nothing out for itself: a name is the one the seat was
// claimed under or the admission was bought under, and a move is the engine's own (`movesOf`).
//
// Two decisions shape the sums (beställarens val 2026-10-18). An observer's answer is shown and
// marked, never counted into the distribution, since she watched rather than played. And a flag
// belongs to the version it was raised on — a table refreshed mid-game (C7) carries the version
// change in its log — while a survey belongs, as it always has, to the version the table ended on.

export const QUESTIONS = ['fun', 'clarity', 'balance'] as const
export type PlaytestQuestion = (typeof QUESTIONS)[number]

export type PlaytestPerson = { name: string; seat: string | null; observer: boolean }
export type PlaytestAnswer = { who: string; seat: string | null; observer: boolean; at: string; answers: SurveyRecord['answers'] }
// `who` is null for a flag the table itself raised: no seat, and no observer named.
export type PlaytestFlag = { who: string | null; seat: string | null; observer: boolean; note: string; at: string; move: number; version: string }
export type PlaytestTable = {
  id: string
  // The room code the table is called by (#706), also once it has ended and admits nobody.
  code: string | null
  // The version the table runs, or ended on: the one its survey belongs to.
  version: string
  ended: boolean
  endedAt: string | null
  moves: number
  people: PlaytestPerson[]
  answers: PlaytestAnswer[]
  flags: PlaytestFlag[]
}
// One count per step of the scale, 1 to 5.
export type Distribution = Record<PlaytestQuestion, number[]>
export type PlaytestVersion = {
  version: string
  // Tables that ended on this version, and tables still running on it, which count for nothing yet.
  ended: number
  running: number
  // Who played at the ended tables, and how many of them answered; observers apart.
  players: number
  answered: number
  observers: number
  // Flags raised on this version, at tables that have ended.
  flags: number
  distribution: Distribution
}
export type Playtest = { tables: PlaytestTable[]; versions: PlaytestVersion[] }

export type PlaytestSource = { id: string; session: SessionRecord; log: readonly Applied[]; surveys: readonly SurveyRecord[]; admissions: readonly GuestRecord[] }

export function playtestOf(sources: readonly PlaytestSource[]): Playtest {
  const tables = sources.map(tableOf)
  return { tables, versions: versionsOf(tables) }
}

function tableOf({ id, session, log, surveys, admissions }: PlaytestSource): PlaytestTable {
  const moves = movesOf(log)
  const told = activityOf(log)
  const people: PlaytestPerson[] = []
  const meet = (name: string, seat: string | null, observer: boolean) => {
    const known = people.find((p) => p.observer === observer && (observer ? p.name === name : p.seat === seat))
    if (known) known.name = name
    else people.push({ name, seat, observer })
  }
  let version = session.version
  let endedAt: string | null = null
  const flags: PlaytestFlag[] = []
  for (const line of told) {
    const intent = line.intent
    if (intent.v === 'seat.claim') meet(intent.name, intent.seat, false)
    else if (intent.v === 'version.change') version = intent.to
    else if (intent.v === 'session.end') endedAt = line.at
    else if (intent.v === 'flag') {
      const observer = line.by === null && intent.observer !== undefined
      const who = line.by !== null ? (line.name ?? line.by) : (intent.observer ?? null)
      const move = moves.filter((m) => m.seq < line.seq).length
      flags.push({ who, seat: line.by, observer, note: intent.note ?? '', at: line.at, move, version })
      if (observer && who !== null) meet(who, null, true)
    }
  }
  for (const a of admissions) if (a.kind === 'observer') meet(a.name, null, true)
  for (const s of surveys) if (s.observer) meet(s.who, null, true)
  return {
    id,
    code: session.code ?? null,
    version,
    ended: endedAt !== null,
    endedAt,
    moves: moves.length,
    people,
    answers: surveys.map((s) => ({ who: s.who, seat: s.seat, observer: s.observer === true, at: s.at, answers: s.answers })),
    flags,
  }
}

function versionsOf(tables: readonly PlaytestTable[]): PlaytestVersion[] {
  const named = new Set<string>()
  for (const t of tables) {
    named.add(t.version)
    if (t.ended) for (const f of t.flags) named.add(f.version)
  }
  return [...named]
    .sort((a, b) => revOf(b) - revOf(a))
    .map((version) => {
      const ended = tables.filter((t) => t.ended && t.version === version)
      const counted = ended.flatMap((t) => t.answers.filter((a) => !a.observer))
      const distribution = Object.fromEntries(QUESTIONS.map((q) => [q, [1, 2, 3, 4, 5].map((n) => counted.filter((a) => a.answers[q] === n).length)])) as Distribution
      return {
        version,
        ended: ended.length,
        running: tables.filter((t) => !t.ended && t.version === version).length,
        players: ended.reduce((n, t) => n + t.people.filter((p) => !p.observer).length, 0),
        answered: counted.length,
        observers: ended.reduce((n, t) => n + t.answers.filter((a) => a.observer).length, 0),
        flags: tables.filter((t) => t.ended).reduce((n, t) => n + t.flags.filter((f) => f.version === version).length, 0),
        distribution,
      }
    })
}

// A version's number, for ordering: `rev-12` is newer than `rev-9`. A version that is not a rev
// (a table started without a project) sorts last.
const revOf = (version: string): number => Number(/^rev-(\d+)$/.exec(version)?.[1] ?? -1)
