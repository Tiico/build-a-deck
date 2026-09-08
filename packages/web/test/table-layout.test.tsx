// @vitest-environment jsdom
// Where a label lands relative to the cards beside it is a layout question, and jsdom answers
// none. So the real renderer's markup, in both modes, is measured in a real engine with the real
// stylesheet — the same way the texture fallback is measured (#10, #20).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ReactElement } from 'react'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { chromium, type Browser } from 'playwright'
import type { Snapshot, VisibleComponentState } from '@byd/protocol'
import { TableRenderer, type TableMode } from '../src/table/TableRenderer.js'
import { TvChrome } from '../src/table/TvChrome.js'
import { ActionPanel } from '../src/table/ActionPanel.js'
import { feltLabels, intentsForPlace, landedKeyFor, type Thing } from '../src/table/keyboard.js'
import { edgeRotation, feltWithHands, handExtent } from '../src/table/hand.js'
import { fitScale } from '../src/table/fit.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const SHEETS = ['src/table/table.css', 'src/table/texture.css', 'src/table/keyboard.css']

const CARD = { id: 'card.standard.63x88', version: 1 }
const card = (id: string, zone: string, x: number, y: number, cardRef: string | null): VisibleComponentState => ({ id, type: CARD, zone, face: cardRef === null ? 'back' : 'front', x, y, rot: 0, cardRef })

// A table with a market row whose cards sit at the very top of the zone, where a label placed
// inside the zone would end up underneath them.
function scene(): Snapshot {
  return {
    seq: 9,
    seat: null,
    floor: 'table',
    seats: [{ id: 'N', name: 'Ada' }],
    zones: [
      { mode: 'order', id: 'table', kind: 'area', name: 'Spelyta', geometry: { x: -600, y: -400, w: 1200, h: 800, rot: 0 }, dynamic: false, order: [] },
      { mode: 'order', id: 'market', kind: 'area', name: 'Marknad', geometry: { x: -330, y: -330, w: 660, h: 120, rot: 0 }, dynamic: false, order: ['m1', 'm2'] },
      { mode: 'count', id: 'draw', kind: 'pile', name: 'Draghög', geometry: { x: -140, y: 0, w: 0, h: 0, rot: 0 }, dynamic: false, count: 8 },
      { mode: 'count', id: 'hand:N', kind: 'hand', name: 'Hand', owner: 'N', geometry: { x: -250, y: -400, w: 500, h: 60, rot: 0 }, dynamic: false, count: 5 },
    ],
    components: [card('m1', 'market', 4, 4, 'Gruva'), card('m2', 'market', 170, 4, 'Torn')],
    rewind: null,
    undo: null,
    ended: false,
  }
}

// The same table as the observer sees it (C8): four seats around the rim, every hand fanned
// face-up, and the northern one at the very edge of the felt where a fan drawn too large runs
// straight off it. Two of the hands hold the twelve the fan tops out at.
function handScene(): Snapshot {
  const seats = [
    { id: 'S', geometry: { x: -250, y: 260, w: 500, h: 60, rot: 0 } },
    { id: 'N', geometry: { x: -250, y: -400, w: 500, h: 60, rot: 0 } },
    { id: 'W', geometry: { x: -600, y: -150, w: 60, h: 300, rot: 0 } },
    { id: 'E', geometry: { x: 540, y: -150, w: 60, h: 300, rot: 0 } },
  ] as const
  const held = { S: 5, N: 12, W: 3, E: 12 } as const
  const cards = seats.flatMap((s) => Array.from({ length: held[s.id] }, (_, i) => card(`h${s.id}${i}`, `hand:${s.id}`, 0, 0, `Kort ${s.id}${i}`)))
  return {
    ...scene(),
    seats: seats.map((s) => ({ id: s.id, name: `Spelare ${s.id}` })),
    zones: [
      ...scene().zones.filter((z) => z.kind !== 'hand'),
      ...seats.map((s) => ({ mode: 'order' as const, id: `hand:${s.id}`, kind: 'hand' as const, name: 'Hand', owner: s.id, geometry: s.geometry, dynamic: false, order: cards.filter((c) => c.zone === `hand:${s.id}`).map((c) => c.id) })),
    ],
    components: [...scene().components, ...cards],
  }
}

// The markup a component actually produces, taken from a real mount.
function markupOf(node: ReactElement): string {
  const { container, unmount } = render(node)
  const html = container.innerHTML
  unmount()
  return html
}
const markup = (mode: TableMode) => markupOf(<TableRenderer view={scene()} mode={mode} scale={1} />)

type Box = { x: number; y: number; w: number; h: number }
type Size = { w: number; h: number }
const FRAME: Size = { w: 1600, h: 1000 }

let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser.close()
}, 60_000)

// One page holding `html` in a root of exactly `size`, with the real stylesheets, for whatever
// the caller wants to read off it.
async function onPage<T>(html: string, size: Size, read_: (page: Awaited<ReturnType<Browser['newPage']>>) => Promise<T>): Promise<T> {
  const page = await browser.newPage({ viewport: { width: size.w, height: size.h } })
  try {
    const shell = read('index.html')
      .replace('<script type="module" src="/src/main.tsx"></script>', '')
      .replace('</head>', `<style>${SHEETS.map(read).join('\n')}</style></head>`)
      .replace('<div id="root"></div>', `<div id="root" style="width:${size.w}px;height:${size.h}px">${html}</div>`)
    await page.setContent(shell, { waitUntil: 'load' })
    return await read_(page)
  } finally {
    await page.close()
  }
}

// Measures each named selector in a real browser; a selector that matches nothing is a failure,
// not a null to reason about later.
async function measureHtml(html: string, size: Size, selectors: Record<string, string>, what = 'the page'): Promise<(name: string) => Box> {
  const seen = await onPage(html, size, async (page) =>
    (await page.evaluate((wanted) => {
      const box = (el: Element | null) => {
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
      }
      return Object.fromEntries(Object.entries(wanted).map(([name, sel]) => [name, box(document.querySelector(sel))]))
    }, selectors)) as Record<string, Box | null>,
  )
  return (name) => {
    const b = seen[name]
    if (!b) throw new Error(`${what}: nothing matched ${selectors[name] ?? name}`)
    return b
  }
}

// Every box a selector matches, in document order.
async function measureAll(html: string, size: Size, selector: string): Promise<{ what: string; box: Box }[]> {
  return await onPage(html, size, async (page) => {
    const found = await page.evaluate((sel) => {
      return [...document.querySelectorAll(sel)].map((el) => {
        const r = el.getBoundingClientRect()
        return {
          what: el.getAttribute('data-component') ?? el.getAttribute('data-zone') ?? el.className,
          box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        }
      })
    }, selector)
    return found as { what: string; box: Box }[]
  })
}

const measure = (mode: TableMode, selectors: Record<string, string>) => measureHtml(markup(mode), FRAME, selectors, mode)

const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
const outside = (frame: Box, boxes: readonly Box[]) => boxes.filter((b) => b.x < frame.x || b.y < frame.y || b.x + b.w > frame.x + frame.w || b.y + b.h > frame.y + frame.h)

describe('a pile says how many it holds (C)', () => {
  it('puts the count as a badge on the corner of the pile and the name below it, clear of the cards', async () => {
    const at = await measure('tv', {
      pile: '[data-zone="draw"]',
      badge: '[data-zone="draw"] .byd-pile-n',
      name: '[data-zone="draw"] .byd-pile-name',
    })
    const [pile, badge, name] = [at('pile'), at('badge'), at('name')]
    // The badge rides the pile's top-right corner: it overlaps the card, and sticks out of it.
    expect(badge.x + badge.w).toBeGreaterThan(pile.x + pile.w)
    expect(badge.y).toBeLessThan(pile.y)
    expect(overlaps(badge, pile)).toBe(true)
    // The name stands under the pile, centred, and never on top of the card.
    expect(name.y).toBeGreaterThanOrEqual(pile.y + pile.h)
    expect(Math.abs(name.x + name.w / 2 - (pile.x + pile.w / 2))).toBeLessThanOrEqual(1)
  }, 60_000)
})

describe('a seat has its name on the table (B)', () => {
  it('lays the name along its own edge, over the fan rather than under it', async () => {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
    try {
      const shell = read('index.html')
        .replace('<script type="module" src="/src/main.tsx"></script>', '')
        .replace('</head>', `<style>${SHEETS.map(read).join('\n')}</style></head>`)
        .replace('<div id="root"></div>', `<div id="root" style="width:1600px;height:1000px">${markup('table')}</div>`)
      await page.setContent(shell, { waitUntil: 'load' })
      const covered = await page.evaluate(() => {
        const pill = document.querySelector('.byd-seat-name')
        if (!pill) return 'no seat name at all'
        const r = pill.getBoundingClientRect()
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
        return hit === pill || pill.contains(hit) ? null : (hit?.className ?? 'nothing')
      })
      expect(covered).toBeNull()
    } finally {
      await page.close()
    }
  }, 60_000)
})

describe('a zone says its name without hiding behind the cards in it (#20)', () => {
  for (const mode of ['table', 'tv'] as const) {
    it(`keeps the label clear of every card in the zone in ${mode} mode`, async () => {
      const at = await measure(mode, {
        zone: '[data-area="market"]',
        label: '[data-area="market"] > span',
        first: '[data-component="m1"]',
        second: '[data-component="m2"]',
      })
      const [zone, label, first, second] = [at('zone'), at('label'), at('first'), at('second')]
      expect(label.w).toBeGreaterThan(0)
      expect(overlaps(label, first)).toBe(false)
      expect(overlaps(label, second)).toBe(false)
      // Outside the zone's content, but still attached to the zone it names.
      expect(label.y + label.h).toBeLessThanOrEqual(zone.y + 2)
      expect(label.x).toBeGreaterThanOrEqual(zone.x)
    }, 60_000)
  }
})

// The same table with a card off the felt, where a split beside a pile at the rim leaves one
// (K1, K15): the camera has to frame it whole rather than let the screen's edge cut it.
function strayScene(): Snapshot {
  const base = scene()
  return { ...base, components: [...base.components, card('stray', 'table', -80, 170, 'Uggla')] }
}

describe('the camera frames what is in play (C5, #20)', () => {
  it('cuts no card in half at the frame edge, not even one that lies beyond the rim', async () => {
    const size = { w: 1260, h: 786 }
    const html = markupOf(<TableRenderer view={strayScene()} mode="tv" camera size={size} glideMs={0} />)
    const boxes = await measureAll(html, size, '.byd-table-frame, .byd-card, .byd-pile')
    const frame = boxes[0]?.box
    if (!frame) throw new Error('no frame')
    const inside = (b: Box) => b.x >= frame.x && b.y >= frame.y && b.x + b.w <= frame.x + frame.w && b.y + b.h <= frame.y + frame.h
    const cut = boxes.slice(1).filter((b) => !inside(b.box))
    expect(cut.map((c) => c.what)).toEqual([])
  }, 60_000)
})

describe('the felt keeps prototype B’s proportions on the screen (K9, #20)', () => {
  it('leaves dark surround on every side of the tilted table', async () => {
    const html = markupOf(<TableRenderer view={scene()} mode="table" size={FRAME} />)
    const at = await measureHtml(html, FRAME, { frame: '.byd-table-frame', wood: '.byd-table-wood' }, 'table')
    const [frame, wood] = [at('frame'), at('wood')]
    const gaps = { left: wood.x - frame.x, top: wood.y - frame.y, right: frame.x + frame.w - (wood.x + wood.w), bottom: frame.y + frame.h - (wood.y + wood.h) }
    // Prototype B held the table at 0.85 of life size in a 1600×1000 screen, which leaves
    // roughly a tenth of the shorter side clear even at the tilt's nearest corner.
    const least = Math.min(...Object.values(gaps)) / Math.min(frame.w, frame.h)
    expect({ ...gaps, least: least > 0.09 }).toEqual({ ...gaps, least: true })
  }, 60_000)
})

describe('the inspection panel waits like prototype C (K8, #20)', () => {
  it('puts “peka på ett kort” at the top of the empty card, not in its middle', async () => {
    const html = markupOf(
      <TvChrome view={scene()} activity={[]} roomCode="KX7P">
        <div />
      </TvChrome>,
    )
    const at = await measureHtml(html, FRAME, { box: '.byd-tv-inspect > div[data-empty]', hint: '.byd-tv-inspect > div[data-empty] > span' }, 'tv chrome')
    const [box, hint] = [at('box'), at('hint')]
    // Within the top quarter of the card-shaped panel, and horizontally centred in it.
    expect(hint.y - box.y).toBeLessThan(box.h / 4)
    expect(Math.abs(hint.x + hint.w / 2 - (box.x + box.w / 2))).toBeLessThanOrEqual(1)
  }, 60_000)
})

// Every hand around the rim, as the browser lays it out at a given frame size: the frame, the
// felt, every card in every fan, and each fan on its own.
async function handsAt(size: Size, mode: TableMode = 'tv') {
  const html = markupOf(<TableRenderer view={handScene()} mode={mode} size={size} />)
  const seen = await onPage(html, size, (page) =>
    page.evaluate(() => {
      const box = (el: Element) => {
        const r = el.getBoundingClientRect()
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
      }
      const one = (sel: string) => {
        const el = document.querySelector(sel)
        return el ? box(el) : null
      }
      return {
        frame: one('.byd-table-frame'),
        table: one('[data-table]'),
        fans: [...document.querySelectorAll('.byd-hand')].map((h) => [...h.querySelectorAll('.byd-hand-fan > i')].map(box)),
      }
    }),
  )
  if (!seen.frame || !seen.table || seen.fans.length === 0) throw new Error(`nothing to measure at ${size.w}`)
  return { frame: seen.frame, table: seen.table, fans: seen.fans, cards: seen.fans.flat() }
}

describe('a hand is drawn in the table’s own millimetres (#23)', () => {
  it('keeps the fan the same share of the table at every width', async () => {
    const wide = await handsAt({ w: 1280, h: 800 })
    const narrow = await handsAt({ w: 390, h: 780 })
    // A card in a hand is table furniture, not chrome: it holds its proportion to the felt the
    // way a card lying on the felt does, instead of staying 54 px wide while the table shrinks.
    // Within a pixel, which is what two rounded measurements can promise each other.
    const expected = (wide.cards[0]?.w ?? 0) * (narrow.table.w / wide.table.w)
    expect(Math.abs((narrow.cards[0]?.w ?? 0) - expected)).toBeLessThanOrEqual(1)
  }, 60_000)
})

describe('a table that has been fitted keeps its own hands (#23)', () => {
  for (const size of [{ w: 390, h: 780 }, { w: 768, h: 900 }, { w: 1280, h: 800 }] as const) {
    it(`cuts no hand card off at the frame's edge at ${size.w}`, async () => {
      const { frame, cards } = await handsAt(size)
      // The fit passes the table into its frame; a hand is part of the table, not an afterthought
      // drawn outside it, so a fitted table never clips one.
      expect({ width: size.w, cut: outside(frame, cards).length }).toEqual({ width: size.w, cut: 0 })
    }, 60_000)
  }

  // The tilted felt (K9) is the same fit seen through a perspective, and the editor's Bord tab
  // (#19) is that same felt in a box the size of a thumbnail.
  for (const size of [{ w: 390, h: 780 }, { w: 768, h: 900 }, { w: 1280, h: 800 }, { w: 640, h: 384 }, { w: 1280, h: 515 }, { w: 1440, h: 615 }, { w: 390, h: 550 }] as const) {
    it(`cuts no hand card off the tilted table at ${size.w}×${size.h}`, async () => {
      const { frame, cards } = await handsAt(size, 'table')
      expect({ at: `${size.w}×${size.h}`, cut: outside(frame, cards).length }).toEqual({ at: `${size.w}×${size.h}`, cut: 0 })
    }, 60_000)
  }
})

describe('a hand is never wider than the table it sits at (#23)', () => {
  for (const size of [{ w: 390, h: 780 }, { w: 768, h: 900 }] as const) {
    it(`keeps a full fan of twelve inside the table's own width at ${size.w}`, async () => {
      const { table, fans } = await handsAt(size)
      const width = (fan: Box[]) => Math.max(...fan.map((c) => c.x + c.w)) - Math.min(...fan.map((c) => c.x))
      // The finding in its own words: under roughly 700 px the hands were wider than the table
      // they sit at, and hung off both its edges.
      expect({ width: size.w, wider: fans.filter((f) => width(f) > table.w).length }).toEqual({ width: size.w, wider: 0 })
    }, 60_000)
  }
})

describe('the table a distant seat is turned to still fits its frame (C5, #23)', () => {
  // `/online` turns the felt so the player's own edge is at the bottom, which for a seat on the
  // left or right means a quarter turn: the table then needs the frame's height where it needed
  // its width, and its hands come round with it.
  for (const size of [{ w: 390, h: 780 }, { w: 768, h: 900 }, { w: 1280, h: 800 }] as const) {
    it(`cuts nothing off a quarter-turned table at ${size.w}`, async () => {
      const html = markupOf(<TableRenderer view={handScene()} mode="table" rotate={90} size={size} />)
      const boxes = await measureAll(html, size, '.byd-table-frame, [data-table], .byd-hand-fan > i, .byd-card, .byd-pile')
      const [frame, ...rest] = boxes.map((b) => b.box)
      if (!frame) throw new Error('no frame')
      expect({ width: size.w, cut: outside(frame, rest).length }).toEqual({ width: size.w, cut: 0 })
    }, 60_000)
  }
})

describe('the wood wraps the table it carries (K9, C5)', () => {
  for (const rotate of [0, 90] as const) {
    it(`holds the felt inside its own border at ${rotate}°`, async () => {
      const size = { w: 1280, h: 800 }
      const html = markupOf(<TableRenderer view={handScene()} mode="table" rotate={rotate} size={size} />)
      const at = await measureHtml(html, size, { wood: '.byd-table-wood', felt: '[data-table]' }, `rotate ${rotate}`)
      const [wood, felt] = [at('wood'), at('felt')]
      // The wood is the table's frame, so the felt lies on it — a quarter-turned felt that keeps
      // the wood's old shape hangs over its edge at the top and the bottom.
      expect({ rotate, over: outside(wood, [felt]).length }).toEqual({ rotate, over: 0 })
    }, 60_000)
  }
})

// `/online`'s own table (C2, K17): the recipe's four seats around a 1200 × 800 floor, every hand
// folded to a count — the seat's own included, since it is read in the band and not on the felt.
function onlineScene(held: number): Snapshot {
  const seats = [
    { id: 'A', geometry: { x: -250, y: 340, w: 500, h: 60, rot: 0 }, held },
    { id: 'B', geometry: { x: -250, y: -400, w: 500, h: 60, rot: 0 }, held: 7 },
    { id: 'C', geometry: { x: 540, y: -250, w: 60, h: 500, rot: 0 }, held: 7 },
    { id: 'D', geometry: { x: -600, y: -250, w: 60, h: 500, rot: 0 }, held: 7 },
  ]
  return {
    ...scene(),
    seats: seats.map((s) => ({ id: s.id, name: `Spelare ${s.id}` })),
    zones: [
      ...scene().zones.filter((z) => z.kind !== 'hand'),
      ...seats.map((s) => ({ mode: 'count' as const, id: `hand:${s.id}`, kind: 'hand' as const, name: 'Hand', owner: s.id, geometry: s.geometry, dynamic: false, count: s.held })),
    ],
  }
}

// The table with its hands on, in millimetres: what the fit has to pass into the frame (#23).
function feltedOf(view: Snapshot, rotate: number): Size {
  const floor = view.zones.find((z) => z.id === view.floor)
  if (!floor) throw new Error('no floor')
  const rect_ = { x: floor.geometry.x, y: floor.geometry.y, w: floor.geometry.w, h: floor.geometry.h }
  const hands = view.zones.filter((z) => z.kind === 'hand')
  const felted = feltWithHands(rect_, hands.map((z) => handExtent(z, edgeRotation(z, floor))))
  return rotate % 180 === 0 ? felted : { w: felted.h, h: felted.w }
}

// The scale the renderer actually chose, read off the felt's own laid-out width rather than off
// its painted one: the tilt (K9) magnifies what is painted, and the question here is the fit.
async function scaleAt(view: Snapshot, size: Size, rotate: 0 | 90 = 0): Promise<number> {
  const floor = view.zones.find((z) => z.id === view.floor)
  if (!floor) throw new Error('no floor')
  const html = markupOf(<TableRenderer view={view} mode="table" rotate={rotate} size={size} />)
  const wide = await onPage(html, size, (page) => page.evaluate(() => (document.querySelector('[data-table]') as HTMLElement | null)?.offsetWidth ?? 0))
  if (wide === 0) throw new Error('no felt')
  return wide / floor.geometry.w
}

// The least air the felt ever leaves between itself and the frame that holds it: the wooden rim
// is drawn in the frame's own pixels, outside the millimetres the fit measures, and the TV's
// chrome leaves the same (K9).
const LEAST_AIR = 44
// The share of the frame the felt covers when the frame has room to give it: prototype B's
// proportion, read as a share of the frame's area instead of as a margin on its shorter side.
const FELT_SHARE = 0.4

describe('the felt uses the room the frame actually has (K9, K17, #24)', () => {
  // Every frame the one renderer is given in table mode: `/table`'s whole screen, the felt row
  // `/online` is left once the band is a layout row of its own (K17), and the editor's Bord tab
  // (#19). The row heights are the ones online-viewport.test.tsx measures on the real page.
  const FRAMES = [
    { what: '/table at 1600×1000', view: scene(), size: { w: 1600, h: 1000 } },
    { what: 'the Bord tab thumbnail', view: scene(), size: { w: 640, h: 384 } },
    { what: "/online's row at 1280", view: onlineScene(21), size: { w: 1280, h: 515 } },
    { what: "/online's row at 1440", view: onlineScene(21), size: { w: 1440, h: 615 } },
    { what: "/online's row at 390", view: onlineScene(21), size: { w: 390, h: 550 } },
    { what: "/online's row at 1280, three cards", view: onlineScene(3), size: { w: 1280, h: 528 } },
    { what: 'the observer’s four fanned hands at 768', view: handScene(), size: { w: 768, h: 900 } },
  ] as const

  for (const frame of FRAMES) {
    it(`leaves no room unused in ${frame.what}`, async () => {
      const felted = feltedOf(frame.view, 0)
      const scale = await scaleAt(frame.view, frame.size)
      // The invariant, and not a pixel count: the felt covers its decided share of the frame —
      // area, so that a frame far wider than the table counts for as much as one the table's own
      // shape — or, where the frame's shape forbids that, it is simply as large as the frame can
      // hold. A felt that is neither has left room on the table's own axis unused.
      const covered = (scale * scale * felted.w * felted.h) / (frame.size.w * frame.size.h)
      const most = fitScale(felted, frame.size, LEAST_AIR)
      expect({
        at: frame.what,
        covered: Math.round(covered * 100) / 100,
        enough: covered >= FELT_SHARE - 0.02 || scale >= most - 0.005,
      }).toEqual({ at: frame.what, covered: Math.round(covered * 100) / 100, enough: true })
    }, 60_000)
  }
})

describe('the felt keeps prototype B’s proportion where the frame can give it (K9, #20)', () => {
  // The two frames the table-mode renderer has always had to itself. Pinned from both sides:
  // this is the proportion #4/#5/#6 tuned and #24 may not move in either direction.
  for (const frame of [{ what: '/table at 1600×1000', size: { w: 1600, h: 1000 } }, { what: 'the Bord tab thumbnail', size: { w: 640, h: 384 } }] as const) {
    it(`covers two fifths of ${frame.what} and no more`, async () => {
      const felted = feltedOf(scene(), 0)
      const scale = await scaleAt(scene(), frame.size)
      const covered = (scale * scale * felted.w * felted.h) / (frame.size.w * frame.size.h)
      expect({ at: frame.what, low: covered < 0.38, high: covered > 0.42, covered: Math.round(covered * 1000) / 1000 }).toEqual({ at: frame.what, low: false, high: false, covered: Math.round(covered * 1000) / 1000 })
    }, 60_000)
  }
})

// ================================================================================================
// The keyboard's own two gates (#1, #2): there has to be something to see where the focus is, and
// the panel has to be pressable at a table's width. Before this, `table.css`, `player.css` and
// `online.css` did not contain the word `focus` once.

describe('the keyboard can be seen standing on the felt (#2)', () => {
  it('draws a real ring around whichever card or pile has the focus', async () => {
    const view = scene()
    const labels = feltLabels(view)
    const keyboard = {
      labels,
      itemProps: (key: string) => ({ tabIndex: key === 'card:m1' ? 0 : -1, ref: () => undefined, onKeyDown: () => undefined, onFocus: () => undefined }),
      onActivate: () => undefined,
    }
    const html = markupOf(<TableRenderer view={view} mode="tv" scale={1} keyboard={keyboard} />)
    const ring = await onPage(html, FRAME, async (page) => {
      await page.evaluate(() => (document.querySelector('[data-kbd="card:m1"]') as HTMLElement).focus())
      return await page.evaluate(() => {
        const el = document.querySelector('[data-kbd="card:m1"]') as HTMLElement
        const style = getComputedStyle(el)
        return { focused: document.activeElement === el, width: parseFloat(style.outlineWidth), style: style.outlineStyle }
      })
    })
    expect(ring.focused).toBe(true)
    expect(ring.style).not.toBe('none')
    expect(ring.width).toBeGreaterThanOrEqual(2)
  }, 60_000)
})

describe('the address panel beside a table (#1, #2)', () => {
  it('keeps every row pressable and never pushes the page sideways at 1280', async () => {
    const view = scene()
    const thing: Thing = { key: 'card:m1', kind: 'card', id: 'm1', name: 'Gruva', zone: 'market' }
    const html = markupOf(
      <ActionPanel
        view={view}
        thing={thing}
        cards={[]}
        onClose={() => undefined}
        onRun={() => undefined}
        onLook={() => undefined}
        intentsFor={(place, moving) => intentsForPlace(view, place, thing, moving)}
        landedKey={(place) => landedKeyFor(view, place, thing)}
      />,
    )
    const measured = await onPage(html, { w: 1280, h: 720 }, (page) =>
      page.evaluate(() => ({
        small: [...document.querySelectorAll('button')]
          .map((el) => ({ what: (el.textContent ?? '').slice(0, 20), box: el.getBoundingClientRect() }))
          .filter(({ box }) => box.height < 44)
          .map(({ what, box }) => `${what}: ${Math.round(box.width)}×${Math.round(box.height)}`),
        sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      })),
    )
    expect(measured).toEqual({ small: [], sideways: 0 })
  }, 60_000)
})
