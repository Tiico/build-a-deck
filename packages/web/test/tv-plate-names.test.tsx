// @vitest-environment jsdom
// A seat's plate on the room's television carries its name (#573), and a name is whatever the
// player typed. In the playtest of 2026-10-02 (#750) the plate simply grew with it: a 27-letter
// name laid a 395 px plate over the draw pile at 1920 × 1080, the seat opposite covered the
// discard pile, and a 59-letter name ran the plate across the whole top row of zones. The phone
// and the picker's side seats already cut a long name; the TV's plate did not.
//
// So the plate is measured where it is drawn — the real stylesheet, in Chromium, at the size of
// the room's screen — with a name long enough to be cut on any typeface. Nothing here leans on how
// wide a letter is on this machine: a 60-letter name overruns its room in every face there is.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { ReactElement } from 'react'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { chromium, type Browser, type Page } from 'playwright'
import { CARD_STANDARD_63x88, STANDARD_TYPES, TOKEN_COUNTER, TypeRegistry, initialState, project, type SetupDef } from '@byd/engine'
import type { Snapshot } from '@byd/protocol'
import { SWEDISH_WORDS, openingSetup, type Setup } from '@byd/server/doc'
import { TableRenderer } from '../src/table/TableRenderer.js'
import { TvChrome } from '../src/table/TvChrome.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const FACE = /url\('(\.\/[^']+\.woff2)'\)/g
const sheet = (rel: string): string =>
  read(rel).replace(FACE, (_all, file: string) => `url('data:font/woff2;base64,${readFileSync(join(import.meta.dirname, '..', dirname(rel), file)).toString('base64')}')`)
const SHEETS = ['src/fonts/felt-font.css', 'src/table/table.css', 'src/table/texture.css', 'src/table/keyboard.css', 'src/buttons.css', 'src/a11y.css']

const registry = new TypeRegistry(STANDARD_TYPES)
const CARD = { id: CARD_STANDARD_63x88.id, version: 1 }
const TOKEN = { id: TOKEN_COUNTER.id, version: 1 }
const COUNTERS = [{ name: 'Poäng', start: 0 }]
// The room's screen the playtest was taken on.
const SCREEN = { w: 1920, h: 1080 }
// Sixty letters, as the issue asks: long enough to be cut in every typeface a TV may have.
const LONG = 'Åke "Örnen" Östlund & söner, Bartholomew Longbottom den yngre'.padEnd(60, '!').slice(0, 60)

const feltOf = (seats: number): Setup => openingSetup({ players: seats, counters: COUNTERS }, SWEDISH_WORDS)

// The wizard's table for that many seats, dealt, with every seat taken by somebody whose name is
// sixty letters long — each one a little different, so the plates can be told apart.
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
      ...setup.seats.flatMap((seat) => Array.from({ length: 3 }, (_, i) => ({ type: CARD, cardRef: `Hand ${seat}${i}`, zone: `hand:${seat}`, face: 'back' as const }))),
      ...setup.seats.flatMap((seat) =>
        setup.zones.some((z) => z.id === `counters:${seat}`) ? COUNTERS.map((c, i) => ({ type: TOKEN, cardRef: c.name, zone: `counters:${seat}`, face: 'front' as const, counter: c.start, x: 8 + i * 32, y: 8 })) : [],
      ),
    ],
  }
  const view = project(initialState('långa-namn', def, registry), registry, null)
  return { ...view, seats: view.seats.map((s) => ({ ...s, name: `${s.id} ${LONG}`.slice(0, 60) })) }
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

async function onPage<T>(html: string, look: (page: Page) => Promise<T>): Promise<T> {
  const page = await browser.newPage({ viewport: { width: SCREEN.w, height: SCREEN.h } })
  try {
    const shell = read('index.html')
      .replace('<script type="module" src="/src/main.tsx"></script>', '')
      .replace('</head>', `<style>${SHEETS.map(sheet).join('\n')}</style></head>`)
      .replace('<div id="root"></div>', `<div id="root" style="width:${SCREEN.w}px;height:${SCREEN.h}px">${html}</div>`)
    await page.setContent(shell, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
    return await look(page)
  } finally {
    await page.close()
  }
}

// The room's television as the table page draws it: the chrome first, measured, and the felt
// handed the box the chrome leaves it, the way the renderer measures for itself.
async function roomMarkup(scene: Snapshot): Promise<string> {
  const tv = (body: ReactElement) => (
    <TvChrome view={scene} activity={[]} roomCode="KX7P" title="Långa namn" version="rev-1" room>
      {body}
    </TvChrome>
  )
  const main = await onPage(markupOf(tv(<div />)), (page) =>
    page.evaluate(() => {
      const r = document.querySelector('[data-tv] > main')!.getBoundingClientRect()
      return { w: Math.round(r.width), h: Math.round(r.height) }
    }),
  )
  return markupOf(tv(<TableRenderer view={scene} mode="tv" camera="follow" size={main} glideMs={0} forTheRoom />))
}

type Reading = { overlaps: string[]; plates: { seat: string; text: string; cut: boolean; marked: boolean }[] }
// Every plate against every pile, every zone that is not its own seat's and every other plate.
// Two rectangles that merely touch do not overlap; a pixel is what rounded placements can promise.
const READ = `(() => {
  const box = (el) => el.getBoundingClientRect()
  const deep = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1
  const plates = [...document.querySelectorAll('[data-seat-plate]')]
  const others = [...document.querySelectorAll('.byd-pile[data-zone], .byd-pile[data-zone] .byd-pile-name, .byd-zone[data-area]')]
  const overlaps = []
  for (const plate of plates) {
    const seat = plate.dataset.seatPlate
    for (const el of others) {
      const id = el.dataset.zone ?? el.dataset.area ?? el.closest('[data-zone]').dataset.zone + ' name'
      if (id.endsWith(':' + seat)) continue
      if (deep(box(plate), box(el))) overlaps.push(seat + ' × ' + id)
    }
    for (const other of plates) if (other !== plate && seat < other.dataset.seatPlate && deep(box(plate), box(other))) overlaps.push(seat + ' × plate ' + other.dataset.seatPlate)
  }
  return {
    overlaps,
    plates: plates.map((plate) => {
      const name = plate.querySelector('b > span') ?? plate.querySelector('b')
      return { seat: plate.dataset.seatPlate, text: plate.querySelector('b').textContent, cut: name.scrollWidth > name.clientWidth, marked: getComputedStyle(name).textOverflow === 'ellipsis' }
    }),
  }
})()`

describe('a long name on the room’s television stays on its own seat’s plate (#750)', () => {
  it.each([2, 4, 6, 8])('lays no plate of a %i-seat table over a pile, another seat’s zone or another plate', async (seats) => {
    const scene = sceneOf(feltOf(seats))
    const reading = await onPage(await roomMarkup(scene), (page) => page.evaluate(READ) as Promise<Reading>)
    expect(reading.plates).toHaveLength(seats)
    expect(reading.overlaps).toEqual([])
  }, 120_000)

  // The cap is the cure for a long name and nothing else: an ordinary name is worn whole on every
  // table, and with room to spare — a plate that only just fits `Margareta` here would cut it on a
  // TV whose typeface is wider than this machine's, so the plate must have half as much again.
  it.each([2, 4, 6, 8])('wears an ordinary name whole on a %i-seat table, with room to spare', async (seats) => {
    const scene = sceneOf(feltOf(seats))
    const ordinary = { ...scene, seats: scene.seats.map((s) => ({ ...s, name: 'Margareta' })) }
    const room = await onPage(await roomMarkup(ordinary), (page) =>
      page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('[data-seat-plate]')].map((plate) => {
          const name = plate.querySelector('b > span')!
          const cap = parseFloat(plate.style.maxWidth)
          // What the name's own line spends besides the name: the plate's padding and border, the
          // seat's ball and the gap after it.
          const style = getComputedStyle(plate)
          const chrome = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth)
          const rest = chrome + name.parentElement!.getBoundingClientRect().width - name.getBoundingClientRect().width
          return { seat: plate.dataset['seatPlate'], cut: name.scrollWidth > name.clientWidth, spare: Number.isNaN(cap) ? Infinity : (cap - rest) / name.scrollWidth }
        }),
      ),
    )
    expect(room.filter((r) => r.cut).map((r) => r.seat)).toEqual([])
    expect(room.filter((r) => r.spare < 1.5).map((r) => `${r.seat} ${r.spare.toFixed(2)}`)).toEqual([])
  }, 120_000)

  // Cut, not renamed: the plate says the beginning of the name and marks that the rest is
  // missing, and the whole name is still in the page for whoever reads it out. A plate along the
  // top or the bottom of a four-seat table has room for most of sixty letters, and whether the
  // last few fit is the typeface's business — so what holds there on every machine is that a cut
  // is marked. A plate at the side has a third of that, which no face fits sixty letters into.
  it('cuts the name with an ellipsis and keeps the whole of it in the page', async () => {
    const scene = sceneOf(feltOf(4))
    const reading = await onPage(await roomMarkup(scene), (page) => page.evaluate(READ) as Promise<Reading>)
    const sides = scene.seats.filter((s) => s.edge === 'E' || s.edge === 'W').map((s) => s.id)
    expect(sides).toHaveLength(2)
    for (const plate of reading.plates) {
      const name = scene.seats.find((s) => s.id === plate.seat)!.name!
      expect(plate.text).toContain(name)
      expect(plate.marked).toBe(true)
      if (sides.includes(plate.seat)) expect(plate.cut).toBe(true)
    }
  }, 120_000)
})
