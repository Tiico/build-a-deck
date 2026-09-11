// @vitest-environment jsdom
// Where a seat lands on the picker is a layout question, and jsdom answers none of them. So the
// markup the real JoinPage produces against a real server is measured in a real engine with the
// real stylesheet — the same way the felt and the phone are measured (#20, #23).
//
// K12 calls the picker "the table as a seat picker": a ring of seats you point at to say where
// you will sit. It only tells you anything if the seats are drawn apart, and for a while they
// were not — every seat landed on the same spot, because a lobby is shown no zones and the edge
// was being worked out from the zones (#39). The edge now travels in the seat list itself.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { chromium, type Browser } from 'playwright'
import type { SetupDef } from '@byd/engine'
import { JoinPage } from '../src/join/JoinPage.js'
import { TableClient } from '../src/client.js'
import { asTable, createSession, recipeSetup, roomOf, startServer, twoSeatSetup, type Running } from './fixture.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const shell = read('index.html')
const css = read('src/join/join.css')

const document_ = (body: string) =>
  shell
    .replace('<script type="module" src="/src/main.tsx"></script>', '')
    .replace('</head>', `<style>${css}</style></head>`)
    .replace('<div id="root"></div>', `<div id="root">${body}</div>`)

type Box = { seat: string; edge: string | null; x: number; y: number; w: number; h: number }

let run: Running
let browser: Browser

beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser.close()
}, 60_000)
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

// The picker as it really comes out: a live session, the real page, the real socket. `sitting`
// puts people in seats first, so the picker is measured with the names it will really carry.
async function picker(setup: SetupDef, sitting: Record<string, string> = {}): Promise<string> {
  const session = await createSession(run, 's1', undefined, setup)
  const table = TableClient.connect(await asTable(run, session))
  await table.ready()
  for (const [seat, name] of Object.entries(sitting)) await table.send({ v: 'seat.claim', seat, name })
  history.replaceState(null, '', `/join?code=${roomOf(session).code}&server=${encodeURIComponent(run.url)}`)
  const { container, unmount } = render(<JoinPage />)
  await screen.findByRole('button', { name: /Sätt dig/ })
  for (const name of Object.values(sitting)) await screen.findByText(name)
  const html = container.innerHTML
  unmount()
  table.close()
  return html
}

// The felt and every seat pill on it, measured on a phone-sized screen.
async function measure(markup: string): Promise<{ felt: Box; seats: Box[] }> {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  try {
    await page.setContent(document_(markup), { waitUntil: 'load' })
    return await page.evaluate(() => {
      const box = (el: Element, seat: string, edge: string | null): { seat: string; edge: string | null; x: number; y: number; w: number; h: number } => {
        const r = el.getBoundingClientRect()
        const round = (n: number) => Math.round(n * 10) / 10
        return { seat, edge, x: round(r.x), y: round(r.y), w: round(r.width), h: round(r.height) }
      }
      return {
        felt: box(document.querySelector('.byd-join-table')!, 'felt', null),
        seats: [...document.querySelectorAll('[data-seat]')].map((el) => box(el, (el as HTMLElement).dataset['seat'] ?? '?', (el as HTMLElement).dataset['edge'] ?? null)),
      }
    })
  } finally {
    await page.close()
  }
}

const place = ({ x, y, w, h }: Box) => `${x},${y} ${w}×${h}`

// A seat pill as the browser presents it: how wide it comes out, whether the name had to be cut
// to fit, and what the seat is called in Chromium's own accessibility tree — which is where a
// name cut by the stylesheet still reads in full, and a name cut in JavaScript would not.
async function pill(markup: string, seat: string): Promise<{ w: number; cut: boolean; name: string }> {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  try {
    await page.setContent(document_(markup), { waitUntil: 'load' })
    const spoken = await page.locator(`[data-seat="${seat}"]`).ariaSnapshot()
    const size = await page.evaluate((id) => {
      const el = document.querySelector(`[data-seat="${id}"]`) as HTMLElement
      return { w: Math.round(el.getBoundingClientRect().width * 10) / 10, cut: el.scrollWidth > el.clientWidth }
    }, seat)
    return { ...size, name: /"([^"]*)"/.exec(spoken)?.[1] ?? spoken.trim() }
  } finally {
    await page.close()
  }
}

// What the thumb actually lands on: the seat the browser finds at each seat's own centre. Two
// boxes that fall on the same point are one fault; which of them takes the tap is the other, and
// only this says so. Answers the seat's own id when the seat can be reached at all.
async function reachable(markup: string): Promise<Record<string, string | null>> {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  try {
    await page.setContent(document_(markup), { waitUntil: 'load' })
    return await page.evaluate(() => {
      const out: Record<string, string | null> = {}
      for (const el of document.querySelectorAll('[data-seat]')) {
        const r = el.getBoundingClientRect()
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
        out[(el as HTMLElement).dataset['seat'] ?? '?'] = (hit?.closest('[data-seat]') as HTMLElement | null)?.dataset['seat'] ?? null
      }
      return out
    })
  } finally {
    await page.close()
  }
}

describe('the table as a seat picker (K12, #39)', () => {
  it('draws the two seats of a two-seat table apart, on the sides their hands are on', async () => {
    const { seats: boxes } = await measure(await picker(twoSeatSetup()))
    expect(boxes.map((b) => b.seat)).toEqual(['A', 'B'])

    // The defect, in one line: A and B used to come out at the same point to the tenth of a
    // pixel — x: 155.3, y: 397.5, w: 64.3, h: 37 for both.
    const [a, b] = boxes as [Box, Box]
    expect(place(a)).not.toBe(place(b))

    // And they are apart in the way that means something: the fixture's table seats A to the
    // south of the floor and B to the north, so A is drawn below B and the two share a column.
    expect(a.y).toBeGreaterThan(b.y)
    expect(a.x).toBeCloseTo(b.x, 0)
    for (const box of boxes) expect(box.w).toBeGreaterThan(40)
  }, 60_000)

  // The control, without which the measurement above proves nothing: the very same page, with
  // every seat put on the same edge — which is what the picker did when it could not tell them
  // apart — is measured as one box drawn twice.
  it('would have said so: two seats on one edge do land on the same point', async () => {
    const same = (await picker(twoSeatSetup())).replace(/data-edge="[NESW]"/g, 'data-edge="S"')
    const { seats: boxes } = await measure(same)
    expect(boxes).toHaveLength(2)
    const [a, b] = boxes as [Box, Box]
    expect(place(a)).toBe(place(b))
  }, 60_000)

  // A table can give a seat no edge at all: no hand of its own, so nothing says which side of the
  // felt it is on. The picker then declines to say — the seat is drawn on the felt rather than
  // hung off a side it may well not be on — and, since that is a place and not a fallback, two
  // such seats stand beside each other rather than on top of one another.
  it('draws a seat the table gives no edge on the felt itself, and two of them side by side', async () => {
    const bare = twoSeatSetup()
    const { felt, seats } = await measure(await picker({ ...bare, zones: bare.zones.filter((z) => z.kind !== 'hand') }))
    expect(seats.map((b) => [b.seat, b.edge])).toEqual([
      ['A', null],
      ['B', null],
    ])
    const [a, b] = seats as [Box, Box]
    expect(place(a)).not.toBe(place(b))
    // On the felt, both of them, and not hanging off it the way an edge seat deliberately does.
    for (const box of seats) {
      expect(box.x).toBeGreaterThanOrEqual(felt.x)
      expect(box.x + box.w).toBeLessThanOrEqual(felt.x + felt.w)
      expect(box.y).toBeGreaterThanOrEqual(felt.y)
      expect(box.y + box.h).toBeLessThanOrEqual(felt.y + felt.h)
    }
  }, 60_000)
})

// The picker is the one screen in the product that is only ever met with a thumb, and a seat is
// the first thing that thumb has to hit. UX-KONTROLLER holds every control to 44 px; the pills
// came out 37 px tall, and the offsets that hang them off the felt's edge were written for that
// height (UX-kontroll 2026-09-10).
describe('a seat is a thumb-sized target (UX-KONTROLLER: träffytor)', () => {
  it('draws every seat at least 44 px in both directions, still apart and still on its own edge', async () => {
    const { seats: boxes } = await measure(await picker(twoSeatSetup()))
    for (const box of boxes) {
      expect(box.h).toBeGreaterThanOrEqual(44)
      expect(box.w).toBeGreaterThanOrEqual(44)
    }
    const [a, b] = boxes as [Box, Box]
    expect(place(a)).not.toBe(place(b))
    expect(a.y).toBeGreaterThan(b.y)
  }, 60_000)
})

// Past four players the recipe seats two people along the same side of the felt: `edgeOf` runs
// S, N, E, W and then round again, so on an eight-seat table A shares the south edge with E, B
// the north with F, and so on. The derivation is right — a table really does have four sides —
// but the picker gave each compass point exactly one place, so the pair landed in it together.
const overlap = (a: Box, b: Box): { w: number; h: number } => ({
  w: Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)),
  h: Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)),
})
const pairsOf = <T,>(items: T[]): [T, T][] => items.flatMap((a, i) => items.slice(i + 1).map((b): [T, T] => [a, b]))

describe('a table whose seats share a side (#42)', () => {
  it('gives every seat of an eight-seat table a box of its own', async () => {
    const { seats: boxes } = await measure(await picker(recipeSetup(8)))
    expect(boxes.map((b) => b.seat)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'])

    // The defect, in one line: each of the four pairs came out as one box drawn twice — the
    // overlap measured the whole pill, 64.3 × 37, for A×E, B×F, C×G and D×H alike.
    const stacked = pairsOf(boxes)
      .filter(([a, b]) => overlap(a, b).w > 0 && overlap(a, b).h > 0)
      .map(([a, b]) => `${a.seat}×${b.seat} ${overlap(a, b).w}×${overlap(a, b).h}`)
    expect(stacked).toEqual([])
  }, 60_000)

  it('lets every seat of an eight-seat table be tapped, and not its neighbour', async () => {
    const hit = await reachable(await picker(recipeSetup(8)))

    // The fault as the thumb met it: the later sibling painted on top of the earlier one, so the
    // four earlier seats answered for nobody — A→E, B→F, C→G, D→H, and A, B, C and D could
    // not be chosen at all. (The issue says the lower seat of each pair; it was the earlier one.)
    expect(hit).toEqual({ A: 'A', B: 'B', C: 'C', D: 'D', E: 'E', F: 'F', G: 'G', H: 'H' })
  }, 60_000)

  // Five, six and seven seats share sides too, and unevenly: at five only the south is doubled,
  // at seven only the west is not. A table that only comes out right when it is full is not right.
  it.each([5, 6, 7])('gives every seat of a %i-seat table a box of its own, and its own tap', async (count) => {
    const markup = await picker(recipeSetup(count))
    const { seats: boxes } = await measure(markup)
    expect(boxes).toHaveLength(count)

    const stacked = pairsOf(boxes)
      .filter(([a, b]) => overlap(a, b).w > 0 && overlap(a, b).h > 0)
      .map(([a, b]) => `${a.seat}×${b.seat} ${overlap(a, b).w}×${overlap(a, b).h}`)
    expect(stacked).toEqual([])
    expect(await reachable(markup)).toEqual(Object.fromEntries(boxes.map((b) => [b.seat, b.seat])))
  }, 60_000)

  // The other half of the bargain: spreading seats along an edge may not move the seats that have
  // an edge to themselves. Up to four players every side carries one, and one seat on a side
  // stands in the middle of it — which is where the picker has always stood it (#39).
  it.each([2, 3, 4])('leaves a table of %i, where nobody shares a side, standing where it stood', async (count) => {
    const { felt, seats } = await measure(await picker(recipeSetup(count)))
    expect(seats).toHaveLength(count)
    for (const seat of seats) {
      if (seat.edge === 'N' || seat.edge === 'S') expect(seat.x + seat.w / 2).toBeCloseTo(felt.x + felt.w / 2, 1)
      else expect(seat.y + seat.h / 2).toBeCloseTo(felt.y + felt.h / 2, 1)
    }
  }, 60_000)

  // Not overlapping is the floor, not the look. The picker is a picture of a table, and a table
  // whose ends are crowded and whose sides are airy is not the table anyone is sitting at.
  it('leaves the same air between two seats on a side as between two on an end', async () => {
    const { seats } = await measure(await picker(recipeSetup(8)))
    const box = (id: string) => seats.find((s) => s.seat === id)!

    // South carries A and E beside each other; east carries C above G.
    const across = box('E').x - (box('A').x + box('A').w)
    const down = box('G').y - (box('C').y + box('C').h)

    // Spread along both axes by the same step, the pairs came out 39.7px apart across the ends
    // and 9px apart down the sides — the same layout read as two different ones.
    expect(Math.abs(down - across)).toBeLessThanOrEqual(2)
  }, 60_000)

  // The other way two seats end up on top of each other, and the one spreading them does not
  // cure: the pill grows with the name it carries, and a long enough name reaches across the gap
  // into the seat beside it. So the pill is capped and the name is cut to fit — cut by the
  // stylesheet, which leaves the name whole to a screen reader, and not by the page, which would
  // not. A seat the reader cannot hear the name of is a worse fault than the one being fixed.
  it('cuts a name too long for its place instead of letting it reach into the seat beside it', async () => {
    const long = 'Bartholomew Longbottom'
    const markup = await picker(recipeSetup(8), { A: long })
    const { seats: boxes } = await measure(markup)

    const stacked = pairsOf(boxes)
      .filter(([a, b]) => overlap(a, b).w > 0 && overlap(a, b).h > 0)
      .map(([a, b]) => `${a.seat}×${b.seat} ${overlap(a, b).w}×${overlap(a, b).h}`)
    expect(stacked).toEqual([])
    expect((await reachable(markup))['E']).toBe('E')

    // Cut on the screen, whole in the ear.
    const seat = await pill(markup, 'A')
    expect(seat.cut).toBe(true)
    expect(seat.name).toBe(long)
  }, 60_000)

  // And the cap is only the cure for the thing it cures. A seat nobody shares an edge with has
  // empty felt beside it and no neighbour to reach into, so it keeps growing with its name the
  // way it did before the pair ever existed — otherwise the commonest table, two to four
  // players, pays for a fault it cannot have.
  it.each([2, 4])('lets a seat alone on its edge of a %i-seat table wear its whole name', async (count) => {
    const markup = await picker(recipeSetup(count), { A: 'Alexandra' })
    const seat = await pill(markup, 'A')
    expect(seat.cut).toBe(false)
    expect(seat.w).toBeGreaterThan(90)
    expect(seat.name).toBe('Alexandra')
  }, 60_000)
})
