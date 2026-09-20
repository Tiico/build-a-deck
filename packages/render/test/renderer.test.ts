import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Renderer } from '../src/renderer.js'
import { CARD_STANDARD_63x88 } from '@byd/engine'
import { compile, type Element, type FaceTemplate } from '@byd/template'
import { compiled, pngPixel, pngSize } from './fixture.js'

let renderer: Renderer
beforeAll(async () => {
  renderer = await Renderer.launch()
}, 60_000)
afterAll(async () => {
  await renderer.close()
}, 60_000)

describe('Renderer.renderPng', () => {
  it('renders the card at the requested DPI with pixel dimensions from its millimetres, identically every time', async () => {
    const c = compiled({ title: 'Drake', body: 'Gör 2 skada.' })
    const a = await renderer.renderPng(c, { dpi: 300 })
    const b = await renderer.renderPng(c, { dpi: 300 })
    const { w, h } = pngSize(a)
    // 63 × 88 mm at 300 dpi ≈ 744 × 1039
    expect(Math.abs(w - 744)).toBeLessThanOrEqual(1)
    expect(Math.abs(h - 1039)).toBeLessThanOrEqual(1)
    expect(Buffer.compare(Buffer.from(a), Buffer.from(b))).toBe(0)
  }, 30_000)

  it('includes the bleed when the compiled output has it', async () => {
    const c = compiled({ title: 'Drake', body: '' }, true)
    const { w, h } = pngSize(await renderer.renderPng(c, { dpi: 150 }))
    // 69 × 94 mm at 150 dpi ≈ 407 × 555
    expect(Math.abs(w - 407)).toBeLessThanOrEqual(1)
    expect(Math.abs(h - 555)).toBeLessThanOrEqual(1)
  }, 30_000)
})

// The first MediaBox in the file, in PostScript points.
function mediaBox(pdf: Uint8Array): { w: number; h: number } {
  const m = /\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(Buffer.from(pdf).toString('latin1'))
  if (!m) throw new Error('no MediaBox')
  return { w: Number(m[3]) - Number(m[1]), h: Number(m[4]) - Number(m[2]) }
}

describe('Renderer.renderPdf', () => {
  it('makes a PDF whose page is the card, bleed included when compiled with it', async () => {
    // Chromium quantises the page size by a fraction of a point; a point is 0.35 mm, well inside
    // any printer's trim tolerance, and the content itself is placed in exact millimetres.
    const pt = (mm: number) => (mm / 25.4) * 72
    const within = (actual: number, mm: number) => expect(Math.abs(actual - pt(mm))).toBeLessThanOrEqual(1)
    const plain = mediaBox(await renderer.renderPdf(compiled({ title: 'Drake', body: 'Text.' })))
    within(plain.w, 63)
    within(plain.h, 88)
    const bled = mediaBox(await renderer.renderPdf(compiled({ title: 'Drake', body: 'Text.' }, true)))
    within(bled.w, 69)
    within(bled.h, 94)
  }, 30_000)
})

describe('fitting in the page (E6 with real metrics)', () => {
  const long = 'När detta kort spelas: dra två kort, sedan kasta ett. Om du kontrollerar ett Torn får du dessutom en extra handling. '
  it('shrinks text in the page until it fits, never below the minimum, and reports each element', async () => {
    const fits = await renderer.fit(compiled({ title: 'Drake', body: long.repeat(4) }))
    const body = fits.find((f) => f.element === 'body')!
    expect(body.sizePt).toBeLessThan(9)
    expect(body.sizePt).toBeGreaterThanOrEqual(6)
    expect(body.overflow).toBe(false)
    const title = fits.find((f) => f.element === 'title')!
    expect(title).toMatchObject({ sizePt: 14, overflow: false })

    const tooMuch = await renderer.fit(compiled({ title: 'Drake', body: long.repeat(12) }))
    expect(tooMuch.find((f) => f.element === 'body')).toMatchObject({ sizePt: 6, overflow: true })
  }, 30_000)
})

// Transparency on a shape (#317) reaches the card the one way anything reaches it: through
// `compile`, into the one renderer. Read off the pixels rather than off the stylesheet, because
// what the acceptance criterion is about is the ink — half of black over white is grey in the
// hand, and the editor's preview and the press have to agree on which grey.
describe('a see-through shape (L17, #317)', () => {
  const card = (opacity?: number): FaceTemplate => ({
    base: [
      { kind: 'shape', id: 'paper', x: 0, y: 0, w: 63, h: 88, shape: 'rect', fill: '#ffffff' },
      { kind: 'shape', id: 'pane', x: 10, y: 10, w: 43, h: 68, shape: 'rect', fill: '#000000', ...(opacity === undefined ? {} : { opacity }) } as Element,
    ],
    variants: {},
  })
  const shot = (face: FaceTemplate) => renderer.renderPng(compile({ type: CARD_STANDARD_63x88, face, row: {}, icons: {} }), { dpi: 96 })
  // Well inside the pane, so no edge and no anti-aliasing is being read: 63 × 88 mm at 96 dpi is
  // 238 × 333 px, and the pane runs from about 38 px to 200 px across.
  const middle = (png: Uint8Array) => pngPixel(png, 119, 166)

  it('lays half the ink of a solid one, and the solid one is unchanged', async () => {
    expect(middle(await shot(card()))).toMatchObject({ r: 0, g: 0, b: 0 })
    expect(middle(await shot(card(1)))).toMatchObject({ r: 0, g: 0, b: 0 })
    const half = middle(await shot(card(0.5)))
    // Half of black on white, give or take Chromium's rounding of the blend.
    for (const channel of [half.r, half.g, half.b]) expect(Math.abs(channel - 128)).toBeLessThanOrEqual(2)
  }, 60_000)

  it('leaves nothing of the shape behind at none, and the paper under it is untouched', async () => {
    expect(middle(await shot(card(0)))).toMatchObject({ r: 255, g: 255, b: 255 })
  }, 30_000)
})
