import { isPictureSource } from '@byd/template'
import type { Element, Row } from './types.js'
import type { Key } from '../i18n/index.js'

// What the template canvas says over a layer that draws nothing on the card shown (#802,
// beställarens beslut variant A, «rutan säger det»). Before it, a picture with none chosen and a
// row of icons with no names were invisible until selected, and a picture bound to a column of
// words drew the browser's broken-image glyph. The words are the canvas's and never the card's:
// the compiler is not asked, so print and the table cannot meet them (E2).
//
// Five ways to be empty, and they are told apart because each has its own way out: a fixed
// picture is chosen in the game's pictures, a row's names are written in its column, and a column
// of words is the wrong column altogether.
export type Placeholder =
  | { kind: 'image'; why: 'none' }
  | { kind: 'image'; why: 'empty' | 'words'; field: string }
  | { kind: 'icons'; why: 'none' }
  | { kind: 'icons'; why: 'empty'; field: string }

export function placeholderOf(el: Element, row: Row): Placeholder | null {
  if (el.kind !== 'image' && el.kind !== 'icons') return null
  if ('literal' in el.bind) {
    // A single icon always carries a name, and a fixed picture carries the address of the one it
    // shows; only a value with nothing in it is a layer that has not been told what to draw.
    if (el.kind === 'icons') return el.bind.literal.trim() === '' ? { kind: 'icons', why: 'none' } : null
    return isPictureSource(el.bind.literal) ? null : { kind: 'image', why: 'none' }
  }
  const field = el.bind.field
  const cell = String(row[field] ?? '').trim()
  if (cell === '') return { kind: el.kind, why: 'empty', field }
  // The one question the compiler asks before it draws a picture, asked here to say why it
  // did not (#802): a cell of words is drawn as an empty cell.
  if (el.kind === 'image' && !isPictureSource(cell)) return { kind: 'image', why: 'words', field }
  return null
}

// The words for each, in the tool's voice (A4): the long form where the layer has room for two
// lines, the short one on a strip, and the sentence — what it is and what to do — as the tag's
// title and name, whichever form is drawn.
export type PlaceholderCase = 'image.none' | 'image.empty' | 'image.words' | 'icons.none' | 'icons.empty'
export const PLACEHOLDER_WORDS: Record<PlaceholderCase, { short: Key; long: Key; sentence: Key }> = {
  'image.none': { short: 'canvas.placeholder.image.none', long: 'canvas.placeholder.image.none', sentence: 'canvas.placeholder.image.none.sentence' },
  'image.empty': { short: 'canvas.placeholder.empty.short', long: 'canvas.placeholder.empty', sentence: 'canvas.placeholder.image.empty.sentence' },
  'image.words': { short: 'canvas.placeholder.image.words.short', long: 'canvas.placeholder.image.words', sentence: 'canvas.placeholder.image.words.sentence' },
  'icons.none': { short: 'canvas.placeholder.icons.none.short', long: 'canvas.placeholder.icons.none', sentence: 'canvas.placeholder.icons.none.sentence' },
  'icons.empty': { short: 'canvas.placeholder.icons.empty.short', long: 'canvas.placeholder.empty', sentence: 'canvas.placeholder.icons.empty.sentence' },
}

// Below this height on the screen the tag is one line in its short form, as the prototype drew
// a new row of icons (24 × 6 mm): two lines of the long form do not fit it at any zoom a
// designer works at.
export const THIN_PX = 60
