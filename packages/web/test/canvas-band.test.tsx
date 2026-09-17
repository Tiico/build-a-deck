// @vitest-environment jsdom
// Where the zoom's band stands, at every desk the editor is held to (#146, L19).
//
// The decision put the control "i den bredd som ändå står oanvänd som rutmönster (323 px vid
// 1440)": in the width the fitting already leaves over, because a control that occupies space
// nothing else wants costs the card nothing. A band floating in the stage's own lower corner does
// not do that. Measured, it covered the card at every one of the four desks — 39 px of the
// bottom-right corner at 1024, 257 × 50 at 1280, 212 × 50 at 1440 and 37 × 50 at 1920 — because
// the fitting centres the card and so leaves only half the spare width on the right: 12 px at
// 1024, 120 at 1280, 164 at 1440. The band is wider than any of them.
//
// So the band is not over the stage at all any more; it has a place of its own in the canvas
// beside it, and the chequerboard is the room's rather than the stage's so the canvas still looks
// like one surface. What that buys is a guarantee rather than an arithmetic: the card is drawn
// inside the stage and clipped by it, so a band that never touches the stage can never cover the
// card — at any zoom, at any pan, in any font.
//
// Whether it does is a layout question and jsdom answers none, so the shipped stylesheet is
// measured in a real engine. Nothing here pins a text width: the desks' own geometry is fixed by
// the grid, and every assertion is a relation between boxes.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { chromium, type Browser } from 'playwright'
import { TemplateCanvas } from '../src/editor/TemplateCanvas.js'
import { fitScale, STAGE_AIR, ZOOM_MAX } from '../src/editor/canvas.js'
import { projectDoc } from './project-doc.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')

// The canvas as the editor mounts it, taken as markup: the zoom rides on the card as an inline
// style, so what the engine measures is the card React actually produced.
function markup(): string {
  const { container, unmount } = render(
    <TemplateCanvas doc={projectDoc()} face="front" row="dragon" selectedElement="title" onSelectElement={vi.fn()} onPatch={vi.fn()} onCallOff={vi.fn()} onRemove={vi.fn()} onAdd={vi.fn()} onPlaceIcon={vi.fn()} onReorder={vi.fn()} onLock={vi.fn()} onRename={vi.fn()} onSelectFace={vi.fn()} onReplaceFace={vi.fn()} group={null} onSelectGroup={vi.fn()} onGroupColumn={vi.fn()} onAddField={vi.fn()} onReset={vi.fn()} onFontFile={async () => 'Typsnitt'} onFontLicence={vi.fn()} onRemoveFont={vi.fn()} />,
  )
  const html = container.innerHTML
  unmount()
  return html
}

// The desks the editor is held to (UX-KONTROLLER, L12), and the one above them L19 measured the
// millimetre at. `beside` is where the band is expected to stand: the fitting leaves width over
// at three of the four, and at 1024 it leaves none — the card is as wide as the stage lets it be
// there, so the band takes a row under the stage instead and that row is what it costs.
const DESKS = [
  { width: 1024, height: 768, where: 'under the stage' },
  { width: 1280, height: 800, where: 'beside the stage' },
  { width: 1440, height: 900, where: 'beside the stage' },
  { width: 1920, height: 1080, where: 'beside the stage' },
] as const

type Box = { left: number; top: number; right: number; bottom: number; w: number; h: number }
type Lap = { x: number; y: number }
type Seen = { stage: Box; room: Box; band: Box; card: Box; onCard: Lap; onStage: Lap }

let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser.close()
}, 60_000)

// The canvas at one desk, read at two zooms: the one the canvas opens on, which is the fitting
// itself, and the ceiling, where the card is far bigger than the stage and every spare pixel of
// chequerboard is gone. The fitting is not recomputed here — the shipped function is handed the
// rectangles the engine measured, so what is drawn is what `Passa in` would have drawn.
async function measure(desk: (typeof DESKS)[number]): Promise<{ fitted: Seen; ceiling: Seen; fit: number }> {
  const page = await browser.newPage({ viewport: { width: desk.width, height: desk.height } })
  try {
    const shell = read('index.html')
      .replace('<script type="module" src="/src/main.tsx"></script>', '')
      .replace('</head>', `<style>${read('src/editor/editor.css')}\n${read('src/buttons.css')}</style></head>`)
      .replace(
        '<div id="root"></div>',
        `<div id="root"><div class="byd-editor" data-page="editor" data-mode="template"><header></header><div></div><main><div role="tabpanel">${markup()}</div></main></div></div>`,
      )
    await page.setContent(shell, { waitUntil: 'load' })
    const drawn = await page.evaluate(() => {
      const size = (selector: string) => {
        const r = document.querySelector(selector)!.getBoundingClientRect()
        return { w: r.width, h: r.height }
      }
      return { zoom: Number((document.getElementById('canvas') as HTMLElement).style.zoom), card: size('[data-card]'), stage: size('.byd-canvas-stage') }
    })
    const fit = fitScale(drawn.zoom, drawn.card, drawn.stage)
    const at = async (zoom: number): Promise<Seen> =>
      page.evaluate((z) => {
        ;(document.getElementById('canvas') as HTMLElement).style.zoom = String(z)
        const box = (el: Element): Box => {
          const r = el.getBoundingClientRect()
          return { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }
        }
        // How much of one rectangle the other actually covers, as a rectangle of its own. Two
        // boxes that share a column of pixels but no row share nothing at all, so a reading on one
        // axis alone is never an overlap: both are zero unless there is a real one, and then they
        // say how big it is.
        const lap = (a: Box, b: Box) => {
          const x = Math.min(a.right, b.right) - Math.max(a.left, b.left)
          const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
          return x > 0 && y > 0 ? { x, y } : { x: 0, y: 0 }
        }
        // The card as a designer can see it: the stage clips what hangs outside itself, so the
        // part of the card a band could cover is the part inside the stage.
        const clip = (a: Box, b: Box): Box => {
          const left = Math.max(a.left, b.left)
          const top = Math.max(a.top, b.top)
          const right = Math.min(a.right, b.right)
          const bottom = Math.min(a.bottom, b.bottom)
          return { left, top, right, bottom, w: Math.max(0, right - left), h: Math.max(0, bottom - top) }
        }
        const stage = box(document.querySelector('.byd-canvas-stage')!)
        const room = box(document.querySelector('.byd-canvas-room')!)
        const band = box(document.querySelector('.byd-canvas-zoom')!)
        const card = box(document.querySelector('[data-card]')!)
        return { stage, room, band, card, onCard: lap(clip(card, stage), band), onStage: lap(stage, band) }
      }, zoom)
    return { fitted: await at(fit), ceiling: await at(ZOOM_MAX), fit }
  } finally {
    await page.close()
  }
}

describe.each(DESKS)('the zoom band on a $width×$height desk (#146, L19)', (desk) => {
  it('never lies over the card — neither at the fitting nor with the card zoomed past every edge', async () => {
    const seen = await measure(desk)

    // The reading is not vacuous: there is a card, there is a band, and at the ceiling the card
    // really is bigger than the room it is in, which is the state a floating band cannot survive.
    expect({ card: seen.fitted.card.w > 0, band: seen.fitted.band.w > 0 }).toEqual({ card: true, band: true })
    expect({ wider: seen.ceiling.card.w > seen.ceiling.stage.w, taller: seen.ceiling.card.h > seen.ceiling.stage.h }).toEqual({ wider: true, taller: true })

    expect({ fitting: seen.fitted.onCard, ceiling: seen.ceiling.onCard }).toEqual({ fitting: { x: 0, y: 0 }, ceiling: { x: 0, y: 0 } })
  }, 60_000)

  // Why the line above holds at every zoom rather than at the two that were measured: the card is
  // drawn inside the stage and clipped by it, so a band outside the stage is a band outside every
  // card the stage will ever show.
  it('stands outside the stage altogether, and inside the canvas’ own corner', async () => {
    const seen = await measure(desk)

    expect(seen.fitted.onStage).toEqual({ x: 0, y: 0 })
    // In the canvas' own lower corner, whichever side of the stage that corner is on: a control
    // that drifts away from the work is one a designer has to go looking for.
    const { room, band } = seen.fitted
    expect({ right: room.right - band.right >= 0 && room.right - band.right < 40, bottom: room.bottom - band.bottom >= 0 && room.bottom - band.bottom < 40 }).toEqual({ right: true, bottom: true })
  }, 60_000)

  it(`stands ${desk.where}`, async () => {
    const seen = await measure(desk)

    const { stage, band } = seen.fitted
    expect(desk.where === 'beside the stage' ? band.left >= stage.right : band.top >= stage.bottom).toBe(true)
  }, 60_000)
})

// And the half the decision is actually about: where the width stands unused, the band is drawn
// in it and the card is exactly as big as it was without one. A card fitted by its height is a
// card nothing horizontal has taken anything from — so the card's height against the stage's is
// the whole proof, and it is a relation rather than a pixel count.
describe.each(DESKS.filter((d) => d.where === 'beside the stage'))('the card at $width×$height (#146, L19)', (desk) => {
  it('is still fitted by the stage’s height, with the chequerboard beside it the band was given', async () => {
    const seen = await measure(desk)

    const { stage, card } = seen.fitted
    expect({ heightBound: Math.abs(card.h - (stage.h - STAGE_AIR)) <= 1 }).toEqual({ heightBound: true })
    // And the fitting still leaves chequerboard on either side of the card, which is what says
    // the height and not the width is what the card ran out of.
    expect({ spare: stage.w - card.w > 0 }).toEqual({ spare: true })
  }, 60_000)
})
