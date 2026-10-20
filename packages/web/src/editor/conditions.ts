import type { Condition, Element, ProjectDoc, Row } from './types.js'
import type { T } from '../i18n/index.js'
import { fieldLabel } from './fields.js'
import { layerName } from './LayerList.js'

// What a condition layer asks of a card (L1, L3), read the way the compiler reads it, and said the
// way the designer wrote it (#478): «om typ = Guld», «om bild finns».
export function holds(when: Condition, row: Row): boolean {
  const value = row[when.field]
  const text = value === null || value === undefined ? '' : String(value)
  return 'equals' in when ? text === when.equals : text.trim() !== ''
}

export function conditionWords(when: Condition, t: T): string {
  return 'equals' in when ? t('canvas.if.equals', { field: fieldLabel(when.field, t), value: when.equals }) : t('canvas.if.filled', { field: fieldLabel(when.field, t) })
}

// What a layer is called, the one name it has wherever it is said (#699, variant D): in the layer
// list, on the condition's tab on the card, in the properties heading and in every question and
// sentence about it. A condition nobody has named is called by its condition — «om raritet =
// Karaktär» — because «if-karaktar» says nothing the condition does not say better; every other
// layer is what the designer named it, or its id (L15).
export function layerTitle(el: Element, t: T): string {
  return el.kind === 'if' && !el.name ? conditionWords(el.when, t) : layerName(el)
}

// The cards a condition holds on, in the deck's order.
export function cardsWhere(doc: Pick<ProjectDoc, 'rows'>, when: Condition): ProjectDoc['rows'] {
  return doc.rows.filter((row) => holds(when, row.fields))
}
