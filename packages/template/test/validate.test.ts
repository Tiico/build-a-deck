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
const check = (base: Element[], row = {}): Issue[] => validateCard({ type: CARD_STANDARD_63x88, face: face(base), row })
const codes = (issues: Issue[]) => issues.map((i) => `${i.code}:${i.severity}`)

describe('physical validation (E5): what looks fine on a screen and fails in the hand', () => {
  it('passes a card whose text is big enough, dark on light, inside the safe area and bled to the edge', () => {
    expect(check([bg(), text()])).toEqual([])
  })

  it('measures text against the type\'s minimum for the script: a warning near it, an error under it', () => {
    expect(codes(check([bg(), text({ font: { family: 'system-ui', sizePt: 7 } })]))).toEqual(['text-too-small:warning'])
    const tiny = check([bg(), text({ font: { family: 'system-ui', sizePt: 5 } })])
    expect(codes(tiny)).toEqual(['text-too-small:error'])
    expect(tiny[0]?.detail).toContain('6')
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
    expect(issues[0]?.detail).toMatch(/deuteranopi/i)
    // Two colours that stay apart under every simulation say nothing.
    expect(check([bg(), text(), bg({ id: 'fara', x: 6, y: 6, w: 8, h: 8, fill: '#1c1c1c' }), bg({ id: 'trygg', x: 18, y: 6, w: 8, h: 8, fill: '#f4ead8' })])).toEqual([])
  })

  it('looks at the elements the row actually shows, so a hidden element is not a card\'s problem', () => {
    const hidden: Element = { kind: 'if', id: 'maybe', when: { field: 'sällsynt', nonEmpty: true }, children: [text({ id: 'rare', font: { family: 'system-ui', sizePt: 4 } })] }
    expect(check([bg(), text(), hidden])).toEqual([])
    expect(codes(check([bg(), text(), hidden], { 'sällsynt': 'ja' }))).toEqual(['text-too-small:error'])
  })
})
