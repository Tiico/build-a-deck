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
import { join } from 'node:path'
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
// The editor's Bord tab is one of the five surfaces, so the shared button language goes over
// it here as it does on the page itself; the felt's own sheets go under.
const SHEETS = ['src/table/table.css', 'src/table/texture.css', 'src/table/keyboard.css', 'src/editor/editor.css', 'src/buttons.css', 'src/a11y.css']

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
const feltOf = (seats: number): Setup =>
  applyRecipe(emptySetup(), { players: seats, mine: true, discard: true, market: false, counters: COUNTERS }, SWEDISH_WORDS)

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

async function onPage<T>(html: string, size: { w: number; h: number }, look: (page: Page) => Promise<T>): Promise<T> {
  const page = await browser.newPage({ viewport: { width: size.w, height: size.h } })
  try {
    const shell = read('index.html')
      .replace('<script type="module" src="/src/main.tsx"></script>', '')
      .replace('</head>', `<style>${SHEETS.map(read).join('\n')}</style></head>`)
      .replace('<div id="root"></div>', `<div id="root" style="width:${size.w}px;height:${size.h}px">${html}</div>`)
    await page.setContent(shell, { waitUntil: 'load' })
    // A zone's name is laid out in a box as wide as the zone, so beside a narrow zone it wraps
    // onto two lines and measures half as wide. Half of any good number would then be the wrap's
    // doing rather than the rule's, and a later `nowrap` — which a seat's name card already has —
    // would quietly undo it. Every reading here is taken with the names forced onto one line.
    await page.addStyleTag({ content: '.byd-zone > span { white-space: nowrap }' })
    return await look(page)
  } finally {
    await page.close()
  }
}

type Reading = { names: string[]; pairs: string[]; clipped: string[]; outside: string[]; smallest: number; cardPx: number }

// What the two issues are about, read off the DOM: which names are visible, which pairs of them
// lie on the same pixels, which were cut short by the box they were given, and which were drawn
// off the felt altogether.
const READ = `(() => {
  const sel = ['.byd-zone > span', '.byd-seat-name', '.byd-setup-handle > span', '.byd-pile-name', '.byd-pile-n', '.byd-hand-count'].join(', ')
  const seen = (el) => {
    const s = getComputedStyle(el)
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return null
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0 ? r : null
  }
  const labels = []
  const clipped = []
  let smallest = Infinity
  for (const el of document.querySelectorAll(sel)) {
    const r = seen(el)
    if (!r) continue
    const text = (el.textContent || '').trim()
    // A pile's name and its count are two halves of one pill ("Draghög · 20") and touch by
    // construction. One label, not two — and it is the badge, \`.byd-pile-n\`, that is read, since
    // in TV mode the wrapper around it covers the whole pile while the badge hangs over its top.
    labels.push({ text, r, pill: el.closest('.byd-pile-count') })
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
    smallest: Number.isFinite(smallest) ? Math.round(smallest * 10) / 10 : 0,
    cardPx: card ? Math.round(card.getBoundingClientRect().width) : 0,
  }
})()`

const readNames = (html: string, size: { w: number; h: number }): Promise<Reading> => onPage(html, size, (page) => page.evaluate(READ) as Promise<Reading>)

// Everything the two issues ask of one reading, said once: the names are all there, none of them
// lies on another, none was cut short, and none was drawn off the felt.
function expectClear(reading: Reading, wanted: string[], where: string): void {
  expect({ where, names: reading.names.length > 0 }).toEqual({ where, names: true })
  expect({ where, missing: wanted.filter((n) => !reading.names.includes(n)) }).toEqual({ where, missing: [] })
  expect({ where, pairs: reading.pairs }).toEqual({ where, pairs: [] })
  expect({ where, clipped: reading.clipped }).toEqual({ where, clipped: [] })
  expect({ where, outside: reading.outside }).toEqual({ where, outside: [] })
}

const seatCounts = Array.from({ length: MAX_PLAYERS - 1 }, (_, i) => i + 2)

describe('the played felt says every name once, in table mode (K9, #71)', () => {
  it.each(seatCounts)('lays no name over another at %i seats', async (seats) => {
    const setup = feltOf(seats)
    const html = markupOf(<TableRenderer view={sceneOf(setup)} mode="table" size={FRAME} />)
    expectClear(await readNames(html, FRAME), namesOf(setup), `table mode, ${seats} seats`)
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

describe('the played felt says every name once, in TV mode (K9, #43)', () => {
  it.each(seatCounts)('lays no name over another, and none off the felt, at %i seats', async (seats) => {
    const setup = feltOf(seats)
    // The TV has a dock that says who sits where (K9), so the felt itself draws no name card
    // there; what is on it is the zones' names and the piles'.
    const wanted = namesOf(setup).filter((n) => !setup.seats.map(seatNameOf).includes(n))
    expectClear(await readNames(await tvFelt(sceneOf(setup), FRAME), FRAME), wanted, `TV mode, ${seats} seats`)
  }, 60_000)
})

// The editor's Bord tab is the same renderer with the designer's handles laid over it, so it is
// the same question asked a third time (#43). The tab is mounted as it ships, out of a real
// project on a real server, and the markup that mounts is what Chromium is given.
const DESK = { w: 1280, h: 1200 }

// The knobs on the left reach the felt through the project's own client, which answers when it
// answers; the handle is what says the recipe has actually been turned.
const handleFor = (id: string): Promise<HTMLElement> =>
  waitFor(() => {
    const el = document.querySelector(`[data-zone-handle="${id}"]`)
    if (!el) throw new Error(`no handle for ${id} yet`)
    return el as HTMLElement
  })

async function bordTab(seats: number, felt: { w: number; h: number } | null, picked = 'mine:B'): Promise<string> {
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
  atWidth(DESK.w)
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
// drawn into that box.
async function bordTabDrawn(seats: number, picked = 'mine:B'): Promise<string> {
  const box = await onPage(await bordTab(seats, null, picked), DESK, (page) =>
    page.evaluate(() => {
      const r = document.querySelector('.byd-setup-felt')!.getBoundingClientRect()
      return { w: Math.round(r.width), h: Math.round(r.height) }
    }),
  )
  return bordTab(seats, box, picked)
}

describe('one name per zone (#43)', () => {
  it('gives every zone in the Bord tab exactly one name, and never two', async () => {
    const html = await bordTabDrawn(2)
    const counted = await onPage(html, DESK, (page) =>
      page.evaluate(() => {
        const shown = (el: Element | null) => !!el && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden'
        const out: Record<string, number> = {}
        for (const handle of document.querySelectorAll('.byd-setup-handle')) {
          const id = handle.getAttribute('data-zone-handle') ?? '?'
          const seat = id.startsWith('hand:') ? id.slice(5) : null
          out[id] = [
            handle.querySelector(':scope > span'),
            document.querySelector(`.byd-zone[data-area="${id}"] > span`),
            document.querySelector(`.byd-pile[data-zone="${id}"] .byd-pile-count`),
            seat ? document.querySelector(`.byd-seat-name[data-seat-name="${seat}"]`) : null,
          ].filter(shown).length
        }
        return out
      }),
    )
    // Not two — which is the whole of the reported collision — and not none either: a zone the
    // designer cannot read the name of is what this tab exists to prevent (B5).
    expect(Object.keys(counted).length).toBeGreaterThan(4)
    expect(Object.entries(counted).filter(([, n]) => n !== 1)).toEqual([])
  }, 60_000)
})

describe('the Bord tab gives the felt the room its names need (#43)', () => {
  // Arithmetic before it is placement: a seat's place setting is 500 mm, and its two names want
  // around 200 px of it. The felt's box is what decides whether those pixels exist, and no
  // placement rule can conjure them.
  it('draws a seat at least 200 px along its own rim at eight seats', async () => {
    const html = await bordTabDrawn(MAX_PLAYERS)
    const px = await onPage(html, DESK, (page) =>
      page.evaluate(() => {
        const box = (sel: string) => document.querySelector(sel)!.getBoundingClientRect()
        return Math.round(box('[data-zone-handle="counters:A"]').right - box('[data-zone-handle="mine:A"]').left)
      }),
    )
    expect(px).toBeGreaterThanOrEqual(200)
  }, 60_000)

  it.each(seatCounts)('lays no name over another at %i seats', async (seats) => {
    // What the tab is for is reading the names, so the reading has to find them all: both of
    // every seat's own zones, both shared piles, and the card that says whose hand is whose.
    const seatsHere = SEAT_IDS.slice(0, seats)
    const wanted = [...seatsHere.flatMap((s) => [`Framför ${s}`, `Räknare ${s}`, s]), 'Draghög', 'Kasthög']
    expectClear(await readNames(await bordTabDrawn(seats), DESK), wanted, `the Bord tab, ${seats} seats`)
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
