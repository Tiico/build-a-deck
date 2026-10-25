import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { fitInDocument, type FitReport } from '@byd/template'
import type { CompiledLike } from './hash.js'
import { capture } from './capture.js'

// The one renderer (E2): compiled HTML/CSS in, pixels or a PDF out. Nothing else may draw a card.
// CSS millimetres are 96 dpi to Chromium; the device scale factor takes them to the DPI asked for.
const CSS_DPI = 96

// `fitInDocument` is carried into the page as source text. Transpilers such as esbuild (under
// tsx) wrap inner functions in a `__name(fn, "name")` helper the page does not have, and
// Playwright evaluates in its own world where a page global would not help — so the source is
// evaluated inside a scope that defines the helper as the identity. Works whoever transpiled it.
const FIT_IN_PAGE = `(() => { const __name = (fn) => fn; return (${fitInDocument.toString()})(document) })()`

async function fitPage(page: Page): Promise<FitReport[]> {
  return (await page.evaluate(FIT_IN_PAGE)) as FitReport[]
}

export type PngOptions = { dpi: number }
// A picture drawn to be screened (#1271): RGBA bytes row by row, as a canvas reads them.
export type PicturePixels = { width: number; height: number; data: Uint8ClampedArray }
// A partner's raster (#1207): the whole page, bleed and all, in exactly these pixels.
export type RasterOptions = { format: 'png' | 'jpg'; widthPx: number; heightPx: number }
// A partner asking for a JPEG gets one that keeps what a press can tell apart; the file is the
// partner's to print and not the table's to load, so size is not what it is weighed against.
const JPEG_QUALITY = 95

export class Renderer {
  private constructor(private readonly browser: Browser) {}

  static async launch(): Promise<Renderer> {
    return new Renderer(await chromium.launch())
  }

  async close(): Promise<void> {
    await this.browser.close()
  }

  renderPdf(compiled: CompiledLike): Promise<Uint8Array> {
    return renderPdfWith(this.browser, compiled)
  }

  renderBooklet(compiled: CompiledLike): Promise<Uint8Array> {
    return renderBookletWith(this.browser, compiled)
  }

  // Fits every text element with Chromium's own metrics and reports the outcome (E6).
  // The same function runs in the editor; the renderer just runs it where the truth is.
  async fit(compiled: CompiledLike): Promise<FitReport[]> {
    const context = await this.browser.newContext({ viewport: { width: 2000, height: 3000 } })
    try {
      const page = await context.newPage()
      await page.setContent(hostDocument(compiled), { waitUntil: 'load' })
      await page.evaluate(() => document.fonts.ready)
      return await fitPage(page)
    } finally {
      await context.close()
    }
  }

  // Zooms the document so CSS millimetres land on the target DPI, then clips a page screenshot to
  // the card's box rounded to whole pixels. Element screenshots round the box before scaling and
  // drift by several pixels at print resolution; a clip is exact.
  async renderPng(compiled: CompiledLike, opts: PngOptions): Promise<Uint8Array> {
    return (await this.renderTexture(compiled, opts)).png
  }

  // The texture and what its smallest text became once E6 had fitted it (#523): the size a play
  // surface must hold the card up at to read it follows from its words, not from the template's
  // nominal size. `null` for a card with no words on it.
  async renderTexture(compiled: CompiledLike, opts: PngOptions): Promise<{ png: Uint8Array; smallestPt: number | null }> {
    const zoom = opts.dpi / CSS_DPI
    const context = await this.browser.newContext({ deviceScaleFactor: 1, viewport: { width: 4000, height: 6000 } })
    try {
      const page = await context.newPage()
      await page.setContent(hostDocument(compiled, zoom), { waitUntil: 'load' })
      await page.evaluate(() => document.fonts.ready)
      const fitted = (await fitPage(page)).filter((f) => !f.empty)
      const box = await cardBox(page)
      if (!box) throw new Error('compiled output has no [data-card]')
      const clip = { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) }
      const png = await capture(page, { type: 'png', clip, animations: 'disabled', caret: 'hide' })
      return { png, smallestPt: fitted.length > 0 ? Math.min(...fitted.map((f) => f.sizePt)) : null }
    } finally {
      await context.close()
    }
  }

  // A partner's file in exactly the pixels it asks for (#1207), the way the texture is made: the
  // document zoomed until the card's box — bleed and all — is `widthPx` across, fitted at that
  // zoom, and screenshot. The pixels are the requirement and never a rounding of a DPI, so what
  // the zoom leaves of the height, a fraction of a pixel when the partner's pixels and millimetres
  // agree, is taken up by stretching the drawn card by that fraction. Laying the card out at the
  // partner's pixels and not at 96 dpi matters: Chromium snaps boxes to whole pixels of the scale
  // they are laid out at, and a card laid out small and scaled up carries that snap up with it.
  // Nothing scales the file afterwards; the pixels are the ones Chromium drew (E2).
  async renderRaster(compiled: CompiledLike, opts: RasterOptions): Promise<Uint8Array> {
    const { widthPx, heightPx } = opts
    if (!Number.isInteger(widthPx) || !Number.isInteger(heightPx) || widthPx <= 0 || heightPx <= 0) throw new Error(`a raster is whole pixels, not ${widthPx} × ${heightPx}`)
    const context = await this.browser.newContext({ deviceScaleFactor: 1, viewport: { width: 4000, height: 6000 } })
    try {
      const page = await context.newPage()
      await page.setContent(hostDocument(compiled), { waitUntil: 'load' })
      await page.evaluate(() => document.fonts.ready)
      const plain = await cardBox(page)
      if (!plain) throw new Error('compiled output has no [data-card]')
      await page.evaluate((zoom) => (globalThis.document.documentElement.style.zoom = String(zoom)), widthPx / plain.width)
      await fitPage(page)
      const box = await cardBox(page)
      if (!box) throw new Error('compiled output has no [data-card]')
      // A transform moves no line of the layout the fitting measured; it only says where the
      // laid-out card is drawn, and Chromium draws it there at the scale, as vectors. What it
      // stretches is the card as painted, which Chromium has clipped to whole pixels from the
      // page's corner: stretching the unrounded box instead left the last row of 1114 a quarter
      // paper, a white line along the edge of the bleed.
      const painted = { width: Math.round(box.x + box.width) - Math.round(box.x), height: Math.round(box.y + box.height) - Math.round(box.y) }
      await page.addStyleTag({ content: `html{overflow:hidden}[data-card]{transform-origin:0 0;transform:scale(${widthPx / painted.width},${heightPx / painted.height})}` })
      await page.setViewportSize({ width: widthPx, height: heightPx })
      const clip = { x: 0, y: 0, width: widthPx, height: heightPx }
      return await capture(page, { ...(opts.format === 'jpg' ? { type: 'jpeg', quality: JPEG_QUALITY } : { type: 'png' }), clip, animations: 'disabled', caret: 'hide' })
    } finally {
      await context.close()
    }
  }

  // One uploaded picture as pixels, for a classifier (F4, #1271): the page's `img[data-screen]`
  // decoded by Chromium and drawn on a canvas at most `maxPx` on its longer side. A raster is only
  // ever made smaller, since pixels it does not have would tell a classifier nothing; an svg has no
  // pixels of its own and is drawn at `maxPx`, in the shape its own size or its viewBox gives it.
  // Throws, saying why, for a picture Chromium cannot decode. This draws no card: the one renderer
  // of cards (E2) is the rest of this class, and a card is never screened (#1268).
  async renderPicture(compiled: CompiledLike, opts: { maxPx: number }): Promise<PicturePixels> {
    const context = await this.browser.newContext({ viewport: { width: 800, height: 800 } })
    try {
      const page = await context.newPage()
      await page.setContent(hostDocument(compiled), { waitUntil: 'load' })
      const drawn = await page.evaluate(async (maxPx) => {
        const doc = globalThis.document
        const img = doc.querySelector('img[data-screen]')
        if (!(img instanceof HTMLImageElement)) return { error: 'the page has no img[data-screen]' }
        try {
          await img.decode()
        } catch {
          return { error: 'Chromium could not decode it' }
        }
        const vector = img.src.startsWith('data:image/svg+xml')
        let w = img.naturalWidth
        let h = img.naturalHeight
        if (vector) {
          // Chromium sizes an svg without its own size at a rounded 150 px, which bends its shape;
          // the file's own size, or else its viewBox, is the shape it was drawn in.
          const text = new TextDecoder().decode(Uint8Array.from(atob(img.src.slice(img.src.indexOf(',') + 1)), (c) => c.charCodeAt(0)))
          const root = new DOMParser().parseFromString(text, 'image/svg+xml').documentElement
          const length = (name: string) => {
            const m = /^\s*([0-9.]+)\s*(px)?\s*$/.exec(root.getAttribute(name) ?? '')
            return m ? Number(m[1]) : NaN
          }
          const [, , vw, vh] = (root.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number)
          if (length('width') > 0 && length('height') > 0) [w, h] = [length('width'), length('height')]
          else if (vw && vh && vw > 0 && vh > 0) [w, h] = [vw, vh]
        }
        if (!(w > 0 && h > 0)) return { error: `it has no size (${w} × ${h})` }
        const scale = vector ? maxPx / Math.max(w, h) : Math.min(1, maxPx / Math.max(w, h))
        const width = Math.max(1, Math.round(w * scale))
        const height = Math.max(1, Math.round(h * scale))
        const canvas = doc.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) return { error: 'there is no 2d canvas' }
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, 0, 0, width, height)
        const data = ctx.getImageData(0, 0, width, height).data
        let bytes = ''
        for (let i = 0; i < data.length; i += 0x8000) bytes += String.fromCharCode(...data.subarray(i, i + 0x8000))
        return { width, height, base64: btoa(bytes) }
      }, opts.maxPx)
      if ('error' in drawn) throw new Error(`the picture could not be drawn: ${drawn.error}`)
      return { width: drawn.width, height: drawn.height, data: new Uint8ClampedArray(Buffer.from(drawn.base64, 'base64')) }
    } finally {
      await context.close()
    }
  }
}

// The card's box in CSS pixels, without waiting: a compiled output that has no card is an
// error to report now, not something to wait thirty seconds for.
async function cardBox(page: Page): Promise<{ x: number; y: number; width: number; height: number } | null> {
  return page.evaluate(() => {
    const el = globalThis.document.querySelector('[data-card]')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  })
}

// A booklet (B7): a document of as many pages as the rules need, sized by its own `@page` and
// broken by Chromium. Nothing here looks for a card, because a booklet is not one.
export async function renderBookletWith(browser: Browser, compiled: CompiledLike): Promise<Uint8Array> {
  const context = await browser.newContext({ viewport: { width: 1200, height: 1600 } })
  try {
    const page = await context.newPage()
    await page.setContent(hostDocument(compiled), { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    return await page.pdf({ printBackground: true, preferCSSPageSize: true })
  } finally {
    await context.close()
  }
}

// A PDF page exactly the card's size, vector text and all; the bleed is part of the compiled
// output, so the page simply follows the card's box. CMYK conversion is a later, separate step.
export async function renderPdfWith(browser: Browser, compiled: CompiledLike): Promise<Uint8Array> {
  const context = await browser.newContext({ viewport: { width: 2000, height: 3000 } })
  try {
    const page = await context.newPage()
    await page.setContent(hostDocument(compiled), { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    await fitPage(page)
    const box = await cardBox(page)
    if (!box) throw new Error('compiled output has no [data-card]')
    const mm = (px: number) => (px / CSS_DPI) * 25.4
    // The page size goes through @page, which Chromium honours exactly; the pdf() size options round.
    await page.addStyleTag({ content: `@page{size:${mm(box.width).toFixed(3)}mm ${mm(box.height).toFixed(3)}mm;margin:0}` })
    return await page.pdf({ printBackground: true, preferCSSPageSize: true })
  } finally {
    await context.close()
  }
}

// A minimal, deterministic host document: no default margins, no scrollbars, the card alone.
export function hostDocument(compiled: CompiledLike, zoom = 1): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#fff}html{zoom:${zoom}}${compiled.css}</style></head><body>${compiled.html}</body></html>`
}

export type { BrowserContext }
