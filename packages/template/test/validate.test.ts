import { describe, expect, it } from 'vitest'
import { CARD_STANDARD_63x88 } from '@byd/engine'
import { contrastRatio, distance, simulate, validateCard, type Issue } from '../src/validate.js'
import type { Element, FaceTemplate } from '../src/model.js'

const face = (base: Element[]): FaceTemplate => ({ base, variants: {} })
const text = (over: Partial<Extract<Element, { kind: 'text' }>> = {}): Element => ({
  kind: 'text',
  id: 'body',
  x: 6,
  y: 30,
  w: 51,
  h: 40,
  bind: { literal: 'Flygande.' },
  font: { family: 'system-ui', sizePt: 10 },
  color: '#222222',
  ...over,
})
const bg = (over: Partial<Extract<Element, { kind: 'shape' }>> = {}): Element => ({ kind: 'shape', id: 'bg', x: -3, y: -3, w: 69, h: 94, shape: 'rect', fill: '#f4ead8', ...over })
// Every check but the font one is about something else, so the deck's font is pinned here (B3).
const PINNED = { 'system-ui': { stack: 'system-ui', asset: 'asset:abc' }, 'Georgia, serif': { stack: 'Georgia, serif', asset: 'asset:def' } }
const check = (base: Element[], row = {}): Issue[] => validateCard({ type: CARD_STANDARD_63x88, face: face(base), row, fonts: PINNED })
const codes = (issues: Issue[]) => issues.map((i) => `${i.code}:${i.severity}`)

describe('physical validation (E5): what looks fine on a screen and fails in the hand', () => {
  it('passes a card whose text is big enough, dark on light, inside the safe area and bled to the edge', () => {
    expect(check([bg(), text()])).toEqual([])
  })

  it('measures text against the type\'s minimum for the script: a warning near it, an error under it', () => {
    expect(codes(check([bg(), text({ font: { family: 'system-ui', sizePt: 7 } })]))).toEqual(['text-too-small:warning'])
    const tiny = check([bg(), text({ font: { family: 'system-ui', sizePt: 5 } })])
    expect(codes(tiny)).toEqual(['text-too-small:error'])
    // A fault is facts, not a sentence: the words are written where the reader is, in the
    // language they are reading in (A4).
    expect(tiny[0]?.values).toEqual({ sizePt: 5, floor: 6 })
    expect(tiny[0]?.element).toBe('body')
  })

  it('reads text against what lies behind it, and says how far the contrast falls short', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1)
    expect(contrastRatio('#777777', '#808080')).toBeLessThan(1.2)
    // Pale grey on the card's cream background: legible on a screen, not in the hand.
    expect(codes(check([bg(), text({ color: '#b9ae99' })]))).toEqual(['low-contrast:error'])
    expect(codes(check([bg(), text({ color: '#8a8071' })]))).toEqual(['low-contrast:warning'])
    // What is behind is the topmost thing under the text, not merely the first shape.
    expect(check([bg(), bg({ id: 'panel', x: 4, y: 26, w: 55, h: 50, fill: '#1c1c1c' }), text({ color: '#f5f5f5' })])).toEqual([])
  })

  it('warns about content inside the safe margin, and calls a background that stops at the trim an error', () => {
    expect(codes(check([bg(), text({ x: 1, y: 30 })]))).toEqual(['outside-safe-area:warning'])
    expect(codes(check([bg(), text({ y: 46 })]))).toEqual(['outside-safe-area:warning'])
    // Reaching the trim is a different fault from being close to it: that text will be cut.
    expect(codes(check([bg(), text({ y: 86 })]))).toEqual(['outside-safe-area:error'])
    // A background drawn exactly to the trim leaves a white edge when the knife wanders.
    expect(codes(check([bg({ x: 0, y: 0, w: 63, h: 88 }), text()]))).toEqual(['short-of-bleed:error'])
  })

  it('calls a hairline what the press cannot hold', () => {
    expect(codes(check([bg(), text(), bg({ id: 'rule', x: 6, y: 20, w: 51, h: 0, shape: 'line', stroke: '#333333', strokeMm: 0.1 })]))).toEqual(['hairline:error'])
    expect(codes(check([bg(), text(), bg({ id: 'rule', x: 6, y: 20, w: 51, h: 0, shape: 'line', stroke: '#333333', strokeMm: 0.3 })]))).toEqual(['hairline:warning'])
    // A shape with no stroke has no line to be too thin.
    expect(check([bg(), text(), bg({ id: 'panel', x: 6, y: 20, w: 51, h: 4, fill: '#ddd0b8' })])).toEqual([])
  })

  it('simulates colour blindness and warns when two colours that carried a difference collapse into one', () => {
    // Red and green of the same weight are far apart to most eyes and one colour to a deuteranope.
    const red = '#c0392b'
    const green = '#7d8f1f'
    expect(distance(red, green)).toBeGreaterThan(70)
    expect(distance(simulate(red, 'deuteranopia'), simulate(green, 'deuteranopia'))).toBeLessThan(11)
    // A dark red beside a bright green still differs in weight: that is not a colour-only difference.
    expect(check([bg(), text(), bg({ id: 'fara', x: 6, y: 6, w: 8, h: 8, fill: red }), bg({ id: 'ljus', x: 18, y: 6, w: 8, h: 8, fill: '#2ecc40' })])).toEqual([])
    const issues = check([bg(), text(), bg({ id: 'fara', x: 6, y: 6, w: 8, h: 8, fill: red }), bg({ id: 'trygg', x: 18, y: 6, w: 8, h: 8, fill: green })])
    expect(codes(issues)).toEqual(['colour-only:warning'])
    expect(issues[0]?.values).toEqual({ a: 'fara', b: 'trygg', blindness: 'deuteranopia' })
    // Two colours that stay apart under every simulation say nothing.
    expect(check([bg(), text(), bg({ id: 'fara', x: 6, y: 6, w: 8, h: 8, fill: '#1c1c1c' }), bg({ id: 'trygg', x: 18, y: 6, w: 8, h: 8, fill: '#f4ead8' })])).toEqual([])
  })

  it('looks at the elements the row actually shows, so a hidden element is not a card\'s problem', () => {
    const hidden: Element = { kind: 'if', id: 'maybe', when: { field: 'sällsynt', nonEmpty: true }, children: [text({ id: 'rare', font: { family: 'system-ui', sizePt: 4 } })] }
    expect(check([bg(), text(), hidden])).toEqual([])
    expect(codes(check([bg(), text(), hidden], { 'sällsynt': 'ja' }))).toEqual(['text-too-small:error'])
  })
})

describe('a font the version is not pinned to (B3, E5)', () => {
  const withFont = (family: string): Element[] => [bg(), text({ font: { family, sizePt: 10 } })]

  it('warns when what renders is whatever the machine has, and says nothing when the file is carried', () => {
    const loose = validateCard({ type: CARD_STANDARD_63x88, face: face(withFont('Georgia, serif')), row: {} })
    expect(loose.map((i) => `${i.code}:${i.severity}`)).toEqual(['unpinned-font:warning'])
    expect(loose[0]?.values).toEqual({ families: 'Georgia, serif' })

    const pinned = validateCard({
      type: CARD_STANDARD_63x88,
      face: face(withFont('Rubrik')),
      row: {},
      fonts: { Rubrik: { stack: '"Rubrik", serif', asset: 'asset:abc' } },
    })
    expect(pinned).toEqual([])

    // A project font that names a stack and carries no file is still whatever the machine has.
    const named = validateCard({ type: CARD_STANDARD_63x88, face: face(withFont('Brödtext')), row: {}, fonts: { 'Brödtext': { stack: 'Georgia, serif' } } })
    expect(named.map((i) => i.code)).toEqual(['unpinned-font'])
  })
})

// A patterned plate (L17) is two inks, not one. Text read against the fill alone passes on the
// paper between the stripes and disappears on the stripes themselves — and the check that was
// meant to catch exactly that would have said the card was fine.
describe('text over a pattern is read against both of its colours (E5, L17)', () => {
  const pattern = (over: Record<string, unknown>) => bg({ fill: '#f4ead8', pattern: { kind: 'stripes', color: '#ffffff', scaleMm: 4, ...over } as never })

  it('passes when the text stands clear of the fill and of the ink over it', () => {
    expect(codes(check([pattern({ color: '#efe4d0' }), text()]))).toEqual([])
  })

  it('fails on the colour the text disappears into, even when the fill behind it is fine', () => {
    // Dark ink on a cream plate: the fill reads well and the stripes swallow the words.
    expect(codes(check([pattern({ color: '#2b2b2b' }), text()]))).toEqual(['low-contrast:error'])
  })
})

// Transparency on a shape (#317) is ordinary rasterisation to the press: the ink is thinner, and
// nothing about that is a fault of its own. What the checks do have to notice is a shape that
// lays down no ink at all, because such a shape is not what the reader's eye meets.
describe('a see-through shape (E5, #317)', () => {
  it('is no fault of its own: a half-transparent plate is checked exactly as a solid one', () => {
    const plate = (over: Record<string, unknown>) => bg({ id: 'panel', x: 4, y: 26, w: 55, h: 50, fill: '#1c1c1c', ...over })
    expect(check([bg(), plate({}), text({ color: '#f5f5f5' })])).toEqual([])
    expect(check([bg(), plate({ opacity: 0.5 }), text({ color: '#f5f5f5' })])).toEqual([])
  })

  // A plate turned all the way down is paper. Reading the words against the colour it would have
  // had is the check believing a stylesheet over the card, and it believes it in the dangerous
  // direction: white on white passes.
  it('is not what lies behind the words once it lays down no ink at all', () => {
    const invisible = bg({ id: 'panel', x: 4, y: 26, w: 55, h: 50, fill: '#1c1c1c', opacity: 0 })
    expect(codes(check([bg({ fill: '#ffffff' }), invisible, text({ color: '#f5f5f5' })]))).toEqual(['low-contrast:error'])
  })

  // And it carries no colour into the colour-blindness pairing either, for the same reason: two
  // marks are only told apart by a reader who can see both of them.
  it('carries no colour into the pairs a colour-blind reader has to tell apart', () => {
    const pair = (over: Record<string, unknown>) => [
      bg({ fill: '#ffffff' }),
      bg({ id: 'a', x: 6, y: 6, w: 10, h: 10, fill: '#7d8f1f' }),
      bg({ id: 'b', x: 20, y: 6, w: 10, h: 10, fill: '#c0392b', ...over }),
      text(),
    ]
    expect(codes(check(pair({}))).filter((c) => c.startsWith('colour-only'))).toEqual(['colour-only:warning'])
    expect(codes(check(pair({ opacity: 0 }))).filter((c) => c.startsWith('colour-only'))).toEqual([])
  })
})
