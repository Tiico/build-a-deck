// A card on the TV is read from the sofa, not from the pointer (C, C5, K8).
//
// The TV's inspection panel holds one card up large for the room, and pointing at a card is what
// fills it. That is a good way in and a bad requirement: nobody wants to keep a pointer moving
// across a screen everyone else is watching. So the felt has to carry a card that can be told
// apart on its own, and this is the measurement that says whether it does.
//
// The measurement, taken on the built app in Chromium against a real four-seat table at
// 1920 x 1080 before any of this was changed: a card measured 68.2 x 95.3 px on the felt. Its
// texture is 372 x 520 px — the face is rendered at 150 dpi (`TEXTURE_DPI`), which is five and a
// half times the detail the screen shows — so sharpness was never what was missing, and a texture
// rendered at the size it is drawn came out measurably worse than the browser's own reduction of
// the large one. What was missing was room.
//
// And the room was being spent above and below the felt. TV mode laid its chrome out in three
// grid rows — a 64 px header, the felt, a 150 px seat dock — while the felt inside them is bound
// by height and not by width: 800 mm of felt into 866 px of frame is 1.08 px/mm, and the 340 px
// side column cost the felt nothing at all, because the width was never the binding side. Giving
// the felt the window's whole height and moving what stood in those two rows into the column
// beside it takes the same card to 82 px, and takes nothing off the screen.
//
// Eighty is the gate: it is under what the layout gives (81.9 px at this window), so a card that
// has lost its room says so, and it is well over what the three-row chrome could ever give.
// The reading is geometry and not type — a card's width is `63 mm x scale` — so it does not
// depend on which face the machine running this happens to have.
import { createServer, type Server } from 'node:http'
import { readFileSync, rmSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { build } from 'vite'
import { chromium, type Browser } from 'playwright'
import { createSession, recipeSetup, roomOf, startServer, type Running } from './fixture.js'

const WEB = join(import.meta.dirname, '..')
const OUT = join(WEB, 'dist-tv-card-size-test')
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }

// The window a TV is met at, and the card's short side under which it is not a card any more.
const SCREEN = { w: 1920, h: 1080 }
const CARD_PX = 80

let browser: Browser
let run: Running
let server: Server
let origin: string
let sessionId: string
beforeAll(async () => {
  await build({ root: WEB, logLevel: 'silent', build: { outDir: OUT, emptyOutDir: true } })
  browser = await chromium.launch()
  run = await startServer()
  // The table the wizard lays out for four, which is the table this was measured on: every seat
  // has an area in front of it and gold to count, and the felt is the 1200 x 800 mm of K18.
  sessionId = await createSession(run, 'tvsize', undefined, recipeSetup(4, { mine: true, discard: true, market: true, counters: [{ name: 'Guld', start: 0 }] }))
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

describe('the TV spends its room on the felt (C5, K9)', () => {
  it('draws a card wide enough to be told apart without pointing at it', async () => {
    const page = await browser.newPage({ viewport: { width: SCREEN.w, height: SCREEN.h } })
    try {
      await page.goto(`${origin}/table?${new URLSearchParams({ server: run.url, session: sessionId, mode: 'tv', host: roomOf(sessionId).hostKey })}`, { waitUntil: 'load' })
      await page.waitForSelector('.byd-table-frame:not([style*="hidden"]) [data-table]')
      // The camera glides into place; the card is measured where it comes to rest.
      const card = await page.evaluate(async () => {
        const width = () => document.querySelector('.byd-card, .byd-pile-top')?.getBoundingClientRect().width ?? 0
        let last = width()
        for (let i = 0; i < 80; i++) {
          await new Promise((ok) => requestAnimationFrame(() => setTimeout(ok, 16)))
          const now = width()
          if (now > 0 && Math.abs(now - last) < 0.01) return Math.round(now * 10) / 10
          last = now
        }
        return Math.round(last * 10) / 10
      })
      expect(card).toBeGreaterThanOrEqual(CARD_PX)
    } finally {
      await page.close()
    }
  })
})
