import type { Element } from '@byd/template'
import type { ProjectDoc } from './projects.js'

// Every name the deck answers to, in the order a table shows them: what the template draws,
// face by face, then whatever else the cards carry. This is the truth about which columns a
// project has — there is no list of fields in the document, and there is deliberately none:
// a column is either drawn or written in, and both are visible here.
export function columnsOf(doc: ProjectDoc): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const add = (field: string) => {
    if (seen.has(field)) return
    seen.add(field)
    out.push(field)
  }
  const walk = (els: readonly Element[]) => {
    for (const el of els) {
      if ('bind' in el && 'field' in el.bind) add(el.bind.field)
      if (el.kind === 'if') {
        add(el.when.field)
        walk(el.children)
      }
      if (el.kind === 'group') walk(el.children)
    }
  }
  for (const face of Object.values(doc.template.faces)) {
    if (face.variantBy) add(face.variantBy)
    walk(face.base)
    for (const v of Object.values(face.variants)) walk(v.override ?? [])
  }
  for (const row of doc.rows) for (const key of Object.keys(row.fields)) add(key)
  // And the order the designer put them in, laid over that (#46). It is read as an order and
  // never as the list itself: a name in it that the deck no longer answers to is stepped over,
  // and a column it does not mention — one made since the last move — keeps the place the walk
  // above gave it. So a project that has never been reordered, and a project whose order is
  // half a year out of date, both read back as decks with exactly the columns they have.
  const wanted = doc.columns
  if (!wanted || wanted.length === 0) return out
  const has = new Set(out)
  const order = wanted.filter((f) => has.has(f))
  const placed = new Set(order)
  for (const field of out) if (!placed.has(field)) order.push(field)
  return order
}
