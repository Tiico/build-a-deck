import type { ProjectDoc } from './projects.js'
import { copiesOf } from './setup.js'
import { growth, type Limit, type Measure, type QuotaMet } from './quotas.js'

// Cards per game (#1195, A2, #1192), in the two forms a card can be counted: the rows of the deck,
// which are the unique cards that are rendered and stored, and the copies, the sum of `antal` as
// the table deals them (`setupFromProject`). Both are measured and both can have a ceiling; which
// one the free tier holds is the price decision's (#1192, question 2).
//
// Counted out of the document itself, never kept beside it, so the count cannot drift from it.
export const CARD_MEASURES = ['cardRowsPerProject', 'cardCopiesPerProject'] as const satisfies readonly Measure[]
export type CardMeasure = (typeof CARD_MEASURES)[number]

export function cardsUsed(doc: Pick<ProjectDoc, 'rows'>): Record<CardMeasure, number> {
  let copies = 0
  for (const row of doc.rows) copies += copiesOf(row.fields)
  return { cardRowsPerProject: doc.rows.length, cardCopiesPerProject: copies }
}

// The game's ceiling on a measure: the owner's, since the owner bears the game (A2).
export type CardCeiling = (measure: CardMeasure) => Promise<Limit>

// Whether a game may go from `before` to `after`: null when it may, and the ceiling that was met
// when it may not. Only a measure that grows asks its ceiling, so an edit that adds nothing — a
// text, a template, a card taken away — is never refused, over the ceiling or not, and never costs
// a question. A new game is one that grows from nothing.
export async function cardGrowth(before: Pick<ProjectDoc, 'rows'>, after: Pick<ProjectDoc, 'rows'>, ceiling: CardCeiling): Promise<QuotaMet | null> {
  const was = cardsUsed(before)
  const will = cardsUsed(after)
  for (const measure of CARD_MEASURES) {
    const n = will[measure] - was[measure]
    if (n <= 0) continue
    const met = growth(measure, await ceiling(measure), was[measure], n)
    if (met) return met
  }
  return null
}
export const NO_CARDS: Pick<ProjectDoc, 'rows'> = { rows: [] }
