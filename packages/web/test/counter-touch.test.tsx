// @vitest-environment jsdom
// A chip a finger can land on (C4, K14, #67). `TOKEN_MM` is 24, so the disc is drawn in the
// table's own measure and comes out 10–34 px on every screen measured — a quarter of a fingertip
// at eight seats. The answer is an invisible target over the disc, and the disc itself does not
// grow (K9). The target is 44 × 44 *on the screen*: in table mode the felt lies under
// `rotateX(13deg)` in a perspective, and a square set to 44 in the felt's plane measured
// 43.3 × 41.2 at 1280 × 800 — so a test that read the set size would pass a target 3 px too
// short. Everything here is read off `getBoundingClientRect()` in real Chromium, with the sheets
// that ship, and never off the number the renderer wrote; the pointer is asked as well, since a
// box that measures 44 but answers to something else is no target at all.
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
import { TOUCH_PX } from '../src/table/fit.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const FACE = /url\('(\.\/[^']+\.woff2)'\)/g
const sheet = (rel: string): string =>
  read(rel).replace(FACE, (_all, file: string) => `url('data:font/woff2;base64,${readFileSync(join(import.meta.dirname, '..', dirname(rel), file)).toString('base64')}')`)
const SHEETS = ['src/fonts/felt-font.css', 'src/table/table.css', 'src/table/texture.css', 'src/table/keyboard.css', 'src/buttons.css', 'src/a11y.css']

const registry = new TypeRegistry(STANDARD_TYPES)
const CARD = { id: CARD_STANDARD_63x88.id, version: 1 }
const TOKEN = { id: TOKEN_COUNTER.id, version: 1 }
// The wizard's one default counter: with it, no two targets share a seat's zone. Two chips in
// one zone do share, and that is the recipe's pitch of 32 mm — a question of its own, broken out
// of #67.
const COUNTERS = [{ name: 'Poäng', start: 0 }]

// The screens the issue was measured on, and the one where a constant would have failed: the
// perspective is 1600 px whatever the window, so a taller felt leans further away at its far
// edge, and a target that was large enough at 1280 × 800 is not at 4K.
const FRAMES = [
  { w: 1280, h: 800 },
  { w: 1920, h: 1080 },
  { w: 3840, h: 2160 },
] as const
const MODES = ['tv', 'table'] as const
// Two seats, and the fullest table the recipe lays: at eight the chip is smallest (K18).
const SEATS = [2, MAX_PLAYERS] as const

const feltOf = (seats: number): Setup => openingSetup({ players: seats, counters: COUNTERS }, SWEDISH_WORDS)

function sceneOf(setup: Setup): Snapshot {
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
      ...Array.from({ length: 20 }, (_, i) => ({ type: CARD, cardRef: `Kort ${i + 1}`, zone: setup.deckZone, face: 'back' as const })),
      ...setup.seats.flatMap((seat) =>
        setup.zones.some((z) => z.id === `counters:${seat}`) ? COUNTERS.map((c, i) => ({ type: TOKEN, cardRef: c.name, zone: `counters:${seat}`, face: 'front' as const, counter: c.start, x: 8 + i * 32, y: 8 })) : [],
      ),
    ],
  }
  return project(initialState('touch', def, registry), registry, null)
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

// A table that can be played on: the target exists for the hand, and a table that is only shown
// has no hand to answer (K16, K9).
const act = () => undefined
const tv = (scene: Snapshot, body: ReactElement) => (
  <TvChrome view={scene} activity={[]} roomCode="KX7P" title="Brickan" version="rev-1">
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
  return markupOf(tv(scene, <TableRenderer view={scene} mode="tv" camera="follow" size={main} glideMs={0} onAct={act} />))
}

// Every target on the felt: its projected box, how far its centre stands from its chip's, and
// whether a press at the centre and at each corner of the finger's square — 44 × 44, upright on
// the screen, centred on the chip — reaches the chip at all. The corners of the *box* are not
// asked: under the tilt the target draws as a slanted shape, and a box's corner can lie outside
// it while the finger's square lies wholly within.
const READ = `(() => {
  const half = ${TOUCH_PX} / 2 - 0.5
  const chips = [...document.querySelectorAll('.byd-token[data-counter-token]')]
  return chips.map((chip) => {
    const id = chip.dataset.counterToken
    const hit = chip.querySelector('[data-counter-hit]')
    if (!hit) return { id, w: 0, h: 0, off: Infinity, misses: ['no target'] }
    const r = hit.getBoundingClientRect()
    const c = chip.getBoundingClientRect()
    const cx = c.left + c.width / 2
    const cy = c.top + c.height / 2
    const off = Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy)
    const probes = [[cx - half, cy - half], [cx + half, cy - half], [cx - half, cy + half], [cx + half, cy + half], [cx, cy]]
    const misses = probes.filter(([x, y]) => document.elementFromPoint(x, y)?.closest('.byd-token') !== chip).map(([x, y]) => Math.round(x) + ',' + Math.round(y))
    return { id, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, off: Math.round(off * 10) / 10, misses }
  })
})()`
type Target = { id: string; w: number; h: number; off: number; misses: string[] }

const cases = SEATS.flatMap((seats) => MODES.flatMap((mode) => FRAMES.map((frame) => [seats, mode, frame] as const)))

describe('a counter chip answers a finger on a 44 × 44 target, measured on the screen (C4, K14, #67)', () => {
  it.each(cases)('at %i seats, mode %s, %o', async (seats, mode, frame) => {
    const scene = sceneOf(feltOf(seats))
    const targets = await onPage(await feltMarkup(scene, mode, frame), frame, (page) => page.evaluate(READ) as Promise<Target[]>)
    // One target per chip, so the reading cannot pass by reading nothing.
    expect({ seats, mode, frame, targets: targets.length }).toEqual({ seats, mode, frame, targets: seats })
    for (const t of targets) {
      const where = { seats, mode, frame, id: t.id }
      // The finger's measure, on the projected box and never on the set size. A minimum, not a
      // pixel value: what the tilt makes of a box differs by screen, and a Mac's pixels are not
      // CI's (browser-tests-must-not-pin-mac-pixels).
      expect({ ...where, w: t.w >= TOUCH_PX, h: t.h >= TOUCH_PX, box: `${t.w}×${t.h}` }).toEqual({ ...where, w: true, h: true, box: `${t.w}×${t.h}` })
      // Centred on the disc it belongs to, so the target and the thing it stands for are one
      // place to aim at.
      expect({ ...where, centred: t.off <= 1.5, off: t.off }).toEqual({ ...where, centred: true, off: t.off })
      // And a press anywhere in the finger's square reaches the chip: a box that measures 44 and
      // answers to the felt underneath is no target.
      expect({ ...where, misses: t.misses }).toEqual({ ...where, misses: [] })
    }
  }, 60_000)
})
