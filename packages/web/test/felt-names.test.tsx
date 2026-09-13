// @vitest-environment jsdom
// Where every name on the felt lands, at every seat count, on every surface that draws one
// (K9, #43, #71). Two names on the same millimetres is a layout fact and jsdom answers none of
// them, so the real renderer's markup is measured in real Chromium against the stylesheets that
// ship — the same way the fan and the camera are (#20, #23).
//
// A count of overlapping pairs is not enough on its own: a rule that draws every name inside its
// own rectangle scores zero and clips twelve names of sixteen. So each reading also says which
// names it saw, whether any was cut short, and whether any was drawn off the felt.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { ReactElement } from 'react'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { chromium, type Browser, type Page } from 'playwright'
import { CARD_STANDARD_63x88, STANDARD_TYPES, TOKEN_COUNTER, TypeRegistry, initialState, project, type SetupDef } from '@byd/engine'
import type { Snapshot } from '@byd/protocol'
import { MAX_PLAYERS, SEAT_IDS, SWEDISH_WORDS, applyRecipe, emptySetup, type Setup } from '@byd/server/doc'
import { TableRenderer } from '../src/table/TableRenderer.js'
import { TvChrome } from '../src/table/TvChrome.js'
import { EditorPage } from '../src/editor/EditorPage.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { atWidth } from './viewport.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')

// A sheet as it ships, with the face's own bytes where the build puts them: inline, as a `data:`
// URL. `assetsInlineLimit` in `vite.config.ts` is what does it there and this is what does it
// here, and it is the same transformation — a woff2 the sheet points at becomes the sheet's own
// content. Nothing else is rewritten, so what is measured below is the cascade the app declares
// and not one this file invented (K19's own lesson, #72).
const FACE = /url\('(\.\/[^']+\.woff2)'\)/g
const sheet = (rel: string): string =>
  read(rel).replace(FACE, (_all, file: string) => `url('data:font/woff2;base64,${readFileSync(join(import.meta.dirname, '..', dirname(rel), file)).toString('base64')}')`)

// The editor's Bord tab is one of the five surfaces, so the shared button language goes over
// it here as it does on the page itself; the felt's own sheets go under. The face the felt is
// written in comes first, because it is on the entry in the app too (#95).
const FELT_FONT = 'src/fonts/felt-font.css'
const SHEETS = [FELT_FONT, 'src/table/table.css', 'src/table/texture.css', 'src/table/keyboard.css', 'src/editor/editor.css', 'src/buttons.css', 'src/a11y.css']

const registry = new TypeRegistry(STANDARD_TYPES)
const CARD = { id: CARD_STANDARD_63x88.id, version: 1 }
const TOKEN = { id: TOKEN_COUNTER.id, version: 1 }
const COUNTERS = [{ name: 'Poäng', start: 0 }]
const DECK = 20
const HELD = 4
const FRAME = { w: 1280, h: 800 }

// A seat's name is as wide as the name is: the collision #71 reports is a name card lying on a
// zone's label, and "A" is not what a table says. So the seats are named as people name them.
const seatNameOf = (seat: string): string => `Spelare ${seat.charCodeAt(0) - 64}`

// The table the recipe lays out for that many seats (K18), which is the table every surface here
// draws — the editor's preview from the document, the played felt from the log. The seats carry
// everything a seat can have, since the question is what happens when one edge holds two of them.
// The market is a knob on the same recipe and a zone nobody owns, 200 mm in from the north rim —
// the one band a seat's own names were sent into when they were moved off that rim. A scene
// pinned to one setting of it measures half a table, so every reading below is taken with it both
// on and off.
const feltOf = (seats: number, market = false): Setup =>
  applyRecipe(emptySetup(), { players: seats, mine: true, discard: true, market, counters: COUNTERS }, SWEDISH_WORDS)

// The same table as the engine projects it, with something lying in every hand and in every area
// in front of a seat: a label is judged against what is dealt near it, not against bare felt.
// The areas in front are opened to `all` for the same reason — the table's own screen is shown
// nothing lying in an `owner` zone (B6), and this is a question about names over cards.
function sceneOf(setup: Setup): Snapshot {
  const def: SetupDef = {
    seats: setup.seats,
    floor: setup.floor,
    zones: setup.zones.map((z) => ({
      id: z.id,
      kind: z.kind,
      name: z.name,
      visibility: z.id.startsWith('mine:') ? ('all' as const) : z.visibility,
      geometry: z.geometry,
      ...(z.owner ? { owner: z.owner } : {}),
      ...(z.returnTo ? { returnTo: z.returnTo } : {}),
      ...(z.shortcut ? { shortcut: z.shortcut } : {}),
    })),
    components: [
      ...Array.from({ length: DECK }, (_, i) => ({ type: CARD, cardRef: `Kort ${i + 1}`, zone: setup.deckZone, face: 'back' as const })),
      ...setup.seats.flatMap((seat) => {
        const z = setup.zones.find((w) => w.id === `mine:${seat}`)
        if (!z) return []
        const tall = z.geometry.h > z.geometry.w
        return [0, 1].map((i) => ({ type: CARD, cardRef: `Spelat ${seat}${i}`, zone: `mine:${seat}`, face: 'front' as const, x: tall ? 18 : 10 + i * 70, y: tall ? 10 + i * 100 : 6 }))
      }),
      ...setup.seats.flatMap((seat) => Array.from({ length: HELD }, (_, i) => ({ type: CARD, cardRef: `Hand ${seat}${i}`, zone: `hand:${seat}`, face: 'back' as const }))),
      ...setup.seats.flatMap((seat) =>
        setup.zones.some((z) => z.id === `counters:${seat}`) ? COUNTERS.map((c, i) => ({ type: TOKEN, cardRef: c.name, zone: `counters:${seat}`, face: 'front' as const, counter: c.start, x: 8 + i * 32, y: 8 })) : [],
      ),
    ],
  }
  const snap = project(initialState('names', def, registry), registry, null)
  return { ...snap, seats: snap.seats.map((s) => ({ ...s, name: seatNameOf(s.id) })) }
}

// Every name the table is meant to say at that seat count. A reading that is missing one of them
// has not placed the names well; it has lost one.
function namesOf(setup: Setup): string[] {
  const areas = setup.zones.filter((z) => z.kind === 'area' && z.id !== setup.floor).map((z) => z.name)
  const piles = setup.zones.filter((z) => z.kind === 'pile').map((z) => z.name)
  return [...areas, ...piles, ...setup.seats.map(seatNameOf)]
}

function markupOf(node: ReactElement): string {
  const { container, unmount } = render(node)
  const html = container.innerHTML
  unmount()
  return html
}

let browser: Browser
let run: Running
let projects = 0
beforeAll(async () => {
  browser = await chromium.launch()
  run = await startServer()
}, 60_000)
afterAll(async () => {
  await browser.close()
  await run.stop()
}, 60_000)

async function onPage<T>(html: string, size: { w: number; h: number }, look: (page: Page) => Promise<T>, sheets: string[] = SHEETS): Promise<T> {
  const page = await browser.newPage({ viewport: { width: size.w, height: size.h } })
  try {
    const shell = read('index.html')
      .replace('<script type="module" src="/src/main.tsx"></script>', '')
      .replace('</head>', `<style>${sheets.map(sheet).join('\n')}</style></head>`)
      .replace('<div id="root"></div>', `<div id="root" style="width:${size.w}px;height:${size.h}px">${html}</div>`)
    await page.setContent(shell, { waitUntil: 'load' })
    // A reading taken while the face is still being decoded is a reading of the fallback, which is
    // the state this whole slice exists to get the felt out of (#95).
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
    return await look(page)
  } finally {
    await page.close()
  }
}

type Crowding = { pairs: string[]; clipped: string[]; outside: string[] }
type Reading = Crowding & { names: string[]; wrapped: string[]; smallest: number; cardPx: number; wider: Crowding }

// How much wider than the shipped face every name has to survive being drawn (#95). "No overlap"
// is not a machine-independent claim: Linux fontconfig snaps each glyph's advance to a whole
// pixel and macOS places them on subpixels, which is up to ~1.5 px per name and does not go away
// because the face ships. A design that clears by two pixels therefore clears on one machine and
// not on the next — which is exactly what it did, and what CI kept reporting.
//
// The number is the felt's own slack said as a proportion, because the scarcity here is relative:
// the two pixel-shifts before this one bought *absolute* room and bought nothing. Today's tightest
// scene has 2.0 % and DejaVu Sans draws K19's names 12–14 % wider, so 15 % is the smallest demand
// that would have caught it. The shipped face leaves 21–22 %.
const NAME_MARGIN = 1.15

// What the two issues are about, read off the DOM: which names are visible, which pairs of them
// lie on the same pixels, which were cut short by the box they were given, and which were drawn
// off the felt altogether — and then all of that again with every name drawn `NAME_MARGIN` wider.
//
// Widening is done with `letter-spacing`, which is how a wider face differs from a narrower one
// as far as this layout is concerned: every name is `nowrap` and anchored at one of its own two
// ends with `translate(-100% …)`, so the element's own width is what moves it. Adding Δ to an
// n-character name of width w adds n·Δ to that width, so Δ = (k−1)·w/n scales the drawn text by k
// while the fixed insets — `--name-in`, the pill's padding — stay fixed, as they would under a
// wider face.
const READ = `((margin) => {
  const sel = ['.byd-zone > span', '.byd-seat-name', '.byd-setup-handle > span', '.byd-pile-name', '.byd-pile-n', '.byd-hand-count'].join(', ')
  const seen = (el) => {
    const s = getComputedStyle(el)
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return null
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0 ? r : null
  }
  // The glyphs' own width, without the pill's padding: a range over the element's text. That is
  // the quantity a wider face changes.
  const textWidth = (el) => {
    const range = document.createRange()
    range.selectNodeContents(el)
    return range.getBoundingClientRect().width
  }
  const base = [...document.querySelectorAll(sel)]
    .filter((el) => seen(el))
    .map((el) => {
      const ls = getComputedStyle(el).letterSpacing
      return { el, ls: ls === 'normal' ? 0 : parseFloat(ls) || 0, w: textWidth(el), n: Math.max(1, (el.textContent || '').trim().length) }
    })
  const widen = (k) => {
    for (const b of base) b.el.style.letterSpacing = (b.ls + ((k - 1) * b.w) / b.n) + 'px'
  }
  const readAt = () => {
    const labels = []
    const clipped = []
    // A zone's name is laid out in a box as wide as the zone, so beside a narrow zone it breaks
    // onto two lines and measures half as wide — half of every good number below would then be the
    // wrap's doing rather than the rule's. The readings used to force one line on from the outside,
    // which meant the shipped declaration could be deleted without a single test noticing: the
    // injected rule stood in for it. What is read here is the cascade as it ships.
    const wrapped = []
    let smallest = Infinity
    for (const el of document.querySelectorAll(sel)) {
      const r = seen(el)
      if (!r) continue
      const text = (el.textContent || '').trim()
      // A pile's name and its count are two halves of one pill ("Draghög · 20") and touch by
      // construction. One label, not two — and it is the badge, \`.byd-pile-n\`, that is read, since
      // in TV mode the wrapper around it covers the whole pile while the badge hangs over its top.
      labels.push({ text, r, pill: el.closest('.byd-pile-count') })
      if (el.matches('.byd-zone > span') && !/nowrap|pre(?!-)/.test(getComputedStyle(el).whiteSpace)) wrapped.push(text)
      smallest = Math.min(smallest, parseFloat(getComputedStyle(el).fontSize))
      if (el.scrollWidth > el.clientWidth + 1) clipped.push(text)
    }
    const hits = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
    const pairs = []
    for (let i = 0; i < labels.length; i++)
      for (let j = i + 1; j < labels.length; j++) {
        if (labels[i].pill && labels[i].pill === labels[j].pill) continue
        if (hits(labels[i].r, labels[j].r)) pairs.push(labels[i].text + ' × ' + labels[j].text)
      }
    // Off the felt. A hand's count is left out on purpose: it hangs a fixed distance below its own
    // hand by \`HAND_COUNT_MM\`, which is K9's own rule for the played felt and not a stray name.
    const felt = document.querySelector('[data-table]')?.getBoundingClientRect() ?? null
    const outside = []
    if (felt)
      for (const el of document.querySelectorAll('.byd-zone > span, .byd-seat-name')) {
        const r = seen(el)
        if (!r) continue
        if (r.left < felt.left - 1 || r.top < felt.top - 1 || r.right > felt.right + 1 || r.bottom > felt.bottom + 1) outside.push((el.textContent || '').trim())
      }
    const card = document.querySelector('.byd-pile-top')
    return {
      names: labels.map((l) => l.text),
      pairs,
      clipped,
      outside,
      wrapped,
      smallest: Number.isFinite(smallest) ? Math.round(smallest * 10) / 10 : 0,
      cardPx: card ? Math.round(card.getBoundingClientRect().width) : 0,
    }
  }
  const at = readAt()
  widen(margin)
  const wide = readAt()
  widen(1)
  return { ...at, wider: { pairs: wide.pairs, clipped: wide.clipped, outside: wide.outside } }
})(${NAME_MARGIN})`

const readNames = (html: string, size: { w: number; h: number }): Promise<Reading> => onPage(html, size, (page) => page.evaluate(READ) as Promise<Reading>)

// Everything the two issues ask of one reading, said once: the names are all there, none of them
// lies on another, none was cut short, and none was drawn off the felt — and the same is still
// true when every name is drawn `NAME_MARGIN` wider, which is what makes the answer belong to the
// design rather than to the machine it was read on (#95).
function expectClear(reading: Reading, wanted: string[], where: string): void {
  expect({ where, names: reading.names.length > 0 }).toEqual({ where, names: true })
  expect({ where, missing: wanted.filter((n) => !reading.names.includes(n)) }).toEqual({ where, missing: [] })
  expect({ where, pairs: reading.pairs }).toEqual({ where, pairs: [] })
  expect({ where, clipped: reading.clipped }).toEqual({ where, clipped: [] })
  expect({ where, outside: reading.outside }).toEqual({ where, outside: [] })
  expect({ where, wrapped: reading.wrapped }).toEqual({ where, wrapped: [] })
  const wide = `${where}, every name drawn ${Math.round((NAME_MARGIN - 1) * 100)} % wider`
  expect({ where: wide, pairs: reading.wider.pairs }).toEqual({ where: wide, pairs: [] })
  expect({ where: wide, clipped: reading.wider.clipped }).toEqual({ where: wide, clipped: [] })
  expect({ where: wide, outside: reading.wider.outside }).toEqual({ where: wide, outside: [] })
}

// Which real face drew the glyphs, asked of the browser rather than of the cascade. A computed
// `font-family` only says what was *asked for*; a face that failed to arrive leaves the rule
// standing and the glyphs drawn by something else entirely, which is the whole failure this slice
// removes. Chromium answers the real question through CDP, and says whether the face it used came
// from the document (`isCustomFont`) or from the machine.
const LABELS = '.byd-zone > span, .byd-seat-name, .byd-pile-name, .byd-pile-n, .byd-hand-count'

type Drawn = { text: string; faces: string[]; custom: boolean }

async function facesOn(page: Page, selector = LABELS): Promise<Drawn[]> {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('DOM.enable')
  await cdp.send('CSS.enable')
  const { root } = (await cdp.send('DOM.getDocument', { depth: -1 })) as { root: { nodeId: number } }
  const { nodeIds } = (await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector })) as { nodeIds: number[] }
  const out: Drawn[] = []
  for (const nodeId of nodeIds) {
    const { fonts } = (await cdp.send('CSS.getPlatformFontsForNode', { nodeId })) as { fonts: { familyName: string; glyphCount: number; isCustomFont: boolean }[] }
    const used = fonts.filter((f) => f.glyphCount > 0)
    const { outerHTML } = (await cdp.send('DOM.getOuterHTML', { nodeId })) as { outerHTML: string }
    out.push({ text: outerHTML.replace(/<[^>]*>/g, '').trim(), faces: used.map((f) => f.familyName), custom: used.length > 0 && used.every((f) => f.isCustomFont) })
  }
  await cdp.detach()
  return out
}

// The face ships so that the felt measures the same on a Mac, on a Linux box and on a TV. That
// only holds while the felt is actually drawn in it, and nothing above would notice if it were
// not: every reading here is taken on one machine, so a felt that quietly fell back to that
// machine's own face would still clear every margin on it. This is the gate against the class
// coming back, and it costs no CI time (#94, #95).
const SHIPPED_FACE = 'Roboto Condensed'

describe('the felt is written in the face that ships with it (K20, #95)', () => {
  it('draws every name in the shipped face, and would say so if it had fallen back to the machine’s own', async () => {
    const html = markupOf(<TableRenderer view={sceneOf(feltOf(4))} mode="table" size={FRAME} />)
    const drawn = await onPage(html, FRAME, (page) => facesOn(page))
    // Found at all: a selector that matches nothing agrees with everything.
    expect(drawn.length).toBeGreaterThan(8)
    expect(drawn.filter((d) => d.faces.join() !== SHIPPED_FACE || !d.custom)).toEqual([])

    // And the reading is not vacuous. The same markup, the same machine, the same assertions —
    // with the one sheet that carries the face left out. If this came back in the shipped face
    // too, the assertion above would be measuring the machine's font folder and not the app.
    const without = SHEETS.filter((s) => s !== FELT_FONT)
    const fallback = await onPage(html, FRAME, (page) => facesOn(page), without)
    expect(fallback.length).toBe(drawn.length)
    expect(fallback.filter((d) => d.faces.join() === SHIPPED_FACE || d.custom)).toEqual([])
  }, 60_000)
})

// When the face finished loading, when the browser first painted, and how wide the names were at
// each. Loading a face is asynchronous whatever its source is, so the very first layout is always
// the fallback's and that is not the question; the question is whether the face is there by the
// time anything is drawn on the screen.
const WATCH = `<script>
  const names = () => [...document.querySelectorAll('.byd-zone > span')].map((e) => Math.round(e.getBoundingClientRect().width * 10) / 10)
  // The browser's own answer for when it first put something on the screen, waited for rather than
  // sampled: a reading taken before the entry has been delivered says "never", and "never" would
  // make every comparison below true.
  window.__paint = new Promise((ok) => new PerformanceObserver((l, obs) => { const e = l.getEntries()[0]; if (e) { obs.disconnect(); ok(e.startTime) } }).observe({ type: 'paint', buffered: true }))
  window.__face = document.fonts.ready.then(() => performance.now())
  // The widths in the first frame the browser draws, read before it draws it.
  window.__painted = new Promise((ok) => requestAnimationFrame(() => ok(names())))
  window.__settled = () => names()
</script>`

// Unlike every other reading in this file, this one is taken over a real navigation rather than
// through `setContent`: a document handed to an already-loaded page has already had its first
// frame, and the question here is precisely what that frame contained.
const HOST = 'http://byd-felt.test'

type Painting = { face: number; paint: number; first: number[]; settled: number[] }

async function paintingWith(html: string, face: 'in the sheet' | 'a round trip away'): Promise<Painting> {
  const page = await browser.newPage({ viewport: { width: FRAME.w, height: FRAME.h } })
  try {
    // The control: the same face, the same bytes, arriving the way a face arrives when it is not
    // in the sheet — over the network, after the document. Nothing else about the page changes.
    const sheets = SHEETS.map((rel) =>
      rel === FELT_FONT && face === 'a round trip away' ? read(rel).replace(FACE, (_all, file: string) => `url('${HOST}/face/${file.replace('./', '')}')`) : sheet(rel),
    )
    const shell = read('index.html')
      .replace('<script type="module" src="/src/main.tsx"></script>', '')
      .replace('</head>', `<style>${sheets.join('\n')}</style></head>`)
      .replace('<div id="root"></div>', `<div id="root" style="width:${FRAME.w}px;height:${FRAME.h}px">${html}</div>${WATCH}`)
    await page.route(`${HOST}/**`, async (route) => {
      const path = new URL(route.request().url()).pathname
      if (!path.startsWith('/face/')) return route.fulfill({ contentType: 'text/html', body: shell })
      await new Promise((ok) => setTimeout(ok, 150))
      return route.fulfill({ contentType: 'font/woff2', body: readFileSync(join(import.meta.dirname, '..', 'src/fonts', path.slice('/face/'.length))) })
    })
    await page.goto(`${HOST}/`, { waitUntil: 'load' })
    const first = await page.evaluate(() => (window as unknown as { __painted: Promise<number[]> }).__painted)
    const when = await page.evaluate(() =>
      Promise.all([(window as unknown as { __face: Promise<number> }).__face, (window as unknown as { __paint: Promise<number> }).__paint]).then(([face, paint]) => ({ face, paint })),
    )
    return { ...when, first, settled: await page.evaluate(() => (window as unknown as { __settled: () => number[] }).__settled()) }
  } finally {
    await page.close()
  }
}

describe('the face is on the felt before the first painting (K20, #95)', () => {
  it('has the face loaded before anything is drawn, which it has not when the face is a round trip away', async () => {
    const html = markupOf(<TableRenderer view={sceneOf(feltOf(MAX_PLAYERS)) } mode="table" size={FRAME} />)

    // Carried in the sheet, the face is finished before the browser paints anything at all: there
    // is no network to wait for, only the decoding, and the sheet the document blocks on is where
    // the bytes already are.
    const shipped = await paintingWith(html, 'in the sheet')
    expect(shipped.first.length).toBeGreaterThan(8)
    expect({ face: 'in the sheet', beforeTheFirstPainting: shipped.face <= shipped.paint }).toEqual({ face: 'in the sheet', beforeTheFirstPainting: true })

    // And what that is worth, measured rather than asserted. The same face a round trip away is
    // not there when the felt is drawn: every one of the sixteen names is painted at the fallback's
    // width and laid out again when the face lands, and for that whole window the felt stands in
    // the state the margin gate above fells. `font-display: block` is no answer either — it hides
    // the glyphs and still lays the line out in the fallback's measurements, which is what the
    // name card's pill is drawn around.
    const late = await paintingWith(html, 'a round trip away')
    expect({ face: 'a round trip away', beforeTheFirstPainting: late.face <= late.paint }).toEqual({ face: 'a round trip away', beforeTheFirstPainting: false })
    expect(late.settled).toEqual(shipped.settled)
    expect(late.first.filter((w, i) => w === late.settled[i])).toEqual([])
  }, 60_000)
})

const seatCounts = Array.from({ length: MAX_PLAYERS - 1 }, (_, i) => i + 2)

// The felt on `/online` is turned a quarter so that the reader's own edge is the one at the
// bottom (C5), and every label is turned back about its own centre so it stays readable while the
// cards follow the table. A name pinned to one end of its own box therefore swings around that
// centre when the felt turns: a line that was a hundred pixels wide becomes a hundred tall, around
// a point that did not move. A placement measured only at rest is a placement measured nowhere,
// so every reading below is taken at all four turns.
const TURNS = [0, 90, 180, 270] as const
const scenes = seatCounts.flatMap((seats) => TURNS.flatMap((rotate) => [false, true].map((market) => [seats, rotate, market] as const)))

describe('the played felt says every name once, in table mode (K9, #71)', () => {
  it.each(scenes)('lays no name over another at %i seats, turned %i°, market %s', async (seats, rotate, market) => {
    const setup = feltOf(seats, market)
    const html = markupOf(<TableRenderer view={sceneOf(setup)} mode="table" rotate={rotate} size={FRAME} />)
    expectClear(await readNames(html, FRAME), namesOf(setup), `table mode, ${seats} seats, turned ${rotate}°, market ${market}`)
  }, 60_000)
})

// The TV draws the felt inside its own chrome and points a camera at it (C5), so the box the
// renderer gets is the chrome's, not the screen's. It is measured first and handed back, which is
// what the renderer does for itself when there is a browser to measure in.
const tv = (body: ReactElement) => (
  <TvChrome view={sceneOf(feltOf(2))} activity={[]} roomCode="KX7P" title="Namnen" version="rev-1">
    {body}
  </TvChrome>
)
async function tvFelt(scene: Snapshot, size: { w: number; h: number }): Promise<string> {
  const main = await onPage(markupOf(tv(<div />)), size, (page) =>
    page.evaluate(() => {
      const r = document.querySelector('[data-tv] > main')!.getBoundingClientRect()
      return { w: Math.round(r.width), h: Math.round(r.height) }
    }),
  )
  return markupOf(tv(<TableRenderer view={scene} mode="tv" camera size={main} glideMs={0} />))
}

const counted = seatCounts.flatMap((seats) => [false, true].map((market) => [seats, market] as const))

describe('the played felt says every name once, in TV mode (K9, #43)', () => {
  it.each(counted)('lays no name over another, and none off the felt, at %i seats, market %s', async (seats, market) => {
    const setup = feltOf(seats, market)
    // The TV has a dock that says who sits where (K9), so the felt itself draws no name card
    // there; what is on it is the zones' names and the piles'.
    const wanted = namesOf(setup).filter((n) => !setup.seats.map(seatNameOf).includes(n))
    expectClear(await readNames(await tvFelt(sceneOf(setup), FRAME), FRAME), wanted, `TV mode, ${seats} seats, market ${market}`)
  }, 60_000)
})

// The editor's Bord tab is the same renderer with the designer's handles laid over it, so it is
// the same question asked a third time (#43). The tab is mounted as it ships, out of a real
// project on a real server, and the markup that mounts is what Chromium is given.
// The windows a designer actually has. L12 makes the editor desk-first, and 1280 x 800 and
// 1440 x 900 *are* desks: the felt's box was `min(70vh, 720px)`, so the 720 ceiling only ever
// bound above about 1030 px of window, and every number the previous slice reported was taken at
// a height almost nobody sits at. The tallest is kept because it is where the ceiling binds.
const DESKS = [
  { w: 1280, h: 800 },
  { w: 1440, h: 900 },
  { w: 1280, h: 1200 },
] as const
const DESK = DESKS[2]

// The knobs on the left reach the felt through the project's own client, which answers when it
// answers; the handle is what says the recipe has actually been turned.
const handleFor = (id: string): Promise<HTMLElement> =>
  waitFor(() => {
    const el = document.querySelector(`[data-zone-handle="${id}"]`)
    if (!el) throw new Error(`no handle for ${id} yet`)
    return el as HTMLElement
  })

async function bordTab(seats: number, felt: { w: number; h: number } | null, desk: { w: number; h: number }, market: boolean, picked = 'mine:B'): Promise<string> {
  // jsdom has no layout, so the renderer's own measurement of the box it was given comes back
  // zero and the whole felt collapses. The box comes from the real stylesheet at a real window
  // (the pass before this one) and is handed to the frame here, which is the one thing jsdom
  // cannot answer for itself.
  const frames = felt
  const clientBox = (side: 'Width' | 'Height') =>
    Object.getOwnPropertyDescriptor(HTMLElement.prototype, `client${side}`) ??
    ({ get: () => 0, configurable: true } as PropertyDescriptor)
  const before = { Width: clientBox('Width'), Height: clientBox('Height') }
  const hadObserver = (globalThis as { ResizeObserver?: unknown }).ResizeObserver
  if (frames) {
    for (const [side, size] of [['Width', frames.w] as const, ['Height', frames.h] as const])
      Object.defineProperty(HTMLElement.prototype, `client${side}`, {
        configurable: true,
        get(this: HTMLElement) {
          return this.classList.contains('byd-table-frame') ? size : 0
        },
      })
    // The renderer asks the box how big it is and then watches it. jsdom has neither answer, and
    // without the watcher it does not ask at all.
    class Stub {
      observe() {
        return undefined
      }
      disconnect() {
        return undefined
      }
    }
    ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = Stub
  }
  // A project of its own each time. The editor sends every turn of a knob to the project's actor
  // as it is made (D3), so a shared project would carry one reading's recipe into the next and
  // the tick box a test means to turn on would be the one it turns off.
  const project_ = `p${++projects}`
  await run.projects.create(project_, projectDoc())
  atWidth(desk.w)
  history.replaceState(null, '', `/editor?project=${project_}&server=${encodeURIComponent(run.http)}`)
  const { unmount } = render(<EditorPage />)
  try {
    await screen.findByText('Skogens herrar')
    fireEvent.click(screen.getByRole('tab', { name: 'Bord' }))
    // Turned up to the table the two issues are about: every seat with a hand, an area in front
    // of it and a counter beside that, which is the recipe that puts two names in one seat's own
    // place setting.
    fireEvent.click(screen.getByRole('button', { name: String(seats) }))
    fireEvent.click(screen.getByLabelText(/en yta framför sig/))
    fireEvent.click(screen.getByRole('button', { name: /Räknare$/ }))
    if (market) fireEvent.click(screen.getByLabelText(/en marknad/))
    // One zone picked up, because picking one up is when the editor has always drawn a second
    // name on it: the handle says what it is while the felt underneath is already saying so.
    fireEvent.click(await handleFor(picked))
    await handleFor(`counters:${SEAT_IDS[seats - 1]}`)
    return document.querySelector('.byd-setup')!.outerHTML
  } finally {
    unmount()
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', before.Width)
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', before.Height)
    if (hadObserver) (globalThis as { ResizeObserver?: unknown }).ResizeObserver = hadObserver
    else delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver
  }
}

// The tab as it really lays out: the box the stylesheet gives the felt, read first, then the felt
// drawn into that box. The box is the window's answer and not the table's — the felt's frame is
// `width: 100%; height: 100%` inside a grid track that cannot grow with what is drawn in it — so
// it is read once per window and kept. Mounting the whole editor out of a real project is by far
// the slowest thing this suite does, and doing it twice for every scene starved the rest of the
// package's sockets until a save somewhere else lost its four-second race.
const boxes = new Map<string, { w: number; h: number }>()
async function feltBox(desk: { w: number; h: number }): Promise<{ w: number; h: number }> {
  const key = `${desk.w}x${desk.h}`
  const known = boxes.get(key)
  if (known) return known
  const box = await onPage(await bordTab(2, null, desk, false), desk, (page) =>
    page.evaluate(() => {
      const r = document.querySelector('.byd-setup-felt')!.getBoundingClientRect()
      return { w: Math.round(r.width), h: Math.round(r.height) }
    }),
  )
  boxes.set(key, box)
  return box
}

async function bordTabDrawn(seats: number, desk: { w: number; h: number } = DESK, market = false, picked = 'mine:B'): Promise<string> {
  return bordTab(seats, await feltBox(desk), desk, market, picked)
}

describe('one name per zone (#43)', () => {
  it('gives every zone in the Bord tab exactly one name, and it is the name on the screen', async () => {
    const html = await bordTabDrawn(2)
    const counted = await onPage(html, DESK, (page) =>
      page.evaluate(() => {
        const shown = (el: Element | null) => !!el && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden'
        const out: Record<string, string[]> = {}
        for (const handle of document.querySelectorAll('.byd-setup-handle')) {
          const id = handle.getAttribute('data-zone-handle') ?? '?'
          const seat = id.startsWith('hand:') ? id.slice(5) : null
          out[id] = [
            handle.querySelector(':scope > span'),
            document.querySelector(`.byd-zone[data-area="${id}"] > span`),
            document.querySelector(`.byd-pile[data-zone="${id}"] .byd-pile-count`),
            seat ? document.querySelector(`.byd-seat-name[data-seat-name="${seat}"]`) : null,
          ]
            .filter(shown)
            .map((el) => (el!.textContent ?? '').trim())
        }
        return out
      }),
    )
    // Not two — which is the whole of the reported collision — and not none either: a zone the
    // designer cannot read the name of is what this tab exists to prevent (B5).
    expect(Object.keys(counted).length).toBeGreaterThan(4)
    expect(Object.entries(counted).filter(([, names]) => names.length !== 1)).toEqual([])
    // And counting is not enough: the one name drawn on a hand has to be the name that hand is
    // actually known by. It is the seat's, because a hand has no name of its own to give — the
    // panel no longer offers to type one, the keyboard's list of places says the same, and what
    // the felt lays on the hand is the seat's name card (K9, K19). Counting the card while the
    // string on it belonged to something else is how "the felt names every hand" stayed true on
    // paper and false on the screen.
    expect({ 'hand:A': counted['hand:A'], 'hand:B': counted['hand:B'] }).toEqual({ 'hand:A': ['A'], 'hand:B': ['B'] })
    expect(Object.values(counted).flat()).not.toContain('Hand')
  }, 60_000)
})

describe('the Bord tab gives the felt the room its names need (#43)', () => {
  // Arithmetic before it is placement, and the arithmetic changed. A place setting is 500 mm and
  // its two names used to want the whole of it side by side, which is where the 200 px floor and
  // the felt's 720 px ceiling came from. One name to a line means a cover has to hold only the
  // longer of the two, and the felt's box no longer has to be conjured taller than the window.
  // What is asserted is therefore the thing the tab is for: a name fits in the cover it names.
  it.each(DESKS)('gives a seat room for its own name at eight seats, at $w × $h', async (desk) => {
    const html = await bordTabDrawn(MAX_PLAYERS, desk)
    const room = await onPage(html, desk, (page) =>
      page.evaluate(() => {
        const box = (sel: string) => document.querySelector(sel)!.getBoundingClientRect()
        const cover = Math.round(box('[data-zone-handle="counters:A"]').right - box('[data-zone-handle="mine:A"]').left)
        const names = [...document.querySelectorAll('.byd-zone[data-area^="mine:"] > span, .byd-zone[data-area^="counters:"] > span')]
        return { cover, widest: Math.round(Math.max(...names.map((n) => n.getBoundingClientRect().width))) }
      }),
    )
    expect({ at: `${desk.w} × ${desk.h}`, fits: room.cover >= room.widest, ...room }).toEqual({ at: `${desk.w} × ${desk.h}`, fits: true, ...room })
  }, 60_000)

  // Mounting the whole editor out of a real project is the slow part of this suite, so the
  // sweep is spent where it buys something. The shortest window draws the smallest felt and is
  // therefore where names meet first: it carries every seat count. The taller two are only asked
  // about the counts that crowd a felt at all — the ones where a rim first carries two seats.
  const desks = DESKS.flatMap((desk, i) =>
    (i === 0 ? seatCounts : seatCounts.filter((n) => n >= MAX_PLAYERS - 1)).flatMap((seats) =>
      [false, true].map((market) => [`${desk.w} × ${desk.h}, ${seats} seats, market ${market}`, desk, seats, market] as const),
    ),
  )
  it.each(desks)('lays no name over another at %s', async (_at, desk, seats, market) => {
    // What the tab is for is reading the names, so the reading has to find them all: both of
    // every seat's own zones, both shared piles, and the card that says whose hand is whose.
    const seatsHere = SEAT_IDS.slice(0, seats)
    const wanted = [...seatsHere.flatMap((s) => [`Framför ${s}`, `Räknare ${s}`, s]), 'Draghög', 'Kasthög', ...(market ? ['Marknad'] : [])]
    expectClear(await readNames(await bordTabDrawn(seats, desk, market), desk), wanted, `the Bord tab at ${desk.w} × ${desk.h}, ${seats} seats, market ${market}`)
  }, 60_000)
})

// K18 measured what a card's short side comes to on the TV at eight seats and wrote the numbers
// down, because three metres away that is the whole of whether the table can be read. Moving a
// name touches none of it — not the felt's size, not the fit, not the camera — and this is what
// says so rather than anyone's word for it.
describe('a name that moved changed no readability number (K9, K18)', () => {
  it.each([
    [1280, 800, 27],
    [1920, 1080, 40],
    [3840, 2160, 89],
  ])('draws the card %i × %i px wide at eight seats', async (w, h, cardPx) => {
    const size = { w, h }
    const reading = await readNames(await tvFelt(sceneOf(feltOf(MAX_PLAYERS)), size), size)
    // And the smallest name is the 12 px it has always been: nothing shrank to make room.
    expect({ card: reading.cardPx, smallest: reading.smallest }).toEqual({ card: cardPx, smallest: 12 })
  }, 60_000)
})

// The rule turns on a zone having a seat. A zone nobody owns has no seat's middle to grow toward,
// so it keeps the placement the felt has always given it — and that is the rule rather than an
// exception to it, since half a rule was measured and found worse than none.
describe('a zone nobody owns keeps the name where it was (K19)', () => {
  it('leaves the shared market’s name above its own top edge, at its left corner', async () => {
    const setup = applyRecipe(emptySetup(), { players: 4, mine: true, discard: true, market: true, counters: COUNTERS }, SWEDISH_WORDS)
    const html = markupOf(<TableRenderer view={sceneOf(setup)} mode="table" size={FRAME} />)
    const at = await onPage(html, FRAME, (page) =>
      page.evaluate(() => {
        const zone = document.querySelector('.byd-zone[data-area="market"]')!
        const name = zone.querySelector(':scope > span')!.getBoundingClientRect()
        const box = zone.getBoundingClientRect()
        return { above: Math.round(box.top - name.bottom), fromLeft: Math.round(name.left - box.left), rim: zone.getAttribute('data-rim'), grow: zone.getAttribute('data-grow') }
      }),
    )
    expect(at.rim).toBe('none')
    expect(at.grow).toBe('fwd')
    expect(at.above).toBeGreaterThanOrEqual(0)
    expect(at.fromLeft).toBeGreaterThan(0)
  }, 60_000)
})
