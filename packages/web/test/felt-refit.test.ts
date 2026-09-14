// The felt follows the window (K9, #75).
//
// #64 made the fit a measured rule: the felt is as large as the frame holds, its wood standing at
// least `LEAST_AIR_PX` inside the frame once the tilt is taken out. A rule that is only applied
// the moment the page loads is not that rule: a laptop docked to a screen, a window dragged
// sideways, a tablet turned over would all keep the scale they loaded with, and the felt would be
// either needlessly small or past its own frame.
//
// The renderer refits through a `ResizeObserver` on its own frame, and that is the one thing
// about the fit no test had ever seen run: jsdom has no `ResizeObserver` and lays nothing out, so
// every other reading of the felt is of a scale handed in, or of markup set into a page where
// nothing is alive to refit it. #75 reports the felt keeping its scale after a `resize` was sent;
// an observer delivers at the browser's next rendering step and not inside the event, so a
// reading taken in that same instant is of the frame before. This is the reading that settles
// it: the built app opened in real Chromium against a real session, the way a person meets it,
// with the window changed under it and no reload, on every surface that fits a felt to a frame.
import { createServer, type Server } from 'node:http'
import { readFileSync, rmSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { build } from 'vite'
import { chromium, type Browser, type Page } from 'playwright'
import { CARD_STANDARD_63x88, type SetupDef } from '@byd/engine'
import { LEAST_AIR_PX } from '../src/table/fit.js'
import { admit, createSession, roomOf, startServer, type Running } from './fixture.js'

const WEB = join(import.meta.dirname, '..')
const OUT = join(WEB, 'dist-felt-refit-test')
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }

// A table big enough that no window below asks for it at life size — the rule's other half, and
// the one that would make every reading here a 1 (K9). The felt's box is drawn at
// `floor.w × scale`, so the scale the page ended up with is read straight off its width.
const FLOOR_MM = { x: -800, y: -500, w: 1600, h: 1000 }
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

let browser: Browser
let run: Running
let server: Server
let origin: string
let sessionId: string
beforeAll(async () => {
  await build({ root: WEB, logLevel: 'silent', build: { outDir: OUT, emptyOutDir: true } })
  browser = await chromium.launch()
  run = await startServer()
  sessionId = await createSession(run, 'refit', undefined, bigSetup())
  // The built app, served the way it is served: every route is the one page.
  server = createServer((req, res) => {
    const path = normalize(new URL(req.url ?? '/', 'http://x').pathname).replace(/^(\.\.[/\\])+/, '')
    const file = join(OUT, extname(path) ? path : 'index.html')
    try {
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file))
    } catch {
      res.writeHead(404).end()
    }
  })
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok))
  const at = server.address()
  origin = `http://127.0.0.1:${typeof at === 'object' && at ? at.port : 0}`
}, 600_000)
afterAll(async () => {
  await browser.close()
  await run.stop()
  await new Promise<void>((ok) => server.close(() => ok()))
  rmSync(OUT, { recursive: true, force: true })
}, 60_000)

type Reading = { scale: number; air: number }

// What the page has drawn: the scale it gave the felt, and the least air between the table and
// the edge of the frame it stands in, measured on what each mode's rule measures. In table mode
// that is the wood, rim and tilt and all, since `feltScale` projects the wood's corners; on a TV
// the wood has no rim and `fitScale` keeps the air from the felt's own millimetres — the one-pixel
// line the TV draws around them stands in the air, as the rim does.
const read = (page: Page): Promise<Reading> =>
  page.evaluate((floorW) => {
    const felt = document.querySelector<HTMLElement>('[data-table]')!
    const frame = document.querySelector<HTMLElement>('.byd-table-frame')!
    const f = frame.getBoundingClientRect()
    const table = frame.dataset['mode'] === 'table'
    const b = (table ? document.querySelector('.byd-table-wood')! : felt).getBoundingClientRect()
    const line = table ? { x: 0, y: 0 } : { x: felt.clientLeft, y: felt.clientTop }
    const scale = parseFloat(felt.style.width) / floorW
    const air = Math.min(b.left + line.x - f.left, b.top + line.y - f.top, f.right - (b.right - line.x), f.bottom - (b.bottom - line.y))
    return { scale: Math.round(scale * 1000) / 1000, air: Math.round(air * 10) / 10 }
  }, FLOOR_MM.w)

// The reading once the page has stopped moving: the same answer twice, a rendering step apart.
// An observer delivers at the browser's next rendering step, not inside the event that changed
// the window, so a reading taken in that same instant is a reading of the frame before — which
// is the reading #75 was raised on.
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

// The page as its person opens it: the host with the key, a seat and an observer with the token
// each was admitted on once — a token holds its seat, so a page that comes back is the same
// person and not a second one.
const tokens: Partial<Record<Surface, string>> = {}
async function urlOf(surface: Surface): Promise<string> {
  const q = { server: run.url, session: sessionId }
  if (surface === '/table') return `${origin}/table?${new URLSearchParams({ ...q, host: roomOf(sessionId).hostKey })}`
  if (surface === '/online') return `${origin}/online?${new URLSearchParams({ ...q, seat: 'A', name: 'Ada', token: (tokens[surface] ??= await admit(run, sessionId, 'A', 'Ada')) })}`
  return `${origin}/observe?${new URLSearchParams({ ...q, name: 'Eva', token: (tokens[surface] ??= await admit(run, sessionId, null, 'Eva')) })}`
}

// The surface at `size`, with its felt measured and painted.
async function open(surface: Surface, size: Size): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: size.w, height: size.h } })
  await page.goto(await urlOf(surface), { waitUntil: 'load' })
  await page.waitForSelector('.byd-table-frame:not([style*="hidden"]) [data-table]')
  await settled(page)
  return page
}

// What a fresh load at `size` draws: the rule as it stands at load, which is the rule a resize
// has to arrive at.
async function fresh(surface: Surface, size: Size): Promise<Reading> {
  const page = await open(surface, size)
  try {
    return await read(page)
  } finally {
    await page.close()
  }
}

// The window changed under the page, and what the page settled on; nothing is reloaded.
async function resized(page: Page, size: Size): Promise<Reading> {
  await page.setViewportSize({ width: size.w, height: size.h })
  return settled(page)
}

describe.each(SURFACES)('the felt on %s follows the window (K9, #75)', (surface) => {
  it('refits when the window grows — to what a fresh load at that size gets, air and all', async () => {
    const loaded = await fresh(surface, SCREEN)
    const page = await open(surface, LAPTOP)
    try {
      const before = await read(page)
      expect(before.air).toBeGreaterThanOrEqual(LEAST_AIR_PX - 0.5)
      // The reading is not vacuous: a bigger window is a bigger table…
      expect(loaded.scale).toBeGreaterThan(before.scale)
      // …and it is the same rule as on load, not a rule of its own.
      expect(await resized(page, SCREEN)).toEqual(loaded)
    } finally {
      await page.close()
    }
  }, 60_000)

  it('refits when the window shrinks, so the wood never goes past its frame', async () => {
    const page = await open(surface, LAPTOP)
    try {
      const before = await read(page)
      const after = await resized(page, SMALL)
      expect(after.scale).toBeLessThan(before.scale)
      expect(after.air).toBeGreaterThanOrEqual(LEAST_AIR_PX - 0.5)
    } finally {
      await page.close()
    }
  }, 60_000)
})

// A window being dragged is a stream of sizes, not one. The observer the frame is watched with
// delivers once per rendering step whatever the stream did in between, so what has to hold is
// only that the last size wins and that the rule is kept at it.
describe('a window dragged through many sizes (K9, #75)', () => {
  it('ends on the fit for the size it stopped at', async () => {
    const loaded = await fresh('/table', SMALL)
    const page = await open('/table', SCREEN)
    try {
      const before = await read(page)
      for (let i = 1; i <= 8; i++) await page.setViewportSize({ width: SCREEN.w - Math.round(((SCREEN.w - SMALL.w) * i) / 9), height: SCREEN.h - Math.round(((SCREEN.h - SMALL.h) * i) / 9) })
      const after = await resized(page, SMALL)
      expect(after.scale).toBeLessThan(before.scale)
      expect(after).toEqual(loaded)
    } finally {
      await page.close()
    }
  }, 60_000)
})
