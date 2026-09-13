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
  })

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
  })

  it('ships no font file for the browser to fetch, and none of the felt’s own text asks for one', () => {
    const loose = filesUnder(OUT).filter((f) => f.endsWith('.woff2') || f.endsWith('.woff') || f.endsWith('.ttf'))
    expect(loose.map((f) => relative(OUT, f))).toEqual([])
    const asking = filesUnder(OUT)
      .filter((f) => /\.(css|js|html)$/.test(f))
      .filter((f) => /url\([^)]*\.woff2?\)/.test(readFileSync(f, 'utf8').replace(/url\(data:[^)]*\)/g, '')))
    expect(asking.map((f) => relative(OUT, f))).toEqual([])
  })

  it('costs the sheet what the two subsets weigh and no more', () => {
    // What shipping the face costs, as one number, so a later swap for a heavier family has to
    // change this line and say why. Roboto Condensed is one variable file per subset covering all
    // four weights the felt draws — 85 kB of woff2, a third more as base64, which is the price of
    // not making the browser ask twice. The runners-up cost twice that in four files each.
    const inlined = blockingSheets(index)
      .flatMap((href) => [...readFileSync(join(OUT, href.replace(/^\//, '')), 'utf8').matchAll(/src:url\(data:font\/woff2;base64,([^)]*)\)/g)])
      .reduce((sum, m) => sum + m[1]!.length, 0)
    expect({ kB: Math.round(inlined / 1000) }).toEqual({ kB: 114 })
    // And nothing else in the build grew a face of its own: the felt's is the only one.
    expect(statSync(join(OUT, blockingSheets(index)[0]!.replace(/^\//, ''))).size).toBeLessThan(inlined + 120_000)
  })

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
