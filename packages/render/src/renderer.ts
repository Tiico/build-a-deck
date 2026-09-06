import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { fitInDocument, type FitReport } from '@byd/template'
import type { CompiledLike } from './hash.js'

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
    const zoom = opts.dpi / CSS_DPI
    const context = await this.browser.newContext({ deviceScaleFactor: 1, viewport: { width: 4000, height: 6000 } })
    try {
      const page = await context.newPage()
      await page.setContent(hostDocument(compiled, zoom), { waitUntil: 'load' })
      await page.evaluate(() => document.fonts.ready)
      await fitPage(page)
      const box = await cardBox(page)
      if (!box) throw new Error('compiled output has no [data-card]')
      const clip = { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) }
      return await page.screenshot({ type: 'png', clip, animations: 'disabled', caret: 'hide' })
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
