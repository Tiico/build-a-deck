// @vitest-environment jsdom
// The fan is written in the card's own measure and never in pixels (L35, #326): a pile on the
// TV is as large as the camera makes it, so the fan has to be the same fraction of the card on
// a 1080p screen and on a 4K one. That is a claim about a layout engine and the stylesheet the
// felt ships, so it is asked of Chromium against `table.css`, mid-animation, at both sizes.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { chromium, type Browser, type Page } from 'playwright'
import type { ReactElement } from 'react'
import { TableRenderer } from '../src/table/TableRenderer.js'
import { TvChrome } from '../src/table/TvChrome.js'
import { SHUFFLE_MS } from '../src/table/shuffle.js'
import { FELT_FONT, feltOf, sceneOf, sheet } from './felt-labels.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
// The felt is a room of the button language (L13), so the shared sheet goes over it here as on
// the page itself; `button-language.test.tsx` holds every measuring suite to that.
const SHEETS = [FELT_FONT, 'src/table/table.css', 'src/table/texture.css', 'src/buttons.css', 'src/a11y.css']

let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser.close()
}, 60_000)

function markupOf(node: ReactElement): string {
  const { container, unmount } = render(node)
  const html = container.innerHTML
  unmount()
  return html
}

async function onPage<T>(html: string, size: { w: number; h: number }, look: (page: Page) => Promise<T>): Promise<T> {
  const page = await browser.newPage({ viewport: { width: size.w, height: size.h } })
  try {
    const shell = read('index.html')
      .replace('<script type="module" src="/src/main.tsx"></script>', '')
      .replace('</head>', `<style>${SHEETS.map(sheet).join('\n')}</style></head>`)
      .replace('<div id="root"></div>', `<div id="root" style="width:${size.w}px;height:${size.h}px">${html}</div>`)
    await page.setContent(shell, { waitUntil: 'load' })
    return await look(page)
  } finally {
    await page.close()
  }
}

const tv = (body: ReactElement) => (
  <TvChrome view={sceneOf(feltOf(2))} activity={[]} roomCode="KX7P" title="Blandningen" version="rev-1">
    {body}
  </TvChrome>
)

// The TV's felt at a size, with the draw pile mid-shuffle: the markup the renderer produces for
// a `shuffles` entry, which is what a live line turns into.
async function fanning(size: { w: number; h: number }): Promise<string> {
  const main = await onPage(markupOf(tv(<div />)), size, (page) =>
    page.evaluate(() => {
      const r = document.querySelector('[data-tv] > main')!.getBoundingClientRect()
      return { w: Math.round(r.width), h: Math.round(r.height) }
    }),
  )
  return markupOf(tv(<TableRenderer view={sceneOf(feltOf(2))} mode="tv" camera size={main} glideMs={0} shuffles={[{ pile: 'draw', seq: 7 }]} />))
}

type Spread = { card: number; reach: number; turned: number; frames: number }

// The fan at its widest, read off the page with the animation held there. `reach` is how far the
// outermost back's centre has travelled from the pile's, in card widths; `turned` is how far the
// same back's box has grown, which is what its rotation does to it.
const AT_WIDEST = 0.34
async function spreadOf(page: Page): Promise<Spread> {
  return page.evaluate(
    async ({ at, ms }) => {
      const animations = document.getAnimations()
      for (const a of animations) {
        a.pause()
        a.currentTime = at * ms
      }
      await new Promise((r) => requestAnimationFrame(() => r(undefined)))
      const top = document.querySelector('[data-zone="draw"] .byd-pile-top')!.getBoundingClientRect()
      const fans = Array.from(document.querySelectorAll('[data-zone="draw"] .byd-pile-fan-card'), (el) => el.getBoundingClientRect())
      const centre = (r: DOMRect) => r.left + r.width / 2
      const reach = Math.max(...fans.map((r) => Math.abs(centre(r) - centre(top))))
      const turned = Math.max(...fans.map((r) => r.width)) - top.width
      return { card: top.width, reach: reach / top.width, turned: turned / top.width, frames: animations.length }
    },
    { at: AT_WIDEST, ms: SHUFFLE_MS },
  )
}

describe('the fan is the same fraction of the card on every screen (L35)', () => {
  const HD = { w: 1920, h: 1080 }
  const UHD = { w: 3840, h: 2160 }

  it('reaches as far, in card widths, at 3840 × 2160 as at 1920 × 1080', async () => {
    const hd = await onPage(await fanning(HD), HD, spreadOf)
    const uhd = await onPage(await fanning(UHD), UHD, spreadOf)
    // The card itself is drawn about twice as large on the larger screen: without that, equal
    // fractions would be equal pixels and the test would prove nothing.
    expect(uhd.card / hd.card).toBeGreaterThan(1.8)
    // Four fanned backs, each with its own animation, on both.
    expect(hd.frames).toBe(4)
    expect(uhd.frames).toBe(4)
    // The outermost back reaches 27 % of the card's width out at the widest: a fan somebody five
    // metres from the TV can see, and the same fan on either screen.
    expect(hd.reach).toBeGreaterThan(0.2)
    expect(Math.abs(uhd.reach - hd.reach)).toBeLessThan(0.02)
    expect(Math.abs(uhd.turned - hd.turned)).toBeLessThan(0.02)
  }, 60_000)
})
