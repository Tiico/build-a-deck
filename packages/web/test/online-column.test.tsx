// @vitest-environment jsdom
// The seat's own hand as a column at the side of a landscape window (K17's revision, #77).
//
// Three things change when the band is stood on end, and each of them is a way the shape can fail
// that the band could not. A card is overlapped from *below*, so its own middle is hidden and its
// name has to live in the strip its neighbour leaves — the band overlapped sideways and never had
// to think about it. The step is vertical, so it is the window's height and not its width that
// tightens it, and it still may not go under a fingertip. And the whole hand has to be got to,
// which for a hand larger than the column means scrolling rather than being told it is elsewhere.
//
// jsdom lays nothing out, so the page is mounted against a real session there and measured in
// Chromium, exactly as `online-viewport.test.tsx` does for the band.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { chromium, type Browser, type Page } from 'playwright'
import { CARD_STANDARD_63x88, type SetupDef } from '@byd/engine'
import type { VisibleComponentState } from '@byd/protocol'
import { Texture } from '../src/table/Texture.js'
import { TableClient } from '../src/client.js'
import { OnlinePage } from '../src/online/OnlinePage.js'
import { FAN_CARD_MIN_PX, FAN_CARD_PX, FAN_MIN_PX } from '../src/online/fan.js'
import { admit, asTable, createSession, startServer, type Running } from './fixture.js'
import { atWindow, type Size } from './felt-frame.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const shell = read('index.html')
const css = ['src/table/table.css', 'src/table/texture.css', 'src/player/player.css', 'src/online/online.css', 'src/table/keyboard.css', 'src/status/status.css', 'src/a11y.css', 'src/buttons.css'].map(read).join('\n')

const document_ = (html: string) =>
  shell
    .replace('<script type="module" src="/src/main.tsx"></script>', '')
    .replace('</head>', `<style>${css}</style></head>`)
    .replace('<div id="root"></div>', `<div id="root">${html}</div>`)

const CARD = { id: CARD_STANDARD_63x88.id, version: 1 }
const rect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h, rot: 0 })
const point = (x: number, y: number) => ({ x, y, w: 0, h: 0, rot: 0 })

// Four seats round the rim and a deck deep enough to fill a hand right up.
function fourSeatSetup(held: number): SetupDef {
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
    components: Array.from({ length: held + 6 }, (_, i) => ({ type: CARD, cardRef: `Kort ${i}`, zone: 'draw', face: 'back' as const })),
  }
}

// The page as it really mounts: a live seat dealt `held` cards in a landscape window, handed back
// as the markup the browser gets.
async function markup(held: number, size: Size): Promise<string> {
  atWindow(size)
  const id = await createSession(run, `col-${held}-${size.w}x${size.h}`, undefined, fourSeatSetup(held))
  const host = TableClient.connect(await asTable(run, id))
  await host.ready()
  await host.send({ v: 'draw', from: 'draw', to: 'hand:A', count: held })
  const token = await admit(run, id, 'A', 'Ada')
  history.replaceState(null, '', `/online?session=${id}&seat=A&name=Ada&token=${token}&server=${encodeURIComponent(run.url)}`)
  const { unmount } = render(<OnlinePage />)
  try {
    await waitFor(() => expect(document.querySelectorAll('[data-hand-column] [data-hand-card]')).toHaveLength(held))
    return document.querySelector('#root, body')!.innerHTML
  } finally {
    unmount()
    host.close()
  }
}

async function onColumn<T>(held: number, size: Size, read_: (page: Page) => Promise<T>): Promise<T> {
  const html = await markup(held, size)
  const page = await browser.newPage({ viewport: { width: size.w, height: size.h } })
  try {
    await page.setContent(document_(html), { waitUntil: 'load' })
    return await read_(page)
  } finally {
    await page.close()
  }
}

// What the column is, read off the drawn page. Every card is scrolled into view first, because a
// hand larger than the column is the decided answer: "on the screen" means every card of it can be
// got to and says its own name when it is.
//
// The name is whatever the card actually shows — the face's own while it is still being rendered
// (#10), the fallback under it otherwise — and it counts as shown only when it is inside the
// column's own visible box and above the top of the card drawn after it. That last clause is the
// whole of what a column changes: a card is covered from below, not from the side.
//
// Both namings are read, because they are two different elements and they centred themselves in
// two different places. The waiting one is the component's own markup, rendered here and put into
// the cards the page really drew: what state a face is in is the component's business, and the
// strip it has to fit into is the column's.
const WAITING = renderToStaticMarkup(
  <Texture faces="http://faces.test" c={{ id: 'x', type: CARD, zone: 'hand:A', face: 'front', x: 0, y: 0, rot: 0, cardRef: 'Kort 0', faces: { front: 'a'.repeat(64) } } as VisibleComponentState} />,
)

const columnAt = (held: number, size: Size, face: 'none' | 'waiting' = 'none') =>
  onColumn(held, size, (page) =>
    page.evaluate(({ face, waiting }) => {
      const box = document.querySelector<HTMLElement>('[data-hand-column]')!
      if (face === 'waiting') for (const card of box.querySelectorAll('[data-hand-card]')) card.innerHTML = waiting
      const cards = [...box.querySelectorAll<HTMLElement>('[data-hand-card]')]
      const slots = cards.map((c) => c.parentElement!)
      const inside = (a: DOMRect, b: DOMRect) => a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1
      const blank: string[] = []
      for (const [i, card] of cards.entries()) {
        card.scrollIntoView({ block: 'nearest' })
        const label = card.querySelector('[data-texture] > b') ?? card.querySelector('span:not([data-texture])')
        const r = label?.getBoundingClientRect()
        const next = cards[i + 1]?.getBoundingClientRect()
        const what = card.getAttribute('aria-label')?.slice(0, 16) ?? '?'
        if (!r || r.width === 0 || r.height === 0) blank.push(`${what}: no name drawn`)
        else if (!inside(r, box.getBoundingClientRect())) blank.push(`${what}: name outside the column`)
        else if (next && r.bottom > next.top + 1) blank.push(`${what}: name under the next card`)
      }
      box.scrollTop = 0
      const tops = slots.map((s) => s.getBoundingClientRect().top)
      return {
        blank,
        cards: cards.length,
        step: Math.round(Math.min(...tops.slice(1).map((t, i) => t - tops[i]!))),
        card: { w: Math.round(cards[0]!.offsetWidth), h: Math.round(cards[0]!.offsetHeight) },
        width: Math.round(box.getBoundingClientRect().width),
        // What the browser is told about the two gestures before either of them reaches us: a
        // touch that pans along the column is the scroller's own, and one across it is not.
        pan: getComputedStyle(cards[0]!).touchAction,
        // What is left to scroll in the column, and what the page itself scrolls — which is never.
        scroll: Math.round(box.scrollHeight - box.clientHeight),
        sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }
    }, { face, waiting: WAITING }),
  )

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

const DESK: Size = { w: 1280, h: 800 }
const WIDE: Size = { w: 1920, h: 1080 }
// A laptop with a short window, where the column runs out of height first: the shape has to stay
// usable there and not merely at the two windows it was designed against.
const SHORT: Size = { w: 1024, h: 600 }
const SIZES = [DESK, WIDE, SHORT] as const
const COUNTS = [3, 13, 21] as const

describe('every card in the column says its own name (K17, #77)', () => {
  for (const face of ['none', 'waiting'] as const)
    for (const size of SIZES)
      for (const held of COUNTS)
        it(`leaves no card of a hand of ${held} blank at ${size.w} × ${size.h}, face ${face}`, async () => {
          const seen = await columnAt(held, size, face)
          const at = `${held} at ${size.w} × ${size.h}, face ${face}`
          expect({ at, cards: seen.cards, blank: seen.blank }).toEqual({ at, cards: held, blank: [] })
        }, 90_000)
})

describe('a card in the column is still something a finger can land on (#6, K17, #77)', () => {
  for (const size of SIZES)
    for (const held of COUNTS)
      it(`keeps the step at a fingertip and the card at reading size, ${held} cards at ${size.w} × ${size.h}`, async () => {
        const { step, card, width } = await columnAt(held, size)
        const at = `${held} at ${size.w} × ${size.h}`
        // The card keeps the size it is read at and does not shrink to make the hand fit; what
        // gives way is the step, and it gives way only down to a fingertip. Past that the column
        // scrolls instead — which is K17's own law, on the other axis.
        expect({ at, step, card, tight: step < FAN_MIN_PX, small: card.w < FAN_CARD_MIN_PX, big: card.w > FAN_CARD_PX }).toEqual({ at, step, card, tight: false, small: false, big: false })
        // And the column costs the felt a strip and not a third of the window: below about 300 px
        // at 1280 the felt comes out the same size whatever the column takes, so it takes little.
        expect({ at, wide: width > size.w / 4 }).toEqual({ at, wide: false })
      }, 90_000)
})

describe('the two gestures are told apart before either reaches the page (K17, #77)', () => {
  it('gives the browser the pan along the column and keeps the drag across it', async () => {
    const { pan } = await columnAt(13, DESK)
    expect(pan).toBe('pan-y')
  }, 90_000)
})

describe('the whole hand is reachable, and the page never scrolls to reach it (L10, #77)', () => {
  it('shows all thirteen cards at once at 1280 × 800, with nothing left to scroll', async () => {
    const seen = await columnAt(13, DESK)
    expect({ cards: seen.cards, scroll: seen.scroll, sideways: seen.sideways }).toEqual({ cards: 13, scroll: 0, sideways: 0 })
  }, 90_000)

  it('keeps all twenty-one reachable at 1280 × 800 by scrolling the column and never the page', async () => {
    const seen = await columnAt(21, DESK)
    expect({ cards: seen.cards, blank: seen.blank, sideways: seen.sideways }).toEqual({ cards: 21, blank: [], sideways: 0 })
    // Not vacuous: twenty-one cards really are more than this window holds, so the reading above
    // is about a column that was scrolled and not about one that happened to fit.
    expect(seen.scroll).toBeGreaterThan(0)
  }, 90_000)
})
