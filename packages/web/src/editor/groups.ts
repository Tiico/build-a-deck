import type { Element, FaceTemplate, ProjectDoc, ProjectRow } from './types.js'

// A card group (#13) is a rule on a column, never a list of card ids: the template's `variantBy`
// names the column and a variant's key is the value it matches (L3). A card that gets that value
// joins the group by its data alone, which is the whole point — twenty traps are one decision,
// and the twenty-first trap needs none.

// The column the deck is grouped by, or nothing when it is not grouped. Every face is grouped by
// the same column: a group is one thing the designer names, with a front and a back (L7).
export function groupColumn(doc: ProjectDoc): string | null {
  for (const face of Object.values(doc.template.faces)) if (face.variantBy) return face.variantBy
  return null
}

// The groups of the deck: every value the column carries, in the order the cards are in, then any
// group the template has designed whose cards have since gone away — a look with nothing to show
// it on is still a look the designer must be able to find and change.
export function groupsOf(doc: ProjectDoc): string[] {
  const column = groupColumn(doc)
  if (!column) return []
  const out: string[] = []
  const add = (value: string) => {
    if (value !== '' && !out.includes(value)) out.push(value)
  }
  for (const row of doc.rows) add(valueOf(row, column))
  for (const face of Object.values(doc.template.faces)) for (const name of Object.keys(face.variants)) add(name)
  return out
}

export function cardsInGroup(doc: ProjectDoc, group: string): ProjectRow[] {
  const column = groupColumn(doc)
  if (!column) return []
  return doc.rows.filter((row) => valueOf(row, column) === group)
}

// The group a card falls into, or nothing when it takes the base look.
export function groupOfRow(doc: ProjectDoc, row: ProjectRow): string | null {
  const column = groupColumn(doc)
  if (!column) return null
  const value = valueOf(row, column)
  return value !== '' && groupsOf(doc).includes(value) ? value : null
}

// A group said as what it is: the rule, so nobody reads it as a bag of cards.
export function ruleLabel(column: string, group: string): string {
  return `${column} = ${group}`
}

// What a group changes against the base on one face: the elements it replaces and the ones it
// takes away. An id here is a layer that is the group's; every other layer is the base's.
export function overriddenIds(face: FaceTemplate, group: string): Set<string> {
  const variant = face.variants[group]
  if (!variant) return new Set()
  return new Set([...(variant.override ?? []).map((e: Element) => e.id), ...(variant.remove ?? [])])
}

// Every id the face knows: the base's and every group's own. An id belongs to the face and not to
// the tab it was minted on — a base element named after a group's own element would be overridden
// by that group the moment one of its cards was drawn, so a new element must clear all of them.
export function idsOnFace(face: FaceTemplate): string[] {
  const out = new Set(face.base.map((e) => e.id))
  for (const variant of Object.values(face.variants)) for (const e of variant.override ?? []) out.add(e.id)
  return [...out]
}

function valueOf(row: ProjectRow, column: string): string {
  const v = row.fields[column]
  return v === null || v === undefined ? '' : String(v)
}

// What the layer panel shows for a face (#13). Without a group that is simply the base; with one
// it is the base as the group draws it, plus — and this is the point — the base layers the group
// has taken away. A removal that hid its own layer would be a door that only opens one way.
export type Layer = { element: Element; source: 'base' | 'group' | 'removed' }

export function layersOf(face: FaceTemplate, group: string | null): Layer[] {
  if (!group) return face.base.map((element) => ({ element, source: 'base' as const }))
  const variant = face.variants[group] ?? {}
  const overrides = new Map((variant.override ?? []).map((e) => [e.id, e]))
  const removed = new Set(variant.remove ?? [])
  const out: Layer[] = face.base.map((element) => {
    if (removed.has(element.id)) return { element, source: 'removed' as const }
    const over = overrides.get(element.id)
    return over ? { element: over, source: 'group' as const } : { element, source: 'base' as const }
  })
  const seen = new Set(face.base.map((e) => e.id))
  for (const e of variant.override ?? []) if (!seen.has(e.id)) out.push({ element: e, source: 'group' })
  return out
}
