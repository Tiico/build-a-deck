// @vitest-environment jsdom
// The distance view's own hand (C2, K9) is a fan of turned cards drawn over the table, and a
// turned card is painted well outside the box a flex row lays it in. Where it actually lands is a
// layout question jsdom answers with zeroes, so `/online` is mounted against a real session and
// measured in a real engine at the widths the audit checks (#6).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { chromium, type Browser, type Page } from 'playwright'
import { CARD_STANDARD_63x88, type SetupDef } from '@byd/engine'
import { TableClient } from '../src/client.js'
import { OnlinePage } from '../src/online/OnlinePage.js'
import { admit, asTable, createSession, startServer, type Running } from './fixture.js'
import { atWidth } from './viewport.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const shell = read('index.html')
// Every sheet `/online` ships with: the felt, the textures, the phone's controls it borrows, its
// own, the keyboard's rings and panel (#1, #2), and the status surfaces.
const css = ['src/table/table.css', 'src/table/texture.css', 'src/player/player.css', 'src/online/online.css', 'src/table/keyboard.css', 'src/status/status.css', 'src/a11y.css'].map(read).join('\n')

const document_ = (html: string) =>
  shell
    .replace('<script type="module" src="/src/main.tsx"></script>', '')
    .replace('</head>', `<style>${css}</style></head>`)
    .replace('<div id="root"></div>', `<div id="root">${html}</div>`)

const CARD = { id: CARD_STANDARD_63x88.id, version: 1 }
const rect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h, rot: 0 })
const point = (x: number, y: number) => ({ x, y, w: 0, h: 0, rot: 0 })

// Four seats around the rim and a deck deep enough to fill a hand right up: the fan grows with
// what the seat holds, so the widest hand is part of the question and not an edge case.
function fourSeatSetup(): SetupDef {
  return {
    seats: ['A', 'B', 'C', 'D'],
    floor: 'table',
    zones: [
      { id: 'draw', kind: 'pile', name: 'Draghög', visibility: 'none', geometry: point(-200, 0) },
      { id: 'table', kind: 'area', name: 'Spelyta', visibility: 'all', geometry: rect(-500, -300, 1000, 600) },
      { id: 'hand:A', kind: 'hand', name: 'Hand', visibility: 'owner', owner: 'A', returnTo: 'draw', geometry: rect(-300, 320, 600, 100) },
      { id: 'hand:B', kind: 'hand', name: 'Hand', visibility: 'owner', owner: 'B', returnTo: 'draw', geometry: rect(-300, -420, 600, 100) },
      { id: 'hand:C', kind: 'hand', name: 'Hand', visibility: 'owner', owner: 'C', returnTo: 'draw', geometry: rect(-600, -150, 100, 300) },
      { id: 'hand:D', kind: 'hand', name: 'Hand', visibility: 'owner', owner: 'D', returnTo: 'draw', geometry: rect(500, -150, 100, 300) },
    ],
    components: Array.from({ length: 30 }, (_, i) => ({ type: CARD, cardRef: `Kort ${i}`, zone: 'draw', face: 'back' as const })),
  }
}

// The page as it really mounts: a live seat that has been dealt `held` cards, rendered at the
// width it will be measured at, and handed back as the markup the browser gets.
async function markup(held: number, width: number): Promise<string> {
  atWidth(width)
  const id = await createSession(run, `s-${held}-${width}`, undefined, fourSeatSetup())
  const host = TableClient.connect(await asTable(run, id))
  await host.ready()
  await host.send({ v: 'draw', from: 'draw', to: 'hand:A', count: held })
  const token = await admit(run, id, 'A', 'Ada')
  history.replaceState(null, '', `/online?session=${id}&seat=A&name=Ada&token=${token}&server=${encodeURIComponent(run.url)}`)
  const { unmount } = render(<OnlinePage />)
  try {
    await waitFor(() => expect(document.querySelectorAll('[data-hand-fan] [data-hand-card]')).toHaveLength(held))
    return document.querySelector('#root, body')!.innerHTML
  } finally {
    unmount()
    host.close()
  }
}

type Box = { what: string; x: number; y: number; w: number; h: number }

// The page, mounted for a hand of `held` and laid out at `size`, for whatever the caller reads.
async function onFan<T>(held: number, size: { w: number; h: number }, read_: (page: Page) => Promise<T>): Promise<T> {
  const html = await markup(held, size.w)
  const page: Page = await browser.newPage({ viewport: { width: size.w, height: size.h } })
  try {
    await page.setContent(document_(html), { waitUntil: 'load' })
    return await read_(page)
  } finally {
    await page.close()
  }
}

// Every card of the seat's own fan, plus what the page as a whole does about its width.
const fanAt = (held: number, size: { w: number; h: number }): Promise<{ cards: Box[]; sideways: number }> =>
  onFan(held, size, (page) =>
    page.evaluate(() => ({
      cards: [...document.querySelectorAll('[data-hand-fan] [data-hand-card]')].map((el) => {
        const r = el.getBoundingClientRect()
        return { what: el.getAttribute('aria-label')?.slice(0, 24) ?? '?', x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
      }),
      sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    })),
  )

const SIZES = [
  { w: 1280, h: 800 },
  { w: 1440, h: 900 },
  { w: 390, h: 844 },
] as const

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

describe('the seat’s own hand lies inside the screen it is drawn on (C2, K9)', () => {
  for (const size of SIZES) {
    for (const held of [3, 12] as const) {
      it(`cuts no card of a hand of ${held} at ${size.w}×${size.h}`, async () => {
        const { cards } = await fanAt(held, size)
        expect(cards).toHaveLength(held)
        // The invariant, not a number: the fan is the only thing on this screen the player reads
        // and drags from, so every card of it is whole and on the screen at every size.
        const cut = cards.filter((c) => c.x < 0 || c.y < 0 || c.x + c.w > size.w || c.y + c.h > size.h)
        expect({ at: `${size.w}×${size.h}`, cut }).toEqual({ at: `${size.w}×${size.h}`, cut: [] })
      }, 60_000)
    }
  }
})

describe('the ring a keyboard leaves on a hand card is on the screen too (#1, #2)', () => {
  for (const size of SIZES) {
    it(`shows the whole focus ring of the outermost card at ${size.w}`, async () => {
      const seen = await onFan(3, size, (page) =>
        page.evaluate(() => {
          const card = document.querySelector('[data-hand-fan] [data-hand-card]') as HTMLElement
          card.focus()
          const style = getComputedStyle(card)
          // How far the ring reaches out of the card's own box: the outline and its offset, or
          // the widest of the two bands the box-shadow draws, whichever stands furthest out.
          const spreads = [...style.boxShadow.matchAll(/(-?[\d.]+)px/g)].map((m) => Number(m[1]))
          const reach = Math.max(parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset), ...spreads)
          // The card is turned, and so is the ring around it, so its corners stand out furthest.
          const r = card.getBoundingClientRect()
          const out = reach * Math.SQRT2
          return { focused: document.activeElement === card, reach, inside: r.left - out >= 0 && r.top - out >= 0 && r.right + out <= innerWidth && r.bottom + out <= innerHeight }
        }),
      )
      expect({ at: size.w, ...seen }).toEqual({ at: size.w, focused: true, reach: seen.reach, inside: true })
      expect(seen.reach).toBeGreaterThan(0)
    }, 60_000)
  }
})

describe('the fan keeps the page’s own promises (#4, #5, #6)', () => {
  for (const size of SIZES) {
    it(`stays pressable and adds no sideways scroll at ${size.w}`, async () => {
      const { cards, sideways } = await fanAt(12, size)
      const small = cards.filter((c) => c.w < 44 || c.h < 44).map((c) => `${c.what}: ${c.w}×${c.h}`)
      expect({ at: size.w, sideways, small }).toEqual({ at: size.w, sideways: 0, small: [] })
    }, 60_000)
  }
})
