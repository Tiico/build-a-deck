import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser } from 'playwright'
import { CARD_STANDARD_63x88 } from '@byd/engine'
import { compile, type FaceTemplate } from '@byd/template'
import { Renderer } from '../src/renderer.js'
import { decodePng } from './fixture.js'

// A text turned a quarter round (#1431), through the one renderer (E2): the name along a box's
// spine. What the acceptance criterion is about is the ink, in the texture and in the print PDF,
// so both are read as painted pixels. The texture is the screenshot the table gets. The PDF is
// drawn back to pixels by pdf.js in a page of its own, which is a reader and not a renderer of
// cards: it draws what the file says, so a PDF whose text stood upright would draw it upright.

let renderer: Renderer
let reader: Browser
beforeAll(async () => {
  renderer = await Renderer.launch()
  reader = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await renderer.close()
  await reader.close()
}, 60_000)

// A white card with one black word on it, in a tall box 20 mm wide and 80 mm long. The word is
// set at the top left of its lines, so where its ink lands says which way it was turned.
const BOX = { x: 20, y: 4, w: 20, h: 80 }
const card = (rotationDeg?: 90 | -90, word = 'MMMM'): FaceTemplate => ({
  base: [
    { kind: 'shape', id: 'paper', x: 0, y: 0, w: 63, h: 88, shape: 'rect', fill: '#ffffff' },
    {
      kind: 'text',
      id: 'spine',
      ...BOX,
      bind: { literal: word },
      font: { family: 'sans-serif', sizePt: 24, weight: 700, align: 'left' },
      color: '#000000',
      fit: 'fixed',
      ...(rotationDeg === undefined ? {} : { rotationDeg }),
    },
  ],
  variants: {},
})
const compiled = (rotationDeg?: 90 | -90, word?: string) => compile({ type: CARD_STANDARD_63x88, face: card(rotationDeg, word), row: {}, icons: {} })

type Ink = { x0: number; y0: number; x1: number; y1: number; w: number; h: number }
type Pixels = { width: number; height: number; dark(x: number, y: number): boolean }

// The rectangle the dark pixels cover, in millimetres on the card.
function inkOf(px: Pixels): Ink {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
  for (let y = 0; y < px.height; y++) {
    for (let x = 0; x < px.width; x++) {
      if (!px.dark(x, y)) continue
      x0 = Math.min(x0, x)
      y0 = Math.min(y0, y)
      x1 = Math.max(x1, x + 1)
      y1 = Math.max(y1, y + 1)
    }
  }
  if (x0 === Infinity) throw new Error('nothing is drawn')
  const mm = (v: number, of: number, across: number) => (v / of) * across
  const ink = { x0: mm(x0, px.width, 63), y0: mm(y0, px.height, 88), x1: mm(x1, px.width, 63), y1: mm(y1, px.height, 88) }
  return { ...ink, w: ink.x1 - ink.x0, h: ink.y1 - ink.y0 }
}

async function textureInk(rotationDeg?: 90 | -90): Promise<Ink> {
  const picture = decodePng(await renderer.renderPng(compiled(rotationDeg), { dpi: 150 }))
  return inkOf({ width: picture.width, height: picture.height, dark: (x, y) => {
    const { r, g, b } = picture.at(x, y)
    return r + g + b < 3 * 100
  } })
}

// pdf.js served from the package, in a page whose only business is drawing a PDF onto a canvas.
const require = createRequire(import.meta.url)
const PDFJS = dirname(require.resolve('pdfjs-dist/build/pdf.mjs'))
const READER = `<!doctype html><html><body><script type="module">
import * as pdfjs from '/pdf.mjs'
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs'
window.draw = async (base64, scale) => {
  const data = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  const page = await (await pdfjs.getDocument({ data }).promise).getPage(1)
  const viewport = page.getViewport({ scale })
  const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(viewport.width), height: Math.round(viewport.height) })
  await page.render({ canvas, viewport }).promise
  const px = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
  const dark = []
  for (let i = 0; i < px.length; i += 4) dark.push(px[i + 3] > 128 && px[i] + px[i + 1] + px[i + 2] < 300 ? 1 : 0)
  return { width: canvas.width, height: canvas.height, dark: dark.join('') }
}
window.ready = true
</script></body></html>`

async function pdfInk(rotationDeg?: 90 | -90): Promise<Ink> {
  const pdf = await renderer.renderPdf(compiled(rotationDeg))
  const page = await reader.newPage()
  try {
    await page.route('http://pdf.reader/**', (route) => {
      const path = new URL(route.request().url()).pathname
      if (path === '/') return route.fulfill({ contentType: 'text/html', body: READER })
      return route.fulfill({ contentType: 'text/javascript', body: readFileSync(join(PDFJS, path.slice(1))) })
    })
    await page.goto('http://pdf.reader/')
    await page.waitForFunction(() => (window as unknown as { ready?: boolean }).ready === true)
    // Two PDF points to a pixel: some 2.8 pixels to a millimetre, plenty to tell a top from a bottom.
    const drawn = await page.evaluate(([b64]) => (window as unknown as { draw(b: string, s: number): Promise<{ width: number; height: number; dark: string }> }).draw(b64!, 2), [Buffer.from(pdf).toString('base64')])
    return inkOf({ width: drawn.width, height: drawn.height, dark: (x, y) => drawn.dark[y * drawn.width + x] === '1' })
  } finally {
    await page.close()
  }
}

// What says a word is turned and which way: upright it is a wide, low run of ink at the top left of
// its box; turned to 90 it is a tall, narrow one down the box's right edge from the top; turned to
// -90 it is a tall, narrow one up the box's left edge from the bottom.
function expectUpright(ink: Ink): void {
  expect(ink.w).toBeGreaterThan(2 * ink.h)
  expect(ink.x0).toBeLessThan(BOX.x + 3)
  expect(ink.y0).toBeLessThan(BOX.y + 5)
}
function expectDown(ink: Ink): void {
  expect(ink.h).toBeGreaterThan(2 * ink.w)
  expect(ink.x1).toBeGreaterThan(BOX.x + BOX.w - 5)
  expect(ink.x0).toBeGreaterThan(BOX.x + BOX.w / 3)
  expect(ink.y0).toBeLessThan(BOX.y + 3)
  expect(ink.y1).toBeLessThan(BOX.y + BOX.h / 2)
}
function expectUp(ink: Ink): void {
  expect(ink.h).toBeGreaterThan(2 * ink.w)
  expect(ink.x0).toBeLessThan(BOX.x + 5)
  expect(ink.x1).toBeLessThan(BOX.x + (2 * BOX.w) / 3)
  expect(ink.y1).toBeGreaterThan(BOX.y + BOX.h - 3)
  expect(ink.y0).toBeGreaterThan(BOX.y + BOX.h / 2)
}

describe('a turned text in the texture (#1431)', () => {
  it('stands upright when it is not turned, which is what makes the two below a measurement', async () => {
    expectUpright(await textureInk())
  }, 60_000)

  it('runs down the box from the top at 90', async () => {
    expectDown(await textureInk(90))
  }, 60_000)

  it('runs up the box from the bottom at -90', async () => {
    expectUp(await textureInk(-90))
  }, 60_000)
})

describe('a turned text in the print PDF (#1431)', () => {
  it('stands upright when it is not turned', async () => {
    expectUpright(await pdfInk())
  }, 60_000)

  it('runs down the box from the top at 90, and up it from the bottom at -90', async () => {
    expectDown(await pdfInk(90))
    expectUp(await pdfInk(-90))
  }, 60_000)

  it('keeps the turned words as text in the file', async () => {
    // A PDF draws a font only for text, so a turned word that had become a picture would carry none.
    const pdf = Buffer.from(await renderer.renderPdf(compiled(90))).toString('latin1')
    expect(pdf).toMatch(/\/Type\s*\/Font/)
  }, 60_000)
})

// The fitting (E6) and the floor it stops at (E5) measured on the turned text: the words are laid
// along the box, so the box's length is their line and its width the room for lines. A turned
// 20 × 80 box must fit exactly as an upright 80 × 20 one does, with the same real metrics.
describe('the fitting measures the turned text (#1431, E5, E6)', () => {
  const fitted = async (face: FaceTemplate) => (await renderer.fit(compile({ type: CARD_STANDARD_63x88, face, row: {}, icons: {} }))).find((r) => r.element === 'spine')!
  const shrinking = (rotationDeg: 90 | -90 | undefined, box: { w: number; h: number }, word: string): FaceTemplate => {
    const face = card(rotationDeg, word)
    const [paper, spine] = face.base
    return { base: [paper!, { ...(spine as Extract<typeof spine, { kind: 'text' }>), ...box, fit: 'shrink' }], variants: {} }
  }
  // One word some 45 mm long at 24 pt: well inside the 80 mm spine in any font a machine has (a
  // Linux box draws it some 13 % wider than a Mac), and twice as wide as the box across.
  const name = 'Drakstrid'
  const long = 'Drakarnas strid om det sista berget i norr, och allt som hände sedan. '.repeat(14)

  it('keeps a name that fits along the spine at its size, which across the box would have to shrink', async () => {
    const along = await fitted(shrinking(90, { w: 20, h: 80 }, name))
    expect(along).toMatchObject({ sizePt: 24, overflow: false })
    expect((await fitted(shrinking(-90, { w: 20, h: 80 }, name))).sizePt).toBe(24)
    expect((await fitted(shrinking(undefined, { w: 20, h: 80 }, name))).sizePt).toBeLessThan(24)
  }, 60_000)

  it('shrinks a turned text exactly as far as the same text laid flat in the turned box', async () => {
    const flat = await fitted(shrinking(undefined, { w: 80, h: 20 }, long))
    for (const turn of [90, -90] as const) {
      const turned = await fitted(shrinking(turn, { w: 20, h: 80 }, long))
      expect(turned.sizePt).toBe(flat.sizePt)
      expect(turned.overflow).toBe(flat.overflow)
      expect(turned.hidden).toBe(flat.hidden)
    }
    // And it is at the floor and still cut, so the comparison is about the lines it cuts off.
    expect(flat.overflow).toBe(true)
    expect(flat.hidden).toBeGreaterThan(0)
  }, 60_000)
})
