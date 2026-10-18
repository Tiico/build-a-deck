import type { PlaytestPerson, PlaytestTable, PlaytestVersion } from '@byd/server/doc'
import { readerLocale, type Lang, type T } from '../i18n/index.js'
import { versionWord } from '../i18n/version.js'
import { clockWord, dayWord } from './when.js'

// What the Resultat view and an ended table's row say (#1010, beställarens val 2026-10-18), as
// data. The server has already counted (`GET /projects/:id/playtest`): which tables, which
// answers, which flags, and per version how the answers fall. What is left is the reading —
// which version to open, which one to hold it against, how a row says its one line — and it lives
// here, framework-free, so it is read by a test rather than by an eye.

// The version the view opens on: the one asked for, or else the newest a table has ended on. A
// game none of whose tables has ended has nothing to open.
export function chosenVersion(versions: readonly PlaytestVersion[], asked: string | null): string | null {
  if (asked !== null && versions.some((v) => v.version === asked)) return asked
  return versions.find((v) => v.ended > 0)?.version ?? null
}

// «Mot förra testade versionen»: the newest older version that has answers to be held against.
// A version whose tables nobody answered at has no distribution, so it is passed over.
export function compareWith(versions: readonly PlaytestVersion[], version: string): PlaytestVersion | null {
  const rev = revOf(version)
  return versions.find((v) => revOf(v.version) < rev && v.answered > 0) ?? null
}

// The mean of a distribution, step 1 to 5; null when nobody answered.
export function meanOf(counts: readonly number[]): number | null {
  const n = counts.reduce((sum, c) => sum + c, 0)
  return n === 0 ? null : counts.reduce((sum, c, i) => sum + c * (i + 1), 0) / n
}

// One decimal, the reader's way: «4,2» in Swedish, «4.2» in English. No mean is a dash.
export function decimal(x: number | null, lang: Lang): string {
  return x === null ? '–' : x.toLocaleString(readerLocale(lang), { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

// A difference, signed, the reader's way: «+1,5», «−0,3», «±0,0».
export function signed(x: number, lang: Lang): string {
  const sign = x > 0.05 ? '+' : x < -0.05 ? '−' : '±'
  return `${sign}${decimal(Math.abs(x), lang)}`
}

// An ended table's one line in the Bord view (A:s rad): how many answered, how many flags.
export function rowSummary(table: PlaytestTable, t: T): string {
  const answers = table.answers.length
  const flags = table.flags.length
  const said = answers === 0 ? t('results.row.noAnswers') : t(answers === 1 ? 'results.answers.one' : 'results.answers', { n: answers })
  const flagged = flags === 0 ? t('results.row.noFlags') : t(flags === 1 ? 'results.flags.one' : 'results.flags', { n: flags })
  return `${said} · ${flagged}`
}

// The people who were at a table and left no answer: a seat that has none, an observer by name.
export function silent(table: PlaytestTable): PlaytestPerson[] {
  return table.people.filter((p) => !table.answers.some((a) => a.observer === p.observer && (p.observer ? a.who === p.name : a.seat === p.seat)))
}

// The tables a version is read from: those that ended on it, and those that raised a flag on it
// before an update moved them on (C7) — a flag belongs to the version it was raised on.
export function tablesFor(tables: readonly PlaytestTable[], version: string): PlaytestTable[] {
  return tables.filter((t) => t.ended && (t.version === version || t.flags.some((f) => f.version === version)))
}

// A table is called by its room code (#706), as its row in the Bord view calls it; one that never
// had a code is called by its version.
export function tableName(table: PlaytestTable, t: T): string {
  return table.code ?? versionWord(table.version, t, 'short')
}

// When a table ended, in the words its row says its last move in: the day and the clock.
export function whenEnded(at: string, now: number, lang: Lang, t: T): string {
  const day = dayWord(at, now, lang, t)
  const word = day === t('history.day.today') || day === t('history.day.yesterday') ? day.toLocaleLowerCase(readerLocale(lang)) : day
  return t('results.table.ended', { at: `${word} ${clockWord(at, lang)}` })
}

const revOf = (version: string): number => Number(/^rev-(\d+)$/.exec(version)?.[1] ?? -1)
