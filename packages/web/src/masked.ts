import { PERSONAL_FIELDS, REDACTED, type Activity, type PersonalHolds, type Snapshot } from '@byd/protocol'
import type { Playtest } from '@byd/server/doc'
import type { Key, T } from './i18n/index.js'

// A masked personal field said in the reader's language (#1281, G6). An erasure (#1279) leaves
// `REDACTED` where a name or a person's words stood — a character from Unicode's private-use area,
// which a screen would draw as a box or as nothing at all. Every screen at a table reads its names
// and its words through the table client, so the client says them there, once, and no surface has
// to remember to (`TableClient`, `masked`). The results and the lists of tables read the same
// placeholder out of their own answers and say it with `maskedWord`.
//
// An observer's masked survey answer is `REDACTED` followed by when her admission was given
// (`maskedSurvey` in the server), so a masked value is one that begins with the placeholder.
export const isMasked = (value: string | null | undefined): boolean => typeof value === 'string' && value.startsWith(REDACTED)

// The word for each kind of thing a masked field held (`PersonalHolds`).
export type MaskedWords = (holds: PersonalHolds) => string
const KEYS: Record<PersonalHolds, Key> = {
  'seat-name': 'masked.name',
  'observer-name': 'masked.name',
  comment: 'masked.comment',
  note: 'masked.note',
}
export const maskedWords =
  (t: T): MaskedWords =>
  (holds) =>
    t(KEYS[holds])

// `value` as the reader is to see it: itself, or the word for what it held.
export function maskedWord<V extends string | null | undefined>(value: V, holds: PersonalHolds, words: MaskedWords): V | string {
  return isMasked(value) ? words(holds) : value
}

// A table's view with its masked names and notes said. The same object back when nothing in it is
// masked, so a view that did not change is not a new one.
export function sayView(view: Snapshot, words: MaskedWords): Snapshot {
  const seats = view.seats.some((s) => isMasked(s.name))
  const notes = view.notes.some((n) => isMasked(n.text))
  if (!seats && !notes) return view
  return {
    ...view,
    seats: seats ? view.seats.map((s) => (isMasked(s.name) ? { ...s, name: words('seat-name') } : s)) : view.seats,
    notes: notes ? view.notes.map((n) => (isMasked(n.text) ? { ...n, text: words('note') } : n)) : view.notes,
  }
}

// A line of the table's activity with its masked fields said: the closed list of personal fields
// (`PERSONAL_FIELDS`), and the name the seat had when the line was written.
export function sayLine(line: Activity, words: MaskedWords): Activity {
  let intent: Record<string, unknown> | null = null
  for (const { v, field, holds } of PERSONAL_FIELDS) {
    const value = (line.intent as Record<string, unknown>)[field]
    if (line.intent.v !== v || typeof value !== 'string' || !isMasked(value)) continue
    intent ??= { ...line.intent }
    intent[field] = words(holds)
  }
  const name = isMasked(line.name)
  if (intent === null && !name) return line
  return { ...line, ...(intent ? { intent: intent as Activity['intent'] } : {}), ...(name ? { name: words('seat-name') } : {}) }
}

// What the designer reads of her playtests (#1010) with its masked names said: the people at each
// table, who answered and who flagged. A masked comment is said where the flag is drawn, since
// there it is the comment's absence that is read and not a quotation.
export function sayPlaytest(read: Playtest, words: MaskedWords): Playtest {
  const name = (who: string) => maskedWord(who, 'seat-name', words)
  return {
    ...read,
    tables: read.tables.map((x) => ({
      ...x,
      people: x.people.map((p) => ({ ...p, name: name(p.name) })),
      answers: x.answers.map((a) => ({ ...a, who: name(a.who) })),
      flags: x.flags.map((f) => ({ ...f, who: f.who === null ? null : name(f.who) })),
    })),
  }
}
