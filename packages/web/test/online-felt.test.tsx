// @vitest-environment jsdom
// The seat's own felt, measured on the box Chromium paints (K9, C5, #77).
//
// A card is a control on this surface — it is dragged, pressed and read — so K9's forty-five
// pixels across its short side is the gate, and the gate is asked of the *drawn* card. `scale ×
// 63 mm` is not the same number: the felt is tilted, so a card at the felt's far edge is painted
// about fifteen per cent smaller than the scale says, and a rule read off the scale passes a card
// the eye cannot use. Every reading below is therefore `getBoundingClientRect` in Chromium on a
// card lying on the felt, and never the number the fit was asked for.
//
// The gate is not one number at every window, and the reason is written down rather than hidden
// in a constant: 1920 x 1080 makes K9's forty-five and 1280 x 800 cannot, because the page's own
// two rows leave the felt too little height for it however the table is turned. See `FLOOR_PX`,
// and DESIGN-BESLUT's K9 and section I.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { chromium, type Browser, type Page } from 'playwright'
import { TableClient } from '../src/client.js'
import { OnlinePage } from '../src/online/OnlinePage.js'
import { seatRotation } from '../src/online/seat.js'
import { admit, asTable, createSession, startServer, type Running } from './fixture.js'
import { atWindow, feltIsFitted, withFrame, type Size } from './felt-frame.js'
import { FELT_FONT, defOf, feltOf, sceneOf, sheet } from './felt-labels.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const shell = read('index.html')
// Every sheet `/online` ships with, the felt's own face first (K20, #95).
const SHEETS = [FELT_FONT, 'src/table/table.css', 'src/table/texture.css', 'src/player/player.css', 'src/online/online.css', 'src/table/keyboard.css', 'src/status/status.css', 'src/a11y.css', 'src/buttons.css']

const document_ = (html: string) =>
  shell
    .replace('<script type="module" src="/src/main.tsx"></script>', '')
    .replace('</head>', `<style>${SHEETS.map(sheet).join('\n')}</style></head>`)
    .replace('<div id="root"></div>', `<div id="root">${html}</div>`)

// The wizard's own four-seat table: an area and a counter in front of every seat, two shared
// piles, something dealt into every hand and two cards played in front of each seat. A rule about
// a card is asked of a table that carries the whole recipe's furniture.
const TABLE = feltOf(4)
const SCENE = sceneOf(TABLE)
// Which of the four seats sits at a side of the felt and which at the bottom, read off the rule
// rather than guessed from a letter.
const SIDE = TABLE.seats.find((s) => seatRotation(SCENE, s) % 180 !== 0)!
const BOTTOM = TABLE.seats.find((s) => seatRotation(SCENE, s) === 0)!

let sessions = 0

// `/online` as it really mounts: a live seat with cards in its hand, at the window it will be
// measured at, handed back as the markup the browser gets.
async function markup(seat: string, size: Size, box: Size | null = null): Promise<string> {
  atWindow(size)
  const id = await createSession(run, `felt${++sessions}`, undefined, defOf(TABLE))
  const host = TableClient.connect(await asTable(run, id))
  await host.ready()
  const token = await admit(run, id, seat, `Spelare ${seat}`)
  history.replaceState(null, '', `/online?session=${id}&seat=${seat}&name=${encodeURIComponent(`Spelare ${seat}`)}&token=${token}&server=${encodeURIComponent(run.url)}`)
  return withFrame(box, async () => {
    const { unmount } = render(<OnlinePage />)
    try {
      await waitFor(() => expect(feltIsFitted()).toBe(true))
      return document.querySelector('#root, body')!.innerHTML
    } finally {
      unmount()
      host.close()
    }
  })
}

async function measure<T>(size: Size, read_: (page: Page) => Promise<T>, html: string): Promise<T> {
  const page = await browser.newPage({ viewport: { width: size.w, height: size.h } })
  try {
    await page.setContent(document_(html), { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
    return await read_(page)
  } finally {
    await page.close()
  }
}

// The page at the scale it really gives its felt: the frame's box read first off a page whose
// felt was given none, then the page mounted again with that box in hand.
const frames = new Map<string, Size>()
async function feltMarkup(seat: string, size: Size): Promise<string> {
  const key = `${seat}@${size.w}x${size.h}`
  const known = frames.get(key)
  const box =
    known ??
    (await measure(
      size,
      (page) =>
        page.evaluate(() => {
          const r = document.querySelector('.byd-table-frame')!.getBoundingClientRect()
          return { w: Math.round(r.width), h: Math.round(r.height) }
        }),
      await markup(seat, size, { w: 1, h: 1 }),
    ))
  frames.set(key, box)
  return markup(seat, size, box)
}

// Every card lying on the felt, as the browser paints it. `getBoundingClientRect` is the painted
// box and not the millimetres: the tilt is already in it, which is the whole point.
const cardsOn = (seat: string, size: Size) =>
  feltMarkup(seat, size).then((html) =>
    measure(
      size,
      (page) =>
        page.evaluate(() => {
          const sides = [...document.querySelectorAll('.byd-card[data-component]')].map((el) => {
            const r = el.getBoundingClientRect()
            return Math.round(Math.min(r.width, r.height))
          })
          const felt = document.querySelector('[data-table]')!.getBoundingClientRect()
          const b = (sel: string) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] }
          return { sides, smallest: Math.min(...sides), felt: { w: Math.round(felt.width), h: Math.round(felt.height) }, rows: { top: b('.byd-online-top'), row: b('.byd-online-felt'), band: b('.byd-hand-under'), wood: b('.byd-table-wood') } }
        }),
      html,
    ),
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
const PHONE: Size = { w: 390, h: 844 }

// K9's own gate, asked of the seat's window: a card on the felt is a control — it is dragged,
// pressed and read — and the smallest thing a control may be is forty-five pixels across its
// short side.
const PLAYABLE_PX = 45

// What a window of this shape can actually afford, measured (#77). The felt's frame is the window
// less the two rows the page's own chrome takes — the seat's line and the hand's band — and less
// the air the fit leaves, and at 1280 x 800 that is not enough room for K9's forty-five however
// the table is turned: the band alone would have to come down to about a hundred pixels, against
// the two hundred and eighteen K17's reading size makes it. So the desk is held to the number the
// design does reach, as a floor that may not be given back, and the shortfall is written down as
// an open question rather than asserted away. See DESIGN-BESLUT, K9's revision of 2026-09-14.
const FLOOR_PX: Record<number, number> = { 800: 30, 1080: PLAYABLE_PX }

describe('a card on the seat\u2019s own felt is as big as the window can make it (K9, C5, #77)', () => {
  for (const size of [DESK, WIDE])
    for (const [where, seat] of [
      ['a side seat', SIDE],
      ['a bottom seat', BOTTOM],
    ] as const)
      it(`draws ${where}\u2019s cards at ${FLOOR_PX[size.h]} px or more at ${size.w} \u00d7 ${size.h}`, async () => {
        const { smallest, sides, felt } = await cardsOn(seat, size)
        const want = FLOOR_PX[size.h]!
        expect(sides.length).toBeGreaterThan(0)
        const at = `${where} at ${size.w} \u00d7 ${size.h}`
        expect({ at, smallest, felt, playable: smallest >= want }).toEqual({ at, smallest, felt, playable: true })
      }, 90_000)
})

// Which way round the felt is drawn, asked of the drawing: a felt that says it is turned and is
// not drawn turned is not a turn.
const turnOf = (seat: string, size: Size) =>
  feltMarkup(seat, size).then((html) =>
    measure(
      size,
      (page) =>
        page.evaluate(() => {
          const felt = document.querySelector<HTMLElement>('[data-table]')!
          const wood = document.querySelector<HTMLElement>('.byd-table-wood')!.getBoundingClientRect()
          return { rotate: Number(felt.dataset['rotate'] ?? 0), wood: { w: Math.round(wood.width), h: Math.round(wood.height) } }
        }),
      html,
    ),
  )

describe('a side seat is not turned in a landscape window (C5, C8, #77)', () => {
  for (const size of [DESK, WIDE])
    it(`draws the side seat’s table the way round the window is at ${size.w} × ${size.h}`, async () => {
      const drawn = await turnOf(SIDE, size)
      expect({ at: `${size.w} × ${size.h}`, rotate: drawn.rotate }).toEqual({ at: `${size.w} × ${size.h}`, rotate: 0 })
      // And the drawing agrees: the table lies the long way the window does.
      expect({ at: `${size.w} × ${size.h}`, along: drawn.wood.w >= drawn.wood.h }).toEqual({ at: `${size.w} × ${size.h}`, along: true })
    }, 90_000)

  it('still puts a side seat’s own edge at the bottom on a phone held upright, where the window asks for the quarter turn anyway', async () => {
    const drawn = await turnOf(SIDE, PHONE)
    expect({ quarter: drawn.rotate % 180 !== 0, along: drawn.wood.w >= drawn.wood.h }).toEqual({ quarter: true, along: false })
  }, 90_000)

  it('leaves a bottom seat’s own edge at the bottom in either window', async () => {
    for (const size of [DESK, PHONE]) expect({ at: size.w, rotate: (await turnOf(BOTTOM, size)).rotate }).toEqual({ at: size.w, rotate: 0 })
  }, 90_000)
})

// Which edge is yours, when the felt is no longer turned to put it at the bottom (C5, #77). The
// table already draws a place card along every seat's own border, turned toward whoever sits
// there (K9); what #77 needs of it is that one of them is marked as the reader's own, so that a
// player at a side seat in a landscape window can see where they are sitting without the whole
// table being turned to tell them.
const placeOf = (seat: string, size: Size) =>
  feltMarkup(seat, size).then((html) =>
    measure(
      size,
      (page) =>
        page.evaluate((seat) => {
          const felt = document.querySelector('[data-table]')!.getBoundingClientRect()
          const cards = [...document.querySelectorAll<HTMLElement>('.byd-seat-name')]
          const mine = cards.filter((el) => el.dataset['me'] !== undefined)
          const el = cards.find((c) => c.dataset['seatName'] === seat)
          const r = el?.getBoundingClientRect()
          return {
            cards: cards.length,
            marked: mine.map((el) => el.dataset['seatName']),
            edge: el?.dataset['edge'] ?? null,
            // Which side of the felt's middle the card lies on, as the reader sees it.
            side: r ? { right: r.left + r.width / 2 > felt.left + felt.width / 2, below: r.top + r.height / 2 > felt.top + felt.height / 2 } : null,
            inside: r ? r.left >= felt.left - 1 && r.right <= felt.right + 1 && r.top >= felt.top - 1 && r.bottom <= felt.bottom + 1 : false,
          }
        }, seat),
      html,
    ),
  )

describe('which edge is yours is said on the screen, turned or not (C5, K9, #77)', () => {
  it('marks the side seat’s own place card and no one else’s, on its own edge of the felt, in a landscape window', async () => {
    const seen = await placeOf(SIDE, DESK)
    expect({ marked: seen.marked, edge: seen.edge, inside: seen.inside }).toEqual({ marked: [SIDE], edge: 'E', inside: true })
    // And it is drawn where that edge is, so it points rather than merely names: the east seat's
    // card lies on the right of the felt's middle, which is where the felt is not turned to.
    expect(seen.side).toEqual({ right: true, below: false })
  }, 90_000)

  it('marks the bottom seat’s own place card too, where the turn already says it', async () => {
    const seen = await placeOf(BOTTOM, DESK)
    expect({ marked: seen.marked, edge: seen.edge, side: seen.side }).toEqual({ marked: [BOTTOM], edge: 'S', side: { right: false, below: true } })
  }, 90_000)

  it('still marks it on a phone, where the felt is turned to the seat’s own edge', async () => {
    const seen = await placeOf(SIDE, PHONE)
    expect({ marked: seen.marked, inside: seen.inside, below: seen.side?.below }).toEqual({ marked: [SIDE], inside: true, below: true })
  }, 90_000)
})

// #25's rule, asked again now that the felt has been given more of the window (#77): the page is
// rows and nothing lies on top of anything. The prototype's layout win came with the band lying
// over the felt and covering the near seat's own area, and the seat's line floating over the
// felt's far corner; both are read back here off the drawn page.

const coveredAt = (seat: string, size: Size) =>
  feltMarkup(seat, size).then((html) =>
    measure(
      size,
      (page) =>
        page.evaluate(() => {
          const box = (sel: string) => document.querySelector(sel)?.getBoundingClientRect() ?? null
          const laps = (a: DOMRect, b: DOMRect) => Math.round(Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)))
          const chrome = [
            ['the hand’s band', box('.byd-hand-under')],
            ['the seat’s line', box('.byd-online-me')],
            ['the session’s tools', box('.byd-online-tools')],
          ] as const
          const felt = box('[data-table]')!
          // Every zone the felt draws, and every name it writes on one.
          const zones = [...document.querySelectorAll<HTMLElement>('.byd-zone, .byd-pile, .byd-hand, .byd-seat-name')].filter((el) => el.checkVisibility())
          const overFelt: string[] = []
          const overZone: string[] = []
          for (const [what, a] of chrome) {
            if (!a) throw new Error(`${what} is not on the page`)
            if (laps(a, felt) > 0) overFelt.push(`${what} over the felt: ${laps(a, felt)} px²`)
            for (const z of zones) {
              const hit = laps(a, z.getBoundingClientRect())
              if (hit > 0) overZone.push(`${what} over ${(z.className || z.tagName).split(' ')[0]}: ${hit} px²`)
            }
          }
          return { zones: zones.length, overFelt, overZone }
        }),
      html,
    ),
  )

describe('the felt gets the room and nothing is drawn over anything else (K17, #25, #77)', () => {
  for (const size of [DESK, PHONE])
    for (const [where, seat] of [
      ['a side seat', SIDE],
      ['a bottom seat', BOTTOM],
    ] as const)
      it(`lays no chrome over ${where}’s felt or over a zone on it at ${size.w} × ${size.h}`, async () => {
        const seen = await coveredAt(seat, size)
        // Not vacuous: the felt really is drawing zones under where the chrome would fall.
        expect(seen.zones).toBeGreaterThan(4)
        const at = `${where} at ${size.w} × ${size.h}`
        expect({ at, ...seen }).toEqual({ at, zones: seen.zones, overFelt: [], overZone: [] })
      }, 90_000)
})
