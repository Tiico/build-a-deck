// @vitest-environment jsdom
// Where a text stands in its box (#219), measured on both sides of the one renderer (E2). The
// editor's preview and `packages/render` must put the words in the same place, and neither jsdom
// nor a stylesheet can say whether they do — only a layout engine can. So the very markup the
// preview mounts and the very document the renderer prints are laid out in the same Chromium and
// the two are compared to each other.
//
// Nothing here pins a pixel. CI lays this text out in DejaVu and this machine in SF Pro, and the
// two differ by more than a tenth of a line; what is asserted is a *share* of the element's own
// box, which is what the placement is about, and the agreement between the two documents.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { chromium, type Browser } from 'playwright'
import { CARD_STANDARD_63x88 } from '@byd/engine'
import { compile, fitInDocument, type Element, type FaceTemplate } from '@byd/template'
import { hostDocument } from '@byd/render'
import { CardPreview } from '../src/editor/CardPreview.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')

// The same function the editor imports and the renderer carries into the page, run in the page.
// The transpiler wraps inner functions in a `__name` helper the page does not have, so the source
// is evaluated in a scope that defines it — exactly as the renderer does it.
const FIT = `(() => { const __name = (fn) => fn; return (${fitInDocument.toString()})(document) })()`

const ACROSS = ['left', 'center', 'right'] as const
const DOWN = ['top', 'middle', 'bottom'] as const
const CELL = { w: 18, h: 26 }

// Nine boxes on one card, one per placement, each with the same short word in it. Fixed size, so
// nothing here is about the fitting.
const cell = (align: (typeof ACROSS)[number], valign: (typeof DOWN)[number], col: number, row: number): Element => ({
  kind: 'text',
  id: `${align}-${valign}`,
  x: 3 + col * 20,
  y: 3 + row * 28,
  ...CELL,
  bind: { literal: 'Ord' },
  font: { family: 'sans-serif', sizePt: 8, align },
  color: '#111111',
  fit: 'fixed',
  valign,
})

const face: FaceTemplate = { base: ACROSS.flatMap((align, col) => DOWN.map((valign, row) => cell(align, valign, col, row))), variants: {} }
const ids = face.base.map((el) => el.id)

// Where the ink of a text lies inside its element's box, as a share of that box. A range over the
// words is measured and not the paragraph: a paragraph fills the width of its element whatever the
// text does inside it, so its box says nothing about the sideways placement.
type Share = { left: number; right: number; top: number; bottom: number }
const READ = `(() => {
  const out = {}
  for (const el of document.querySelectorAll('[data-element][data-fit]')) {
    const box = el.getBoundingClientRect()
    // The union of the rects the *words* draw. A range over the element would hand back the
    // paragraph's own border box as well, and a paragraph is as wide as its element whatever the
    // text inside it does — which is precisely what the sideways placement is not.
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let ink = null
    while (walker.nextNode()) {
      const range = document.createRange()
      range.selectNodeContents(walker.currentNode)
      for (const r of range.getClientRects()) {
        if (r.width === 0 && r.height === 0) continue
        ink = ink === null ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom } : { left: Math.min(ink.left, r.left), right: Math.max(ink.right, r.right), top: Math.min(ink.top, r.top), bottom: Math.max(ink.bottom, r.bottom) }
      }
    }
    if (ink === null) continue
    out[el.dataset.element] = {
      left: (ink.left - box.left) / box.width,
      right: (ink.right - box.left) / box.width,
      top: (ink.top - box.top) / box.height,
      bottom: (ink.bottom - box.top) / box.height,
    }
  }
  return out
})()`

let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser.close()
}, 60_000)

async function shares(document_: string): Promise<Record<string, Share>> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  try {
    await page.setContent(document_, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    await page.evaluate(FIT)
    return (await page.evaluate(READ)) as Record<string, Share>
  } finally {
    await page.close()
  }
}

// The preview as the editor mounts it — the component's own markup, its own scoped stylesheet,
// and the editor's stylesheet around it, which is the whole point of measuring it rather than the
// compiled output on its own.
function editorDocument(): string {
  const { container, unmount } = render(<CardPreview id="byd-card-ord" face={face} row={{}} icons={{}} />)
  const html = container.innerHTML
  unmount()
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#fff}${read('src/editor/editor.css')}\n${read('src/buttons.css')}</style></head><body><div class="byd-editor">${html}</div></body></html>`
}

describe('the editor and the renderer put the text in the same place (#219)', () => {
  let editor: Record<string, Share>
  let renderer: Record<string, Share>
  beforeAll(async () => {
    editor = await shares(editorDocument())
    renderer = await shares(hostDocument(compile({ type: CARD_STANDARD_63x88, face, row: {}, icons: {} })))
  }, 120_000)

  it('agrees on every one of the nine placements, to within a hundredth of the box', () => {
    for (const id of ids) {
      const a = editor[id]!
      const b = renderer[id]!
      for (const edge of ['left', 'right', 'top', 'bottom'] as const) {
        expect(Math.abs(a[edge] - b[edge]), `${id} ${edge}: editor ${a[edge]} vs renderer ${b[edge]}`).toBeLessThan(0.01)
      }
    }
  }, 60_000)

  it('stands the text at the top, in the middle and at the bottom of its box', () => {
    for (const align of ACROSS) {
      const [top, middle, bottom] = DOWN.map((valign) => renderer[`${align}-${valign}`]!)
      // The top is where a text has always stood: its ink starts at the box's own top edge.
      expect(top!.top).toBeLessThan(0.02)
      // The middle leaves the same air above as below, and the bottom leaves it all above.
      expect(Math.abs(middle!.top - (1 - middle!.bottom))).toBeLessThan(0.02)
      expect(bottom!.bottom).toBeGreaterThan(0.98)
      expect(top!.top).toBeLessThan(middle!.top)
      expect(middle!.top).toBeLessThan(bottom!.top)
    }
  }, 60_000)

  it('sets the text against the left edge, in the middle and against the right edge', () => {
    for (const valign of DOWN) {
      const [left, center, right] = ACROSS.map((align) => renderer[`${align}-${valign}`]!)
      expect(left!.left).toBeLessThan(0.02)
      expect(Math.abs(center!.left - (1 - center!.right))).toBeLessThan(0.02)
      expect(right!.right).toBeGreaterThan(0.98)
    }
  }, 60_000)
})
