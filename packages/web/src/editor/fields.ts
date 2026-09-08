import type { Element, ProjectDoc } from './types.js'
import type { T } from '../i18n/index.js'
import type { RecipeWords } from '@byd/server/doc'

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

// What a column is called on screen. Every column is the designer's own word except one:
// `antal` is the engine's — how many copies of the card the deck holds (L4) — so it is the one
// the tool names, in the reader's language (A4). The field itself keeps its name everywhere it
// matters: in the document, in the CSV, and in what the engine reads.
export const fieldLabel = (field: string, t: T): string => (field === 'antal' ? t('table.field.antal') : field)

// The words the recipe names its zones with (B5, A4). They are the designer's document the
// moment the zone exists, so they are written in the language the designer is working in; the
// same words go with the edit, so the actor writes exactly what the editor showed.
export const recipeWords = (t: T): RecipeWords => ({
  floor: t('zone.floor'),
  draw: t('zone.draw'),
  drawShortcut: t('zone.draw.shortcut'),
  discard: t('zone.discard'),
  discardShortcut: t('zone.discard.shortcut'),
  market: t('zone.market'),
  marketShortcut: t('zone.market.shortcut'),
  mine: t('zone.mine'),
  mineShortcut: t('zone.mine.shortcut'),
  counters: t('zone.counters'),
  hand: t('zone.hand'),
})
