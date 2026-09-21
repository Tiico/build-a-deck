// @vitest-environment jsdom
// The number in a chip, at every size the felt is ever drawn at (K9, K18, #89).
//
// A counter is a 24 mm disc and the value on it is a word: at eight seats on a 1280 × 800 table
// the disc paints about thirteen pixels across, and a two-digit value set in a fixed twelve
// pixels painted straight out through the chip's outline on every seat. A chip whose number does
// not fit inside it is not a chip.
//
// So the gate is containment, read off `getBoundingClientRect()` in real Chromium with the sheets
// that ship — never off the size the renderer wrote — plus the two ratios that keep the answer
// honest at both ends: a number that fits because it was shrunk to a speck is not read at three
// metres either, and one that fills the whole disc has no disc left around it. Ratios and
// minimums only: CI's Linux has other fonts than a Mac
// (browser-tests-must-not-pin-mac-pixels), and the felt brings its own letters (K20).
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

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const FACE = /url\('(\.\/[^']+\.woff2)'\)/g
const sheet = (rel: string): string =>
  read(rel).replace(FACE, (_all, file: string) => `url('data:font/woff2;base64,${readFileSync(join(import.meta.dirname, '..', dirname(rel), file)).toString('base64')}')`)
const SHEETS = ['src/fonts/felt-font.css', 'src/table/table.css', 'src/table/texture.css', 'src/table/keyboard.css', 'src/buttons.css', 'src/a11y.css']

const registry = new TypeRegistry(STANDARD_TYPES)

// The four values a counter is asked to hold, on one seat at once: a single digit, a negative, a
// three-digit value, and a negative three-digit value — which is the widest thing a chip is ever
// given, a minus and three figures. Four counters also puts the fixture past the rule's own hinge,
// so the stacked case (#89) is measured as well as the two that lie side by side.
const NAMED = [
  { name: 'Poäng', start: 0 },
  { name: 'Liv', start: -7 },
  { name: 'Rundor', start: 999 },
  { name: 'Kort', start: -120 },
]
const FRAMES = [
  { w: 1280, h: 800 },
  { w: 1920, h: 1080 },
  { w: 3840, h: 2160 },
] as const
const MODES = ['tv', 'table'] as const
const SEATS = Array.from({ length: MAX_PLAYERS - 1 }, (_, i) => i + 2)

const feltOf = (seats: number): Setup =>
  openingSetup({ players: seats, counters: NAMED }, SWEDISH_WORDS)

function sceneOf(setup: Setup): Snapshot {
  const rows = Array.from({ length: 20 }, (_, i) => ({ id: `Kort ${i + 1}`, fields: {} }))
  return project(initialState('zone', setupFromProject({ rows, setup }), registry), registry, null)
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
  return markupOf(tv(scene, <TableRenderer view={scene} mode="tv" camera="follow" size={main} glideMs={0} onAct={act} />))
}

// A pixel of slack, which is what two rounded placements can promise each other; anything past
// that is ink outside the disc it belongs to.
const SLACK_PX = 1
// What the number may be, as a share of the chip it stands in. The floor is legibility — a value
// shrunk until it is a smudge fits every chip and says nothing — and the ceiling is the disc: ink
// that takes the whole box leaves no amber around it, and a chip is read as a chip at three
// metres before it is read as a number (K9).
//
// The height read here is the number's line box and not its figures: the felt's own face (K20)
// leaves about a fifth of its own size as leading, so a box of two thirds of the chip is figures
// of about half of it. That is why the ceiling is not tighter, and it is a share either way — no
// pixel of it is a Mac's.
const LEAST_TALL = 0.26
const MOST_TALL = 0.68
const LEAST_WIDE = 0.15

const READ = `(() => {
  const box = (el) => el.getBoundingClientRect()
  const round = (n) => Math.round(n * 100) / 100
  return [...document.querySelectorAll('.byd-token')].map((chip) => {
    const c = box(chip)
    const ink = box(chip.querySelector('b'))
    return {
      id: chip.dataset.counterToken,
      value: chip.querySelector('b').textContent,
      out: round(Math.max(c.left - ink.left, ink.right - c.right, c.top - ink.top, ink.bottom - c.bottom)),
      tall: round(ink.height / c.height),
      wide: round(ink.width / c.width),
    }
  })
})()`
type Ink = { id: string; value: string; out: number; tall: number; wide: number }

async function sweep(seats: number, mode: 'tv' | 'table', frame: { w: number; h: number }) {
  const scene = sceneOf(feltOf(seats))
  const ink = await onPage(await feltMarkup(scene, mode, frame), frame, (page) => page.evaluate(READ) as Promise<Ink[]>)
  return {
    chips: ink.length,
    // Every value the felt was asked to draw, so a sweep that quietly met only single digits
    // cannot pass for one that met the widest.
    values: [...new Set(ink.map((i) => i.value))].sort(),
    outside: ink.filter((i) => i.out > SLACK_PX).map((i) => `${i.id} ${i.value} out by ${i.out}px`),
    unreadable: ink.filter((i) => i.tall < LEAST_TALL || i.wide < LEAST_WIDE).map((i) => `${i.id} ${i.value} ${i.tall}×${i.wide} of its chip`),
    swamped: ink.filter((i) => i.tall > MOST_TALL).map((i) => `${i.id} ${i.value} ${i.tall} of its chip's height`),
  }
}

const cases = MODES.flatMap((mode) => FRAMES.map((frame) => [mode, frame] as const))

describe('a counter says its value inside its own chip, at every table the product supports (K9, K18, #89)', () => {
  it.each(cases)('in %s mode at %o', async (mode, frame) => {
    const got: Record<string, unknown> = {}
    const want: Record<string, unknown> = {}
    for (const seats of SEATS) {
      const key = `${seats} seats`
      got[key] = await sweep(seats, mode, frame)
      want[key] = {
        // Four counters per seat, all of them drawn: the two that lie beside each other and the
        // two stacked under the pile's top, each with its own number on it (#89).
        chips: seats * NAMED.length,
        values: ['-120', '-7', '0', '999'],
        outside: [],
        unreadable: [],
        swamped: [],
      }
    }
    expect({ mode, frame, ...got }).toEqual({ mode, frame, ...want })
  }, 300_000)
})
