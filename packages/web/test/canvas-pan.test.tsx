// @vitest-environment jsdom
// Panning the card once it is bigger than the stage (#146). A zoom that cannot be panned is a
// zoom that hides the work: at 600 % the card is 1 428 × 1 995 px and the stage is a few hundred,
// so every part of the card that is not under the hand has to be reachable. Whether it is is a
// layout question and jsdom answers none — a scrolling box, a centred item and the page behind
// it are all real box model — so the shipped stylesheet is measured in a real engine.
//
// The trap this is here for: a grid that centres an item it cannot hold pushes half the overflow
// off the top and the left, where no scroll can ever reach it. The card's own top edge is then
// gone for good, which is exactly where a designer works.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { chromium, type Browser } from 'playwright'
import { TemplateCanvas } from '../src/editor/TemplateCanvas.js'
import { projectDoc } from './project-doc.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')

// The canvas as the editor mounts it, zoomed all the way in by the control a designer uses, and
// then taken as markup: the zoom rides on the card as an inline style, so what is measured in the
// engine is the card the React state actually produced.
async function zoomedIn(): Promise<string> {
  const user = userEvent.setup()
  const { container, unmount } = render(
    <TemplateCanvas doc={projectDoc()} face="front" row="dragon" selectedElement="title" onSelectElement={vi.fn()} onPatch={vi.fn()} onCallOff={vi.fn()} onRemove={vi.fn()} onAdd={vi.fn()} onPlaceIcon={vi.fn()} onReorder={vi.fn()} onLock={vi.fn()} onRename={vi.fn()} onSelectFace={vi.fn()} onReplaceFace={vi.fn()} group={null} onSelectGroup={vi.fn()} onGroupColumn={vi.fn()} onAddField={vi.fn()} onReset={vi.fn()} onFontFile={async () => 'Typsnitt'} onFontLicence={vi.fn()} onRemoveFont={vi.fn()} onCatalogFont={vi.fn(async () => undefined)} />,
  )
  const more = screen.getByRole('button', { name: 'Förstora mer' })
  for (let i = 0; i < 20; i++) await user.click(more)
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

type Seen = {
  card: { top: number; left: number; w: number; h: number }
  stage: { top: number; left: number; w: number; h: number }
  scrollable: { x: number; y: number }
  overscroll: string
  page: { x: number; y: number }
  band: { right: number; bottom: number }
  over: Record<string, { same: boolean; w: number }>
  panned: { top: number; left: number } | null
}

async function measure(): Promise<Seen> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  try {
    const shell = read('index.html')
      .replace('<script type="module" src="/src/main.tsx"></script>', '')
      .replace('</head>', `<style>${read('src/editor/editor.css')}\n${read('src/buttons.css')}</style></head>`)
      .replace(
        '<div id="root"></div>',
        `<div id="root"><div class="byd-editor" data-page="editor" data-mode="template"><header></header><div></div><main><div role="tabpanel">${await zoomedIn()}</div></main></div></div>`,
      )
    await page.setContent(shell, { waitUntil: 'load' })
    // Panned from the keyboard, which is the half of this a pointer never proves: the stage is a
    // scrolling box, and a scrolling box only a mouse can move is a card a keyboard cannot read.
    await page.focus('.byd-canvas-stage')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowRight')
    // Chromium answers an arrow with an animated scroll rather than a jump, so the arrival is
    // waited for: reading the offset the instant after the key is read before the scroll begins.
    const panned = await page
      .waitForFunction(() => {
        const box = document.querySelector('.byd-canvas-stage') as HTMLElement
        return box.scrollTop > 0 && box.scrollLeft > 0 ? { top: box.scrollTop, left: box.scrollLeft } : null
      })
      .then((handle) => handle.jsonValue())
      .catch(() => null)
    return await page.evaluate(() => {
      const stage = document.querySelector('.byd-canvas-stage') as HTMLElement
      const card = document.querySelector('[data-card]') as HTMLElement
      const band = document.querySelector('.byd-canvas-zoom') as HTMLElement
      const room = document.querySelector('.byd-canvas-room') as HTMLElement
      const box = (el: Element) => {
        const r = el.getBoundingClientRect()
        return { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom) }
      }
      // Put back, so every measurement below is of a stage nobody has scrolled.
      stage.scrollTo(0, 0)
      const at = box(stage)
      return {
        card: box(card),
        stage: at,
        scrollable: { x: stage.scrollWidth - stage.clientWidth, y: stage.scrollHeight - stage.clientHeight },
        overscroll: getComputedStyle(stage).overscrollBehaviorY,
        page: { x: document.documentElement.scrollWidth - document.documentElement.clientWidth, y: document.documentElement.scrollHeight - document.documentElement.clientHeight },
        band: { right: box(room).right - box(band).right, bottom: box(room).bottom - box(band).bottom },
        // The layer that takes the pointer, against the elements it grabs — measured at this
        // zoom, since a box that drifts from its element as the card grows is a drag that grabs
        // the paper beside the thing the designer is pointing at.
        over: Object.fromEntries(
          [...document.querySelectorAll('[data-drag]')].map((drag) => {
            const el = document.querySelector(`#canvas [data-element="${drag.getAttribute('data-drag')}"]`)!
            const a = box(drag)
            const b = box(el)
            return [drag.getAttribute('data-drag')!, { same: a.top === b.top && a.left === b.left && a.w === b.w && a.h === b.h, w: a.w }]
          }),
        ),
      }
    }).then((seen) => ({ ...seen, panned }))
  } finally {
    await page.close()
  }
}

describe('a card bigger than the stage (#146)', () => {
  it('leaves its own top and left corner where a scroll can reach them', async () => {
    const seen = await measure()

    // The premise: the card really is bigger than the room it is in, on both axes.
    expect({ wider: seen.card.w > seen.stage.w, taller: seen.card.h > seen.stage.h }).toEqual({ wider: true, taller: true })
    // And unscrolled, its own first corner is the first thing in the box — not half an overflow
    // above it, where nothing can ever go.
    expect({ top: seen.card.top >= seen.stage.top - 1, left: seen.card.left >= seen.stage.left - 1 }).toEqual({ top: true, left: true })
    // The rest of it is reachable by scrolling, which is the whole of panning.
    expect({ x: seen.scrollable.x > 0, y: seen.scrollable.y > 0 }).toEqual({ x: true, y: true })
  }, 60_000)

  it('is panned from the keyboard as readily as from a wheel', async () => {
    const seen = await measure()

    expect(seen.panned).not.toBeNull()
  }, 60_000)

  it('keeps the scrolling to the stage and never hands it on to the page', async () => {
    const seen = await measure()

    expect(seen.overscroll).toBe('contain')
    expect(seen.page).toEqual({ x: 0, y: 0 })
  }, 60_000)

  // The overlay is drawn in the card's own millimetres inside the same zoom, so growing the card
  // must move the handles with it. Measured at the far end of the range, where a rounding that
  // does not scale shows up as whole pixels rather than as a hair.
  it('keeps the drag layer exactly over the elements it grabs at the far end of the zoom', async () => {
    const seen = await measure()

    expect(Object.keys(seen.over).sort()).toEqual(['body', 'frame', 'title'])
    for (const [id, box] of Object.entries(seen.over)) {
      expect({ [id]: box }).toEqual({ [id]: { same: true, w: box.w } })
      // And really drawn at this zoom: `title` is 53 mm wide, which is 1 200 px at 600 %.
      expect({ [id]: box.w > 100 }).toEqual({ [id]: true })
    }
  }, 60_000)

  it('keeps the zoom band in the canvas’ own corner while the card is panned past it', async () => {
    const seen = await measure()

    // Outside the scrolling box, so it is in the same corner at every scroll position: a control
    // that pans away with the card is gone exactly when the card is big enough to need it. The
    // corner is the canvas room's and not the stage's — the band stands beside the stage rather
    // than on it, which is what keeps it off the card (#146, L19); `canvas-band.test.tsx` is where
    // that is measured, desk by desk.
    expect({ right: seen.band.right >= 0 && seen.band.right < 40, bottom: seen.band.bottom >= 0 && seen.band.bottom < 40 }).toEqual({ right: true, bottom: true })
  }, 60_000)
})
