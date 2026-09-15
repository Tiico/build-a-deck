// @vitest-environment jsdom
// Where a seat's counters may lie, so that a finger can reach every one of them (C4, K18, #89).
//
// #67 gave a lone chip an invisible, properly projected target and `counter-touch.test.ts` holds
// that end: 44 × 44 on the projected box, at one counter per seat. This is the other end, and the
// prototype's first finding is why it exists: counting overlapping PAIRS is not enough. A 44 px
// target is about a hundred millimetres of felt, four times the chip beneath it, and the counters
// zone is drawn to the chip — so at one counter per seat no two targets overlap at any screen, and
// at 1280 × 800 with eight seats the target still lay outside its own zone in 8 cases of 8 and
// inside a NEIGHBOUR's zone in 12. The gate therefore reads three things at once: the size of each
// projected box, whether any two boxes share pixels, and whether a box reaches into a zone that is
// not its chip's — and prints the pairs compared and the targets read, so that a sweep which
// measured nothing cannot pass for a sweep that found nothing.
//
// Everything is read off `getBoundingClientRect()` in real Chromium with the sheets that ship, and
// never off the size the renderer wrote. Ratios and minimums only: CI's Linux has other fonts than
// a Mac (browser-tests-must-not-pin-mac-pixels), and the felt's letters are its own (K20).
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { ReactElement } from 'react'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { chromium, type Browser, type Page } from 'playwright'
import { STANDARD_TYPES, TypeRegistry, initialState, project } from '@byd/engine'
import type { Snapshot } from '@byd/protocol'
import { MAX_PLAYERS, SWEDISH_WORDS, openingSetup, setupFromProject, type Setup } from '@byd/server/doc'
import { TableRenderer } from '../src/table/TableRenderer.js'
import { TvChrome } from '../src/table/TvChrome.js'
import { TOUCH_PX } from '../src/table/fit.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const FACE = /url\('(\.\/[^']+\.woff2)'\)/g
const sheet = (rel: string): string =>
  read(rel).replace(FACE, (_all, file: string) => `url('data:font/woff2;base64,${readFileSync(join(import.meta.dirname, '..', dirname(rel), file)).toString('base64')}')`)
const SHEETS = ['src/fonts/felt-font.css', 'src/table/table.css', 'src/table/texture.css', 'src/table/keyboard.css', 'src/buttons.css', 'src/a11y.css']

const registry = new TypeRegistry(STANDARD_TYPES)

// As many counters as a seat can be given, in the order the editor's own button adds them. Four
// is past the rule's own hinge on purpose: whatever answers three has to answer four as well.
const NAMED = [
  { name: 'Poäng', start: 0 },
  { name: 'Liv', start: 20 },
  { name: 'Rundor', start: 1 },
  { name: 'Kort', start: 5 },
]
const COUNTS = [1, 2, 3, 4] as const

// The screens the issue was measured on. The perspective is 1600 px whatever the window, so a
// taller felt leans further away at its far edge and a target large enough at 1280 × 800 is not
// large enough at 4K — and the other way about.
const FRAMES = [
  { w: 1280, h: 800 },
  { w: 1920, h: 1080 },
  { w: 3840, h: 2160 },
] as const
const MODES = ['tv', 'table'] as const
const SEATS = Array.from({ length: MAX_PLAYERS - 1 }, (_, i) => i + 2)

const feltOf = (seats: number, counters: number): Setup =>
  openingSetup({ players: seats, counters: NAMED.slice(0, counters) }, SWEDISH_WORDS)

// The table as the server would deal it, laid out by the one function that lays chips out — a
// test that placed its own chips would be measuring the test's arithmetic and not the product's.
function sceneOf(setup: Setup): Snapshot {
  const rows = Array.from({ length: 20 }, (_, i) => ({ id: `Kort ${i + 1}`, fields: {} }))
  return project(initialState('zone', setupFromProject({ rows, setup }), registry), registry, null)
}
// Which zone each chip lies in, read off the same scene, so the sweep knows whose rectangle is
// whose without the renderer having to say so on the felt.
const zoneOfChip = (scene: Snapshot): Record<string, string> =>
  Object.fromEntries(scene.components.filter((c) => c.type.id === 'token.counter').map((c) => [c.id, c.zone]))

function markupOf(node: ReactElement): string {
  const { container, unmount } = render(node)
  const html = container.innerHTML
  unmount()
  return html
}

let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser.close()
}, 60_000)

async function onPage<T>(html: string, size: { w: number; h: number }, look: (page: Page) => Promise<T>): Promise<T> {
  const page = await browser.newPage({ viewport: { width: size.w, height: size.h } })
  try {
    const shell = read('index.html')
      .replace('<script type="module" src="/src/main.tsx"></script>', '')
      .replace('</head>', `<style>${SHEETS.map(sheet).join('\n')}</style></head>`)
      .replace('<div id="root"></div>', `<div id="root" style="width:${size.w}px;height:${size.h}px">${html}</div>`)
    await page.setContent(shell, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
    return await look(page)
  } finally {
    await page.close()
  }
}

// A table that can be played on: the target exists for the hand, and a table that is only shown
// has no hand to answer (K16, K9).
const act = () => undefined
const tv = (scene: Snapshot, body: ReactElement) => (
  <TvChrome view={scene} activity={[]} roomCode="KX7P" title="Räknarna" version="rev-1">
    {body}
  </TvChrome>
)
async function feltMarkup(scene: Snapshot, mode: 'tv' | 'table', frame: { w: number; h: number }): Promise<string> {
  if (mode === 'table') return markupOf(<TableRenderer view={scene} mode="table" size={frame} onAct={act} />)
  const main = await onPage(markupOf(tv(scene, <div />)), frame, (page) =>
    page.evaluate(() => {
      const r = document.querySelector('[data-tv] > main')!.getBoundingClientRect()
      return { w: Math.round(r.width), h: Math.round(r.height) }
    }),
  )
  return markupOf(tv(scene, <TableRenderer view={scene} mode="tv" camera size={main} glideMs={0} onAct={act} />))
}

// A pixel is what two rounded placements can promise each other; anything deeper is one target on
// another, or a target in somebody else's rectangle. Hands are not among the rectangles read: what
// a hand draws is its fan, which is deeper than its strip and hangs out over the wood on purpose
// (K2, #65), and `felt-hands.test.tsx` holds that end.
const SLACK_PX = 1
const READ = `(() => {
  const box = (el) => el.getBoundingClientRect()
  const deep = (a, b) => a.left < b.right - ${SLACK_PX} && b.left < a.right - ${SLACK_PX} && a.top < b.bottom - ${SLACK_PX} && b.top < a.bottom - ${SLACK_PX}
  const zones = [...document.querySelectorAll('.byd-zone[data-area]')].map((el) => ({ id: el.dataset.area, r: box(el) }))
  const targets = [...document.querySelectorAll('.byd-token-hit')].map((el) => ({ id: el.dataset.counterHit, r: box(el) }))
  const card = document.querySelector('.byd-pile[data-zone] .byd-pile-top')
  const cardBox = card ? box(card) : null
  return {
    zones: zones.map((z) => z.id),
    targets: targets.map((t) => ({ id: t.id, w: Math.round(t.r.width * 10) / 10, h: Math.round(t.r.height * 10) / 10 })),
    pairs: (targets.length * (targets.length - 1)) / 2,
    overlapping: targets.flatMap((a, i) => targets.slice(i + 1).filter((b) => deep(a.r, b.r)).map((b) => a.id + ' × ' + b.id)),
    inside: targets.flatMap((t) => zones.filter((z) => deep(t.r, z.r)).map((z) => t.id + ' → ' + z.id)),
    card: cardBox ? Math.round(Math.min(cardBox.width, cardBox.height) * 10) / 10 : 0,
  }
})()`
type Reading = {
  zones: string[]
  targets: { id: string; w: number; h: number }[]
  pairs: number
  overlapping: string[]
  inside: string[]
  card: number
}

// What one felt says about itself, in the terms the issue asks for.
async function sweep(seats: number, counters: number, mode: 'tv' | 'table', frame: { w: number; h: number }) {
  const scene = sceneOf(feltOf(seats, counters))
  const home = zoneOfChip(scene)
  const r = await onPage(await feltMarkup(scene, mode, frame), frame, (page) => page.evaluate(READ) as Promise<Reading>)
  return {
    targets: r.targets.length,
    pairs: r.pairs,
    zones: r.zones.length,
    under44: r.targets.filter((t) => t.w < TOUCH_PX || t.h < TOUCH_PX).map((t) => `${t.id} ${t.w}×${t.h}`),
    overlapping: r.overlapping,
    // A target may hang out of its own zone: the zone is drawn to the 24 mm chip and the finger
    // is four times that, and what lies beyond is the open felt. Another seat's rectangle is the
    // offence, because a press there is a press on somebody else's business.
    trespassing: r.inside.filter((line) => home[line.split(' → ')[0] ?? ''] !== line.split(' → ')[1]),
    card: r.card,
  }
}

const cases = MODES.flatMap((mode) => FRAMES.map((frame) => [mode, frame] as const))

describe('every counter a seat has answers a finger of its own, inside its own business (C4, K18, #89)', () => {
  it.each(cases)('in %s mode at %o', async (mode, frame) => {
    const got: Record<string, unknown> = {}
    const want: Record<string, unknown> = {}
    const cards: Record<string, number> = {}
    for (const seats of SEATS) {
      for (const counters of COUNTS) {
        const key = `${seats} seats, ${counters} counters`
        const r = await sweep(seats, counters, mode, frame)
        // One target per chip while the chips lie side by side, and one for the whole pile once
        // they are stacked: three counters are one thing to press, not three (#89).
        const n = seats * (counters <= 2 ? counters : 1)
        // Pinned, not echoed: a reading of nothing would otherwise pass every list below.
        got[key] = { targets: r.targets, pairs: r.pairs, zones: r.zones, under44: r.under44, overlapping: r.overlapping, trespassing: r.trespassing }
        want[key] = {
          targets: n,
          pairs: (n * (n - 1)) / 2,
          // The recipe draws one `Framför` and one counters zone per seat, and nothing else here
          // is an area: a zone list shorter than that is a felt that was not drawn.
          zones: seats * 2,
          under44: [],
          overlapping: [],
          trespassing: [],
        }
        cards[key] = r.card
      }
    }
    expect({ mode, frame, ...got }).toEqual({ mode, frame, ...want })
    // The felt did not quietly shrink to make room (K9, K18): a card is the same size on this
    // screen whether a seat keeps one count or four. An exact pixel value is not pinned — the TV's
    // chrome is laid out in fonts CI does not share — the invariance is.
    for (const seats of SEATS) {
      const sides = COUNTS.map((n) => cards[`${seats} seats, ${n} counters`])
      expect({ mode, frame, seats, sides }).toEqual({ mode, frame, seats, sides: sides.map(() => sides[0]) })
      expect({ mode, frame, seats, drawn: (sides[0] ?? 0) > 0 }).toEqual({ mode, frame, seats, drawn: true })
    }
  }, 300_000)
})
