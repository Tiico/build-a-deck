// Imported by the editor as well as the server, so this module stays free of anything Node:
// types only from the project document, and no imports that reach the database or the network.
import type { ProjectDoc, ProjectRow } from './projects.js'

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
  template: boolean
  setup: boolean
  icons: boolean
  name?: { from: string; to: string }
}

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
    template: !same(before.template, after.template),
    setup: !same(before.setup, after.setup),
    icons: !same(before.icons, after.icons) || !same(before.credits ?? {}, after.credits ?? {}),
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
