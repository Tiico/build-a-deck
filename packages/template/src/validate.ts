import type { ComponentTypeDef } from '@byd/engine'
import { elementsFor } from './compile.js'
import { detectScript } from './fit.js'
import type { Element, FaceTemplate, Row } from './model.js'

// Physical validation (E5): the checks that catch what a screen hides. Text that looks fine at
// arm's length is five points in the hand; two effect colours that differ only in red and green
// are one colour to eight percent of the men at the table; a background drawn to the trim leaves
// a white edge when the knife wanders. Warnings belong in the editor, errors block an order.
export type IssueCode = 'text-too-small' | 'low-contrast' | 'outside-safe-area' | 'short-of-bleed' | 'hairline' | 'colour-only' | 'unpinned-font'
export type Severity = 'warning' | 'error'
export type Issue = { element: string; code: IssueCode; severity: Severity; detail: string }
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
const APART = 22
const TOGETHER = 11
const BLINDNESS = ['protanopia', 'deuteranopia', 'tritanopia'] as const
export type Blindness = (typeof BLINDNESS)[number]
const SWEDISH: Record<Blindness, string> = { protanopia: 'protanopi', deuteranopia: 'deuteranopi', tritanopia: 'tritanopi' }

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
      if (el.font.sizePt < floor) issues.push({ element: el.id, code: 'text-too-small', severity: 'error', detail: `${el.font.sizePt} pt är under ${floor} pt, som är minsta läsbara storlek för skriften` })
      else if (el.font.sizePt < floor * SMALL_TEXT_FACTOR) issues.push({ element: el.id, code: 'text-too-small', severity: 'warning', detail: `${el.font.sizePt} pt är nära gränsen ${floor} pt; i handen blir det litet` })

      const behind = behindOf(box, boxes)
      if (behind) {
        const ratio = contrastRatio(el.color, behind)
        if (ratio < CONTRAST_ERROR) issues.push({ element: el.id, code: 'low-contrast', severity: 'error', detail: `kontrasten mot bakgrunden är ${ratio.toFixed(1)}:1, under ${CONTRAST_ERROR}:1` })
        else if (ratio < CONTRAST_WARNING) issues.push({ element: el.id, code: 'low-contrast', severity: 'warning', detail: `kontrasten mot bakgrunden är ${ratio.toFixed(1)}:1, under ${CONTRAST_WARNING}:1` })
      }
    }

    // The trim is where the knife falls, and it wanders. Content must stay inside the safe area;
    // a background that reaches the trim must carry on into the bleed, or the cut leaves a
    // white line along the edge.
    const reaches = box.x <= 0 || box.y <= 0 || box.x + box.w >= widthMm || box.y + box.h >= heightMm
    const bled = box.x <= -bleedMm && box.y <= -bleedMm && box.x + box.w >= widthMm + bleedMm && box.y + box.h >= heightMm + bleedMm
    const near = box.x < safeMm || box.y < safeMm || box.x + box.w > widthMm - safeMm || box.y + box.h > heightMm - safeMm
    const background = el.kind === 'shape' || el.kind === 'image'
    if (reaches && background && !bled) issues.push({ element: box.id, code: 'short-of-bleed', severity: 'error', detail: `når kanten men inte ut till utfallet ${bleedMm} mm; snittet kan lämna en vit kant` })
    else if (reaches && !background) issues.push({ element: box.id, code: 'outside-safe-area', severity: 'error', detail: 'når kortets kant och kommer att skäras' })
    else if (!reaches && near) issues.push({ element: box.id, code: 'outside-safe-area', severity: 'warning', detail: `ligger närmare kanten än skyddsmarginalen ${safeMm} mm och kan skäras` })

    if (el.kind === 'shape' && el.stroke && el.strokeMm !== undefined && el.strokeMm > 0) {
      if (el.strokeMm < HAIRLINE_ERROR_MM) issues.push({ element: el.id, code: 'hairline', severity: 'error', detail: `linjen är ${el.strokeMm} mm, under ${HAIRLINE_ERROR_MM} mm som pressen klarar` })
      else if (el.strokeMm < HAIRLINE_WARNING_MM) issues.push({ element: el.id, code: 'hairline', severity: 'warning', detail: `linjen är ${el.strokeMm} mm och kan bli ojämn under ${HAIRLINE_WARNING_MM} mm` })
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
      detail: `${loose.join(', ')} följer inte med spelet: trycket kan bli ett annat typsnitt än det du ser`,
    })

  issues.push(...colourOnly(boxes))
  return issues
}

// Colours that carry a difference to most eyes and none to some: the card is told once per pair.
function colourOnly(boxes: Box[]): Issue[] {
  const carried = boxes.flatMap((b) => (b.el.kind === 'shape' && b.el.fill ? [{ id: b.id, colour: b.el.fill }] : b.el.kind === 'text' ? [{ id: b.id, colour: b.el.color }] : []))
  const issues: Issue[] = []
  for (const [i, a] of carried.entries()) {
    for (const b of carried.slice(i + 1)) {
      if (distance(a.colour, b.colour) < APART) continue
      const lost = BLINDNESS.find((kind) => distance(simulate(a.colour, kind), simulate(b.colour, kind)) < TOGETHER)
      if (lost) issues.push({ element: b.id, code: 'colour-only', severity: 'warning', detail: `${a.id} och ${b.id} skiljs bara åt av färg och blir samma vid ${SWEDISH[lost]}` })
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

// What lies behind a text box: the last filled shape drawn under its middle, where the words
// are. A box is usually wider than the plate it sits on — a cost in a circle, say — so asking
// for the whole box to be covered would read the paper behind the plate instead of the plate.
function behindOf(box: Box, boxes: Box[]): string | null {
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  let found: string | null = null
  for (const other of boxes) {
    if (other === box) break
    if (other.el.kind !== 'shape' || !other.el.fill) continue
    if (other.x <= cx && other.y <= cy && other.x + other.w >= cx && other.y + other.h >= cy) found = other.el.fill
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
