import { parseInline, type InlineNode } from './inline.js'

// Text fitting (E6). The compiler decides a size; something else measures. The default measurer
// is a character-width estimate good enough for the editor; Chromium can be injected to measure
// for real without the compiler changing.

export type MeasureFont = { family: string; sizePt: number; weight: number; lineHeight: number }
export type Measure = (text: string, font: MeasureFont, widthMm: number) => number

export const PT_TO_MM = 25.4 / 72
const STEP_PT = 0.5

// Flattens the inline tree to what takes up width: text as itself, an icon as one em ("M"). A
// reference (B7) belongs to the rulebook and never reaches a card, but it measures as what it
// is written as, so nothing here can be surprised by one.
export function measurableText(text: string): string[] {
  const flat = (nodes: InlineNode[]): string =>
    nodes.map((n) => (n.type === 'text' ? n.text : n.type === 'icon' ? 'M' : n.type === 'ref' ? `[[${n.of}:${n.id}]]` : flat(n.children))).join('')
  return parseInline(text).map((p) => flat(p.children))
}

// Average glyph width as a fraction of the em, by weight. A crude model; it errs wide on purpose.
export const estimateHeight: Measure = (text, font, widthMm) => {
  const em = font.sizePt * PT_TO_MM
  const glyph = (font.weight >= 600 ? 0.56 : 0.52) * em
  const paragraphs = measurableText(text)
  if (paragraphs.length === 0) return 0
  const lines = paragraphs.reduce((n, p) => n + Math.max(1, Math.ceil((p.length * glyph) / Math.max(widthMm, glyph))), 0)
  const gaps = (paragraphs.length - 1) * 0.5 * em
  return lines * em * font.lineHeight + gaps
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
