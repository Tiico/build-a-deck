import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser } from 'playwright'

// What the hand may take hold of on the felt (K14), measured in an engine that knows what a
// finger does. Two properties carry it and neither can be read in jsdom: `touch-action: none` is
// the difference between dragging the thing under the finger and scrolling the page out from
// under it, and the lift while something is dragged is the difference between carrying a thing
// over the table and shoving it along underneath what is already lying there.
const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')

// A felt that can be played on, and beside it one that is only being shown — the editor's Bord
// tab and the TV nobody sits at. Nothing on the second may answer a finger at all.
const THINGS = `
  <div class="byd-table-frame" data-mode="tv" data-playable="true">
    <div data-table>
      <div class="byd-zone" data-area="table"><span>Spelyta</span></div>
      <div class="byd-card" data-component="c1"></div>
      <div class="byd-card" data-component="c2" data-dragging="true"></div>
      <div class="byd-token" data-counter-token="k1"><b>20</b></div>
      <div class="byd-token" data-counter-token="k2" data-dragging="true"><b>20</b></div>
    </div>
  </div>
  <div class="byd-table-frame" data-mode="tv">
    <div data-table><div class="byd-token" data-counter-token="k3"><b>20</b></div></div>
  </div>`

const SEEN = {
  'a zone on a playable felt': '[data-playable] .byd-zone',
  'a card on a playable felt': '[data-playable] [data-component="c1"]',
  'a card being dragged': '[data-playable] [data-component="c2"]',
  'a chip on a playable felt': '[data-playable] [data-counter-token="k1"]',
  'a chip being dragged': '[data-playable] [data-counter-token="k2"]',
  'a chip on a felt that is only shown': '.byd-table-frame:not([data-playable]) [data-counter-token="k3"]',
} as const

let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser.close()
}, 60_000)

type Grab = { touchAction: string; zIndex: string; cursor: string }

async function measure(): Promise<Record<string, Grab>> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  try {
    const shell = read('index.html')
      .replace('<script type="module" src="/src/main.tsx"></script>', '')
      // The felt is a room of the button language (L13, #90), so the shared sheet goes over its
      // own the way it does on the page itself: what is measured here is the cascade that ships.
      .replace('</head>', `<style>${read('src/table/table.css')}\n${read('src/buttons.css')}</style></head>`)
      .replace('<div id="root"></div>', `<div id="root">${THINGS}</div>`)
    await page.setContent(shell, { waitUntil: 'load' })
    return await page.evaluate((seen) => {
      return Object.fromEntries(
        seen.map(([name, selector]) => {
          const style = getComputedStyle(document.querySelector(selector)!)
          return [name, { touchAction: style.touchAction, zIndex: style.zIndex, cursor: style.cursor }]
        }),
      )
    }, Object.entries(SEEN))
  } finally {
    await page.close()
  }
}

describe('what a finger can take hold of on the felt (K14, #73)', () => {
  it('answers a finger on a chip as it does on a card, and lets the page scroll everywhere else', async () => {
    const seen = await measure()
    expect(seen['a chip on a playable felt']).toEqual({ touchAction: 'none', zIndex: 'auto', cursor: 'grab' })
    expect(seen['a card on a playable felt']).toEqual({ touchAction: 'none', zIndex: 'auto', cursor: 'grab' })
    // The controls: the felt itself is not a thing to be carried, and a table that is only being
    // shown has no hand at all — so `none` above is this rule and not the page's default.
    expect(seen['a zone on a playable felt']?.touchAction).toBe('auto')
    expect(seen['a chip on a felt that is only shown']).toEqual({ touchAction: 'auto', zIndex: 'auto', cursor: 'auto' })
  }, 60_000)

  it('lifts a chip over the felt while it is carried, as high as a card goes', async () => {
    const seen = await measure()
    expect(seen['a chip being dragged']?.zIndex).toBe(seen['a card being dragged']?.zIndex)
    // And the control: the lift is what being dragged does, not something every chip has.
    expect(seen['a chip being dragged']?.zIndex).not.toBe(seen['a chip on a playable felt']?.zIndex)
  }, 60_000)
})
