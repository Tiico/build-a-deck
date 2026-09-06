import type { Element, ProjectDoc } from './types.js'

// The columns a project's table has: every field the template binds, in template order,
// then the system column `antal` (L4). Fields in rows but not in the template come last.
export function fieldsOf(doc: ProjectDoc): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const add = (f: string) => {
    if (!seen.has(f)) {
      seen.add(f)
      out.push(f)
    }
  }
  const walk = (els: Element[]) => {
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
  for (const row of doc.rows) for (const k of Object.keys(row.fields)) add(k)
  return [...out.filter((f) => f !== 'antal'), 'antal']
}
