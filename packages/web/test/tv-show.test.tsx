// @vitest-environment jsdom
// «Visa för alla» on the TV, measured on the box Chromium paints (#508, beslut B, K26).
//
// The TV's inspection panel held the latest card at 177 px across at 1920 × 1080 — 8.5 px of body
// text on a screen read from three metres, where K26's floor is 24 px — and at eight seats the
// column gave it 97. The prototype measured the column at every width it could have and found it
// never reaches the floor: a card the room can read is 504 px wide, and the column is 360. So a
// shown card stands over the felt, which is bound by its height and has the room, and this is the
// reading that says it reaches the floor there, with the felt and the column under it untouched.
//
// It is geometry and not type: the card keeps 63 × 88 and fills the felt's height less the
// caption's one fixed line, so no machine's face moves the number.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ReactElement } from 'react'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { chromium, type Browser, type Page } from 'playwright'
import { TvChrome } from '../src/table/TvChrome.js'
import { TableRenderer } from '../src/table/TableRenderer.js'
import { FELT_FONT, feltOf, sceneOf, sheet } from './felt-labels.js'
import { DEFAULT_BODY_PT, SCREENS, textPxOnCard } from './legibility.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const SHEETS = [FELT_FONT, 'src/table/table.css', 'src/table/texture.css', 'src/buttons.css', 'src/a11y.css']

function markupOf(node: ReactElement): string {
  const { container, unmount } = render(node)
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

async function onPage<T>(html: string, size: { w: number; h: number }, look: (page: Page) => Promise<T>): Promise<T> {
  const page = await browser.newPage({ viewport: { width: size.w, height: size.h } })
  try {
    const shell = read('index.html')
      .replace('<script type="module" src="/src/main.tsx"></script>', '')
      .replace('</head>', `<style>${SHEETS.map(sheet).join('\n')}</style></head>`)
      .replace('<div id="root"></div>', `<div id="root" class="byd-fit">${html}</div>`)
    await page.setContent(shell, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
    return await look(page)
  } finally {
    await page.close()
  }
}

type Box = { x: number; y: number; w: number; h: number; right: number; bottom: number }
type Reading = { card: Box; felt: Box; column: Box; window: { w: number; h: number } }

const READ = () => {
  const box = (el: Element | null): Box => {
    const r = el!.getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }
  }
  return {
    card: box(document.querySelector('[data-tv-show]')),
    felt: box(document.querySelector('[data-tv] > main')),
    column: box(document.querySelector('[data-tv] > aside')),
    window: { w: innerWidth, h: innerHeight },
  }
}

const shownOn = async (seats: number, size: { w: number; h: number }): Promise<Reading> => {
  const scene = sceneOf(feltOf(seats))
  const card = scene.components.find((c) => c.cardRef !== null && c.counter === undefined) ?? { ...scene.components[0]!, cardRef: 'kort' }
  const html = markupOf(
    <TvChrome view={scene} activity={[]} roomCode="KX7P" title="Visa" showing={{ card, by: 'Ada', at: 1 }}>
      <TableRenderer view={scene} mode="tv" camera="follow" size={{ w: size.w - 360, h: size.h }} glideMs={0} />
    </TvChrome>,
  )
  return onPage(html, size, (page) => page.evaluate(READ) as Promise<Reading>)
}

const bodyOf = (reading: Reading) => Number(textPxOnCard(DEFAULT_BODY_PT, reading.card.w).toFixed(1))
const inside = (inner: Box, outer: Box) => inner.x >= outer.x - 0.5 && inner.y >= outer.y - 0.5 && inner.right <= outer.right + 0.5 && inner.bottom <= outer.bottom + 0.5

describe('a card shown for everyone is read from the sofa (K26, #508)', () => {
  // K26's TV row is written at 1920 × 1080 CSS px, which is also a 4K set at DPR 2: brödtext man
  // ska läsa, 28–32 px. The seat count is asked because the column's own card shrank with it (97 px
  // at eight seats); the shown card does not live in the column and must not.
  for (const seats of [4, 8])
    it(`draws the card with its body at the TV's reading size at 1920 × 1080 with ${seats} seats`, async () => {
      const reading = await shownOn(seats, { w: 1920, h: 1080 })
      const at = `${seats} seats at 1920 × 1080, card ${Math.round(reading.card.w)} px`
      expect({ at, reads: bodyOf(reading) >= SCREENS.tv.bodyPx.min }).toEqual({ at, reads: true })
    }, 60_000)

  // A 1280 × 800 window is a laptop in TV mode, not a set across a room: K26 puts it at the desk's
  // numbers, and the card is as tall as that window can hold.
  it('draws it at the desk’s reading size in a 1280 × 800 window', async () => {
    const reading = await shownOn(4, { w: 1280, h: 800 })
    const at = `1280 × 800, card ${Math.round(reading.card.w)} px`
    expect({ at, reads: bodyOf(reading) >= SCREENS.desk.bodyPx.max }).toEqual({ at, reads: true })
  }, 60_000)

  it('keeps the card over the felt and whole, and leaves the column where it was', async () => {
    for (const size of [
      { w: 1920, h: 1080 },
      { w: 1280, h: 800 },
    ]) {
      const reading = await shownOn(8, size)
      const at = `${size.w} × ${size.h}`
      expect({ at, overFelt: inside(reading.card, reading.felt), column: Math.round(reading.column.w) }).toEqual({ at, overFelt: true, column: 360 })
    }
  }, 60_000)
})
