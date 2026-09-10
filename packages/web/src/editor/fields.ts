import type { ProjectDoc } from './types.js'
import type { T } from '../i18n/index.js'
import { ANTAL, columnsOf, type RecipeWords } from '@byd/server/doc'

// The three kinds a field can be, and they are the wizard's three — the editor does not get a
// fourth (L4 leaves boolean to the type registry, not to this form).
export type FieldKind = 'text' | 'number' | 'image'
export const FIELD_KINDS: readonly FieldKind[] = ['text', 'number', 'image']

// The name the tool puts in the box when a field is made — in the wizard and in the editor, from
// here, so the two doors cannot drift apart. It is a *key*, and #27 settled what that means: an
// identifier in the document, not a text, so it does not change language when the reader does.
// Two designers pressing the same button must get the same column, or a template would bind
// `bild2` for one of them and `image2` for the other. What the tool writes in the reader's own
// language and then hands over is the label beside it in the wizard; the editor's table names a
// column by its key, so the key is the whole of what it suggests — and the designer types over
// it whenever she has a better word.
export function suggestFieldKey(kind: FieldKind, taken: readonly string[]): string {
  const base = kind === 'image' ? 'bild' : kind === 'number' ? 'värde' : 'fält'
  let n = 1
  while (taken.includes(`${base}${n}`)) n++
  return `${base}${n}`
}

// The columns a project's table has: every name the deck answers to — what the template binds,
// in template order, then whatever else the cards carry — and the system column `antal` last,
// which the table shows whether or not a card happens to carry it (L4). Which names those are is
// the document's own question and is answered where the edits are, so the editor and the actor
// cannot come to different conclusions about what a column is.
export const fieldsOf = (doc: ProjectDoc): string[] => [...columnsOf(doc).filter((f) => f !== ANTAL), ANTAL]

// What a column is called on screen. Every column is the designer's own word except one:
// `antal` is the engine's — how many copies of the card the deck holds (L4) — so it is the one
// the tool names, in the reader's language (A4). The field itself keeps its name everywhere it
// matters: in the document, in the CSV, and in what the engine reads.
export const fieldLabel = (field: string, t: T): string => (field === ANTAL ? t('table.field.antal') : field)

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
