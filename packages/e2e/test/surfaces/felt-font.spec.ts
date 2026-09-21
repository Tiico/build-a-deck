import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
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

  test('costs the sheet what the two subsets weigh, and sounds an alarm where a second face would fit', () => {
    // What shipping the face costs, as one number, so a later swap for a heavier family has to
    // change this line and say why. Roboto Condensed is one variable file per subset covering all
    // four weights the felt draws — 85 kB of woff2, a third more as base64, which is the price of
    // not making the browser ask twice. The runners-up cost twice that in four files each.
    const inlined = blockingSheets(index)
      .flatMap((href) => [...readFileSync(join(OUT, href.replace(/^\//, '')), 'utf8').matchAll(/src:url\(data:font\/woff2;base64,([^)]*)\)/g)])
      .reduce((sum, m) => sum + m[1]!.length, 0)
    expect({ kB: Math.round(inlined / 1000) }).toEqual({ kB: 114 })
    // And nothing else in the build grew a face of its own: the felt's is the only one. What is
    // left of the blocking sheet once the two subsets are taken out is the app's CSS, and the
    // number below is an alarm rather than a budget.
    //
    // It used to be a budget, and that is what #366 took away. Between 2026-09-13 and 09-17 this
    // line moved seven times, 120 kB to 146 kB, then down to 88 kB and to 83.5 kB — eight moves in
    // eight days, each honest on its own terms, and a limit that always gives way measures
    // nothing. The measurement behind #366 says two things that end the argument. Every one of the
    // seven raises was a surface that is not drawn on the first frame but was imported as though
    // it were, and a number can give way a kilobyte at a time where a rule about membership
    // cannot. And the number was governing the wrong thing: the whole 83.4 kB is ~72 ms of a
    // 2 104 ms first painting on a Lighthouse mobile profile — 3.4 % — while the face this gate
    // exists to protect costs 448 ms, six times the budget it was weighed against.
    //
    // So what governs the sheet's contents is the membership rule further down (#366, L40): only a
    // surface the first frame draws may be imported statically, read off the route table in
    // `App.tsx`. This line stops being that mechanism. It is not lowered and not raised; it is
    // given one job.
    //
    // The job is the sheet's non-face CSS, and this line is honest about which job that is not.
    // It reads `sheet - inlined`, so it cannot be the thing that fells a second face: a face that
    // arrived inlined would grow both sides by the same 45 kB and walk straight through. What
    // fells a face is two lines above — `kB: 114` is an exact weight and `toBe(2)` is an exact
    // count of subsets, and either one goes red the moment a third `@font-face` is inlined or the
    // family is swapped for a heavier one. A face that arrived *not* inlined is felled by the two
    // tests above this describe block, which say the build ships no font file and the page asks
    // the network for none.
    //
    // So what is left for this line is the CSS: 83.4 kB today, and 120 kB is 36.6 kB of room for
    // the felt's own surfaces to go on growing a rule at a time without anybody coming back here
    // to edit a number. If it ever binds, the answer is not a ninth raise: it is to ask what in
    // the sheet the first frame does not draw, which is the question the rule below asks
    // continuously.
    //
    // The price is stated where the rule is, not hidden here: nothing caps `table.css`, already
    // about 30 % of the sheet, and that surface is on the first frame for real.
    const sheet = blockingSheets(index).reduce((sum, href) => sum + statSync(join(OUT, href.replace(/^\//, ''))).size, 0)
    expect(sheet).toBeLessThan(inlined + 120_000)
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

// The drawer's own sheet, off the critical path (#346, #186's way). The book is behind a button
// nobody has pressed on the first frame, and it was three and a half kilobytes of the sheet the
// first painting waits for — which is what the line above spent seven raises arguing about.
//
// The split is along what the first frame actually shows. The button belongs to the table and
// keeps its rules in the sheet that blocks; everything inside the drawer belongs to the book and
// travels when the book is asked for. So the two are measured apart, and neither is allowed to
// drift into the other's sheet.
test.describe('the rulebook’s drawer waits for its own sheet (#346)', () => {
  test('keeps the button that opens it in the blocking sheet, and the drawer’s inside out of it', () => {
    const blocking = blockingSheets(index).map((href) => readFileSync(join(OUT, href.replace(/^\//, '')), 'utf8'))
    // The button is drawn on the first frame, so its rules are in the sheet the first frame has.
    expect(blocking.filter((css) => css.includes('.byd-rules-open')).length).toBeGreaterThan(0)
    // And the inside of the drawer is not: the page it is read on, the question above it, the
    // living number. The panel itself is named as a *condition* in the button's own rule — the
    // button steps aside when the drawer is out — so what is asked of it is that nothing in the
    // blocking sheet dresses it, which is the `{` after the name rather than the name.
    for (const inside of ['.byd-rules-page', '.byd-rules-tally', '.byd-rules-ask']) {
      expect(blocking.filter((css) => css.includes(inside))).toEqual([])
    }
    expect(blocking.filter((css) => /\.byd-rules-panel\s*\{/.test(css))).toEqual([])
  })

  test('ships the drawer’s inside in a sheet of its own, and no part of the button with it', () => {
    const blocking = blockingSheets(index)
    const others = filesUnder(OUT)
      .filter((path) => path.endsWith('.css'))
      .filter((path) => !blocking.some((href) => path.endsWith(href.replace(/^\//, ''))))
      .map((path) => readFileSync(path, 'utf8'))
    // Somewhere that is not the blocking sheet, the book is fully dressed.
    expect(others.filter((css) => css.includes('.byd-rules-page') && css.includes('.byd-rules-panel')).length).toBeGreaterThan(0)
    // And not one rule about the button travels with it. The split has a seam and the seam can be
    // put in the wrong place: the phone's own smaller button was left inside the drawer's sheet
    // when the two were first pulled apart, which would have redrawn the one surface where the
    // button's shape differs most — and only once somebody pressed it. Naming the class rather
    // than a selector is what makes that impossible to do again by halves.
    expect(others.filter((css) => css.includes('.byd-rules-open'))).toEqual([])
  })
})

// The camera's own sheet, off the critical path (#325, the same way as #346 and #186). The
// cluster in the felt's bottom-right corner and the edge marking both exist only while the view
// is somebody's own, and the view is automatic when the page is painted — so on the first frame
// neither is drawn. Their rules were four and a half kilobytes of the sheet that first painting
// waits for, against a margin of 2.4 kB, and the way out is the one already taken next door
// rather than a ceiling raised an eighth time.
//
// The split is along what the first frame actually shows. The grab cursor stays in `table.css`,
// because it is drawn while Space is held — before the camera is manual, and before the cluster
// exists. Everything that only exists once the view is manual travels with `CameraControls.js`.
test.describe('the camera’s corner waits for its own sheet (#325)', () => {
  test('keeps nothing of the cluster or the edge marking in the blocking sheet', () => {
    const blocking = blockingSheets(index).map((href) => readFileSync(join(OUT, href.replace(/^\//, '')), 'utf8'))
    for (const inside of ['.byd-camera-controls', '.byd-camera-edge', '.byd-camera-said', '--byd-camera-dock']) {
      expect(blocking.filter((css) => css.includes(inside))).toEqual([])
    }
    // The reading is not vacuous: what the first frame does draw is still there. The grab the
    // frame takes while Space is held is a cursor on the felt itself, and it has to be dressed
    // before anybody has touched the camera.
    expect(blocking.filter((css) => css.includes('[data-pan]')).length).toBeGreaterThan(0)
  })

  test('ships them in a sheet of its own, fully dressed', () => {
    const blocking = blockingSheets(index)
    const others = filesUnder(OUT)
      .filter((path) => path.endsWith('.css'))
      .filter((path) => !blocking.some((href) => path.endsWith(href.replace(/^\//, ''))))
      .map((path) => readFileSync(path, 'utf8'))
    // Somewhere that is not the blocking sheet, the corner is complete: the cluster, the marking,
    // and the one number the two share — how far up the bottom marking starts, so as not to draw
    // an arrow over a seat in the dock. A sheet carrying the marking without that number would
    // dress the corner by halves.
    expect(others.filter((css) => css.includes('.byd-camera-controls') && css.includes('.byd-camera-edge') && css.includes('--byd-camera-dock')).length).toBeGreaterThan(0)
  })
})

// The help pattern's box waits for its own sheet (#304, #346's way).
//
// The pattern's rules lived in `editor.css` while only the editor used it, and the editor's sheet
// is fetched when the route opens (#186) — so nothing of it was ever weighed here. #304 put the
// same question mark on the login, the start page and the guided start, which are the first
// screens anyone sees, and a sheet of its own for all of them landed the whole pattern in the
// sheet the first painting blocks on. That was 813 bytes over this budget, which is exactly what
// the budget is for.
//
// The split is the rulebook's, along what the first frame actually shows: the ring is drawn on
// the first frame and keeps its rules here; the box is behind a press nobody has made and travels
// when it is asked for.
test.describe('the help box waits for its own sheet (#304)', () => {
  test('keeps the question mark in the blocking sheet, and the box’s rules out of it', () => {
    const blocking = blockingSheets(index).map((href) => readFileSync(join(OUT, href.replace(/^\//, '')), 'utf8'))
    // The ring is painted before anyone presses it, so it is dressed by the sheet the first frame
    // has — on the login card, which is the first screen of all.
    expect(blocking.filter((css) => css.includes('.byd-help-ask')).length).toBeGreaterThan(0)
    expect(blocking.filter((css) => css.includes('.byd-help-row')).length).toBeGreaterThan(0)
    // And nothing of the box is: its ground, its heading, its cross.
    for (const inside of ['.byd-help-topic', '.byd-help-close']) {
      expect(blocking.filter((css) => css.includes(inside))).toEqual([])
    }
    expect(blocking.filter((css) => /\.byd-help-box\s*[.{]/.test(css))).toEqual([])
  })

  test('ships the box’s rules in a sheet of its own, and no part of the ring with it', () => {
    const blocking = blockingSheets(index)
    const others = filesUnder(OUT)
      .filter((path) => path.endsWith('.css'))
      .filter((path) => !blocking.some((href) => path.endsWith(href.replace(/^\//, ''))))
      .map((path) => readFileSync(path, 'utf8'))
    // Somewhere that is not the blocking sheet, the box is fully dressed.
    expect(others.filter((css) => css.includes('.byd-help-box') && css.includes('.byd-help-close')).length).toBeGreaterThan(0)
    // And the ring does not travel with it. The seam can be put in the wrong place: a ring that
    // arrives dressed only after the first press is a question mark nobody could see to press.
    expect(others.filter((css) => /\.byd-help-ask\s*[,:>{[]/.test(css))).toEqual([])
  })
})

// The membership rule (#366, L40). What may be in the sheet the first painting blocks on is no
// longer a number of bytes but a question about each surface: is it drawn on the first frame?
//
// The number that used to stand here had been moved eight times in eight days, and the measurement
// behind #366 says what each move was made of. Every one of the seven raises between 2026-09-13
// and 09-17 was a surface that is not on the first frame — a layer grid, a shape gallery, a
// rulebook page, a camera cluster, a help box — imported as though it were, and the line gave way
// a kilobyte at a time because every single raise was honest on its own terms. A membership rule
// cannot give way a kilobyte at a time: a surface is either drawn on the first frame or it is not.
//
// The same measurement also says the number was governing the wrong thing. The whole 83.4 kB
// budget is ~72 ms of a 2 104 ms first painting on a Lighthouse mobile profile — 3.4 % — while the
// face the gate exists to protect costs 448 ms, six times the budget it was weighed against. A
// limit that governs a thirtieth of the cost and moves every time it binds is a log, not a budget.
//
// So the first frame is read off `App.tsx` rather than written down here. The route table is what
// the app actually shows on a first painting, and a module reached from it by a plain `import` is
// on that frame by definition; a module reached only through a dynamic `import()` is not, because
// the browser has not asked for it yet. Adding a surface that genuinely belongs on the first frame
// therefore needs no edit in this file — add the route, import it, done. Adding one that does not
// belong is what fails here, by name.
//
// The price, stated rather than discovered later: this puts no ceiling on `table.css`, already
// about 30 % of the sheet. That surface is on the first frame for real and grows a rule at a time.
// If it becomes a problem it is a different problem from this one.
const SRC = join(WEB, 'src')

// A specifier as TypeScript asks for it — relative, and spelling the `.js` the build will emit —
// resolved back to the file on disk it means.
const resolveSpec = (from: string, spec: string): string | null => {
  if (!spec.startsWith('.')) return null
  const base = resolve(dirname(from), spec)
  const tries = [base.replace(/\.js$/, '.tsx'), base.replace(/\.js$/, '.ts'), base, `${base}.tsx`, `${base}.ts`, join(base, 'index.tsx'), join(base, 'index.ts')]
  return tries.find((p) => existsSync(p) && statSync(p).isFile()) ?? null
}

const sourceOf = (file: string): string => readFileSync(file, 'utf8')

// The two kinds of edge, kept apart, because the whole rule is the difference between them. A
// plain `import` puts the module in the entry the browser blocks on; `import()` gives it a chunk
// and a sheet of its own that nobody fetches until something asks.
const staticEdges = (file: string): string[] =>
  file.endsWith('.css')
    ? []
    : [...sourceOf(file).replace(/\bimport\(\s*['"][^'"]+['"]\s*\)/g, '')
        .matchAll(/(?:^|\n)\s*(?:import|export)\s+(?!type\b)(?:[^;'"]*?\bfrom\s*)?['"]([^'"]+)['"]/g)]
        .map((m) => resolveSpec(file, m[1]!))
        .filter((p): p is string => p !== null)

const dynamicEdges = (file: string): string[] =>
  file.endsWith('.css')
    ? []
    : [...sourceOf(file).matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)]
        .map((m) => resolveSpec(file, m[1]!))
        .filter((p): p is string => p !== null)

const modules = filesUnder(SRC).filter((f) => /\.(tsx?|css)$/.test(f))
// Every module anywhere under `src` that something reaches with `import()`. These are the cuts:
// what lies beyond one is not on the first frame, whoever else happens to point at it.
const deferred = new Set(modules.flatMap(dynamicEdges))

// What the first painting carries: the entry, and everything a plain `import` chain reaches from
// it, stopping dead at every cut. Not the bundler's answer read back — the bundler would happily
// walk straight through a cut that somebody had punctured with a second, static import, and that
// puncture is exactly the regression this is here to name.
const firstFrame = ((): Set<string> => {
  const seen = new Set<string>()
  const walk = (file: string): void => {
    if (seen.has(file)) return
    seen.add(file)
    for (const next of staticEdges(file)) if (!deferred.has(next)) walk(next)
  }
  walk(join(SRC, 'main.tsx'))
  return seen
})()

// The route table in `App.tsx`, as a pair of sets: the paths it answers, and the module each one
// is drawn from. Read rather than described, so that emptying `App.tsx` empties this too instead
// of quietly passing.
const routeTable = (): { path: string; component: string; module: string | null; lazy: boolean }[] => {
  const app = join(SRC, 'App.tsx')
  const text = sourceOf(app)
  const importedFrom = (name: string): { module: string | null; lazy: boolean } | null => {
    const asLazy = new RegExp(`\\b${name}\\s*=[^\\n]*\\blazy\\(\\s*\\(\\)\\s*=>\\s*import\\(\\s*['"]([^'"]+)['"]`).exec(text)
    if (asLazy) return { module: resolveSpec(app, asLazy[1]!), lazy: true }
    const asStatic = new RegExp(`(?:^|\\n)\\s*import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*['"]([^'"]+)['"]`).exec(text)
    if (asStatic) return { module: resolveSpec(app, asStatic[1]!), lazy: false }
    // A route drawn by a wrapper declared in `App.tsx` itself — the editor's `Suspense` — answers
    // for whatever that wrapper renders.
    const wrapper = new RegExp(`function ${name}\\(\\)[\\s\\S]*?\\n\\}`).exec(text)
    const inner = wrapper && /<([A-Z][A-Za-z0-9]*)\s*\/>/.exec(wrapper[0])
    return inner ? importedFrom(inner[1]!) : null
  }
  return [...text.matchAll(/location\.pathname(?:\.startsWith\()?\s*===?\s*'([^']+)'\)?\)\s*return\s*<([A-Z][A-Za-z0-9]*)\s*\/>/g)].map((m) => ({
    path: m[1]!,
    component: m[2]!,
    ...(importedFrom(m[2]!) ?? { module: null, lazy: false }),
  }))
}

// The classes a stylesheet is the only one to declare, read off the sources so that a renamed
// panel does not turn the reading into a no-op (`editorsOwnClasses`' trick, generalised).
const allCss = modules.filter((f) => f.endsWith('.css'))
const classesIn = (file: string): Set<string> => new Set([...sourceOf(file).matchAll(/\.(byd-[a-z0-9-]+)/g)].map((m) => m[1]!))
const ownClasses = (file: string): string[] => {
  const mine = classesIn(file)
  for (const other of allCss) if (other !== file) for (const name of classesIn(other)) mine.delete(name)
  return [...mine]
}

test.describe('only what the first frame draws rides in the sheet it blocks on (#366)', () => {
  test('reads the first frame off the route table, and finds a real one', () => {
    const table = routeTable()
    // Not vacuous, in the one way that matters: if `App.tsx` stopped saying what it says, every
    // reading below would be a reading of nothing, and this is where that is caught.
    expect(table.length).toBeGreaterThanOrEqual(8)
    expect(table.filter((r) => r.module === null)).toEqual([])
    expect(table.filter((r) => r.lazy).map((r) => r.component)).toEqual(['EditorRoute'])
    // And every route the app draws without fetching anything is in the set the entry carries.
    expect(table.filter((r) => !r.lazy && !firstFrame.has(r.module!)).map((r) => r.component)).toEqual([])
    // The cuts exist and the editor's is one of them.
    expect(deferred.size).toBeGreaterThan(0)
    expect([...deferred].some((f) => f.endsWith(join('editor', 'EditorPage.tsx')))).toBe(true)
  })

  test('names any surface in the blocking sheet that the first frame does not draw', () => {
    const blocking = blockingSheets(index)
      .map((href) => readFileSync(join(OUT, href.replace(/^\//, '')), 'utf8'))
      .join('')
    const rides = (file: string): string[] => ownClasses(file).filter((name) => new RegExp(`\\.${name}(?![a-z0-9-])`).test(blocking))
    // The reading is not vacuous: the felt's own surfaces are in there, by the dozen, and a
    // regexp that matched nothing would fail here before it could pass below.
    const carried = allCss.filter((file) => rides(file).length > 0)
    expect(carried.length).toBeGreaterThanOrEqual(6)
    expect(carried.filter((f) => f.endsWith(join('table', 'table.css'))).length).toBe(1)
    // The rule itself.
    const trespassing = carried
      .filter((file) => !firstFrame.has(file))
      .map((file) => `${relative(WEB, file)} dresses ${rides(file).slice(0, 3).join(', ')} in the blocking sheet, but the first frame never draws it — put its component behind lazy(() => import(…)), as EditorPage is (#366, L40)`)
    expect(trespassing).toEqual([])
  })

  test('keeps every deferred surface out of the blocking sheet and dressed in its own', () => {
    const blocking = blockingSheets(index)
    const blockingText = blocking.map((href) => readFileSync(join(OUT, href.replace(/^\//, '')), 'utf8')).join('')
    const others = filesUnder(OUT)
      .filter((path) => path.endsWith('.css'))
      .filter((path) => !blocking.some((href) => path.endsWith(href.replace(/^\//, ''))))
      .map((path) => readFileSync(path, 'utf8'))
      .join('')
    // Everything a cut puts out of reach of the first frame, and the classes only it declares.
    const behindACut = allCss.filter((file) => !firstFrame.has(file) && ownClasses(file).length > 0)
    // Not a list of file names — the cuts are read out of the code — but the reading has to have
    // found some, and the editor's is the one the decision is named after.
    expect(behindACut.length).toBeGreaterThanOrEqual(3)
    expect(behindACut.filter((f) => f.endsWith(join('editor', 'editor.css'))).length).toBe(1)
    const strays = behindACut.flatMap((file) =>
      ownClasses(file)
        .filter((name) => new RegExp(`\\.${name}(?![a-z0-9-])`).test(blockingText))
        .map((name) => `${relative(WEB, file)}: .${name} is in the blocking sheet although the first frame never draws it`),
    )
    expect(strays).toEqual([])
    // And they are dressed somewhere: a surface cut out of the entry and out of every other sheet
    // would pass the line above by not existing at all.
    const undressed = behindACut.filter((file) => !ownClasses(file).some((name) => new RegExp(`\\.${name}(?![a-z0-9-])`).test(others)))
    expect(undressed.map((f) => relative(WEB, f))).toEqual([])
  })

  test('lets nothing be drawn inside a Suspense that is not behind a cut', () => {
    // What keeps the rule from being undone in one line. Taking `lazy()` off a small surface — the
    // help box is 1.1 kB — moves it into the blocking sheet without the cut existing any more, so
    // no reading of cuts above would notice. What stays behind is the `Suspense` that was put
    // there because the surface is drawn on a press and not on the first frame.
    const waiting = modules.filter((f) => f.endsWith('.tsx') && sourceOf(f).includes('<Suspense'))
    expect(waiting.length).toBeGreaterThanOrEqual(4)
    const unwaited = waiting.filter((file) => {
      const text = sourceOf(file)
      const blocks = [...text.matchAll(/<Suspense\b[\s\S]*?<\/Suspense>/g)].map((m) => m[0])
      return blocks.some((block) => {
        const rendered = [...new Set([...block.matchAll(/<([A-Z][A-Za-z0-9]*)[\s/>]/g)].map((m) => m[1]!))]
        return !rendered.some((name) => new RegExp(`\\b${name}\\s*=[^\\n]*\\blazy\\(`).test(text))
      })
    })
    expect(unwaited.map((f) => `${relative(WEB, f)} waits on a component that is not behind a cut — bind it with lazy(() => import(…)) (#366, L40)`)).toEqual([])
  })
})
