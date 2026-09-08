// @vitest-environment jsdom
// The distance view's own hand (C2, K9) is a fan of turned cards drawn over the table, and a
// turned card is painted well outside the box a flex row lays it in. Where it actually lands is a
// layout question jsdom answers with zeroes, so `/online` is mounted against a real session and
// measured in a real engine at the widths the audit checks (#6).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
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
async function markup(held: number, width: number, raise = false): Promise<string> {
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
    // The hand's second mode is a state of the page and not a route, so it is raised here, in
    // the browserless half, and measured over there like everything else.
    if (raise) {
      await userEvent.setup().click(screen.getByRole('button', { name: /Visa alla/ }))
      await waitFor(() => expect(document.querySelectorAll('[data-spread-card]')).toHaveLength(held))
    }
    return document.querySelector('#root, body')!.innerHTML
  } finally {
    unmount()
    host.close()
  }
}

type Box = { what: string; x: number; y: number; w: number; h: number }

// The page, mounted for a hand of `held` and laid out at `size`, for whatever the caller reads.
async function onFan<T>(held: number, size: { w: number; h: number }, read_: (page: Page) => Promise<T>, raise = false): Promise<T> {
  const html = await markup(held, size.w, raise)
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

// The same cards, each one measured after the band has been asked to bring it into view. A hand
// wider than the band is the decided answer (#24), so "on the screen" cannot mean "all at once"
// any more — it means every card of it can be got to and is whole when it is got to.
const eachBrought = (held: number, size: { w: number; h: number }): Promise<Box[]> =>
  onFan(held, size, (page) =>
    page.evaluate(() => {
      const out = []
      for (const el of document.querySelectorAll('[data-hand-fan] [data-hand-card]')) {
        el.scrollIntoView({ block: 'nearest', inline: 'center' })
        const r = el.getBoundingClientRect()
        out.push({ what: el.getAttribute('aria-label')?.slice(0, 24) ?? '?', x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) })
      }
      return out
    }),
  )

const COUNTS = [3, 13, 21] as const

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
    for (const held of COUNTS) {
      it(`cuts no card of a hand of ${held} at ${size.w}×${size.h}`, async () => {
        const cards = await eachBrought(held, size)
        expect(cards).toHaveLength(held)
        // The invariant, not a number: the fan is the only thing on this screen the player reads
        // and drags from, so every card of it is whole and on the screen once the band has
        // brought it there. Nothing is cut by the screen's edge, ever, in either direction.
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

// The hand's own arc, in degrees, from the leftmost card's turn to the rightmost (#24). Read off
// the matrix the browser actually painted, not off the numbers that asked for it.
const arcAt = (held: number, size: { w: number; h: number }): Promise<number> =>
  onFan(held, size, (page) =>
    page.evaluate(() => {
      const turns = [...document.querySelectorAll('[data-hand-fan] [data-hand-card]')].map((el) => {
        const m = new DOMMatrixReadOnly(getComputedStyle(el).transform)
        return (Math.atan2(m.b, m.a) * 180) / Math.PI
      })
      return Math.max(...turns) - Math.min(...turns)
    }),
  )

describe('a hand of many cards still looks like a hand (#24)', () => {
  for (const size of SIZES) {
    it(`spans no more than thirty degrees at twenty-one cards at ${size.w}`, async () => {
      const arc = await arcAt(21, size)
      expect({ at: size.w, over: arc > 30.01, arc: Math.round(arc) }).toEqual({ at: size.w, over: false, arc: Math.round(arc) })
    }, 60_000)
  }
})

// What a fingertip actually has to land on. A card in a fan is covered by the ones drawn after
// it, so what is offered is not the card but the step to its neighbour — `offsetLeft` is that
// step, before any turning moves the paint around.
const stepAt = (held: number, size: { w: number; h: number }): Promise<{ step: number; card: number }> =>
  onFan(held, size, (page) =>
    page.evaluate(() => {
      const cards = [...document.querySelectorAll('[data-hand-fan] [data-hand-card]')] as HTMLElement[]
      const steps = cards.slice(1).map((el, i) => el.offsetLeft - cards[i]!.offsetLeft)
      // The card's own width, not the box a turned card's corners describe.
      return { step: Math.round(Math.min(...steps)), card: Math.round(cards[0]!.offsetWidth) }
    }),
  )

describe('a card in the hand is still something a thumb can land on (#6, #24)', () => {
  for (const size of SIZES) {
    for (const held of COUNTS) {
      it(`keeps the step at a fingertip and the card at reading size, ${held} cards at ${size.w}`, async () => {
        const { step, card } = await stepAt(held, size)
        // The card stays the size it is read at and stops shrinking; it is the step that gives
        // way, and it gives way only down to a fingertip. Past that the hand scrolls instead.
        expect({ at: `${held}@${size.w}`, step, card, tight: step < 44, small: card < 56, big: card > 112 }).toEqual({ at: `${held}@${size.w}`, step, card, tight: false, small: false, big: false })
      }, 60_000)
    }
  }
})

// Every control the page offers, and every card of the hand, as boxes on the screen — enough to
// ask both of #25's questions at once: does anything lie on top of the hand, and is anything
// smaller than a fingertip.
const bandAt = (held: number, size: { w: number; h: number }): Promise<{ cards: Box[]; controls: Box[] }> =>
  onFan(held, size, (page) =>
    page.evaluate(() => {
      const box = (el: Element): Box => {
        const r = el.getBoundingClientRect()
        return { what: (el.getAttribute('aria-label') ?? el.textContent ?? '?').trim().slice(0, 24), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
      }
      const cards = [...document.querySelectorAll('[data-hand-fan] [data-hand-card]')]
      return {
        cards: cards.map(box),
        controls: [...document.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])')].filter((el) => !cards.includes(el)).map(box),
      }
    }),
  )

const laps = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))

describe('the hand and the page’s own controls do not share a band (#25)', () => {
  for (const size of SIZES) {
    for (const held of COUNTS) {
      it(`lays nothing over the hand and nothing under 44 px, ${held} cards at ${size.w}`, async () => {
        const { cards, controls } = await bandAt(held, size)
        expect(cards).toHaveLength(held)
        const over = controls.flatMap((c) => cards.filter((card) => laps(c, card) > 0).map((card) => `${c.what} over ${card.what}: ${laps(c, card)} px²`))
        // Ångra, Flagga and Avsluta have measured 76×32, 77×32 and 70×32 at every width since
        // before either issue, and they are in this sweep for that reason (#6, L10).
        const small = controls.filter((c) => c.w < 44 || c.h < 44).map((c) => `${c.what}: ${c.w}×${c.h}`)
        expect({ at: `${held}@${size.w}`, over, small }).toEqual({ at: `${held}@${size.w}`, over: [], small: [] })
      }, 60_000)
    }
  }
})

// The three rows the page is (#25, K17): the tools on top, the felt in the middle, the hand at
// the bottom. What each of them actually gets of the screen, and whether anything lies over the
// felt — the row the table is fitted into, whose shape table-layout.test.tsx measures the fit
// against.
const rowsAt = (held: number, size: { w: number; h: number }) =>
  onFan(held, size, (page) =>
    page.evaluate(() => {
      const box = (sel: string) => {
        const el = document.querySelector(sel)
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { what: sel, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
      }
      return { felt: box('.byd-online-felt'), top: box('.byd-online-top'), band: box('.byd-hand-under') }
    }),
  )

describe('the felt keeps the middle of the page to itself (K17, #25)', () => {
  for (const size of SIZES) {
    for (const held of COUNTS) {
      it(`gives the table the whole width and most of the height, ${held} cards at ${size.w}`, async () => {
        const { felt, top, band } = await rowsAt(held, size)
        if (!felt || !top || !band) throw new Error('the page is not three rows')
        // The band is a row of its own and no longer floats over the felt (K17), so what is left
        // to the table is a real row and not the whole window: it is the frame the fit is given,
        // and the fit is measured against these shapes. Full width, three fifths of the height,
        // and the two bands strictly above and below it rather than on top of it.
        const share = felt.h / size.h
        expect({
          at: `${held}@${size.w}`,
          row: { w: felt.w, h: felt.h },
          full: felt.w === size.w,
          tall: share >= 0.6,
          stacked: top.y + top.h <= felt.y && felt.y + felt.h <= band.y,
        }).toEqual({ at: `${held}@${size.w}`, row: { w: felt.w, h: felt.h }, full: true, tall: true, stacked: true })
      }, 60_000)
    }
  }
})

// The hand raised as a grid (#24, prototype C's Uppslaget as the fan's second mode).
const spreadAt = (held: number, size: { w: number; h: number }) =>
  onFan(
    held,
    size,
    (page) =>
      page.evaluate(() => {
        const box = (el: Element) => {
          const r = el.getBoundingClientRect()
          return { what: (el.getAttribute('aria-label') ?? el.textContent ?? '?').trim().slice(0, 24), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
        }
        const cards = [...document.querySelectorAll('[data-spread-card]')].map(box)
        const top = document.querySelector('.byd-online-top')!.getBoundingClientRect()
        return {
          cards,
          // The tools the grid must never cover: a surface over the only Ångra on the page has
          // made it unreachable, not merely hidden.
          tools: [...document.querySelectorAll('.byd-online-top button')].map(box),
          sheetTop: Math.round(document.querySelector('.byd-hand-spread')!.getBoundingClientRect().top),
          topBottom: Math.round(top.bottom),
          sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        }
      }),
    true,
  )

describe('the hand raised as a grid is the whole hand at reading size (#24)', () => {
  for (const size of SIZES) {
    it(`lays out twenty-one cards whole, over the table and never over the tools, at ${size.w}`, async () => {
      const { cards, tools, sheetTop, topBottom, sideways } = await spreadAt(21, size)
      expect(cards).toHaveLength(21)
      // Reading size is the whole promise of this mode: a card here is the size the fan reads at
      // and keeps the card's own proportion, or the grid is just the fan with the turning taken
      // out. Two decimals of tolerance for the browser's own rounding.
      const wrong = cards.filter((c) => c.w < 56 || c.w > 112 || Math.abs(c.h / c.w - 88 / 63) > 0.02).map((c) => `${c.what}: ${c.w}×${c.h}`)
      const small = tools.filter((t) => t.w < 44 || t.h < 44).map((t) => `${t.what}: ${t.w}×${t.h}`)
      // Nothing in the grid hides anything else. A card that keeps its size while the row it
      // sits in is shorter than it lands on the card below, and a grid whose rows overlap is the
      // fan again with the turning taken out — which is the one thing this mode is not for.
      const hides = cards.flatMap((a, i) => cards.slice(i + 1).filter((b) => laps(a, b) > 0).map((b) => `${a.what} over ${b.what}`))
      expect({ at: size.w, wrong, hides, small, sideways, coversTools: sheetTop < topBottom }).toEqual({ at: size.w, wrong: [], hides: [], small: [], sideways: 0, coversTools: false })
    }, 60_000)
  }
})
