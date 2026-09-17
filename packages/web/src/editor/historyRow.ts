import { DOC_PARTS, type DocPart, type VersionChange } from '@byd/server/doc'
import type { VersionSummary } from '@byd/server'
import type { Key } from '../i18n/sv.js'
import type { Lang, T } from '../i18n/index.js'

// What a row in the project's history says (#177, B4).
//
// The panel used to say `Version N · i dag` and nothing else, which is a list of timestamps
// rather than a record of work: fifteen rows saying the same thing, and the designer looking for
// "the time I changed the duel cards" opening them one at a time. So a row says what its save
// changed, and this module is the whole of that as words. Nothing here draws; the panel paints
// what comes out of here, which is what lets the words be read by a test rather than by an eye.
//
// It is framework-free on purpose. What a save changed is not a rendering question, and the day a
// second surface wants to say it — a comparison, a printed hand-off — it asks here.

// How many parts may stand as chips in one row before they stop being news.
//
// The beställare decided it on 2026-09-17: three read, four do not. Four fit, but they become a
// row of colour that the eye skips, and whoever moved four parts of the game in one save knows
// perfectly well that she did something big — so from four the row says so in words instead.
export const MOST_CHIPS = 3

export type Chip = { part: DocPart; word: string }

export type HistoryRow = {
  rev: number
  // The clock, because the day is a heading over the row rather than a word inside it.
  time: string
  // A named version is read as its name (B4); the number stays, but under it.
  heading: string
  version: string | null
  // What happened to the cards, in one line. Empty when nothing about the cards moved and a chip
  // is carrying the news instead — a row must never say "nothing changed" beside a chip.
  words: string
  chips: Chip[]
  // From four parts the chips give way to this, which is real text and not a tooltip: a count
  // nobody can see is not a count (L12).
  count: string | null
  // The whole row for a reader who hears it rather than sees it. Every chip is spelled out here —
  // a colour and a short word are not information a screen reader can pass on — and everything
  // the eye reads is in it, in the order the eye reads it, so the name never fights the label.
  spoken: string
}

export type HistoryDay = { key: string; day: string; count: string; versions: VersionSummary[] }
export type Reading = { now: number; lang: Lang; t: T }

// The four parts of the document that are not cards, each in two forms: the word a chip carries,
// and the same thing said as a sentence for the reader who hears the row.
const PART_WORD: Record<DocPart, Key> = { template: 'history.part.template', setup: 'history.part.setup', rules: 'history.part.rules', icons: 'history.part.icons' }
const PART_SAID: Record<DocPart, Key> = { template: 'history.part.template.said', setup: 'history.part.setup.said', rules: 'history.part.rules.said', icons: 'history.part.icons.said' }

// A row takes the same `Reading` the day headings do — the clock the panel is read against, the
// language, the catalogue — so the panel has one thing to hold and hand over. A row reads the day
// off its heading and so wants nothing from `now` itself; it is in the shape because the shape is
// the panel's, not this function's.
export function historyRow(v: VersionSummary, change: VersionChange | undefined, { lang, t, current }: Reading & { current: boolean }): HistoryRow {
  const time = clock(v.at, lang)
  const heading = v.label ?? t('history.version', { rev: v.rev })
  const version = v.label ? t('history.version', { rev: v.rev }) : null
  const words = change ? wordsOf(change, t) : ''
  // In the one order the parts are named, whoever handed them over and in whatever order. A chip
  // row that reshuffles itself between two versions that moved the same things is a chip row
  // nobody learns to read, and the row is where it is drawn, so the row is where it holds.
  const parts = DOC_PARTS.filter((part) => change?.parts.includes(part))
  const many = parts.length > MOST_CHIPS
  const chips = many ? [] : parts.map((part) => ({ part, word: t(PART_WORD[part]) }))
  const count = many ? t('history.parts.four') : null
  const spoken = [time, heading, version, words, ...(many ? [count] : parts.map((part) => t(PART_SAID[part]))), current ? t('history.current') : null]
    .filter((said): said is string => Boolean(said))
    .join(' · ')
  return { rev: v.rev, time, heading, version, words, chips, count, spoken }
}

// What happened to the cards, and to the orders that belong to the document rather than to any
// one card. A save this has no word for still says something — see `history.diff.other` below —
// because a row that looks like every other row and means nothing is worse than no row. But only
// when there is no word at all: a template change with no card touched is carried by its chip,
// and this stays quiet rather than talking over it.
function wordsOf(change: VersionChange, t: T): string {
  if (change.first) return t('history.created')
  const said: string[] = []
  if (change.added) said.push(t(change.added === 1 ? 'history.diff.added.one' : 'history.diff.added', { n: change.added }))
  if (change.removed) said.push(t(change.removed === 1 ? 'history.diff.removed.one' : 'history.diff.removed', { n: change.removed }))
  if (change.changed) said.push(t(change.changed === 1 ? 'history.diff.changed.one' : 'history.diff.changed', { n: change.changed }))
  if (change.reordered) said.push(t('history.diff.reordered'))
  if (change.columns) said.push(t('history.diff.columns'))
  if (change.renamed !== undefined) said.push(t('history.diff.renamed', { name: change.renamed }))
  if (said.length > 0) return said.join(' · ')
  if (change.parts.length > 0) return ''
  // Nothing named, and yet something happened. `diffProjects` does not look at `palette`,
  // `framing` or `fonts` (see the note there), and a byte-identical document is refused a version
  // — so an empty change is a save whose only difference is one this cannot name. It is never a
  // save where nothing changed, and the row must not say that it is.
  return t('history.diff.other')
}

// The versions under the day they were made, in the order they came in — the panel lists them
// newest first and this must not quietly resort them.
export function byDay(versions: readonly VersionSummary[], { now, lang, t }: Reading): HistoryDay[] {
  const days: HistoryDay[] = []
  for (const v of versions) {
    const key = dayKey(new Date(v.at))
    const last = days.at(-1)
    if (last?.key === key) last.versions.push(v)
    else days.push({ key, day: dayName(v.at, now, lang, t), count: '', versions: [v] })
  }
  for (const day of days) day.count = t(day.versions.length === 1 ? 'history.day.version' : 'history.day.versions', { n: day.versions.length })
  return days
}

// A day on the reader's own calendar, not a count of hours back: something saved at half past
// eleven last night was saved yesterday, whatever o'clock it happens to be now. Told apart by the
// local date the two fall on, which is the only reading that survives a midnight.
const dayKey = (at: Date): string => `${at.getFullYear()}-${at.getMonth()}-${at.getDate()}`

function dayName(iso: string, now: number, lang: Lang, t: T): string {
  const at = new Date(iso)
  const today = new Date(now)
  if (dayKey(at) === dayKey(today)) return t('history.day.today')
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (dayKey(at) === dayKey(yesterday)) return t('history.day.yesterday')
  // A date from another year says which one; within this year the year would be noise.
  const year = at.getFullYear() === today.getFullYear() ? {} : { year: 'numeric' as const }
  return at.toLocaleDateString(lang, { day: 'numeric', month: 'long', ...year })
}

const clock = (iso: string, lang: Lang): string => new Date(iso).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })
