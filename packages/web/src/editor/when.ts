import type { Lang, T } from '../i18n/index.js'

// When something happened, in the words a reader uses about it — the day and the clock.
//
// Two surfaces say this: the history, where a save's day heads a group of versions (#177), and the
// Bord tab, where a table's last move stands beside its name (#228). They said it differently. The
// history had the reading right and kept it to itself; the list said a bare clock, in `sv-SE`, so a
// table played at 00:10 last night looked exactly like one played at 00:10 this morning and an
// English reader was told the time in Swedish.
//
// So the reading lives here and both ask for it. It is framework-free, like `historyRow` beside it:
// what day something happened is not a rendering question.

// A day on the reader's own calendar, not a count of hours back: something saved at half past
// eleven last night was saved yesterday, whatever o'clock it happens to be now. Told apart by the
// local date the two fall on, which is the only reading that survives a midnight.
export const dayKey = (at: Date): string => `${at.getFullYear()}-${at.getMonth()}-${at.getDate()}`

export function dayWord(iso: string, now: number, lang: Lang, t: T): string {
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

export const clockWord = (iso: string, lang: Lang): string => new Date(iso).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })

// When the table last moved, in the words a designer uses about it. A table nobody has played has
// no moment at all, and saying "inga drag än" is truer than showing when it was started.
export function lastMoveWords(at: string | null, now: number, lang: Lang, t: T): string {
  if (at === null) return t('tables.noMoves')
  return t('tables.lastMove', { at: `${dayWord(at, now, lang, t)} ${clockWord(at, lang)}` })
}
