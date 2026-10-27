import { describe, expect, it } from 'vitest'
import { CARD_STANDARD_63x88 } from '@byd/engine'
import { TextElement, compile, type FaceTemplate } from '../src/index.js'

// A text turned a quarter round (#1431): the name along a box's spine. The box stays where it is on
// the card, as the designer drew it, and the words run along its length instead of across it. So
// the box is still the footprint every handle, outline and check stands on, and the turn is a
// matter of how the text is laid inside it.
const spine = (rotationDeg?: 0 | 90 | -90) => ({
  kind: 'text' as const,
  id: 'spine',
  x: 5,
  y: 4,
  w: 12,
  h: 80,
  bind: { field: 'name' },
  font: { family: 'Inter', sizePt: 20, weight: 700 as const, align: 'center' as const },
  color: '#111111',
  fit: 'shrink' as const,
  valign: 'middle' as const,
  ...(rotationDeg === undefined ? {} : { rotationDeg }),
})
const faceOf = (rotationDeg?: 0 | 90 | -90): FaceTemplate => ({ base: [spine(rotationDeg)], variants: {} })
const out = (rotationDeg?: 0 | 90 | -90, name = 'Drakarnas strid') => compile({ type: CARD_STANDARD_63x88, face: faceOf(rotationDeg), row: { name }, icons: {} })
const sizeOf = (css: string) => Number(/\[data-element="spine"\]\{[^}]*font-size:([\d.]+)pt/.exec(css)?.[1])

describe('a text turned a quarter round (#1431)', () => {
  it('is a quarter turn either way and nothing in between', () => {
    expect(TextElement.parse(spine(90)).rotationDeg).toBe(90)
    expect(TextElement.parse(spine(-90)).rotationDeg).toBe(-90)
    expect(TextElement.parse(spine(0)).rotationDeg).toBe(0)
    expect(TextElement.safeParse({ ...spine(), rotationDeg: 45 }).success).toBe(false)
    expect(TextElement.safeParse({ ...spine(), rotationDeg: 180 }).success).toBe(false)
  })

  it('compiles a text that is not turned to exactly the bytes it always compiled to', () => {
    expect(out(0)).toEqual(out(undefined))
    expect(out(undefined).html).not.toContain('data-turn')
    expect(out(undefined).css).not.toContain('rotate(')
  })

  it('keeps the box where the designer drew it and lays the words along its length', () => {
    const turned = out(90)
    // The element is the footprint, exactly as an upright text's is.
    expect(turned.css).toContain('[data-element="spine"]{left:5mm;top:4mm;width:12mm;height:80mm;')
    // Inside it stands a block as long as the box is tall and as deep as it is wide, turned so
    // that its top faces the box's right edge and the words read from the top down.
    expect(turned.html).toMatch(/<div data-element="spine"[^>]*><div data-turn="90">.*Drakarnas strid.*<\/div><\/div>/)
    expect(turned.css).toMatch(/\[data-element="spine"\]>\[data-turn\]\{[^}]*width:80mm;height:12mm;[^}]*transform:translate\(12mm,0\) rotate\(90deg\);/)
  })

  it('turns the other way with its top to the left, reading from the bottom up', () => {
    expect(out(-90).html).toContain('<div data-turn="-90">')
    expect(out(-90).css).toMatch(/\[data-element="spine"\]>\[data-turn\]\{[^}]*width:80mm;height:12mm;[^}]*transform:translate\(0,80mm\) rotate\(-90deg\);/)
  })

  it('stands the words in the turned block, so the middle is the middle across the spine', () => {
    const css = out(90).css
    expect(css).toMatch(/\[data-element="spine"\]>\[data-turn\]\{[^}]*justify-content:safe center;/)
    expect(/\[data-element="spine"\]\{[^}]*\}/.exec(css)?.[0]).not.toContain('display:flex')
  })

  it('fits the text to the length of the box and not to its width', () => {
    // A turned 12 × 80 box is an 80 × 12 line laid on its side, and is fitted as one: some 25
    // letters at 20 pt need two lines of 80 mm, which 12 mm cannot hold, so the size steps down.
    // Upright, the same words wrap down an 80 mm column and fit at full size.
    const name = 'Drakarnas strid om berget'
    const across = compile({ type: CARD_STANDARD_63x88, face: { base: [{ ...spine(), w: 80, h: 12 }], variants: {} }, row: { name }, icons: {} })
    expect(sizeOf(out(90, name).css)).toBe(sizeOf(across.css))
    expect(sizeOf(out(-90, name).css)).toBe(sizeOf(across.css))
    expect(sizeOf(out(90, name).css)).toBeLessThan(20)
    expect(sizeOf(out(undefined, name).css)).toBe(20)
  })

  it('still warns when the turned text does not fit at the floor', () => {
    const long = out(90, 'Drakarnas strid om det sista berget i norr, och vad som hände sedan med alla som var med. '.repeat(4))
    expect(long.warnings).toEqual([{ element: 'spine', code: 'text-too-small', detail: expect.stringMatching(/12×80mm/) }])
  })
})
