import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { CARD_STANDARD_63x88, type SetupDef } from '@byd/engine'
import { join, tableOf } from '../../support/api.js'
import { Host } from '../../support/host.js'

// What `/online` shows a player holding a phone (C2's revision of 2026-09-16, #99).
//
// The felt used to be drawn there whatever the screen. A whole four-seat table on a phone put the
// cards at 16–20 px on their short side — K9's floor for something dragged and pressed is 45 — and
// #77 measured three ways of laying it out before establishing that the best any of them reached
// was 23. The cause is the count of things on the felt and not how they are drawn, so the answer
// is not a better layout: the phone is the player's control and not the board. The board is the TV
// in the room, or a screen wide enough to carry it.
//
// So this is the gate K17 went without: whether a felt is drawn at all at a phone's size, and
// whether the hand there is the strip K10 gives a phone. Presence is a question about the
// document, but the sideways scroll under it is a question only an engine with the real box model
// can answer — and a surface that fits by hiding what runs past the edge fits nothing.
//
// Migrated from `packages/web/test/online-phone.test.tsx`. That version mounted `OnlinePage` in
// jsdom, lifted the markup and pasted eight stylesheets around it. This opens `/online` at each
// size. Which surface the route hands over is decided in JavaScript from the window's own
// measurements (`BOARD_FLOOR`), so a mounted component is only ever answering about the size the
// test told it — and here the window is the size, which is the whole question.
const PHONE = { width: 390, height: 844 }
const DESK = { width: 1280, height: 800 }

const CARD = { id: CARD_STANDARD_63x88.id, version: 1 }
const rect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h, rot: 0 })
const point = (x: number, y: number) => ({ x, y, w: 0, h: 0, rot: 0 })

// The table #99 was measured on: four seats, four hands, the two piles. It is the wizard's own
// opening table, and the reason a phone cannot hold it.
function fourSeatSetup(): SetupDef {
  return {
    seats: ['A', 'B', 'C', 'D'],
    floor: 'table',
    zones: [
      { id: 'draw', kind: 'pile', name: 'Draghög', visibility: 'none', geometry: point(-200, 0) },
      { id: 'discard', kind: 'pile', name: 'Kasthög', visibility: 'all', geometry: point(200, 0) },
      { id: 'table', kind: 'area', name: 'Spelyta', visibility: 'all', geometry: rect(-500, -300, 1000, 600) },
      { id: 'hand:A', kind: 'hand', name: 'Hand', visibility: 'owner', owner: 'A', returnTo: 'draw', geometry: rect(-300, 320, 600, 100) },
      { id: 'hand:B', kind: 'hand', name: 'Hand', visibility: 'owner', owner: 'B', returnTo: 'draw', geometry: rect(-300, -420, 600, 100) },
      { id: 'hand:C', kind: 'hand', name: 'Hand', visibility: 'owner', owner: 'C', returnTo: 'draw', geometry: rect(-600, -150, 100, 300) },
      { id: 'hand:D', kind: 'hand', name: 'Hand', visibility: 'owner', owner: 'D', returnTo: 'draw', geometry: rect(500, -150, 100, 300) },
      { id: 'mine:A', kind: 'area', name: 'Framför A', visibility: 'owner', owner: 'A', geometry: rect(-300, 220, 380, 90) },
    ],
    components: Array.from({ length: 20 }, (_, i) => ({ type: CARD, cardRef: `Kort ${i}`, zone: 'draw', face: 'back' as const })),
  }
}

// What a surface is made of, counted rather than described: a felt, the fan or the column the wide
// screens give a hand, and the strip a phone gives it.
const made = (page: Page) =>
  page.evaluate(() => ({
    felts: document.querySelectorAll('[data-table]').length,
    // The column a landscape window stands a hand in carries `data-hand-fan` too — it is the same
    // hand in another shape — so the fan proper is the one that is not a column.
    fans: document.querySelectorAll('[data-hand-fan]:not([data-hand-column])').length,
    columns: document.querySelectorAll('[data-hand-column]').length,
    strips: document.querySelectorAll('.byd-strip[data-hand]').length,
    cards: document.querySelectorAll('.byd-strip[data-hand] [data-hand-card]').length,
    sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }))

/** A seat at the four-seat table, holding five cards, open at this window's size. */
async function seated(page: Page, request: import('@playwright/test').APIRequestContext, baseURL: string): Promise<void> {
  const table = await tableOf(request, fourSeatSetup())
  const host = await Host.open(baseURL, table)
  try {
    await host.send([{ v: 'draw', from: 'draw', to: 'hand:A', count: 5 }])
  } finally {
    host.close()
  }
  const seat = await join(request, table, { name: 'Ada', seat: 'A' })
  await page.goto(seat.onlineUrl)
  await expect(page.locator('[data-page="online"], [data-page="player"]')).toBeVisible()
}

test.describe(`a player at ${PHONE.width} × ${PHONE.height}`, () => {
  test.use({ viewport: PHONE })
  test('is given the controls and not the board: no felt, and the hand as the strip', async ({ page, request, baseURL }) => {
    await seated(page, request, baseURL!)
    // The five cards are counted as well as the strip, so a strip that arrived empty — or a
    // selector that stopped matching — cannot report a clean surface.
    await expect.poll(async () => (await made(page)).cards, { message: 'the five cards reach the strip' }).toBe(5)
    expect(await made(page)).toEqual({ felts: 0, fans: 0, columns: 0, strips: 1, cards: 5, sideways: 0 })
  })
})

test.describe(`a player at ${DESK.width} × ${DESK.height}`, () => {
  test.use({ viewport: DESK })
  test('still gets the board and its own hand in one window, as C2 has it', async ({ page, request, baseURL }) => {
    await seated(page, request, baseURL!)
    // A landscape window puts the hand in a column at the window's inline end (#77), beside a felt
    // that keeps the height. None of that is #99's to change.
    await expect.poll(async () => (await made(page)).felts, { message: 'the felt is drawn' }).toBe(1)
    expect(await made(page)).toEqual({ felts: 1, fans: 0, columns: 1, strips: 0, cards: 0, sideways: 0 })
  })
})
