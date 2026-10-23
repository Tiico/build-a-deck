import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Renderer } from '../src/renderer.js'
import { CARD_STANDARD_63x88 } from '@byd/engine'
import { compile, type Element, type FaceTemplate } from '@byd/template'
import { compiled, decodePng, pngPixel, pngSize } from './fixture.js'

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

// A partner's file (#1207): a raster in exactly the pixels `requirements()` names, of the whole
// page bleed and all, drawn by the same Chromium that draws the texture and the PDF. The pixels
// are a requirement and not a consequence of rounding, and where the trim falls in them is read
// off the painted file, not off the stylesheet.
describe('Renderer.renderRaster (#1207)', () => {
  // Black exactly on the trim and nothing in the bleed, so the paper of the bleed is the white of
  // the page, and the edge between them is where the knife will fall.
  const trimmed: FaceTemplate = { base: [{ kind: 'shape', id: 'trim', x: 0, y: 0, w: 63, h: 88, shape: 'rect', fill: '#000000' }], variants: {} }
  const card = (bleedMm: number) => compile({ type: CARD_STANDARD_63x88, face: trimmed, row: {}, icons: {}, bleed: bleedMm })
  // Where the black begins and ends along the middle row and the middle column, in pixels.
  function trimIn(png: Uint8Array) {
    const pic = decodePng(png)
    const dark = (x: number, y: number) => pic.at(x, y).r < 128
    const row = Math.floor(pic.height / 2)
    const col = Math.floor(pic.width / 2)
    const xs = [...Array(pic.width).keys()].filter((x) => dark(x, row))
    const ys = [...Array(pic.height).keys()].filter((y) => dark(col, y))
    return { width: pic.width, height: pic.height, left: xs[0] ?? -1, right: pic.width - 1 - (xs.at(-1) ?? -1), top: ys[0] ?? -1, bottom: pic.height - 1 - (ys.at(-1) ?? -1) }
  }
  const px = (mm: number, of: number, total: number) => (mm / of) * total

  it('draws one card in exactly the pixels each of two requirements names, with each its own bleed', async () => {
    // An eighth of an inch at 300 dpi, as The Game Crafter and QPMN ask: 69,35 × 94,35 mm.
    const eighth = trimIn(await renderer.renderRaster(card(3.175), { format: 'png', widthPx: 819, heightPx: 1114 }))
    expect({ width: eighth.width, height: eighth.height }).toEqual({ width: 819, height: 1114 })
    for (const edge of [eighth.left, eighth.right]) expect(Math.abs(edge - px(3.175, 69.35, 819))).toBeLessThanOrEqual(1)
    for (const edge of [eighth.top, eighth.bottom]) expect(Math.abs(edge - px(3.175, 94.35, 1114))).toBeLessThanOrEqual(1)

    // A millimetre and a half at 600 dpi, as Press Start Cards asks: 66 × 91 mm.
    const thin = trimIn(await renderer.renderRaster(card(1.5), { format: 'png', widthPx: 1559, heightPx: 2150 }))
    expect({ width: thin.width, height: thin.height }).toEqual({ width: 1559, height: 2150 })
    for (const edge of [thin.left, thin.right]) expect(Math.abs(edge - px(1.5, 66, 1559))).toBeLessThanOrEqual(1)
    for (const edge of [thin.top, thin.bottom]) expect(Math.abs(edge - px(1.5, 91, 2150))).toBeLessThanOrEqual(1)
  }, 60_000)

  // A background carried out past the bleed is paint on every last pixel of the file: the edge of
  // the page is where the bleed ends, and a row of paper there is what a white line is made of.
  it('paints a background all the way to the outermost pixels', async () => {
    const full: FaceTemplate = { base: [{ kind: 'shape', id: 'paper', x: -4, y: -4, w: 71, h: 96, shape: 'rect', fill: '#c0392b' }], variants: {} }
    for (const [bleedMm, widthPx, heightPx] of [[3.175, 819, 1114], [1.5, 1559, 2150], [3.175, 825, 1125]] as const) {
      const pic = decodePng(await renderer.renderRaster(compile({ type: CARD_STANDARD_63x88, face: full, row: {}, icons: {}, bleed: bleedMm }), { format: 'png', widthPx, heightPx }))
      const edges = [[0, 0], [widthPx - 1, 0], [0, heightPx - 1], [widthPx - 1, heightPx - 1], [0, heightPx >> 1], [widthPx - 1, heightPx >> 1], [widthPx >> 1, 0], [widthPx >> 1, heightPx - 1]]
      for (const [x, y] of edges) expect(pic.at(x!, y!), `${widthPx}×${heightPx} at ${x},${y}`).toEqual({ r: 192, g: 57, b: 43 })
    }
  }, 60_000)

  it('draws the same file every time', async () => {
    const a = await renderer.renderRaster(card(3.175), { format: 'png', widthPx: 819, heightPx: 1114 })
    const b = await renderer.renderRaster(card(3.175), { format: 'png', widthPx: 819, heightPx: 1114 })
    expect(Buffer.compare(Buffer.from(a), Buffer.from(b))).toBe(0)
  }, 60_000)

  it('writes a JPEG in the same exact pixels when the partner asks for one', async () => {
    const jpg = await renderer.renderRaster(card(3.175), { format: 'jpg', widthPx: 819, heightPx: 1114 })
    expect([jpg[0], jpg[1]]).toEqual([0xff, 0xd8])
    expect(jpegSize(jpg)).toEqual({ w: 819, h: 1114 })
  }, 60_000)

  // The raster is the texture's picture and not a second drawing of the card: the same compiled
  // page, the same Chromium, the same ink where the card has ink.
  it('is the picture the texture is, ink for ink', async () => {
    const c = compiled({ title: 'Drake', body: 'Gör 2 skada.' })
    const texture = decodePng(await renderer.renderPng(c, { dpi: 96 }))
    const raster = decodePng(await renderer.renderRaster(c, { format: 'png', widthPx: texture.width, heightPx: texture.height }))
    expect({ w: raster.width, h: raster.height }).toEqual({ w: texture.width, h: texture.height })
    // The frame's cream, and the paper beside it and outside its rounded corner, away from any text.
    const mm = (v: number) => Math.round((v * 96) / 25.4)
    for (const [x, y] of [[30, 80], [62.7, 44], [0.3, 0.3], [60, 20]] as const) {
      const a = texture.at(mm(x), mm(y))
      const b = raster.at(mm(x), mm(y))
      for (const channel of ['r', 'g', 'b'] as const) expect(Math.abs(a[channel] - b[channel]), `${x},${y} ${channel}`).toBeLessThanOrEqual(8)
    }
  }, 60_000)
})

// The width and height in a JPEG's start-of-frame marker.
function jpegSize(jpg: Uint8Array): { w: number; h: number } {
  for (let at = 2; at + 9 < jpg.length; ) {
    if (jpg[at] !== 0xff) throw new Error(`no marker at ${at}`)
    const marker = jpg[at + 1] ?? 0
    const length = ((jpg[at + 2] ?? 0) << 8) | (jpg[at + 3] ?? 0)
    if (marker >= 0xc0 && marker <= 0xc3) return { h: ((jpg[at + 5] ?? 0) << 8) | (jpg[at + 6] ?? 0), w: ((jpg[at + 7] ?? 0) << 8) | (jpg[at + 8] ?? 0) }
    at += 2 + length
  }
  throw new Error('no start of frame')
}

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

// The texture carries what its smallest text became (#523): the size a card has to be held up at
// to be read is a question about its words after E6 fitted them, and the renderer is where that
// fitting is true. An empty box is no text at all, so it has no say in it.
describe('Renderer.renderTexture (#523)', () => {
  const long = 'När detta kort spelas: dra två kort, sedan kasta ett. Om du kontrollerar ett Torn får du dessutom en extra handling. '
  it('renders the same picture as renderPng and says the smallest text on the card after fitting', async () => {
    const c = compiled({ title: 'Drake', body: long.repeat(4) })
    const { png, smallestPt } = await renderer.renderTexture(c, { dpi: 150 })
    expect(Buffer.compare(Buffer.from(png), Buffer.from(await renderer.renderPng(c, { dpi: 150 })))).toBe(0)
    const body = (await renderer.fit(c)).find((f) => f.element === 'body')!.sizePt
    expect(smallestPt).toBe(body)
    expect(smallestPt).toBeLessThan(9)
  }, 30_000)

  it('leaves an empty box out, and says nothing for a card with no words', async () => {
    expect((await renderer.renderTexture(compiled({ title: 'Drake', body: '' }), { dpi: 96 })).smallestPt).toBe(14)
    expect((await renderer.renderTexture(compiled({ title: '', body: '' }), { dpi: 96 })).smallestPt).toBeNull()
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

// A shape of the designer's own (L26, #309) through the one renderer there is (B3): a point list
// in the element box's own millimetres, pressed to pixels by Chromium like every other outline.
// The proof is the ink on the card and not the path in the markup — a second code path that drew
// shapes would show up here as a triangle that is not there.
describe('a shape of the designer own points', () => {
  // 63 × 88 mm at 96 dpi is 238 × 333 px, so a millimetre is about 3.78 px.
  const mm = (v: number) => Math.round((v * 96) / 25.4)
  const face: FaceTemplate = {
    base: [
      { kind: 'shape', id: 'paper', x: 0, y: 0, w: 63, h: 88, shape: 'rect', fill: '#ffffff' },
      // The banner it was written out of stays on the element; the points are what is drawn.
      { kind: 'shape', id: 'own', x: 0, y: 0, w: 63, h: 88, shape: 'banner', fill: '#000000', points: [{ x: 31.5, y: 0 }, { x: 63, y: 88 }, { x: 0, y: 88 }] } as Element,
    ],
    variants: {},
  }

  it('presses the outline the points describe and nothing of the entry they came from', async () => {
    const png = await renderer.renderPng(compile({ type: CARD_STANDARD_63x88, face, row: {}, icons: {} }), { dpi: 96 })
    // Deep inside the triangle, and in the top-left corner the triangle leaves to the paper —
    // which is exactly the corner the banner the element still names would have covered.
    expect(pngPixel(png, mm(31.5), mm(60))).toMatchObject({ r: 0, g: 0, b: 0 })
    expect(pngPixel(png, mm(4), mm(6))).toMatchObject({ r: 255, g: 255, b: 255 })
  }, 60_000)
})

// A curve drawn out of a side (L38, #327), through the same single renderer (B3). The proof is
// the ink again and not the path: a bulge that reached the card only in the editor's own preview
// would be a second code path drawing shapes, and this is where it would show up as a card whose
// right side is still straight.
describe('a side of an own shape bent into a curve', () => {
  const mm = (v: number) => Math.round((v * 96) / 25.4)
  // The left half of the card, with its right side pulled 20 mm out. Both arms carry the same
  // offset, so the middle of the side lands three quarters of the way out — 46,5 mm — while the
  // side's two ends stay where they are at 31,5.
  const face: FaceTemplate = {
    base: [
      { kind: 'shape', id: 'paper', x: 0, y: 0, w: 63, h: 88, shape: 'rect', fill: '#ffffff' },
      {
        kind: 'shape',
        id: 'own',
        x: 0,
        y: 0,
        w: 63,
        h: 88,
        shape: 'rect',
        fill: '#000000',
        points: [{ x: 0, y: 0 }, { x: 31.5, y: 0, out: { dx: 20, dy: 0 } }, { x: 31.5, y: 88, in: { dx: 20, dy: 0 } }, { x: 0, y: 88 }],
      } as Element,
    ],
    variants: {},
  }

  it('presses the bulge to pixels, and leaves the paper the curve has not reached', async () => {
    const png = await renderer.renderPng(compile({ type: CARD_STANDARD_63x88, face, row: {}, icons: {} }), { dpi: 96 })
    // Halfway down, where the curve reaches 46,5 mm: ink at 44, which a straight side at 31,5
    // would have left to the paper.
    expect(pngPixel(png, mm(44), mm(44))).toMatchObject({ r: 0, g: 0, b: 0 })
    // And near the top, where the side is still on its way out: paper at the same 44 mm, which
    // is what says the side is a curve and not simply a wider rectangle.
    expect(pngPixel(png, mm(44), mm(10))).toMatchObject({ r: 255, g: 255, b: 255 })
  }, 60_000)
})
