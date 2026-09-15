// @vitest-environment jsdom
// A hand's fan stays in its own zone (C5, K9, K18, #84). The recipe lays a hand 60 mm deep along
// the rim and a card in a fan is 75 mm tall, so a fan drawn about the zone's centre reaches into
// whatever lies next to the hand — on the TV, seat B's three cards and its count lay in
// "Framför B". C5 lets the camera cut a hand; nothing lets a hand cut a neighbour. Where a fan
// and its count land is a layout fact, so as in `felt-names.test.tsx` the real renderer's markup
// is measured in real Chromium against the sheets that ship, and every rectangle the fan draws
// is held against every other zone's.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { ReactElement } from 'react'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { chromium, type Browser, type Page } from 'playwright'
import { CARD_STANDARD_63x88, STANDARD_TYPES, TOKEN_COUNTER, TypeRegistry, initialState, project, type SetupDef } from '@byd/engine'
import type { Snapshot } from '@byd/protocol'
import { MAX_PLAYERS, SWEDISH_WORDS, openingSetup, type Setup } from '@byd/server/doc'
import { TableRenderer } from '../src/table/TableRenderer.js'
import { TvChrome } from '../src/table/TvChrome.js'
import { FAN_MAX } from '../src/table/hand.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')

// The sheets as they ship, the felt's face inlined the way the build inlines it (#95).
const FACE = /url\('(\.\/[^']+\.woff2)'\)/g
const sheet = (rel: string): string =>
  read(rel).replace(FACE, (_all, file: string) => `url('data:font/woff2;base64,${readFileSync(join(import.meta.dirname, '..', dirname(rel), file)).toString('base64')}')`)
const SHEETS = ['src/fonts/felt-font.css', 'src/table/table.css', 'src/table/texture.css', 'src/table/keyboard.css', 'src/buttons.css', 'src/a11y.css']

const registry = new TypeRegistry(STANDARD_TYPES)
const CARD = { id: CARD_STANDARD_63x88.id, version: 1 }
const TOKEN = { id: TOKEN_COUNTER.id, version: 1 }
const COUNTERS = [{ name: 'Poäng', start: 0 }]
const DECK = 20
// The screen the audit was taken on (UX-39).
const FRAME = { w: 1280, h: 800 }

// The table the wizard lays out for that many seats (K18): every seat with a hand, an area in
// front and a counter beside it, which is the recipe that puts a zone right next to every hand.
const feltOf = (seats: number): Setup => openingSetup({ players: seats, counters: COUNTERS }, SWEDISH_WORDS)

// The same table as the engine projects it, with `held` cards in every hand: a fan is measured
// with something in it, since an empty hand draws no fan.
function sceneOf(setup: Setup, held: number): Snapshot {
  const def: SetupDef = {
    seats: setup.seats,
    floor: setup.floor,
    zones: setup.zones.map((z) => ({
      id: z.id,
      kind: z.kind,
      name: z.name,
      visibility: z.visibility,
      geometry: z.geometry,
      ...(z.owner ? { owner: z.owner } : {}),
      ...(z.returnTo ? { returnTo: z.returnTo } : {}),
      ...(z.shortcut ? { shortcut: z.shortcut } : {}),
    })),
    components: [
      ...Array.from({ length: DECK }, (_, i) => ({ type: CARD, cardRef: `Kort ${i + 1}`, zone: setup.deckZone, face: 'back' as const })),
      ...setup.seats.flatMap((seat) => Array.from({ length: held }, (_, i) => ({ type: CARD, cardRef: `Hand ${seat}${i}`, zone: `hand:${seat}`, face: 'back' as const }))),
      ...setup.seats.flatMap((seat) =>
        setup.zones.some((z) => z.id === `counters:${seat}`) ? COUNTERS.map((c, i) => ({ type: TOKEN, cardRef: c.name, zone: `counters:${seat}`, face: 'front' as const, counter: c.start, x: 8 + i * 32, y: 8 })) : [],
      ),
    ],
  }
  return project(initialState('hands', def, registry), registry, null)
}

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

// The TV draws the felt inside its own chrome and points a camera at it (C5), so the box the
// renderer gets is the chrome's: measured first and handed back, as the renderer does for itself.
const tv = (body: ReactElement) => (
  <TvChrome view={sceneOf(feltOf(2), 0)} activity={[]} roomCode="KX7P" title="Händerna" version="rev-1">
    {body}
  </TvChrome>
)
async function feltMarkup(scene: Snapshot, mode: 'tv' | 'table'): Promise<string> {
  if (mode === 'table') return markupOf(<TableRenderer view={scene} mode="table" size={FRAME} />)
  const main = await onPage(markupOf(tv(<div />)), FRAME, (page) =>
    page.evaluate(() => {
      const r = document.querySelector('[data-tv] > main')!.getBoundingClientRect()
      return { w: Math.round(r.width), h: Math.round(r.height) }
    }),
  )
  return markupOf(tv(<TableRenderer view={scene} mode="tv" camera size={main} glideMs={0} />))
}

// Every rectangle a fan draws — each card's box as the browser lays the turned card out, and the
// count — held against every other zone drawn on the felt. Two rectangles that merely touch do
// not overlap, and a pixel is what two rounded placements can promise each other; anything
// deeper is a card lying in a zone that is not its hand's.
const SLACK_PX = 1
const READ = `(() => {
  const box = (el) => el.getBoundingClientRect()
  const zones = [...document.querySelectorAll('.byd-zone[data-area], .byd-pile[data-zone]')].map((el) => ({ id: el.dataset.area ?? el.dataset.zone, r: box(el) }))
  const deep = (a, b) => a.left < b.right - ${SLACK_PX} && b.left < a.right - ${SLACK_PX} && a.top < b.bottom - ${SLACK_PX} && b.top < a.bottom - ${SLACK_PX}
  const overlaps = []
  let cards = 0
  for (const hand of document.querySelectorAll('.byd-hand[data-zone]')) {
    const drawn = [...hand.querySelectorAll('.byd-hand-fan > i')].map((el, i) => ({ what: 'card ' + (i + 1), r: box(el) }))
    cards += drawn.length
    const count = hand.querySelector('.byd-hand-count')
    if (count) drawn.push({ what: 'count', r: box(count) })
    for (const zone of zones) {
      if (zone.id === hand.dataset.zone) continue
      for (const d of drawn) if (deep(d.r, zone.r)) overlaps.push(hand.dataset.zone + ' ' + d.what + ' × ' + zone.id)
    }
  }
  return { overlaps, cards, zones: zones.length }
})()`
type Reading = { overlaps: string[]; cards: number; zones: number }

async function fansOn(scene: Snapshot, mode: 'tv' | 'table'): Promise<Reading> {
  return onPage(await feltMarkup(scene, mode), FRAME, (page) => page.evaluate(READ) as Promise<Reading>)
}

const seatCounts = Array.from({ length: MAX_PLAYERS - 1 }, (_, i) => i + 2)
const MODES = ['tv', 'table'] as const
// Three cards is the hand the audit saw; a full fan is as far as a fan ever spreads (K9).
const HELD = [3, FAN_MAX] as const
const scenes = seatCounts.flatMap((seats) => MODES.flatMap((mode) => HELD.map((held) => [seats, mode, held] as const)))

describe('a hand’s fan and its count stay in the hand’s own zone (C5, K9, K18, #84)', () => {
  it.each(scenes)('lays no card and no count of a fan in another zone at %i seats, mode %s, %i cards held', async (seats, mode, held) => {
    const setup = feltOf(seats)
    const reading = await fansOn(sceneOf(setup, held), mode)
    // Something was measured at all: a fan that is not drawn overlaps nothing.
    expect({ seats, mode, held, cards: reading.cards }).toEqual({ seats, mode, held, cards: seats * held })
    expect({ seats, mode, held, zones: reading.zones > seats }).toEqual({ seats, mode, held, zones: true })
    expect({ seats, mode, held, overlaps: reading.overlaps }).toEqual({ seats, mode, held, overlaps: [] })
  }, 60_000)
})
