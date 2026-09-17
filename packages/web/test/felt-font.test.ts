// The felt's face has to be in the document before the first painting (#95).
//
// This is not a loading-time nicety. The prototype measured the felt with the face held back half
// a second: `Räknare A` is 88.6 px while it is on its way and 75.5 px once it has arrived, and all
// sixteen names change width when it lands — under `font-display: swap` and under `block` alike,
// because `block` hides the glyphs but still lays the line out in the fallback's measurements. For
// the length of that window the felt stands in exactly the state the gate fells: names measured
// against whatever face the machine happens to have. A face fetched in a round trip of its own is
// therefore not a flash to look at but a stretch of time when the table is wrong.
//
// So the bytes travel inside the stylesheet the browser already blocks on. What is checked here is
// the built app and not the intention: the entry's sheet is a render-blocking `<link>` in the head,
// the face is inside it as a `data:` URL, and nothing in the build asks the network for a woff2.
import { createServer, type Server } from 'node:http'
import { readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { extname, join, normalize, relative } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { build } from 'vite'
import { chromium, type Browser } from 'playwright'

const WEB = join(import.meta.dirname, '..')
const OUT = join(WEB, 'dist-felt-font-test')
const FAMILY = 'Roboto Condensed'

const filesUnder = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? filesUnder(join(dir, e.name)) : [join(dir, e.name)]))

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' }

let index: string
let browser: Browser
let server: Server
let origin: string
beforeAll(async () => {
  await build({ root: WEB, logLevel: 'silent', build: { outDir: OUT, emptyOutDir: true } })
  index = readFileSync(join(OUT, 'index.html'), 'utf8')
  browser = await chromium.launch()
  // The built app, served the way it is served: over http, one file per request, so that what
  // the browser asks for is a fact on a wire and not a guess about a bundler.
  server = createServer((req, res) => {
    const path = normalize(new URL(req.url ?? '/', 'http://x').pathname).replace(/^(\.\.[/\\])+/, '')
    const file = join(OUT, path === '/' ? 'index.html' : path)
    try {
      const body = readFileSync(file)
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body)
    } catch {
      res.writeHead(404).end()
    }
  })
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok))
  const at = server.address()
  origin = `http://127.0.0.1:${typeof at === 'object' && at ? at.port : 0}/`
}, 600_000)
afterAll(async () => {
  await browser.close()
  await new Promise<void>((ok) => server.close(() => ok()))
  rmSync(OUT, { recursive: true, force: true })
}, 60_000)

// Every `<link rel="stylesheet">` the head carries with nothing that would take it off the
// critical path: a `media` that does not apply, or a `rel` that only hints.
const blockingSheets = (html: string): string[] =>
  [...html.matchAll(/<link\b[^>]*>/g)]
    .map((m) => m[0])
    .filter((tag) => /rel="stylesheet"/.test(tag) && !/media="(print|[^"]*\bnot\b[^"]*)"/.test(tag))
    .map((tag) => /href="([^"]+)"/.exec(tag)?.[1] ?? '')
    .filter(Boolean)

describe('the felt’s face is in the document before the first painting (K20, #95)', () => {
  it('puts it inside the stylesheet the page already blocks on, and not in a round trip of its own', () => {
    const sheets = blockingSheets(index)
    expect(sheets.length).toBeGreaterThan(0)
    const carrying = sheets
      .map((href) => readFileSync(join(OUT, href.replace(/^\//, '')), 'utf8'))
      .filter((css) => css.includes(`font-family:${FAMILY}`) || css.includes(`font-family:"${FAMILY}"`) || css.includes(`font-family:'${FAMILY}'`))
    // The face is declared in a sheet that blocks the first painting…
    expect(carrying.length).toBeGreaterThan(0)
    // …and its bytes are in that same sheet, so there is nothing left to wait for.
    expect(carrying.filter((css) => css.includes('src:url(data:font/woff2;base64,')).length).toBe(carrying.length)
    // Both subsets, because a name with a letter outside the shipped ones is drawn by a system
    // face again and that name's width is back to being the machine's answer (A4).
    expect([...carrying.join('').matchAll(/src:url\(data:font\/woff2;base64,/g)].length).toBe(2)
  }, 60_000)

  // What the licence actually asks for. OFL 1.1 lets the face be bundled and sold with software on
  // three conditions, and the one with teeth here is that *each copy* of the font software carries
  // the copyright notice and the licence. The bytes are inside the sheet, so the sheet is the copy
  // — and a licence in a file beside the source would not have travelled with it (E4's own rule,
  // that licence metadata has to reach what ships, applied to the app itself rather than to a
  // card).
  it('carries the copyright notice and the whole licence in the same file as the bytes', () => {
    const css = blockingSheets(index)
      .map((href) => readFileSync(join(OUT, href.replace(/^\//, '')), 'utf8'))
      .filter((text) => text.includes('src:url(data:font/woff2;base64,'))
      .join('')
    expect(css).toContain('Copyright 2011 Google Inc.')
    expect(css).toContain('SIL OPEN FONT LICENSE Version 1.1')
    expect(css).toContain('may be bundled,\n   redistributed and/or sold with any software')
    // And the condition the choice of family turned on: the copyright statement — the lines before
    // the licence body, which is where OFL 1.1 says a reserved name is declared — declares none, so
    // a subset or a rebuild of this face is not barred from carrying the name. Read off the notice
    // rather than off the whole text, since the licence body names the term either way.
    const notice = css.slice(css.indexOf('Copyright 2011 Google Inc.'), css.indexOf('This Font Software is licensed'))
    expect(notice.length).toBeGreaterThan(20)
    expect(notice).not.toMatch(/reserved font name/i)
  }, 60_000)

  it('ships no font file for the browser to fetch, and none of the felt’s own text asks for one', () => {
    const loose = filesUnder(OUT).filter((f) => f.endsWith('.woff2') || f.endsWith('.woff') || f.endsWith('.ttf'))
    expect(loose.map((f) => relative(OUT, f))).toEqual([])
    const asking = filesUnder(OUT)
      .filter((f) => /\.(css|js|html)$/.test(f))
      .filter((f) => /url\([^)]*\.woff2?\)/.test(readFileSync(f, 'utf8').replace(/url\(data:[^)]*\)/g, '')))
    expect(asking.map((f) => relative(OUT, f))).toEqual([])
  }, 60_000)

  it('costs the sheet what the two subsets weigh and no more', () => {
    // What shipping the face costs, as one number, so a later swap for a heavier family has to
    // change this line and say why. Roboto Condensed is one variable file per subset covering all
    // four weights the felt draws — 85 kB of woff2, a third more as base64, which is the price of
    // not making the browser ask twice. The runners-up cost twice that in four files each.
    const inlined = blockingSheets(index)
      .flatMap((href) => [...readFileSync(join(OUT, href.replace(/^\//, '')), 'utf8').matchAll(/src:url\(data:font\/woff2;base64,([^)]*)\)/g)])
      .reduce((sum, m) => sum + m[1]!.length, 0)
    expect({ kB: Math.round(inlined / 1000) }).toEqual({ kB: 114 })
    // And nothing else in the build grew a face of its own: the felt's is the only one. The slack
    // is everything in the sheet that is not the two subsets — every stylesheet the app ships,
    // minified — and it is far below what a second face would cost, which is what this catches.
    // Raised from 120 kB to 125 kB on 2026-09-14: the editor's layer grid and the fill rule (L15,
    // L16) are two new panels of real CSS. Raised again to 130 kB the same day for the shape
    // gallery, the pattern tiles, the shadow's chips and the ready-made backs (L17) — four more
    // grids of buttons in the property panel, and one beside the layers. Raised to 136 kB on
    // 2026-09-15 for the deck's measure (E1) and the game's colours (E4): a panel beside the wall
    // with a rule, a list of the files that cannot answer it and a drawer that opens one of them,
    // and a row per meaning in the symbol panel with the inks to paint it in.
    // Raised to 139 kB on 2026-09-15 for what a pile can be asked for (B5, K14): the sheet the
    // felt hangs under the ring, and the sentence panel in the Bord tab — a slot inside running
    // text, its popover, and the chip rows a question is written with. Two real surfaces, one on
    // the felt and one in the editor, and the headroom left over is deliberate: the sheet is the
    // first thing on the felt that is a list rather than a disc, and it will grow.
    // Raised to 142 kB on 2026-09-16 for the crown over the card (#129): the group menu and the
    // button that opens it, the fold that puts the properties away, and the layer column as a
    // crown, a list and a foot. 1 523 bytes of it, on a sheet that had 47 left — the 139 kB line
    // was one small panel away from failing on the trunk alone, which is why this raise is a
    // little wider than the growth that forced it.
    // Raised again to 144 kB the same day for the crown a tab panel wears (#128, #130): a row,
    // the boxes in it, the drawer a box opens, the filter rail with its fade and its arrow, and
    // the foot under the work. One mechanism, but three surfaces were rebuilt round it — and the
    // wall's dock and the table's four stacked bands went the other way, so it is 1 760 bytes net
    // and 194 over what the raise above had left. The two crowns were written in parallel and
    // landed within the hour: the shared row is `.byd-crown`, the card's own `.byd-canvas-crown`.
    // Raised to 146 kB on 2026-09-17, and this one is not paying for a surface. The rulebook's
    // empty state (#131) grew the sheet by 94 bytes net — two surfaces, the disposition and the
    // contents column, paid for almost entirely out of their own pocket by giving the tab's three
    // quiet buttons the pill `.byd-crown-box` that was already declared and by merging
    // `.byd-crown-step button` with `.byd-crown-more`, which had been written out twice. What
    // forces the raise is what that left: 73 bytes, on a trunk four or five sessions push to
    // within the hour. At that margin the next small panel fails whoever happens to write it, and
    // a gate that fells work for arriving late rather than for being wrong has stopped saying the
    // thing it was built to say. So the 2 kB is headroom and not a surface, deliberately.
    //
    // It is also the last raise that should be spent this way. The number guards one fact — the
    // felt's face is in the sheet the browser already blocks on — but the editor's CSS rides in
    // that same sheet, so every panel anybody builds is weighed against the felt's typeface. That
    // is why this line has moved seven times in four days. Splitting the editor out of the
    // blocking sheet would make the budget mean what it says again; until then each raise buys
    // quiet rather than an answer.
    expect(statSync(join(OUT, blockingSheets(index)[0]!.replace(/^\//, ''))).size).toBeLessThan(inlined + 146_000)
  }, 60_000)

  // And the same thing said by a browser rather than by a reader of files: the built app served
  // the way it is served, with every request it makes written down.
  it('asks the network for the page and its sheet, and never for a face', async () => {
    const page = await browser.newPage()
    const asked: string[] = []
    page.on('request', (r) => asked.push(new URL(r.url()).pathname))
    try {
      await page.goto(origin, { waitUntil: 'load' })
      await page.evaluate(() => document.fonts.ready.then(() => undefined))
      // The face is in the document — declared, and with its bytes to hand — without the page
      // having gone anywhere for it.
      const declared = await page.evaluate((family) => [...document.fonts].filter((f) => f.family.replace(/['"]/g, '') === family).map((f) => f.status), FAMILY)
      // The reading is not vacuous: the page did go to the network, for the document and for the
      // sheet the face rode in on. What it never asked for is the face.
      expect(asked.filter((p) => p.endsWith('.css')).length).toBeGreaterThan(0)
      expect({ declared: declared.length, fonts: asked.filter((p) => /\.(woff2?|ttf|otf)$/.test(p)) }).toEqual({ declared: 2, fonts: [] })
    } finally {
      await page.close()
    }
  }, 60_000)
})
