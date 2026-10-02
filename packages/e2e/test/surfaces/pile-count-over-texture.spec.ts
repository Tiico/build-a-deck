import type { Browser, Page } from '@playwright/test'
import { join, type Table } from '../../support/api.js'
import { PHONE, SMALL_TV, TV, type Device } from '../../support/devices.js'
import { expect, test } from '../../support/test.js'

// The pile's count stands on its pile whatever state the card's picture is in (#669).
//
// A card's face is not an image until the render farm has made one (#10): until then it wears a
// waiting state, and if the render is lost it wears a failed one. Both are drawn over the image
// box, and both were drawn at `z-index: 1` — which does not stay inside the card. A pile is
// turned, so it is a stacking context of its own, and inside it the top card's state stood above
// the pile's count badge (K19, #76, #652), which has none. On the TV and on the observer's felt
// the count was gone for as long as the deck was rendering, and for good once a render failed:
// the one number a player reads off the draw pile.
//
// The answer is a hit test at the middle of the badge, which follows the same paint order the
// screen does and is blind to which font the machine has: CI's DejaVu and a Mac's SF Pro set the
// numerals differently, but the topmost element at a point is the topmost element. Each state is
// first proved to be on show — a hit test over a card with no state on it is green for ever.

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')

type State = 'pending' | 'failed' | 'ready'

/**
 * A screen on a table, with every card face held in the state asked for. The suite runs no render
 * worker, so a face waits by itself; a failed face is the server's 500 every time, played through
 * the client's whole ladder of retries on a fake clock; a ready face is a picture.
 */
async function screen(browser: Browser, baseURL: string | undefined, device: Device, url: string, state: State): Promise<Page> {
  const context = await browser.newContext({ viewport: device.viewport, ...(device.hasTouch ? { hasTouch: true } : {}), ...(device.isMobile ? { isMobile: true } : {}), ...(baseURL ? { baseURL } : {}) })
  const page = await context.newPage()
  if (state === 'failed') {
    await page.clock.install()
    await page.route('**/faces/**', (r) => r.fulfill({ status: 500, body: 'lost' }))
  }
  if (state === 'ready') await page.route('**/faces/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }))
  await page.goto(url)
  const pile = page.locator('.byd-pile[data-zone="draw"]')
  await expect(pile).toBeVisible()
  if (state === 'failed') {
    // Eight retries on growing pauses: run the clock until the face has given up, then let time
    // flow again so the camera settles the way it does on a real screen.
    await expect
      .poll(async () => {
        await page.clock.runFor(15_000)
        return pile.locator('.byd-pile-top [data-texture="failed"]').count()
      }, { timeout: 30_000 })
      .toBe(1)
    await page.clock.resume()
  }
  if (state === 'ready') await expect(pile.locator('.byd-pile-top img.byd-texture[data-state="ready"]')).toHaveCount(1)
  // Non-vacuity: the state this reading is about is the one the top card is in.
  await expect(pile.locator('.byd-pile-top [data-texture]')).toHaveCount(state === 'ready' ? 0 : 1)
  if (state !== 'ready') await expect(pile.locator(`.byd-pile-top [data-texture="${state}"]`)).toHaveCount(1)
  return page
}

type Reading = { count: string; hit: string; covers: boolean; message: { shown: boolean; hit: boolean; overlaps: boolean } }

// What is on top at the badge's middle, and whether the state's own words are still its own.
const read = (page: Page): Promise<Reading> =>
  page.locator('.byd-pile[data-zone="draw"]').evaluate((pile) => {
    const n = pile.querySelector<HTMLElement>('.byd-pile-n')!
    const b = n.getBoundingClientRect()
    const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
    const name = (el: Element | null) => (el ? `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}` : 'nothing')
    const state = pile.querySelector<HTMLElement>('.byd-pile-top [data-texture]')
    const words = state?.querySelector<HTMLElement>(':scope > i') ?? null
    const shown = !!words && getComputedStyle(words).display !== 'none'
    const w = words?.getBoundingClientRect()
    return {
      count: n.textContent ?? '',
      hit: name(top),
      covers: !!top && n.contains(top),
      message: {
        shown,
        hit: shown && !!w && !!state && state.contains(document.elementFromPoint(w.left + w.width / 2, w.top + w.height / 2)),
        overlaps: shown && !!w && w.left < b.right && b.left < w.right && w.top < b.bottom && b.top < w.bottom,
      },
    }
  })

async function tableOfFour(tableOf: (g: { players: number; cards: number }) => Promise<Table>) {
  return tableOf({ players: 4, cards: 24 })
}

const STATES: State[] = ['pending', 'failed', 'ready']

// A 4K television draws the card large enough to carry the state's words as well as its ground;
// the two smaller screens draw the ground alone. It is the one place the words and the badge are
// both on the same card, so it is where the words are proved to be still their own.
const UHD: Device = { name: 'uhd-tv', viewport: { width: 3840, height: 2160 } }

for (const device of [TV, SMALL_TV, UHD]) {
  test.describe(`the draw pile's count on the TV at ${device.viewport.width} × ${device.viewport.height} (#669)`, () => {
    for (const state of STATES) {
      test(`stands on the pile while its picture is ${state}`, async ({ browser, baseURL, tableOf }) => {
        const table = await tableOfFour(tableOf)
        const page = await screen(browser, baseURL, device, `${table.tvUrl}&lang=sv`, state)
        const now = await read(page)
        expect(now.count).toBe('24')
        expect({ hit: now.hit, covers: now.covers }).toEqual({ hit: now.hit, covers: true })
        // The state's own words are not given up for the badge: where the card is large enough to
        // carry them, they are on top at their own middle and nowhere under the badge.
        if (device === UHD && state !== 'ready') expect(now.message.shown, 'the 4K card carries the words').toBe(true)
        if (now.message.shown) expect(now.message).toEqual({ shown: true, hit: true, overlaps: false })
        await page.context().close()
      })
    }
  })
}

test.describe(`the draw pile's count on the observer's felt at ${PHONE.viewport.width} (#669)`, () => {
  for (const state of STATES) {
    test(`stands on the pile while its picture is ${state}`, async ({ browser, baseURL, tableOf, request }) => {
      const table = await tableOfFour(tableOf)
      const eva = await join(request, table, { name: 'Eva' })
      const page = await screen(browser, baseURL, PHONE, `${eva.observeUrl}&lang=sv`, state)
      const now = await read(page)
      expect(now.count).toBe('24')
      expect({ hit: now.hit, covers: now.covers }).toEqual({ hit: now.hit, covers: true })
      if (now.message.shown) expect(now.message).toEqual({ shown: true, hit: true, overlaps: false })
      await page.context().close()
    })
  }
})
