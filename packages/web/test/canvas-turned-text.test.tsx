// @vitest-environment jsdom
// A text turned a quarter round on Mall's canvas (#1431). The box stays where the designer drew it
// and only the words turn, so the selection frame and the drag stand on the box exactly as they do
// for an upright text. What is asked here is whether that is true of what the screen shows: the
// markup the real canvas produces is drawn in a real engine, and the turned words' ink is read off
// the screenshot and held against the frame the canvas draws round them, before and after a drag.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { chromium, type Browser } from 'playwright'
import type { Element } from '@byd/template'
import { TemplateCanvas, type TemplateCanvasProps } from '../src/editor/TemplateCanvas.js'
import { projectDoc } from './project-doc.js'
import { drag, laidOut, target } from './drag.js'
import type { ProjectDoc } from '../src/editor/types.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')

// A colour no part of the editor paints, so the words can be told from the furniture drawn over
// the card: the frame and the handles are in the editor's own mark colour.
const INK = { css: '#12f0c8', rgb: [0x12, 0xf0, 0xc8] }

// Four capitals at 24 pt in a box 16 mm wide and 70 mm long, turned to read down it. Set at the
// start of their line, so the ink stands at the top of the box and against its right edge.
const spine = (x: number, y: number): Element => ({
  kind: 'text',
  id: 'spine',
  x,
  y,
  w: 16,
  h: 70,
  bind: { literal: 'MMMM' },
  font: { family: 'sans-serif', sizePt: 24, weight: 700, align: 'left' },
  color: INK.css,
  fit: 'fixed',
  rotationDeg: 90,
})
function withSpine(at: { x: number; y: number }): ProjectDoc {
  const doc = projectDoc()
  doc.template.faces['front']!.base = [spine(at.x, at.y)]
  return doc
}

function props(doc: ProjectDoc, onPatch = vi.fn()): TemplateCanvasProps {
  return {
    doc,
    face: 'front',
    row: 'dragon',
    selectedElement: 'spine',
    onSelectElement: vi.fn(),
    onPatch,
    onCallOff: vi.fn(),
    onRemove: vi.fn(),
    onAdd: vi.fn(),
    onReorder: vi.fn(),
    onLock: vi.fn(),
    onRename: vi.fn(),
    onSelectFace: vi.fn(),
    onReplaceFace: vi.fn(),
    group: null,
    onSelectGroup: vi.fn(),
    onGroupColumn: vi.fn(),
    onAddField: vi.fn(),
    onReset: vi.fn(),
  }
}

function markup(doc: ProjectDoc): string {
  const { container, unmount } = render(<TemplateCanvas {...props(doc)} />)
  const html = container.innerHTML
  unmount()
  return html
}

let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser.close()
}, 60_000)

function page(body: string): string {
  return read('index.html')
    .replace('<script type="module" src="/src/main.tsx"></script>', '')
    .replace('</head>', `<style>${read('src/editor/editor.css')}\n${read('src/buttons.css')}</style></head>`)
    .replace('<div id="root"></div>', `<div id="root">${body}</div>`)
}

type Rect = { left: number; top: number; right: number; bottom: number }
// The frame the canvas draws round the selected element, and the rectangle the words' ink covers,
// both in screen pixels. The ink is read from the screenshot through a canvas, so it is the painted
// pixel and never a guess at what the CSS would have done.
async function seen(doc: ProjectDoc): Promise<{ frame: Rect; ink: Rect }> {
  const view = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  try {
    await view.setContent(
      page(`<div class="byd-editor" data-page="editor" data-mode="template"><header></header><div></div><main><div role="tabpanel">${markup(doc)}</div></main></div>`),
      { waitUntil: 'load' },
    )
    await view.evaluate(() => document.fonts.ready)
    const shot = (await view.screenshot()).toString('base64')
    return await view.evaluate(async ([data, rgb]) => {
      const box = document.querySelector('[data-drag="spine"]')!.getBoundingClientRect()
      const shown = new Image()
      shown.src = `data:image/png;base64,${data}`
      await shown.decode()
      const sheet = Object.assign(document.createElement('canvas'), { width: shown.width, height: shown.height })
      const ink = sheet.getContext('2d')!
      ink.drawImage(shown, 0, 0)
      // Only the card on the stage: the canvas draws the same face again, small, in its card row.
      const card = document.querySelector('[data-drag-layer]')!.getBoundingClientRect()
      const [cx, cy] = [Math.floor(card.left), Math.floor(card.top)]
      const px = ink.getImageData(cx, cy, Math.ceil(card.width), Math.ceil(card.height))
      let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
      for (let y = 0; y < px.height; y++) {
        for (let x = 0; x < px.width; x++) {
          const at = (y * px.width + x) * 4
          if (rgb.every((c, i) => Math.abs(px.data[at + i]! - c) <= 12)) {
            x0 = Math.min(x0, cx + x)
            y0 = Math.min(y0, cy + y)
            x1 = Math.max(x1, cx + x + 1)
            y1 = Math.max(y1, cy + y + 1)
          }
        }
      }
      return { frame: { left: box.left, top: box.top, right: box.right, bottom: box.bottom }, ink: { left: x0, top: y0, right: x1, bottom: y1 } }
    }, [shot, INK.rgb] as const)
  } finally {
    await view.close()
  }
}

// Inside the frame, a pixel of rounding either way allowed.
function expectInside(ink: Rect, frame: Rect): void {
  expect(ink.left).toBeGreaterThanOrEqual(frame.left - 1)
  expect(ink.top).toBeGreaterThanOrEqual(frame.top - 1)
  expect(ink.right).toBeLessThanOrEqual(frame.right + 1)
  expect(ink.bottom).toBeLessThanOrEqual(frame.bottom + 1)
}

describe('a turned text on the canvas (#1431)', () => {
  it('is drawn turned, inside the frame the canvas draws round it', async () => {
    const { frame, ink } = await seen(withSpine({ x: 20, y: 6 }))
    expect(Number.isFinite(ink.left)).toBe(true)
    // Turned: the four letters run down the box and not across it.
    expect(ink.bottom - ink.top).toBeGreaterThan(2 * (ink.right - ink.left))
    expectInside(ink, frame)
    // And read from the top down: they start at the frame's top and stand against its right edge.
    const height = frame.bottom - frame.top
    expect(ink.top - frame.top).toBeLessThan(height * 0.1)
    expect(ink.bottom - frame.top).toBeLessThan(height * 0.7)
    expect(frame.right - ink.right).toBeLessThan((frame.right - frame.left) * 0.35)
  }, 120_000)

  it('moves with its frame when it is dragged, and stays inside it', async () => {
    // The drag as the canvas takes it: 60 px right and 30 px down at 6 px to the millimetre.
    const before = withSpine({ x: 20, y: 6 })
    const onPatch = vi.fn()
    const { unmount } = render(<TemplateCanvas {...props(before, onPatch)} />)
    laidOut()
    drag(target('spine')!, [150, 200], [210, 230])
    unmount()
    expect(onPatch).toHaveBeenLastCalledWith('spine', { x: 30, y: 11 }, expect.any(String))
    const moved = withSpine(onPatch.mock.lastCall![1] as { x: number; y: number })

    const a = await seen(before)
    const b = await seen(moved)
    const frameShift = { x: b.frame.left - a.frame.left, y: b.frame.top - a.frame.top }
    const inkShift = { x: b.ink.left - a.ink.left, y: b.ink.top - a.ink.top }
    expect(frameShift.x).toBeGreaterThan(10)
    expect(frameShift.y).toBeGreaterThan(5)
    expect(Math.abs(inkShift.x - frameShift.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(inkShift.y - frameShift.y)).toBeLessThanOrEqual(1)
    expectInside(b.ink, b.frame)
  }, 120_000)
})
