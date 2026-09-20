import type { ComponentTypeDef } from '@byd/engine'
import { elementsFor } from './compile.js'
import { detectScript } from './fit.js'
import { paintOf, type Element, type FaceTemplate, type Row } from './model.js'

// Physical validation (E5): the checks that catch what a screen hides. Text that looks fine at
// arm's length is five points in the hand; two effect colours that differ only in red and green
// are one colour to eight percent of the men at the table; a background drawn to the trim leaves
// a white edge when the knife wanders. Warnings belong in the editor, errors block an order.
export type IssueCode = 'text-too-small' | 'low-contrast' | 'outside-safe-area' | 'short-of-bleed' | 'hairline' | 'colour-only' | 'unpinned-font'
export type Severity = 'warning' | 'error'
// A fault is what was measured, not a sentence about it: the words belong where the reader is,
// in the language they are reading in (A4). `values` carries exactly what the sentence needs.
export type IssueValues = Record<string, string | number>
export type Issue = { element: string; code: IssueCode; severity: Severity; values: IssueValues }
// `fonts` is what the version is pinned to (B3): a family without a file of its own renders as
// whatever the machine happens to have, which is a difference nobody sees until the print.
export type ValidateInput = { type: ComponentTypeDef; face: FaceTemplate; row: Row; fonts?: Record<string, { stack: string; asset?: string | undefined }> }

// Text below the type's own minimum for the script cannot be read; a little above it is a risk.
const SMALL_TEXT_FACTOR = 1.35
// Print contrast, in the ratio WCAG uses: under 3 is unreadable on paper, under 4.5 is a risk.
const CONTRAST_ERROR = 3
const CONTRAST_WARNING = 4.5
// What a press can hold. Below a quarter of a millimetre a line breaks up or disappears.
const HAIRLINE_ERROR_MM = 0.25
const HAIRLINE_WARNING_MM = 0.4
// Two colours are a difference to the eye above this distance, and one colour below it (CIE76).
// Two colours a reader can tell apart, and two a colour-blind reader cannot. They are exported
// because the palette (E4) has to pass the very same judgement the card check passes: a deck
// should learn that two of its meanings collapse into one while it is naming them, not forty
// cards later.
export const APART = 22
export const TOGETHER = 11
export const BLINDNESS = ['protanopia', 'deuteranopia', 'tritanopia'] as const
export type Blindness = (typeof BLINDNESS)[number]
type Box = { id: string; x: number; y: number; w: number; h: number; el: Element }

export function validateCard({ type, face, row, fonts }: ValidateInput): Issue[] {
  const issues: Issue[] = []
  const boxes = flatten(elementsFor(face, row), 0, 0, row)
  const { widthMm, heightMm } = type.physical
  const { safeMm, bleedMm, minPtByScript } = type.print

  for (const box of boxes) {
    const el = box.el
    if (el.kind === 'text') {
      const value = 'literal' in el.bind ? el.bind.literal : String(row[el.bind.field] ?? '')
      const floor = minPtByScript[detectScript(value)] ?? minPtByScript['Latn'] ?? 6
      if (el.font.sizePt < floor) issues.push({ element: el.id, code: 'text-too-small', severity: 'error', values: { sizePt: el.font.sizePt, floor } })
      else if (el.font.sizePt < floor * SMALL_TEXT_FACTOR) issues.push({ element: el.id, code: 'text-too-small', severity: 'warning', values: { sizePt: el.font.sizePt, floor } })

      // A plate can be two inks (L17), and the words have to survive both: the worst of them is
      // what the reader meets somewhere on the card.
      const behind = behindOf(box, boxes, row)
      if (behind.length > 0) {
        const ratio = Math.min(...behind.map((colour) => contrastRatio(el.color, colour)))
        if (ratio < CONTRAST_ERROR) issues.push({ element: el.id, code: 'low-contrast', severity: 'error', values: { ratio: ratio.toFixed(1), limit: CONTRAST_ERROR } })
        else if (ratio < CONTRAST_WARNING) issues.push({ element: el.id, code: 'low-contrast', severity: 'warning', values: { ratio: ratio.toFixed(1), limit: CONTRAST_WARNING } })
      }
    }

    // The trim is where the knife falls, and it wanders. Content must stay inside the safe area;
    // a background that reaches the trim must carry on into the bleed, or the cut leaves a
    // white line along the edge.
    const reaches = box.x <= 0 || box.y <= 0 || box.x + box.w >= widthMm || box.y + box.h >= heightMm
    const bled = box.x <= -bleedMm && box.y <= -bleedMm && box.x + box.w >= widthMm + bleedMm && box.y + box.h >= heightMm + bleedMm
    const near = box.x < safeMm || box.y < safeMm || box.x + box.w > widthMm - safeMm || box.y + box.h > heightMm - safeMm
    const background = el.kind === 'shape' || el.kind === 'image'
    if (reaches && background && !bled) issues.push({ element: box.id, code: 'short-of-bleed', severity: 'error', values: { bleedMm } })
    else if (reaches && !background) issues.push({ element: box.id, code: 'outside-safe-area', severity: 'error', values: {} })
    else if (!reaches && near) issues.push({ element: box.id, code: 'outside-safe-area', severity: 'warning', values: { safeMm } })

    if (el.kind === 'shape' && el.stroke && el.strokeMm !== undefined && el.strokeMm > 0) {
      if (el.strokeMm < HAIRLINE_ERROR_MM) issues.push({ element: el.id, code: 'hairline', severity: 'error', values: { strokeMm: el.strokeMm, limit: HAIRLINE_ERROR_MM } })
      else if (el.strokeMm < HAIRLINE_WARNING_MM) issues.push({ element: el.id, code: 'hairline', severity: 'warning', values: { strokeMm: el.strokeMm, limit: HAIRLINE_WARNING_MM } })
    }
  }

  // A font the version does not carry is whatever the machine has (B3). It is said once per
  // card with every family it is true of: forty elements in the same font are one mistake.
  const loose = [...new Set(boxes.flatMap((b) => (b.el.kind === 'text' && !fonts?.[b.el.font.family]?.asset ? [b.el.font.family] : [])))]
  const first = boxes.find((b) => b.el.kind === 'text' && loose.includes(b.el.font.family))
  if (loose.length > 0 && first)
    issues.push({
      element: first.id,
      code: 'unpinned-font',
      severity: 'warning',
      values: { families: loose.join(', ') },
    })

  issues.push(...colourOnly(boxes, row))
  return issues
}

// Colours that carry a difference to most eyes and none to some: the card is told once per pair.
// A fill can be a rule on a column (L16), so what is compared is the colour this row actually
// gets — the card in the hand, not the template in the abstract.
function colourOnly(boxes: Box[], row: Row): Issue[] {
  const carried = boxes.flatMap((b) => {
    if (b.el.kind === 'shape') {
      const fill = inkOf(b.el, row)
      return fill ? [{ id: b.id, colour: fill }] : []
    }
    return b.el.kind === 'text' ? [{ id: b.id, colour: b.el.color }] : []
  })
  const issues: Issue[] = []
  for (const [i, a] of carried.entries()) {
    for (const b of carried.slice(i + 1)) {
      if (distance(a.colour, b.colour) < APART) continue
      const lost = BLINDNESS.find((kind) => distance(simulate(a.colour, kind), simulate(b.colour, kind)) < TOGETHER)
      if (lost) issues.push({ element: b.id, code: 'colour-only', severity: 'warning', values: { a: a.id, b: b.id, blindness: lost } })
    }
  }
  return issues
}

// The elements a row actually shows, in draw order, with group offsets applied.
function flatten(elements: readonly Element[], dx: number, dy: number, row: Row): Box[] {
  const out: Box[] = []
  for (const el of elements) {
    if (el.kind === 'group') {
      out.push(...flatten(el.children, dx + el.x, dy + el.y, row))
      continue
    }
    if (el.kind === 'if') {
      if (shows(el.when, row)) out.push(...flatten(el.children, dx, dy, row))
      continue
    }
    out.push({ id: el.id, x: el.x + dx, y: el.y + dy, w: el.w, h: el.h, el })
  }
  return out
}

function shows(when: { field: string; nonEmpty?: true; equals?: string }, row: Row): boolean {
  const value = row[when.field]
  const text = value === null || value === undefined ? '' : String(value)
  return when.equals === undefined ? text !== '' : text === when.equals
}

// The colour a shape actually lays on the paper. Transparency (#317) is ordinary rasterisation
// to the press — thinner ink, which is nothing the press has a name for — so a shape is read at
// its own colour whatever it is turned down to. All the way down is the one exception, because
// then it lays no ink at all: an invisible plate is not what lies behind the words, and it is not
// one of the two marks a colour-blind reader has to tell apart. Believing the stylesheet instead
// would fail in the dangerous direction, passing white words on white paper.
function inkOf(el: Extract<Element, { kind: 'shape' }>, row: Row): string | undefined {
  return el.opacity === 0 ? undefined : paintOf(el.fill, row)
}

// What lies behind a text box: the last filled shape drawn under its middle, where the words
// are. A box is usually wider than the plate it sits on — a cost in a circle, say — so asking
// for the whole box to be covered would read the paper behind the plate instead of the plate.
//
// Every colour of it, not one: a patterned plate (L17) is its fill and the ink repeated over it,
// and text that reads well between the stripes and vanishes on them is a card that fails in the
// hand while the check called it fine.
function behindOf(box: Box, boxes: Box[], row: Row): string[] {
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  let found: string[] = []
  for (const other of boxes) {
    if (other === box) break
    if (other.el.kind !== 'shape') continue
    const fill = inkOf(other.el, row)
    if (!fill) continue
    if (other.x <= cx && other.y <= cy && other.x + other.w >= cx && other.y + other.h >= cy) {
      found = other.el.pattern ? [fill, other.el.pattern.color] : [fill]
    }
  }
  return found
}

// --- colour ---

function channels(hex: string): [number, number, number] {
  const h = hex.trim().replace('#', '')
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h
  const n = Number.parseInt(full.slice(0, 6).padEnd(6, '0'), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const toHex = (rgb: [number, number, number]): string => `#${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`
const toLinear = (v: number): number => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4)
const fromLinear = (v: number): number => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055) * 255

export function relativeLuminance(hex: string): number {
  const [r, g, b] = channels(hex).map(toLinear) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

// The ratio WCAG defines, which is also how a printer talks about legibility.
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

// Viénot, Brettel and Mollon's simulation of dichromatic vision, in linear RGB.
const MATRICES: Record<Blindness, number[]> = {
  protanopia: [0.11238, 0.88762, 0, 0.11238, 0.88762, 0, 0.00401, -0.00401, 1],
  deuteranopia: [0.29275, 0.70725, 0, 0.29275, 0.70725, 0, -0.02234, 0.02234, 1],
  tritanopia: [1, 0.14461, -0.14461, 0, 0.85924, 0.14076, 0, 0.85924, 0.14076],
}

export function simulate(hex: string, kind: Blindness): string {
  const [r, g, b] = channels(hex).map(toLinear) as [number, number, number]
  const m = MATRICES[kind]
  const out: [number, number, number] = [
    (m[0] ?? 0) * r + (m[1] ?? 0) * g + (m[2] ?? 0) * b,
    (m[3] ?? 0) * r + (m[4] ?? 0) * g + (m[5] ?? 0) * b,
    (m[6] ?? 0) * r + (m[7] ?? 0) * g + (m[8] ?? 0) * b,
  ]
  return toHex(out.map(fromLinear) as [number, number, number])
}

// CIE76 in Lab: near enough to say whether two colours read as one.
function lab(hex: string): [number, number, number] {
  const [r, g, b] = channels(hex).map(toLinear) as [number, number, number]
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
  const f = (v: number) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116)
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
}

export function distance(a: string, b: string): number {
  const [l1, a1, b1] = lab(a)
  const [l2, a2, b2] = lab(b)
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2)
}

// ── What a check proposes be done about itself (#233) ────────────────────────────────────────
//
// The wall has always said what is wrong and on which cards, and never what to do about it: the
// designer was handed a measurement and left to find the element in the template and work out the
// number herself. A fault is nearly always the template's — the same element on every row, which
// is why `checks.ts` gathers them by kind — so the remedy is the template's too, and it is one
// edit for the whole deck.
//
// It lives beside the check that found the fault, and deliberately so. The floor a size is lifted
// to, the width a hairline is thickened to and the margin a box is brought inside are the very
// constants the check measures against; written anywhere else they would be a second copy of them,
// free to drift until a remedy no longer mends what the check reports.
//
// A remedy is a patch and never an edit: it says what an element should become, and the surface
// that asked applies it through whatever door it already has. That keeps this pure, which is what
// lets every reading in `remedy.test.ts` apply one and run the check again — the whole contract
// being that the fault is gone afterwards, and that nothing else has broken in its place.

// A patch onto one element, in that element's own words.
export type Remedy = { element: string; patch: Partial<Extract<Element, { kind: 'text' }>> & Partial<Extract<Element, { kind: 'shape' }>> }

export function remedyFor(issue: Issue, input: ValidateInput): Remedy | null {
  // The box the check measured, which is the element with whatever its groups have added to its
  // place folded in. A patch is written in the element's *own* words, so the difference between the
  // two is exactly the offset to take back off again before writing a place down — otherwise an
  // element inside a group would be moved by its group's distance a second time.
  const box = flatten(elementsFor(input.face, input.row), 0, 0, input.row).find((b) => b.id === issue.element || b.el.id === issue.element)
  if (!box) return null
  const el = box.el
  // A group and an `if` are not things that are drawn; `flatten` has already walked through them,
  // so what it hands back always carries a place of its own. Said out loud rather than asserted,
  // because a remedy that guessed here would write a place onto something that has none.
  if (!('x' in el)) return null
  const off = { x: box.x - el.x, y: box.y - el.y }
  const { widthMm, heightMm } = input.type.physical
  const { safeMm, bleedMm, minPtByScript } = input.type.print
  switch (issue.code) {
    case 'text-too-small': {
      if (el.kind !== 'text') return null
      const value = 'literal' in el.bind ? el.bind.literal : String(input.row[el.bind.field] ?? '')
      const floor = minPtByScript[detectScript(value)] ?? minPtByScript['Latn'] ?? 6
      // Clear of the *warning* and not merely over the error's line. A remedy that turns red into
      // orange has handed the designer the same decision a second time, which is not a remedy.
      // Rounded up to a tenth, because a size a hand would type is a size a hand can read back.
      const lifted = Math.ceil(floor * SMALL_TEXT_FACTOR * 10) / 10
      return lifted > el.font.sizePt ? { element: el.id, patch: { font: { ...el.font, sizePt: lifted } } } : null
    }
    case 'hairline': {
      if (el.kind !== 'shape') return null
      return { element: el.id, patch: { strokeMm: HAIRLINE_WARNING_MM } }
    }
    case 'outside-safe-area': {
      // Inside the safe area on every side. The box is moved before it is narrowed: a designer who
      // drew something 20 mm wide meant it to be 20 mm wide, and only a box too big for the safe
      // area at all gives any of that up.
      const room = { w: widthMm - safeMm * 2, h: heightMm - safeMm * 2 }
      const w = Math.min(box.w, room.w)
      const h = Math.min(box.h, room.h)
      const x = Math.min(Math.max(box.x, safeMm), widthMm - safeMm - w)
      const y = Math.min(Math.max(box.y, safeMm), heightMm - safeMm - h)
      return x === box.x && y === box.y && w === box.w && h === box.h ? null : { element: el.id, patch: { x: x - off.x, y: y - off.y, w, h } }
    }
    case 'short-of-bleed':
      // All the way out on every side: a background that reaches the trim has to carry on past it,
      // or the knife — which wanders — leaves a white line along the edge.
      return { element: el.id, patch: { x: -bleedMm - off.x, y: -bleedMm - off.y, w: widthMm + bleedMm * 2, h: heightMm + bleedMm * 2 } }
    // The three that are nobody's to answer with a number.
    //
    // `low-contrast` is mended by choosing a colour, and which colour is a design decision: a
    // machine darkening an ink until it passes would be making that decision quietly, on a card
    // whose palette somebody chose. `colour-only` needs something that is *not* colour to carry
    // the difference — a shape, a word, a mark — which no patch can invent. And `unpinned-font`
    // needs a font file (B3), which is not in the template at all and cannot be conjured from it.
    case 'low-contrast':
    case 'colour-only':
    case 'unpinned-font':
      return null
  }
}
