// @vitest-environment jsdom
// A seat's plate on the room's television carries its name (#573), and a name is whatever the
// player typed. In the playtest of 2026-10-02 (#750) the plate simply grew with it: a 27-letter
// name laid a 395 px plate over the draw pile at 1920 × 1080, the seat opposite covered the
// discard pile, and a 59-letter name ran the plate across the whole top row of zones. #750 capped
// the plate and cut the name; #683 (beslut E 2026-10-05) took the cap away: a plate stands on a
// free place (`placePlates`), and one that fits nowhere is a badge with the seat's mark — never a
// name cut short.
//
// So the plate is measured where it is drawn — the real stylesheet, in Chromium, at the size of
// the room's screen — with a name long enough to fit nowhere on any typeface. The markup is laid
// out in the page the way the renderer's layout effect does it, by the exported functions run as
// strings, since no effect runs there. Nothing here leans on how wide a letter is on this machine:
// a 60-letter name overruns every free place in every face there is.
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
import { placeNames, placePlates } from '../src/table/freeSide.js'

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
    // What the renderer's layout effect does on the room's television (#683): the names against the
    // plates at their own places, the plates on a free place, and the names once more.
    await page.evaluate(`(${String(placePlates)})(document, true); (${String(placeNames)})(document); (${String(placePlates)})(document); (${String(placeNames)})(document)`)
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

type Reading = { overlaps: string[]; plates: { seat: string; form: string; seen: string; text: string; cut: boolean }[] }
// Every plate against every pile and its name, every zone, its own seat's too, and every other plate.
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
      if (deep(box(plate), box(el))) overlaps.push(seat + ' × ' + id)
    }
    for (const other of plates) if (other !== plate && seat < other.dataset.seatPlate && deep(box(plate), box(other))) overlaps.push(seat + ' × plate ' + other.dataset.seatPlate)
  }
  const hidden = (el) => getComputedStyle(el).clipPath !== 'none'
  return {
    overlaps,
    plates: plates.map((plate) => {
      const shown = [...plate.querySelectorAll('i, span')].filter((el) => !hidden(el) && !(el.parentElement && hidden(el.parentElement)))
      return {
        seat: plate.dataset.seatPlate,
        form: plate.dataset.form ?? 'plate',
        seen: shown.map((el) => el.textContent).join(' '),
        text: plate.textContent,
        cut: shown.some((el) => el.scrollWidth > el.clientWidth + 1),
      }
    }),
  }
})()`

describe('a long name on the room’s television stays on its own seat’s plate (#750, #683)', () => {
  it.each([2, 4, 6, 8])('lays no plate of a %i-seat table over a pile, a zone or another plate', async (seats) => {
    const scene = sceneOf(feltOf(seats))
    const reading = await onPage(await roomMarkup(scene), (page) => page.evaluate(READ) as Promise<Reading>)
    expect(reading.plates).toHaveLength(seats)
    expect(reading.overlaps).toEqual([])
  }, 120_000)

  // An ordinary name is worn whole on every table, on a whole plate, and on a free place.
  it.each([2, 4, 6, 8])('wears an ordinary name whole on a %i-seat table', async (seats) => {
    const scene = sceneOf(feltOf(seats))
    const ordinary = { ...scene, seats: scene.seats.map((s) => ({ ...s, name: 'Margareta' })) }
    const reading = await onPage(await roomMarkup(ordinary), (page) => page.evaluate(READ) as Promise<Reading>)
    expect(reading.plates.map((p) => `${p.seat} ${p.form} ${p.seen}`)).toEqual(ordinary.seats.map((s) => `${s.id} plate M Margareta 3 kort`))
    expect(reading.plates.filter((p) => p.cut).map((p) => p.seat)).toEqual([])
    expect(reading.overlaps).toEqual([])
  }, 120_000)

  // Not cut, and not renamed: a name that fits nowhere leaves the seat's mark on the felt, and the
  // whole name is still in the page for whoever reads it out. Sixty letters at 24 px are wider than
  // the felt between a side seat's zones and the piles, so the side seats are badges on any face.
  it('draws a plate whose name fits nowhere as a badge with the seat’s mark, and keeps the whole name in the page', async () => {
    const scene = sceneOf(feltOf(4))
    const reading = await onPage(await roomMarkup(scene), (page) => page.evaluate(READ) as Promise<Reading>)
    const sides = scene.seats.filter((s) => s.edge === 'E' || s.edge === 'W').map((s) => s.id)
    expect(sides).toHaveLength(2)
    for (const plate of reading.plates) {
      const name = scene.seats.find((s) => s.id === plate.seat)!.name!
      expect(plate.text).toContain(name)
      expect(plate.cut).toBe(false)
      expect(plate.seen).not.toContain('…')
      if (plate.form === 'badge') expect(plate.seen).toBe(name.slice(0, 1))
      else expect(plate.seen).toBe(`${name.slice(0, 1)} ${name} 3 kort`)
      if (sides.includes(plate.seat)) expect(plate.form).toBe('badge')
    }
    expect(reading.overlaps).toEqual([])
  }, 120_000)
})
