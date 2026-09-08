import type { Cell } from './ProjectClient.js'
import type { ProjectRow } from './types.js'
import { translate, type T } from '../i18n/index.js'

// Without a catalogue of its own this module speaks Swedish, exactly as a surface mounted
// without a language provider does: the table hands over its own `t` (A4).
const swedish: T = (key, params) => translate('sv', key, params)

// The table's selection (#17): which of the cards on screen the next change is about.
// A view of the project like the sort (#15) and the filter (#16) — it decides what an action
// reaches, never what the deck holds.
export type Selection = ReadonlySet<string>

export const noSelection: Selection = new Set<string>()

// A checkbox is a toggle: ticking a row adds it, ticking it again takes it away.
export function toggleRow(selection: Selection, cardRef: string): Selection {
  const next = new Set(selection)
  if (!next.delete(cardRef)) next.add(cardRef)
  return next
}

// "Markera alla synliga": the header's checkbox is about the rows on screen and no others, so it
// adds or removes exactly them and leaves any other row of the deck as it was.
export function markRows(selection: Selection, cardRefs: readonly string[], marked: boolean): Selection {
  const next = new Set(selection)
  for (const cardRef of cardRefs) {
    if (marked) next.add(cardRef)
    else next.delete(cardRef)
  }
  return next
}

// The selection follows the screen: when the filter (#16) is asked a new question, the rows that
// leave are let go of. A tick that survives out of sight is a card a later "Ta bort 4 kort" would
// take without anyone having seen it.
export function keepRows(selection: Selection, cardRefs: readonly string[]): Selection {
  return new Set(cardRefs.filter((cardRef) => selection.has(cardRef)))
}

// How many cards the next action is about. The number is what makes a bulk change safe to press,
// so it is said in the same live region as the count of shown cards.
export function selectionLabel(count: number, t: T = swedish): string {
  return t(count === 1 ? 'table.selected.one' : 'table.selected.other', { n: count })
}

// Taking the marked cards out of the deck. One call gives the whole list of rows back, so a bulk
// delete is one change to the project and is saved and undone as one (L4, B4).
export function removeRows(rows: readonly ProjectRow[], selection: Selection): ProjectRow[] {
  return rows.filter((row) => !selection.has(row.id))
}

// Duplicating the marked cards. A copy is a card of its own — a new `cardRef`, since a row is a
// card, not a physical one (L4) — and it lands right after the card it came from, where the eye
// is already looking. Everything else is copied as it stands, `antal` included.
export function duplicateRows(rows: readonly ProjectRow[], selection: Selection): ProjectRow[] {
  const taken = new Set(rows.map((row) => row.id))
  const out: ProjectRow[] = []
  for (const row of rows) {
    out.push(row)
    if (!selection.has(row.id)) continue
    const id = freeCopyId(row.id, taken)
    taken.add(id)
    out.push({ ...row, id, fields: { ...row.fields } })
  }
  return out
}

function freeCopyId(cardRef: string, taken: ReadonlySet<string>): string {
  const base = `${cardRef}-kopia`
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`
}

// Writing one column on every marked card. The value is the cell as the table would hold it:
// `antal` is the system column and is a number (L4), everything else is text.
export function setColumn(rows: readonly ProjectRow[], selection: Selection, field: string, value: Cell): ProjectRow[] {
  return rows.map((row) => (selection.has(row.id) ? { ...row, fields: { ...row.fields, [field]: value } } : row))
}
