// Imported by the editor as well as the server, so this module stays free of anything Node:
// types only from the project document, and no imports that reach the database or the network.
import type { ProjectDoc, ProjectRow } from './projects.js'
import { columnsOf } from './edits.js'

// What changed between two versions of a project (B4). The history is presented as changes in
// the card table, which is where a designer already lives: cards added, removed and changed,
// with the field that moved and what it moved from. The template, the setup and the symbol set
// are named as having moved without being spelled out — a diff of an element tree is a diff for
// a machine, and the canvas shows the change better than a list can.
import type { Cell } from './projects.js'
export type FieldChange = { field: string; from: Cell | null; to: Cell | null }
export type RowChange =
  | { kind: 'added'; cardRef: string }
  | { kind: 'removed'; cardRef: string }
  | { kind: 'changed'; cardRef: string; fields: FieldChange[] }
export type DocDiff = {
  rows: RowChange[]
  // The order of the rows is the order of the deck until the first shuffle, so it is a change
  // of its own — and not a change to any card.
  reordered: boolean
  // And the order of the columns (#46), which is neither of those: it is the document's, so a
  // version whose only change is a column moved is a version where something happened, and the
  // history has to be able to say so rather than reading as an empty save.
  columns: boolean
  template: boolean
  setup: boolean
  icons: boolean
  // And the rulebook (B7), which is a part of the document like the other three: a save that
  // only rewrote a rule is a save where something happened, and the history has to say so.
  rules: boolean
  name?: { from: string; to: string }
}

// What this deliberately does not look at, and what follows from that (#177).
//
// `ProjectDoc` also carries `palette` (E4), `framing` (E1) and `fonts` (B3), and none of the three
// is compared here: they are settings a card is drawn by rather than something a card table can
// show a before and an after of, and a row of the diff is a row of that table.
//
// The consequence is not that those saves are invisible — it is that they come out of here as an
// empty `DocDiff`, and so as a `VersionChange` with nothing in it. And an empty change is never
// "nothing happened": a save that would leave the document byte for byte as it was is refused a
// version at all (`replace` in `projects.ts` and `store-postgres.ts`), so a version that exists
// changed something. Between two consecutive versions the empty case therefore means exactly one
// thing — the difference is one of the three above — which is why the history has a word for a
// save it cannot name (`history.diff.other`) instead of a sentence saying nothing changed.
//
// So: the catch-all in the history is not dead code, and it stops being reachable the day one of
// the three is compared here. Widening this means deciding what the history should say about it.
export function diffProjects(before: ProjectDoc, after: ProjectDoc): DocDiff {
  const olds = new Map(before.rows.map((r) => [r.id, r.fields]))
  const news = new Map(after.rows.map((r) => [r.id, r.fields]))
  const rows: RowChange[] = []
  for (const row of before.rows) {
    const now = news.get(row.id)
    if (!now) {
      rows.push({ kind: 'removed', cardRef: row.id })
      continue
    }
    const fields = fieldChanges(row.fields, now)
    if (fields.length > 0) rows.push({ kind: 'changed', cardRef: row.id, fields })
  }
  for (const row of after.rows) if (!olds.has(row.id)) rows.push({ kind: 'added', cardRef: row.id })

  const kept = before.rows.filter((r) => news.has(r.id)).map((r) => r.id)
  const keptNow = after.rows.filter((r) => olds.has(r.id)).map((r) => r.id)
  const diff: DocDiff = {
    rows: rows.sort(byPosition(before, after)),
    reordered: kept.join(' ') !== keptNow.join(' '),
    // Compared as the table reads them and not as the key is written: `columnsOf` is what lays
    // the stored order over the derivation, so an order written down that says exactly what the
    // derivation already said is not a change anybody made.
    columns: columnsOf(before).join(' ') !== columnsOf(after).join(' '),
    template: !same(before.template, after.template),
    setup: !same(before.setup, after.setup),
    icons: !same(before.icons, after.icons) || !same(before.credits ?? {}, after.credits ?? {}),
    rules: !same(before.rules ?? null, after.rules ?? null),
  }
  if (before.name !== after.name) diff.name = { from: before.name, to: after.name }
  return diff
}

// Every field either side knows about, in the order the newer card lists them; a field that was
// not there before moved from nothing.
function fieldChanges(before: ProjectRow['fields'], after: ProjectRow['fields']): FieldChange[] {
  const keys = [...new Set([...Object.keys(after), ...Object.keys(before)])]
  const out: FieldChange[] = []
  for (const field of keys) {
    const from = before[field] ?? null
    const to = after[field] ?? null
    if (from !== to) out.push({ field, from, to })
  }
  return out
}

// Changes read in the order the table shows them: the older deck first, then what is new.
function byPosition(before: ProjectDoc, after: ProjectDoc): (a: RowChange, b: RowChange) => number {
  const place = (change: RowChange): number => {
    const old = before.rows.findIndex((r) => r.id === change.cardRef)
    if (old >= 0) return old
    return before.rows.length + after.rows.findIndex((r) => r.id === change.cardRef)
  }
  return (a, b) => place(a) - place(b)
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

// The parts of the document that are not cards (#177), in the one order they are ever named.
// The history draws a chip per part that moved, and a chip row that reshuffles itself between two
// versions is a chip row nobody learns to read, so the order lives here and not at a call site.
export const DOC_PARTS = ['template', 'setup', 'rules', 'icons'] as const
export type DocPart = (typeof DOC_PARTS)[number]

// What one save changed, as a row in the history says it (#177): the cards counted, and the parts
// that are not cards named. It is deliberately small. A full `DocDiff` carries every field of
// every card that moved, which is what the card table holds a version against — but a history of
// fifteen versions of a 308-card deck would be megabytes of that, sent so a panel can print three
// numbers. This is what a row shows and nothing else, so a whole history fits in one answer.
export type VersionChange = {
  rev: number
  added: number
  removed: number
  changed: number
  parts: DocPart[]
  reordered: boolean
  columns: boolean
  renamed?: string
  // The first version of all: nothing came before it, so nothing changed in it — the game began.
  first?: true
}

export function changeOf(rev: number, diff: DocDiff): VersionChange {
  const count = (kind: RowChange['kind']) => diff.rows.filter((r) => r.kind === kind).length
  return {
    rev,
    added: count('added'),
    removed: count('removed'),
    changed: count('changed'),
    parts: DOC_PARTS.filter((part) => diff[part]),
    reordered: diff.reordered,
    columns: diff.columns,
    ...(diff.name ? { renamed: diff.name.to } : {}),
  }
}
