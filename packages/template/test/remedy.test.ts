import { describe, expect, it } from 'vitest'
import { CARD_STANDARD_63x88 } from '@byd/engine'
import { remedyFor, validateCard, type Issue } from '../src/validate.js'
import type { Element, FaceTemplate } from '../src/model.js'

// What a check proposes be done about itself (#233).
//
// The wall has always said what is wrong and on which cards, and never what to do about it: the
// designer is handed a measurement and left to find the element in the template and work out the
// number herself. A fault is nearly always the template's — the same element on every row — so the
// remedy is the template's too, and it is one edit for the whole deck.
//
// Every reading below applies the remedy and runs the check again. That is the whole of the
// contract: a remedy that leaves the fault standing is not a remedy, and nothing here is allowed
// to be satisfied by the shape of a patch.

const face = (base: Element[]): FaceTemplate => ({ base, variants: {} })
const PINNED = { 'system-ui': { stack: 'system-ui', asset: 'asset:abc' } }
const input = (base: Element[], row = {}) => ({ type: CARD_STANDARD_63x88, face: face(base), row, fonts: PINNED })
const check = (base: Element[], row = {}): Issue[] => validateCard(input(base, row))

// The template with one element replaced by what the remedy asks for. This is what the editor does
// when the button is pressed, done here by hand so the test is about the remedy and not about a
// client.
const applied = (base: Element[], issue: Issue): Element[] => {
  const remedy = remedyFor(issue, input(base))
  if (!remedy) throw new Error(`no remedy for ${issue.code}`)
  return base.map((el) => (el.id === remedy.element ? ({ ...el, ...remedy.patch } as Element) : el))
}
const still = (base: Element[], issue: Issue): Issue[] => check(applied(base, issue)).filter((i) => i.code === issue.code)

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
const shape = (over: Partial<Extract<Element, { kind: 'shape' }>> = {}): Element => ({ kind: 'shape', id: 'bg', x: -3, y: -3, w: 69, h: 94, shape: 'rect', fill: '#f4ead8', ...over })
const only = (base: Element[], code: Issue['code']): Issue => {
  const found = check(base).find((i) => i.code === code)
  if (!found) throw new Error(`the fixture does not fail ${code}: ${check(base).map((i) => i.code).join(', ') || 'nothing at all'}`)
  return found
}

describe('a check that proposes its own remedy (#233)', () => {
  it('lifts text that is under the floor clear of the warning as well as the error', () => {
    const base = [shape(), text({ font: { family: 'system-ui', sizePt: 3 } })]
    const issue = only(base, 'text-too-small')
    expect(issue.severity).toBe('error')
    // Clear of the warning too, and not merely over the error's line: a remedy that turns red into
    // orange has handed the designer the same decision a second time.
    expect(still(base, issue)).toEqual([])
  })

  it('thickens a hairline to what a press can hold', () => {
    const base = [shape({ stroke: '#333333', strokeMm: 0.05 })]
    const issue = only(base, 'hairline')
    expect(still(base, issue)).toEqual([])
  })

  it('brings an element that crosses the trim back inside the safe area', () => {
    const base = [shape(), text({ x: 60, y: 30, w: 20, h: 10 })]
    const issue = only(base, 'outside-safe-area')
    expect(still(base, issue)).toEqual([])
  })

  it('carries a background that reaches the trim on into the bleed', () => {
    const base = [shape({ x: 0, y: 0, w: 63, h: 88 })]
    const issue = only(base, 'short-of-bleed')
    expect(still(base, issue)).toEqual([])
  })

  it('keeps an element inside the card while it moves it, rather than trading one fault for another', () => {
    const base = [shape(), text({ x: 60, y: 82, w: 20, h: 12 })]
    const issue = only(base, 'outside-safe-area')
    const moved = applied(base, issue).find((el) => el.id === 'body') as Extract<Element, { kind: 'text' }>
    expect(moved.x).toBeGreaterThanOrEqual(0)
    expect(moved.y).toBeGreaterThanOrEqual(0)
    expect(moved.x + moved.w).toBeLessThanOrEqual(63)
    expect(moved.y + moved.h).toBeLessThanOrEqual(88)
    // And the whole card is measured again, not just the code that was being fixed: a remedy that
    // makes a second check fail has moved the trouble rather than mended it.
    expect(check(applied(base, issue))).toEqual([])
  })

  it('offers nothing where the answer is a choice somebody has to make', () => {
    // Contrast is a colour, and which colour is a design decision rather than a number. Colour
    // carrying a difference on its own needs something that is not colour, which no patch can
    // invent. And pinning a font needs a font *file*, which is not in the template at all.
    const dim = [shape({ fill: '#f0f0f0' }), text({ color: '#e8e8e8' })]
    expect(remedyFor(only(dim, 'low-contrast'), input(dim))).toBeNull()

    const loose = [shape(), text({ font: { family: 'Nowhere', sizePt: 10 } })]
    expect(remedyFor(only(loose, 'unpinned-font'), input(loose))).toBeNull()
  })

  it('names an element that is really in the face, so the editor can find what to patch', () => {
    const base = [shape(), text({ font: { family: 'system-ui', sizePt: 3 } })]
    const remedy = remedyFor(only(base, 'text-too-small'), input(base))!
    expect(base.some((el) => el.id === remedy.element)).toBe(true)
  })
})
