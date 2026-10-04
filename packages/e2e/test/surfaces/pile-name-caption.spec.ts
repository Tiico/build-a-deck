import type { APIRequestContext, Browser, Page } from '@playwright/test'
import { deckFromProject } from '@byd/server'
import { setupFromProject } from '@byd/server/doc'
import { join, tableOf as tableFrom, type Table } from '../../support/api.js'
import { PHONE, SMALL_TV, TV, type Device } from '../../support/devices.js'
import { mentions, watchWire, type Wire } from '../../support/frames.js'
import { gameDoc } from '../../support/game.js'
import { Host } from '../../support/host.js'
import { expect, test } from '../../support/test.js'

// While a pile's top card has no picture, its name stands under the pile (#771, K19).
//
// A card's face is not an image until the render farm has made one (#10). Until then the card
// wears a waiting state, and if the render is lost a failed one, and the state says the card's
// name in the middle of the card. On the TV-mode felts a pile's card is small — 28 × 39 px on the
// observer's phone at 390, 22 × 31 at 320, 47 × 65 on the room's television at 1280 — so that
// name was set at its 8 px floor and stood under the pile's count badge, which covers the card's
// upper half: two letters of «Grävling 1» were readable at 390, none at 320, and none on the
// television's discard pile at 1280.
//
// The name now stands as a caption under the pile's own name, in the felt's own label size, and
// only while the card has no picture. A face-down pile hides its card from the screen that reads
// it, so its caption can only say what the wire already said: on a player's or the room's screen
// a face-down draw pile has none, and its card's name is in neither the page nor the frames.
//
// What is asserted is rectangles and the topmost element at a point, not font pixels: the felt's
// font is shipped with the app (K20), but a measurement that holds by two pixels would still be a
// measurement of one machine (#95).

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')

type State = 'pending' | 'failed' | 'ready'

// The narrowest phone K26 names, as well as the width the felt was first measured unreadable at.
const SMALL_PHONE: Device = { name: 'small-phone', viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true }

// The two names the prototype was measured with: a short one, and the long one that has to fit
// whole at 320. With no shuffle the draw pile deals from its first row, so after three cards to
// the discard pile the fourth row is the draw pile's top and the third the discard pile's.
const SHORT = 'Grävling 1'
const LONG = 'Skogens väktare'

async function tableWithNames(request: APIRequestContext): Promise<{ table: Table; titles: string[] }> {
  const doc = gameDoc({ players: 4, cards: 24 })
  doc.rows[2]!.fields['title'] = LONG
  doc.rows[3]!.fields['title'] = SHORT
  const table = await tableFrom(request, setupFromProject(doc), deckFromProject(doc))
  return { table, titles: doc.rows.map((r) => String(r.fields['title'])) }
}

async function deal(baseURL: string, table: Table): Promise<void> {
  const dealer = await Host.open(baseURL, table)
  await dealer.send([{ v: 'deal', from: 'draw', to: ['discard'], each: 3, face: 'front' } as never])
  dealer.close()
}

/**
 * A screen on the table, with every card face held in the state asked for by answering `/faces`
 * the way the server does — said here rather than left to the suite having no render worker,
 * because the journeys that start one render this same deck into the same database (#669).
 */
async function screen(browser: Browser, baseURL: string | undefined, device: Device, url: string, state: State): Promise<{ page: Page; wire: Wire }> {
  const context = await browser.newContext({ viewport: device.viewport, ...(device.hasTouch ? { hasTouch: true } : {}), ...(device.isMobile ? { isMobile: true } : {}), ...(baseURL ? { baseURL } : {}) })
  const page = await context.newPage()
  const wire = watchWire(page)
  if (state === 'pending') await page.route('**/faces/**', (r) => r.fulfill({ status: 202, body: 'queued' }))
  if (state === 'failed') {
    await page.clock.install()
    await page.route('**/faces/**', (r) => r.fulfill({ status: 500, body: 'lost' }))
  }
  if (state === 'ready') await page.route('**/faces/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }))
  await page.goto(url)
  const discard = page.locator('.byd-pile[data-zone="discard"]')
  await expect(discard).toBeVisible()
  if (state === 'failed') {
    await expect
      .poll(async () => {
        await page.clock.runFor(15_000)
        return discard.locator('.byd-pile-top [data-texture="failed"]').count()
      }, { timeout: 30_000 })
      .toBe(1)
    await page.clock.resume()
  }
  // Non-vacuity: the state this reading is about is the one the top card is in.
  if (state === 'ready') await expect(discard.locator('.byd-pile-top img.byd-texture[data-state="ready"]')).toHaveCount(1)
  await expect(discard.locator('.byd-pile-top [data-texture]')).toHaveCount(state === 'ready' ? 0 : 1)
  // The camera glides to what is in play; a reading taken mid-glide reads a pile still moving.
  await page.waitForFunction(() => {
    const el = document.querySelector('.byd-pile[data-zone="discard"]')
    if (!el) return false
    const w = window as unknown as { __last?: string; __still?: number }
    const now = JSON.stringify(el.getBoundingClientRect())
    w.__still = now === w.__last ? (w.__still ?? 0) + 1 : 0
    w.__last = now
    return w.__still >= 5
  }, undefined, { polling: 100, timeout: 10_000 })
  return { page, wire }
}

type Caption = {
  /** Whether a caption is drawn under the pile at all. */
  shown: boolean
  text: string
  /** The caption's text is not cut: no ellipsis, nothing clipped by its own box. */
  whole: boolean
  px: number
  /** Points along the caption where something else is on top of it. */
  covered: string[]
  /** Other labels, badges and cards whose box meets the caption's. */
  meets: string[]
  /** Whether the caption lies wholly inside the window. */
  inside: boolean
  /** The card's own stand-in name, where it is still drawn on the card. */
  onCard: string | null
  /** The card's own stand-in name as the page holds it, drawn or not. */
  cardName: string | null
}

const read = (page: Page, zone: string): Promise<Caption> =>
  page.evaluate((zone) => {
    const pile = document.querySelector<HTMLElement>(`.byd-pile[data-zone="${zone}"]`)!
    const drawn = (el: Element) => {
      const cs = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0
    }
    const b = pile.querySelector<HTMLElement>('.byd-pile-top [data-texture] > b')
    const onCard = b && drawn(b) ? b.textContent : null
    const cap = pile.querySelector<HTMLElement>('.byd-pile-caption')
    if (!cap || !drawn(cap)) return { shown: false, text: '', whole: false, px: 0, covered: [], meets: [], inside: false, onCard, cardName: b?.textContent ?? null }
    const r = cap.getBoundingClientRect()
    const label = (el: Element) => `${el.closest('.byd-pile')?.getAttribute('data-zone') ?? ''} ${el.className || el.tagName}: ${(el.textContent ?? '').slice(0, 24)}`
    const meet = (o: DOMRect) => o.left < r.right - 0.5 && r.left < o.right - 0.5 && o.top < r.bottom - 0.5 && r.top < o.bottom - 0.5
    const others = [...document.querySelectorAll('.byd-pile-n, .byd-pile-name, .byd-pile-top, .byd-pile-caption, .byd-zone > span, .byd-zone, [data-seat-plate], .byd-seat-name, .byd-area-count, .byd-card, .byd-hand-fan > i')]
      .filter((el) => el !== cap && drawn(el))
    // A zone's own rectangle is the felt it stands on, not a label; only its name is.
    const meets = others.filter((el) => !el.classList.contains('byd-zone') && meet(el.getBoundingClientRect())).map(label)
    // The caption takes no pointer (it is a label over the felt, never a handle), so a hit test
    // finds what is beneath it. It is asked to take one for the reading and nothing else.
    const was = cap.style.pointerEvents
    cap.style.pointerEvents = 'auto'
    const covered: string[] = []
    for (const f of [0.08, 0.3, 0.5, 0.7, 0.92]) {
      const x = r.left + r.width * f
      const y = r.top + r.height / 2
      const top = document.elementFromPoint(x, y)
      if (!top || !cap.contains(top)) covered.push(`${Math.round(f * 100)}%: ${top ? label(top) : 'nothing'}`)
    }
    cap.style.pointerEvents = was
    return {
      shown: true,
      text: cap.textContent ?? '',
      whole: cap.scrollWidth <= cap.clientWidth,
      px: parseFloat(getComputedStyle(cap).fontSize),
      covered,
      meets,
      inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
      onCard,
      cardName: b?.textContent ?? null,
    }
  }, zone)

// A caption that reads: whole, on top along its length, clear of every other label and card, on
// the screen, and at least the floor the screen sets for all its text (K26).
function expectReadable(now: Caption, name: string, floor: number) {
  expect(now.shown, `a caption names the top card under ${name}`).toBe(true)
  expect(now.text).toBe(name)
  expect(now.whole, `«${now.text}» is whole`).toBe(true)
  expect(now.px).toBeGreaterThanOrEqual(floor)
  expect(now.covered, 'nothing is drawn over the caption').toEqual([])
  expect(now.meets, 'the caption meets no other label, badge or card').toEqual([])
  expect(now.inside, 'the caption is on the screen').toBe(true)
  // The name is said once: where the caption says it, the card does not say it a second time.
  expect(now.onCard, 'the card does not draw the name a second time').toBe(null)
}

const MISSING: State[] = ['pending', 'failed']

for (const device of [PHONE, SMALL_PHONE]) {
  test.describe(`the observer's felt at ${device.viewport.width} × ${device.viewport.height} (#771)`, () => {
    for (const state of MISSING) {
      test(`names both piles' top cards under the piles while their pictures are ${state}`, async ({ browser, baseURL, request }) => {
        const { table } = await tableWithNames(request)
        await deal(baseURL!, table)
        const eva = await join(request, table, { name: 'Eva' })
        const { page } = await screen(browser, baseURL, device, `${eva.observeUrl}&lang=sv`, state)
        // The observer sees everything (C8), the draw pile's top card included.
        expectReadable(await read(page, 'discard'), LONG, 12)
        expectReadable(await read(page, 'draw'), SHORT, 12)
        await page.context().close()
      })
    }
    test('draws no caption once the pictures are there', async ({ browser, baseURL, request }) => {
      const { table } = await tableWithNames(request)
      await deal(baseURL!, table)
      const eva = await join(request, table, { name: 'Eva' })
      const { page } = await screen(browser, baseURL, device, `${eva.observeUrl}&lang=sv`, 'ready')
      for (const zone of ['discard', 'draw']) expect((await read(page, zone)).shown, zone).toBe(false)
      await page.context().close()
    })
  })
}

for (const device of [SMALL_TV, TV]) {
  test.describe(`the room's television at ${device.viewport.width} × ${device.viewport.height} (#771)`, () => {
    for (const state of MISSING) {
      test(`names the discard pile's top card under the pile while its picture is ${state}, and never the face-down draw pile's`, async ({ browser, baseURL, request }) => {
        const { table, titles } = await tableWithNames(request)
        await deal(baseURL!, table)
        const { page, wire } = await screen(browser, baseURL, device, `${table.tvUrl}&lang=sv`, state)
        // The room reads its television from three metres, so the floor is K26's 24 px.
        expectReadable(await read(page, 'discard'), LONG, 24)

        // The draw pile is face down and the room may not know its top card (K15): no caption, and
        // no name anywhere in the page or on the wire. The discard pile's top card proves the
        // search can find a name where one was sent, so the absence below is not a blind search.
        const draw = await read(page, 'draw')
        expect(draw.shown, 'a face-down pile names nothing').toBe(false)
        expect(draw.cardName, 'the face-down card carries no name on the card either').toBe(null)
        expect(mentions(wire.received(), LONG), 'the discard pile’s top card was sent').not.toHaveLength(0)
        const text = await page.evaluate(() => document.body.innerText + document.body.textContent)
        expect(text).toContain(LONG)
        const hidden = titles.slice(3)
        for (const name of hidden) {
          expect(text.includes(name), `the room's screen shows ${name}, which lies face down in the draw pile`).toBe(false)
          expect(mentions(wire.received(), name), `the room's screen was sent ${name}, which lies face down in the draw pile`).toHaveLength(0)
        }
        await page.context().close()
      })
    }
    test('draws no caption once the picture is there', async ({ browser, baseURL, request }) => {
      const { table } = await tableWithNames(request)
      await deal(baseURL!, table)
      const { page } = await screen(browser, baseURL, device, `${table.tvUrl}&lang=sv`, 'ready')
      for (const zone of ['discard', 'draw']) expect((await read(page, zone)).shown, zone).toBe(false)
      await page.context().close()
    })
  })
}
