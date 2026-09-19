import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { expect, test } from '@playwright/test'

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
//
// Migrated from `packages/web/test/felt-font.test.ts`, which built the app and served it over http
// to ask these questions — six hundred seconds of budget for the build alone. The suite builds the
// app once for every test in it and serves it from the real server, so this reads the build that
// is already there and opens the origin that is already up.
const WEB = join(import.meta.dirname, '..', '..', '..', 'web')
const OUT = process.env['BYD_E2E_WEB_DIST']!
const FAMILY = 'Roboto Condensed'

const filesUnder = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? filesUnder(join(dir, e.name)) : [join(dir, e.name)]))

const index = readFileSync(join(OUT, 'index.html'), 'utf8')

// Every `<link rel="stylesheet">` the head carries with nothing that would take it off the
// critical path: a `media` that does not apply, or a `rel` that only hints.
const blockingSheets = (html: string): string[] =>
  [...html.matchAll(/<link\b[^>]*>/g)]
    .map((m) => m[0])
    .filter((tag) => /rel="stylesheet"/.test(tag) && !/media="(print|[^"]*\bnot\b[^"]*)"/.test(tag))
    .map((tag) => /href="([^"]+)"/.exec(tag)?.[1] ?? '')
    .filter(Boolean)

test.describe('the felt’s face is in the document before the first painting (K20, #95)', () => {
  test('puts it inside the stylesheet the page already blocks on, and not in a round trip of its own', () => {
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
  test('carries the copyright notice and the whole licence in the same file as the bytes', () => {
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

  test('ships no font file for the browser to fetch, and none of the felt’s own text asks for one', () => {
    const loose = filesUnder(OUT).filter((f) => f.endsWith('.woff2') || f.endsWith('.woff') || f.endsWith('.ttf'))
    expect(loose.map((f) => relative(OUT, f))).toEqual([])
    const asking = filesUnder(OUT)
      .filter((f) => /\.(css|js|html)$/.test(f))
      .filter((f) => /url\([^)]*\.woff2?\)/.test(readFileSync(f, 'utf8').replace(/url\(data:[^)]*\)/g, '')))
    expect(asking.map((f) => relative(OUT, f))).toEqual([])
  })

  test('costs the sheet what the two subsets weigh and no more', () => {
    // What shipping the face costs, as one number, so a later swap for a heavier family has to
    // change this line and say why. Roboto Condensed is one variable file per subset covering all
    // four weights the felt draws — 85 kB of woff2, a third more as base64, which is the price of
    // not making the browser ask twice. The runners-up cost twice that in four files each.
    const inlined = blockingSheets(index)
      .flatMap((href) => [...readFileSync(join(OUT, href.replace(/^\//, '')), 'utf8').matchAll(/src:url\(data:font\/woff2;base64,([^)]*)\)/g)])
      .reduce((sum, m) => sum + m[1]!.length, 0)
    expect({ kB: Math.round(inlined / 1000) }).toEqual({ kB: 114 })
    // And nothing else in the build grew a face of its own: the felt's is the only one. The slack
    // is everything in the blocking sheet that is not the two subsets, minified — and what the
    // number has to be is small enough to fell a second face and no smaller.
    //
    // It used to be neither. Between 2026-09-13 and 2026-09-17 this line moved seven times, 120 kB
    // to 146 kB, and every raise was honest on its own terms: the editor's CSS rode in this same
    // sheet, so a layer grid, a shape gallery, a crown or a sentence panel was weighed against the
    // felt's typeface and the number had to give way. A limit that always gives way measures
    // nothing, and twice it cost an agent a session's work on compressing CSS that was not what she
    // had come to write. Since #186 the editor is a route of its own with a sheet of its own, and
    // what is left here is the felt, the phone and the app's chrome — surfaces that grow by a rule
    // at a time rather than by a panel.
    //
    // So the number is the measurement plus a stated margin rather than the next round figure up.
    // The blocking sheet is 76.3 kB of CSS beside the face; 84 kB leaves 7.7 kB, about a tenth, for
    // the felt's own surfaces to go on growing without anybody having to come back here. And it
    // still fells what it is for: the cheaper of the two subsets shipped is 45 kB as base64, so the
    // smallest second face anyone could add is nearly six times the whole margin.
    const sheet = blockingSheets(index).reduce((sum, href) => sum + statSync(join(OUT, href.replace(/^\//, ''))).size, 0)
    expect(sheet).toBeLessThan(inlined + 84_000)
  })

  // And the same thing said by a browser rather than by a reader of files: the built app served
  // the way it is served, with every request it makes written down.
  test('asks the network for the page and its sheet, and never for a face', async ({ page }) => {
    const asked: string[] = []
    page.on('request', (r) => asked.push(new URL(r.url()).pathname))
    {
      await page.goto('/', { waitUntil: 'load' })
      await page.evaluate(() => document.fonts.ready.then(() => undefined))
      // The face is in the document — declared, and with its bytes to hand — without the page
      // having gone anywhere for it.
      const declared = await page.evaluate((family) => [...document.fonts].filter((f) => f.family.replace(/['"]/g, '') === family).map((f) => f.status), FAMILY)
      // The reading is not vacuous: the page did go to the network, for the document and for the
      // sheet the face rode in on. What it never asked for is the face.
      expect(asked.filter((p) => p.endsWith('.css')).length).toBeGreaterThan(0)
      expect({ declared: declared.length, fonts: asked.filter((p) => /\.(woff2?|ttf|otf)$/.test(p)) }).toEqual({ declared: 2, fonts: [] })
    }
  })
})

// The other half of the same question (#186). The gate above says what has to be in the blocking
// sheet; what follows says what must not. The editor is opened by a designer who has already
// loaded the app and is about to wait on her project anyway, so its stylesheet — by far the app's
// largest — has no business delaying the felt's first painting. While it rode in the same sheet the
// budget above was really a ceiling on how much interface might exist, which is why it moved seven
// times in four days.
//
// The classes the editor declares and nobody else does, read off the sources rather than written
// down here, so a renamed panel does not quietly turn this check into a no-op. `buttons.css` names
// `.byd-editor` itself — the button language dresses all nine surfaces — so a marker has to be one
// the editor alone owns. A name is only a name to its own end: the rulebook's `.byd-rules-panel`
// blocks on the felt's account and would otherwise answer for the editor's `.byd-rules`.
const editorsOwnClasses = (): string[] => {
  const classesIn = (file: string): Set<string> => new Set([...readFileSync(join(WEB, file), 'utf8').matchAll(/\.(byd-[a-z0-9-]+)/g)].map((m) => m[1]!))
  const own = classesIn('src/editor/editor.css')
  for (const other of filesUnder(join(WEB, 'src')).filter((f) => f.endsWith('.css') && !f.endsWith(join('editor', 'editor.css'))))
    for (const name of classesIn(relative(WEB, other))) own.delete(name)
  return [...own]
}

test.describe('the editor is not weighed against the felt’s face (#186)', () => {
  test('keeps the editor’s own CSS out of the sheet the first painting blocks on', () => {
    const markers = editorsOwnClasses()
    // Not vacuous: the editor does have selectors of its own to look for.
    expect(markers.length).toBeGreaterThan(20)
    const blocking = blockingSheets(index)
      .map((href) => readFileSync(join(OUT, href.replace(/^\//, '')), 'utf8'))
      .join('')
    expect(markers.filter((name) => new RegExp(`\\.${name}(?![a-z0-9-])`).test(blocking))).toEqual([])
  })

  // Taking the sheet off the critical path is only half a fix; the other half is that the editor
  // still looks like itself. Said by a browser rather than by a reader of files: open the route the
  // way a designer does, watch the wire, and then ask the page whether the rules are in force and
  // not merely downloaded. The probe is a bare `flex-grow`, so the reading is the same on a Linux
  // runner as on a Mac — nothing here may depend on which face the machine has.
  test('fetches the editor’s own sheet when /editor opens, and it is in force', async ({ page }) => {
    const css: string[] = []
    page.on('request', (r) => {
      if (new URL(r.url()).pathname.endsWith('.css')) css.push(new URL(r.url()).pathname)
    })
    {
      await page.goto('/editor', { waitUntil: 'load' })
      await page.waitForFunction(() => document.querySelectorAll('link[rel=stylesheet]').length > 1, undefined, { timeout: 20_000 })
      // Two sheets on the wire: the one the first painting blocked on, and the editor's, asked for
      // only once the route said it wanted it.
      expect(css.length).toBe(2)
      const second = readFileSync(join(OUT, css.find((p) => !blockingSheets(index).includes(p))!.replace(/^\//, '')), 'utf8')
      expect(editorsOwnClasses().filter((name) => new RegExp(`\\.${name}(?![a-z0-9-])`).test(second)).length).toBeGreaterThan(20)
      // And in force: a rule out of that sheet reaches an element the document did not have when
      // the page loaded.
      const flex = await page.evaluate(() => {
        const probe = document.createElement('div')
        document.body.append(probe)
        const bare = getComputedStyle(probe).flexGrow
        probe.className = 'byd-editor-spacer'
        return { bare, dressed: getComputedStyle(probe).flexGrow }
      })
      expect(flex).toEqual({ bare: '0', dressed: '1' })
    }
  })
})
