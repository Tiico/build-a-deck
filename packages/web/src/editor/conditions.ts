import type { Condition, ProjectDoc, Row } from './types.js'
import type { T } from '../i18n/index.js'

// What a condition layer asks of a card (L1, L3), read the way the compiler reads it, and said the
// way the designer wrote it (#478): «om typ = Guld», «om bild finns».
export function holds(when: Condition, row: Row): boolean {
  const value = row[when.field]
  const text = value === null || value === undefined ? '' : String(value)
  return 'equals' in when ? text === when.equals : text.trim() !== ''
}

export function conditionWords(when: Condition, t: T): string {
  return 'equals' in when ? t('canvas.if.equals', { field: when.field, value: when.equals }) : t('canvas.if.filled', { field: when.field })
}

// The cards a condition holds on, in the deck's order.
export function cardsWhere(doc: Pick<ProjectDoc, 'rows'>, when: Condition): ProjectDoc['rows'] {
  return doc.rows.filter((row) => holds(when, row.fields))
}
