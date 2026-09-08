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

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const SHEETS = ['src/table/table.css', 'src/table/texture.css']

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
      { mode: 'count', id: 'discard', kind: 'pile', name: 'Kasthög', geometry: { x: 140, y: 0, w: 0, h: 0, rot: 0 }, dynamic: false, count: 3 },
      { mode: 'count', id: 'hand:N', kind: 'hand', name: 'Hand', owner: 'N', geometry: { x: -250, y: -400, w: 500, h: 60, rot: 0 }, dynamic: false, count: 5 },
    ],
    components: [
      card('m1', 'market', 4, 4, 'Gruva'),
      card('m2', 'market', 170, 4, 'Torn'),
      // A seat's counter (C4): a chip with its value and, where there is room, its name.
      { id: 't1', type: { id: 'token.counter', version: 1 }, zone: 'table', face: 'front', x: 300, y: 100, rot: 0, cardRef: 'Poäng', counter: 3 } as unknown as VisibleComponentState,
    ],
    rewind: null,
    undo: null,
    ended: false,
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

describe('two piles on a phone-sized felt (C5)', () => {
  it('never lays one pile\'s label over the next one\'s, however long the names are', async () => {
    // The felt shrinks with the screen while the words do not, so on a phone the room between
    // two piles is a thumb's width. What a player reads at a glance is the count; the name is a
    // tap away in the play sheet.
    const phone = { w: 375, h: 812 }
    // The felt as a phone fits it: a 1200 mm table drawn about 260 px wide.
    const onPhone = markupOf(<TableRenderer view={scene()} mode="table" scale={0.22} />)
    const labels = await measureAll(onPhone, phone, '.byd-pile-count')
    expect(labels).toHaveLength(2)
    expect(overlaps(labels[0]!.box, labels[1]!.box)).toBe(false)
    const counts = await measureAll(onPhone, phone, '.byd-pile-n')
    expect(counts.every((c) => c.box.w > 0)).toBe(true)

    // An area's name is no better off: it stands over the zone's top edge and would lie across
    // the next one, so it goes the same way.
    const zones = await measureAll(onPhone, phone, '.byd-zone > span')
    expect(zones.every((z) => z.box.w === 0)).toBe(true)

    // A counter's own name is six pixels tall on a felt this size; its value is the whole point.
    const tokens = await measureAll(onPhone, phone, '.byd-token span')
    expect(tokens).toHaveLength(1)
    expect(tokens.every((z) => z.box.w === 0)).toBe(true)

    // On a screen with room, the names are back.
    const named = await measureAll(markup('table'), FRAME, '.byd-pile-name')
    expect(named.every((n) => n.box.w > 0)).toBe(true)
    const feltZones = await measureAll(markup('table'), FRAME, '.byd-zone > span')
    expect(feltZones.every((z) => z.box.w > 0)).toBe(true)
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
