import { parseBody, type InlineNode } from './inline.js'

// Text fitting (E6). The compiler decides a size; something else measures. The default measurer
// is a character-width estimate good enough for the editor; Chromium can be injected to measure
// for real without the compiler changing.

export type MeasureFont = { family: string; sizePt: number; weight: number; lineHeight: number }
export type Measure = (text: string, font: MeasureFont, widthMm: number) => number

export const PT_TO_MM = 25.4 / 72
const STEP_PT = 0.5

// Radavståndet ett element har när mallen inte säger något. Det står här, bredvid räkningen som
// använder det, eftersom både kompilatorn och den som mäter en ruta måste svara likadant på hur
// högt en rad är — annars mäter de två olika kort.
export const DEFAULT_LINE_HEIGHT = 1.25

// One run of text that has to find room on lines of its own, and what the layout puts around it,
// in ems of the element's font (#308): the gap above it, and the indent taken off its width. A
// paragraph has neither; a list item has both, and measured as part of the paragraph above it a
// list would be thought shorter than it is and never shrink — which is what E6 is here to stop.
export type MeasurableLine = { text: string; gapEm: number; indentEm: number }

// How the body's blocks sit, in ems of the element's own font (#308). The estimate lays the text
// out with these and `compile` writes the same three numbers into the card's stylesheet, so what
// is measured is what the page does. They live here, beside the arithmetic, because an estimate
// working from other numbers than the page is worse than no estimate at all.
export const BLOCK_GAP_EM = 0.5
export const ITEM_GAP_EM = 0.2
export const INDENT_EM = 1.15

// Flattens the inline tree to what takes up width: text as itself, an icon as one em ("M"). A
// reference (B7) belongs to the rulebook and never reaches a card, but it measures as what it
// is written as, so nothing here can be surprised by one.
const flat = (nodes: readonly InlineNode[]): string =>
  nodes.map((n) => (n.type === 'text' ? n.text : n.type === 'icon' ? 'M' : n.type === 'ref' ? `[[${n.of}:${n.id}]]` : flat(n.children))).join('')

// The body as the lines the page will lay out: a paragraph is one run, and a list is one run per
// item, indented and set a little apart.
export function measurableLines(text: string): MeasurableLine[] {
  const out: MeasurableLine[] = []
  for (const block of parseBody(text)) {
    const first = out.length > 0 ? BLOCK_GAP_EM : 0
    if (block.type === 'paragraph') out.push({ text: flat(block.children), gapEm: first, indentEm: 0 })
    else for (const [index, item] of block.items.entries()) out.push({ text: flat(item), gapEm: index === 0 ? first : ITEM_GAP_EM, indentEm: INDENT_EM })
  }
  return out
}

// What each of those runs says, without the layout around it.
export function measurableText(text: string): string[] {
  return measurableLines(text).map((line) => line.text)
}

// Average glyph width as a fraction of the em, by weight. A crude model; it errs wide on purpose.
export const estimateHeight: Measure = (text, font, widthMm) => {
  const em = font.sizePt * PT_TO_MM
  const glyph = (font.weight >= 600 ? 0.56 : 0.52) * em
  return measurableLines(text).reduce((height, run) => {
    const room = Math.max(widthMm - run.indentEm * em, glyph)
    const lines = Math.max(1, Math.ceil((run.text.length * glyph) / room))
    return height + run.gapEm * em + lines * em * font.lineHeight
  }, 0)
}

export function detectScript(text: string): 'Latn' | 'Hani' | 'Arab' {
  if (/[一-鿿぀-ヿ가-힯]/u.test(text)) return 'Hani'
  if (/[؀-ۿ]/u.test(text)) return 'Arab'
  return 'Latn'
}

export type FitResult = { sizePt: number; overflow: boolean }

// Steps the size down until the text fits the box, never below `minPt`.
export function fitText(text: string, font: MeasureFont, box: { w: number; h: number }, minPt: number, measure: Measure): FitResult {
  for (let size = font.sizePt; size >= minPt - 1e-9; size -= STEP_PT) {
    if (measure(text, { ...font, sizePt: size }, box.w) <= box.h) return { sizePt: size, overflow: false }
  }
  return { sizePt: Math.min(font.sizePt, minPt), overflow: true }
}
