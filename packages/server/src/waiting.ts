import type { Applied } from '@byd/protocol'
import type { SurveyRecord } from './surveys.js'

// «Väntar på dig» on Mina spel (#1225, #1204 beslut B): what waits for the account, game by game,
// in an answer of its own after the list (`GET /me/waiting`), so the first screen never waits for
// every table's log to be read.
//
// `rev` is the game's newest version, the one the new flags are new on. `playtest` is there only for
// whoever may read the game's playtest (#524, `canStartTables`). `other` is there when the newest
// version was saved by an account other than the reader's and it is known whose (#1225); it names
// her the way a ceiling's bearer is named (#1198), never by address, and `null` when the address
// gives no name.
export type WaitingPlaytest = {
  // The players' survey answers at every table of the game, in every version. An observer's answer
  // stands apart (L70) and is not counted.
  answers: number
  // The new flags, and how many tables raised them, and when the newest of them was raised.
  flags: number
  tables: number
  at: string | null
}
export type GameWaiting = { rev: number; playtest?: WaitingPlaytest; other?: { name: string | null; at: string } }
export type Waiting = Record<string, GameWaiting>

// What a table's log is read for here: its flags and the versions it moved to.
export const WAITING_VERBS = ['flag', 'version.change'] as const satisfies readonly Applied['intent']['v'][]

// A table as it is counted: the version it started on, its flags and version changes in order, and
// its survey answers.
export type WaitingTable = { version: string; lines: readonly Applied[]; surveys: readonly Pick<SurveyRecord, 'observer'>[] }

// **A new flag is one raised on the game's newest version.** A flag belongs to the version it was
// raised on (L70): the table's own, or the one an update (C7) moved the table to before the flag. So
// a version saved after a playtest is what makes its flags old — the designer has answered them —
// and a table that goes on playing an older version raises no new ones. Running tables count as much
// as ended ones: a flag is new from the moment it is raised.
export function playtestWaiting(rev: number, tables: readonly WaitingTable[]): WaitingPlaytest {
  const newest = `rev-${rev}`
  let answers = 0
  let flags = 0
  let flagged = 0
  let at: string | null = null
  for (const table of tables) {
    answers += table.surveys.filter((s) => s.observer !== true).length
    let version = table.version
    let here = 0
    for (const line of table.lines) {
      if (line.intent.v === 'version.change') version = line.intent.to
      else if (line.intent.v === 'flag' && version === newest) {
        here++
        if (at === null || line.at > at) at = line.at
      }
    }
    flags += here
    if (here > 0) flagged++
  }
  return { answers, flags, tables: flagged, at }
}
