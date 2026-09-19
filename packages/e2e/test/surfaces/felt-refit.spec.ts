import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { CARD_STANDARD_63x88, type SetupDef } from '@byd/engine'
import { TV_AIR_PX, WOOD_AIR_PX } from '../../../web/src/table/fit.js'
import { join, tableOf, type Table } from '../../support/api.js'

// The felt follows the window (K9, #75).
//
// #64 made the fit a measured rule: the felt is as large as the frame holds, its wood standing at
// least `WOOD_AIR_PX` inside the frame once the tilt is taken out. A rule that is only applied the
// moment the page loads is not that rule: a laptop docked to a screen, a window dragged sideways,
// a tablet turned over would all keep the scale they loaded with, and the felt would be either
// needlessly small or past its own frame.
//
// The renderer refits through a `ResizeObserver` on its own frame, and that is the one thing about
// the fit no test had ever seen run: jsdom has no `ResizeObserver` and lays nothing out, so every
// other reading of the felt is of a scale handed in, or of markup set into a page where nothing is
// alive to refit it. An observer delivers at the browser's next rendering step and not inside the
// event, so a reading taken in that same instant is of the frame before — which is the reading
// #75 was raised on.
//
// Migrated from `packages/web/test/felt-refit.test.ts`. That file already did this properly: it
// built the app, served it over http, and opened the real routes in real Chromium. It simply had
// to build its own stack to do it — a Vite build, a static server and an in-process API, some two
// hundred lines of scaffolding before the first measurement. All of that is what `packages/e2e`
// already stands up, so the migration is almost entirely deletion.
const FLOOR_MM = { x: -800, y: -500, w: 1600, h: 1000 }

// A table big enough that no window below asks for it at life size — the rule's other half, and
// the one that would make every reading here a 1 (K9). The felt's box is drawn at
// `floor.w × scale`, so the scale the page ended up with is read straight off its width.
function bigSetup(): SetupDef {
  const rect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h, rot: 0 })
  return {
    seats: ['A', 'B'],
    floor: 'table',
    zones: [
      { id: 'draw', kind: 'pile', name: 'Draghög', visibility: 'none', geometry: rect(-200, 0, 0, 0) },
      { id: 'table', kind: 'area', name: 'Spelyta', visibility: 'all', geometry: rect(FLOOR_MM.x, FLOOR_MM.y, FLOOR_MM.w, FLOOR_MM.h) },
      { id: 'hand:A', kind: 'hand', name: 'Hand', visibility: 'owner', owner: 'A', returnTo: 'draw', geometry: rect(-300, 380, 600, 100) },
      { id: 'hand:B', kind: 'hand', name: 'Hand', visibility: 'owner', owner: 'B', returnTo: 'draw', geometry: rect(-300, -480, 600, 100) },
    ],
    components: Array.from({ length: 10 }, (_, i) => ({ type: { id: CARD_STANDARD_63x88.id, version: 1 }, cardRef: `Kort ${i}`, zone: 'draw', face: 'back' as const })),
  }
}

type Size = { w: number; h: number }
const LAPTOP: Size = { w: 1280, h: 800 }
const SCREEN: Size = { w: 1920, h: 1080 }
const SMALL: Size = { w: 1024, h: 640 }

// The surfaces that fit a felt to a frame: the host's table, a seat's own window (C5) and the
// observer's. The TV (`mode=tv`) is not among them: there the camera frames what is in play (C5),
// so its scale is the camera's and the air is not a rule it keeps.
const SURFACES = ['/table', '/online', '/observe'] as const
type Surface = (typeof SURFACES)[number]

// Each mode leaves the air its own furniture needs (#76): the wood on the dark takes its share of
// the room, the TV leaves only what a hand's count hangs out into.
const airOf = (surface: Surface) => (surface === '/observe' ? TV_AIR_PX : WOOD_AIR_PX)

type Reading = { scale: number; air: number }

// What the page has drawn: the scale it gave the felt, and the least air between the table and the
// edge of the frame it stands in, measured on what each mode's rule measures. In table mode that
// is the wood, rim and tilt and all, since `feltScale` projects the wood's corners; on a TV the
// wood has no rim and `fitScale` keeps the air from the felt's own millimetres — the one-pixel
// line the TV draws around them stands in the air, as the rim does.
const read = (page: Page): Promise<Reading> =>
  page.evaluate((floorW) => {
    const felt = document.querySelector<HTMLElement>('[data-table]')
    const frame = document.querySelector<HTMLElement>('.byd-table-frame')
    if (!felt || !frame) throw new Error('there is no felt in a frame here to measure')
    const f = frame.getBoundingClientRect()
    const table = frame.dataset['mode'] === 'table'
    const b = (table ? document.querySelector('.byd-table-wood')! : felt).getBoundingClientRect()
    const line = table ? { x: 0, y: 0 } : { x: felt.clientLeft, y: felt.clientTop }
    const scale = parseFloat(felt.style.width) / floorW
    const air = Math.min(b.left + line.x - f.left, b.top + line.y - f.top, f.right - (b.right - line.x), f.bottom - (b.bottom - line.y))
    return { scale: Math.round(scale * 1000) / 1000, air: Math.round(air * 10) / 10 }
  }, FLOOR_MM.w)

// The reading once the page has stopped moving: the same answer twice, a rendering step apart.
async function settled(page: Page): Promise<Reading> {
  let last = await read(page)
  for (let i = 0; i < 50; i++) {
    await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => setTimeout(ok, 0))))
    const now = await read(page)
    if (now.scale === last.scale && now.air === last.air) return now
    last = now
  }
  throw new Error(`the felt never settled: ${JSON.stringify(last)}`)
}

// The three addresses onto one table: the host with the key, a seat and an observer with the
// token each was admitted on. A table of its own per test rather than one for the file — every
// reading here is of a room at different window sizes, and which room it is does not matter, so
// there is nothing to be gained by sharing one and a shared fixture is one more thing that can go
// wrong between two tests.
async function room(request: import('@playwright/test').APIRequestContext): Promise<Record<Surface, string>> {
  const table: Table = await tableOf(request, bigSetup())
  const seat = await join(request, table, { name: 'Ada', seat: 'A' })
  const watcher = await join(request, table, { name: 'Eva' })
  return { '/table': table.tableUrl, '/online': seat.onlineUrl, '/observe': watcher.observeUrl }
}

/** The surface at `size`, with its felt measured and painted. */
async function open(page: Page, urls: Record<Surface, string>, surface: Surface, size: Size): Promise<void> {
  await page.setViewportSize({ width: size.w, height: size.h })
  await page.goto(urls[surface], { waitUntil: 'load' })
  await page.waitForSelector('.byd-table-frame:not([style*="hidden"]) [data-table]')
  await settled(page)
}

test.describe('the felt follows the window (K9, #75)', () => {

  for (const surface of SURFACES) {
    test(`refits on ${surface} when the window grows — to what a fresh load at that size gets, air and all`, async ({ page, request }) => {
      const urls = await room(request)
      // What a fresh load at that size draws: the rule as it stands at load, which is the rule a
      // resize has to arrive at.
      await open(page, urls, surface, SCREEN)
      const loaded = await read(page)

      await open(page, urls, surface, LAPTOP)
      const before = await read(page)
      expect(before.air).toBeGreaterThanOrEqual(airOf(surface) - 0.5)
      // The reading is not vacuous: a bigger window is a bigger table…
      expect(loaded.scale).toBeGreaterThan(before.scale)
      // …and it is the same rule as on load, not a rule of its own. Nothing is reloaded here.
      await page.setViewportSize({ width: SCREEN.w, height: SCREEN.h })
      expect(await settled(page)).toEqual(loaded)
    })

    test(`refits on ${surface} when the window shrinks, so the wood never goes past its frame`, async ({ page, request }) => {
      const urls = await room(request)
      await open(page, urls, surface, LAPTOP)
      const before = await read(page)
      await page.setViewportSize({ width: SMALL.w, height: SMALL.h })
      const after = await settled(page)
      expect(after.scale).toBeLessThan(before.scale)
      expect(after.air).toBeGreaterThanOrEqual(airOf(surface) - 0.5)
    })
  }

  // A window being dragged is a stream of sizes, not one. The observer the frame is watched with
  // delivers once per rendering step whatever the stream did in between, so what has to hold is
  // only that the last size wins and that the rule is kept at it.
  test('ends on the fit for the size a dragged window stopped at', async ({ page, request }) => {
    const urls = await room(request)
    await open(page, urls, '/table', SMALL)
    const loaded = await read(page)

    await open(page, urls, '/table', SCREEN)
    const before = await read(page)
    for (let i = 1; i <= 8; i++)
      await page.setViewportSize({
        width: SCREEN.w - Math.round(((SCREEN.w - SMALL.w) * i) / 9),
        height: SCREEN.h - Math.round(((SCREEN.h - SMALL.h) * i) / 9),
      })
    await page.setViewportSize({ width: SMALL.w, height: SMALL.h })
    const after = await settled(page)
    expect(after.scale).toBeLessThan(before.scale)
    expect(after).toEqual(loaded)
  })
})
