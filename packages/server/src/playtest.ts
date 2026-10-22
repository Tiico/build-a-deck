import { activityOf, canSeeFace, componentOf, initialState, movesOf, project, replay, zoneOf, type DeckFacts, type TypeRegistry } from '@byd/engine'
import type { Applied, VisibleComponentState, ZoneKind } from '@byd/protocol'
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
// The card a flag is about (#1142), as it was at the flag: the component as an observer's view
// had it — every face's texture in the version the flag was raised on — and what the flagger
// herself saw of it, where it lay, and how the game's newest version draws the same row:
// `changed` when its face is drawn differently, `gone` when the row is no longer there.
export type PlaytestCard = VisibleComponentState & {
  seen: 'front' | 'back'
  place: { zone: string; kind: ZoneKind; owner: string | null }
  now?: 'same' | 'changed' | 'gone'
}
// `who` is null for a flag the table itself raised: no seat, and no observer named.
export type PlaytestFlag = { who: string | null; seat: string | null; observer: boolean; note: string; at: string; move: number; version: string; card?: PlaytestCard }
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

// `decks` is what each version the table played knew about its cards, for the flags about one.
export type PlaytestSource = { id: string; session: SessionRecord; log: readonly Applied[]; surveys: readonly SurveyRecord[]; admissions: readonly GuestRecord[]; decks?: Record<string, DeckFacts> }
// What a flag about a card is read with: the types, and the game's newest deck to hold it against.
export type CardReading = { registry: TypeRegistry; now?: DeckFacts }

export function playtestOf(sources: readonly PlaytestSource[], cards?: CardReading): Playtest {
  const tables = sources.map((source) => tableOf(source, cards))
  return { tables, versions: versionsOf(tables) }
}

function tableOf({ id, session, log, surveys, admissions, decks }: PlaytestSource, cards?: CardReading): PlaytestTable {
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
  for (const [i, line] of told.entries()) {
    // The log's own line, not the activity's: the activity leaves out which card a flag is about.
    const intent = log[i]!.intent
    if (intent.v === 'seat.claim') meet(intent.name, intent.seat, false)
    else if (intent.v === 'version.change') version = intent.to
    else if (intent.v === 'session.end') endedAt = line.at
    else if (intent.v === 'flag') {
      const observer = line.by === null && intent.observer !== undefined
      const who = line.by !== null ? (line.name ?? line.by) : (intent.observer ?? null)
      const move = moves.filter((m) => m.seq < line.seq).length
      const card = intent.component !== undefined && cards ? cardAt(session, log, log[i]!, intent.component, observer, cards, decks?.[version]) : undefined
      flags.push({ who, seat: line.by, observer, note: intent.note ?? '', at: line.at, move, version, ...(card ? { card } : {}) })
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

// The card as the log has it just before the flag, which changes nothing on the table: the log is
// replayed from the table's start, so the answer is the one any replay of it gives.
function cardAt(session: SessionRecord, log: readonly Applied[], flag: Applied, id: string, observer: boolean, { registry, now }: CardReading, deck: DeckFacts | undefined): PlaytestCard | undefined {
  const state = replay(initialState(session.version, session.setup, registry), registry, log.filter((l) => l.seq < flag.seq))
  const seen = project(state, registry, null, deck, undefined, true).components.find((c) => c.id === id)
  if (!seen) return undefined
  const component = componentOf(state, id)
  const zone = zoneOf(state, component.zone)
  const owner = zone.owner === undefined ? null : (state.seats[zone.owner]?.name ?? zone.owner)
  const content = registry.get(component.type).contentFace
  const then = deck?.faces?.[component.cardRef]?.[content]
  const later = now?.faces?.[component.cardRef]
  return {
    ...seen,
    seen: canSeeFace(state, registry, component, flag.by, observer) ? 'front' : 'back',
    place: { zone: zone.name, kind: zone.kind, owner },
    ...(now && then !== undefined ? { now: later === undefined ? 'gone' : later[content] === then ? 'same' : 'changed' } : {}),
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
