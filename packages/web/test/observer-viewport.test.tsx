// @vitest-environment jsdom
// The observer's screen at the widths the audit checks (#6, #76). She watches rather than works,
// so the table is the screen: nothing the page draws about her may cover what the table is doing,
// and the felt itself has to be readable in the window she holds — she is a player surface and is
// measured at 390 and 320 like every other one (L12, C8). Both are geometry, so both are measured
// in a real engine.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { chromium, type Browser, type Page } from 'playwright'
import { contrastRatio, flatten } from '../src/player/contrast.js'
import { TableClient } from '../src/client.js'
import { ObserverPage } from '../src/observer/ObserverPage.js'
import { admit, asSeat, createSession, startServer, type Running } from './fixture.js'
import { atWidth } from './viewport.js'
import { FELT_FONT, READ, defOf, expectClear, feltOf, namesOf, seatNameOf, sheet, type Reading } from './felt-labels.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const shell = read('index.html')
// The face the felt is written in comes first, as it does on the app's own entry (K20, #95):
// a reading taken against the machine's fallback is a reading of the machine.
const SHEETS = [FELT_FONT, 'src/table/table.css', 'src/table/texture.css', 'src/player/player.css', 'src/status/status.css', 'src/a11y.css', 'src/buttons.css']

type Size = { w: number; h: number }

const document_ = (html: string) =>
  shell
    .replace('<script type="module" src="/src/main.tsx"></script>', '')
    .replace('</head>', `<style>${SHEETS.map(sheet).join('\n')}</style></head>`)
    .replace('<div id="root"></div>', `<div id="root">${html}</div>`)

// The window the page is mounted at. The felt's turn is read off the window's shape against the
// table's (#76), so a mounting that only says how wide the window is decides it on jsdom's own
// default height and not on the one Chromium is about to draw at.
function atWindow(size: Size): void {
  atWidth(size.w)
  for (const [name, value] of [['innerWidth', size.w], ['innerHeight', size.h]] as const) Object.defineProperty(window, name, { value, configurable: true, writable: true })
}

// The table the issue is about: the wizard's own, with an area and a counter in front of every
// seat, two shared piles and something dealt into every hand. Fourteen names on one felt is what
// #76 measured lying on top of one another.
const SEATS = 4
const TABLE = feltOf(SEATS)

// The box the stylesheet gives the renderer at this window. jsdom lays nothing out, so the
// renderer's own measurement of its frame comes back zero and the felt collapses; the box is read
// once in Chromium off a page whose felt has been told it has no room at all, so that what is
// measured is the page's layout and never the felt's own size feeding back into it.
async function withFrame<T>(box: Size | null, body: () => Promise<T>): Promise<T> {
  const before = (side: 'Width' | 'Height') => Object.getOwnPropertyDescriptor(HTMLElement.prototype, `client${side}`) ?? ({ get: () => 0, configurable: true } as PropertyDescriptor)
  const had = { Width: before('Width'), Height: before('Height') }
  const hadObserver = (globalThis as { ResizeObserver?: unknown }).ResizeObserver
  if (box) {
    for (const [side, size] of [['Width', box.w] as const, ['Height', box.h] as const])
      Object.defineProperty(HTMLElement.prototype, `client${side}`, {
        configurable: true,
        get(this: HTMLElement) {
          return this.classList.contains('byd-table-frame') ? size : 0
        },
      })
    // The renderer asks its frame how big it is and then watches it; jsdom has neither answer,
    // and without the watcher it never asks.
    class Stub {
      observe() {
        return undefined
      }
      disconnect() {
        return undefined
      }
    }
    ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = Stub
  }
  try {
    // Held for the whole wait, not only for the first render: the felt does not exist until the
    // table has arrived over the socket, so a stub taken down when `render` returns is a stub the
    // renderer never sees.
    return await body()
  } finally {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', had.Width)
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', had.Height)
    if (hadObserver) (globalThis as { ResizeObserver?: unknown }).ResizeObserver = hadObserver
    else delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver
  }
}

// The observer's page as it mounts against a real session, with every seat holding cards.
async function markup(size: Size, box: Size | null = null): Promise<string> {
  atWindow(size)
  const id = await createSession(run, `obs${++sessions}`, undefined, defOf(TABLE))
  const seated = await Promise.all(TABLE.seats.map((seat) => asSeat(run, id, seat, `Spelare ${seat}`).then((at) => TableClient.connect(at))))
  await Promise.all(seated.map((c) => c.ready()))
  await seated[0]!.send({ v: 'seat.claim', seat: TABLE.seats[0]!, name: 'Ada' })
  history.replaceState(null, '', `/observe?session=${id}&name=Eva&token=${await admit(run, id, null, 'Eva')}&server=${encodeURIComponent(run.url)}`)
  return withFrame(box, async () => {
    const { unmount } = render(<ObserverPage />)
    try {
      await screen.findByText(/Du är observatör/)
      await waitFor(() => expect(document.querySelector('[data-table]')).toBeTruthy())
      return document.querySelector('#root, body')!.innerHTML
    } finally {
      unmount()
      for (const c of seated) c.close()
    }
  })
}

async function measure<T>(size: Size, read_: (page: Page) => Promise<T>, html?: string): Promise<T> {
  const page = await browser.newPage({ viewport: { width: size.w, height: size.h } })
  try {
    await page.setContent(document_(html ?? (await markup(size))), { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
    return await read_(page)
  } finally {
    await page.close()
  }
}

// The felt at the scale the page really gives it: the frame's box read first off a page whose
// felt was given none, then the page mounted again with that box in hand.
const frames = new Map<string, Size>()
async function feltMarkup(size: Size): Promise<string> {
  const key = `${size.w}x${size.h}`
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
      await markup(size, { w: 1, h: 1 }),
    ))
  frames.set(key, box)
  return markup(size, box)
}

let sessions = 0
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

// The windows she is met in, each a real shape rather than a width with jsdom's default height
// hung off it: two phones held upright, a tablet held upright, and a desk.
const NARROW: Size = { w: 320, h: 568 }
const PHONE: Size = { w: 390, h: 844 }
const TABLET: Size = { w: 768, h: 1024 }
const DESK: Size = { w: 1280, h: 800 }
const WINDOWS = [PHONE, TABLET, DESK] as const

describe.each(WINDOWS)('the observer at $w × $h', (size) => {
  const width = size.w
  it('never draws her own chrome over the game or over what is said about it', async () => {
    const covered = await measure(size, (page) =>
      page.evaluate(() => {
        const box = (sel: string) => document.querySelector(sel)?.getBoundingClientRect() ?? null
        // Everything the observer's own page adds around the table, whatever shape it is in.
        const chrome = [...document.querySelectorAll('.byd-observer-banner, .byd-observer-handle')]
        // The game, and the words the table says about itself.
        const content = ['[data-tv] > main', '#tv-inspect', '#tv-feed', '#tv-seats'].map((sel) => [sel, box(sel)] as const)
        const over: string[] = []
        for (const el of chrome) {
          const a = el.getBoundingClientRect()
          for (const [sel, b] of content) {
            if (!b || b.width === 0 || b.height === 0) continue
            const overlap = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
            if (overlap > 0) over.push(`${el.className} över ${sel}: ${Math.round(overlap)} px²`)
          }
        }
        return over
      }),
    )
    expect(covered).toEqual([])
  }, 90_000)

  it('gives the table the screen', async () => {
    // The table's share of the window: at 390 it used to be a 50 px strip beside an activity
    // column nobody had asked for.
    const share = await measure(size, (page) =>
      page.evaluate(() => {
        const table = document.querySelector('[data-tv] > main')!.getBoundingClientRect()
        return { width: Math.round((table.width / window.innerWidth) * 100), height: Math.round((table.height / window.innerHeight) * 100) }
      }),
    )
    expect(share.width).toBeGreaterThanOrEqual(width < 1024 ? 90 : 60)
    expect(share.height).toBeGreaterThanOrEqual(40)
  }, 90_000)

  it('reads at AA on the handle and in her own sentence', async () => {
    // Only what the observer's page says about her: the table's own cards are drawn by the
    // compiler against their own shapes and are the template's contrast question, not this one.
    const measured = await measure(size, (page) =>
      page.$$eval('.byd-observer-handle, .byd-observer-handle *, .byd-observer-note', (els) =>
        els
          .filter((el) => [...el.childNodes].some((node) => node.nodeType === 3 && (node.textContent ?? '').trim() !== ''))
          .filter((el) => el.checkVisibility())
          .map((el) => {
            const style = getComputedStyle(el)
            const behind: string[] = []
            for (let at: Element | null = el; at; at = at.parentElement) behind.unshift(getComputedStyle(at).backgroundColor)
            return { what: (el.textContent ?? '').trim().slice(0, 28), ink: style.color, behind, large: parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700) }
          }),
      ),
    )
    expect(measured.length).toBeGreaterThan(0)
    expect(
      measured
        .map((t) => ({ ...t, ratio: contrastRatio(t.ink, flatten(['#0d0f14', ...t.behind])) }))
        .filter((t) => t.ratio < (t.large ? 3 : 4.5))
        .map((t) => `${t.what}: ${t.ratio.toFixed(2)}:1`),
    ).toEqual([])
  }, 90_000)

  it('never makes the page scroll sideways, and gives every control a 44 by 44 pixel hit area', async () => {
    const measured = await measure(size, (page) =>
      page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        small: [...document.querySelectorAll('button, a[href], input, select, textarea')]
          .filter((el) => (el as HTMLElement).checkVisibility())
          .map((el) => ({ what: (el.getAttribute('aria-label') ?? el.textContent ?? el.tagName).trim().slice(0, 24), box: (el.closest('label') ?? el).getBoundingClientRect() }))
          .filter(({ box }) => box.width < 44 || box.height < 44)
          .map(({ what, box }) => `${what}: ${Math.round(box.width)}×${Math.round(box.height)}`),
      })),
    )
    expect(measured).toEqual({ overflow: 0, small: [] })
  }, 90_000)
})

// What the felt does with the window it is given (C5, C8, L12, #76). The observer's table is a
// landscape one and her window is usually a portrait phone, so the felt fitted upright is bound
// by the short side and leaves the long one empty: 294 × 197 of a 390 × 844 screen, a card's
// short side 15 px, fourteen names in a space that holds four. Turned a quarter the table's long
// side runs down the screen and the felt fills the width.
//
// The rule is `turnToFit` and belongs to the two shapes, so it is asked of the drawing and not of
// the attribute alone: a felt that says it is turned and is not drawn turned is not a turn.
const TURNS = [
  ['a phone held upright', PHONE, 90],
  ['the narrowest phone', NARROW, 90],
  ['a tablet held upright', TABLET, 90],
  ['a phone turned sideways', { w: 844, h: 390 }, 0],
  ['a desk', DESK, 0],
] as const

describe('the observer’s felt turns to meet her window (C8, L12, #76)', () => {
  it.each(TURNS)('turns the table %s', async (_what, size, turn) => {
    const drawn = await measure(
      size,
      (page) =>
        page.evaluate(() => {
          const felt = document.querySelector<HTMLElement>('[data-table]')!
          const wood = document.querySelector<HTMLElement>('.byd-table-wood')!.getBoundingClientRect()
          return { rotate: Number(felt.dataset['rotate'] ?? 0), wood: { w: Math.round(wood.width), h: Math.round(wood.height) } }
        }),
      await feltMarkup(size),
    )
    expect({ size, rotate: drawn.rotate }).toEqual({ size, rotate: turn })
    // And the drawing agrees with the rule: the table as it is laid on the screen runs the long
    // way the window does.
    expect({ size, along: drawn.wood.w >= drawn.wood.h }).toEqual({ size, along: size.w >= size.h })
  }, 90_000)
})

// Every name her felt says, measured the way K19 is measured everywhere else (#43, #71, #72): all
// of them drawn, none on another, none cut short, none off the felt — and all of it still true
// with every name drawn 15 % wider, so the answer belongs to the design and not to the machine.
// The TV has a dock that names the seats, so what stands on the felt is the zones' names and the
// piles'.
const wantedNames = namesOf(TABLE).filter((n) => !TABLE.seats.map(seatNameOf).includes(n))
const readNames = (size: Size, html: string): Promise<Reading> => measure(size, (page) => page.evaluate(READ) as Promise<Reading>, html)

describe('the observer’s felt says every name once (K19, C8, #76)', () => {
  it.each([NARROW, PHONE, TABLET, DESK])('lays no name over another at $w × $h', async (size) => {
    expectClear(await readNames(size, await feltMarkup(size)), wantedNames, `the observer at ${size.w} × ${size.h}`)
  }, 90_000)
})

describe('the observer’s felt stays readable through the turn (C8, K19, L12, #76)', () => {
  // K19's floor, pinned on the surface that came closest to breaking it: nothing on the felt is
  // set under 12 px, at any window the observer is measured at.
  it.each([NARROW, PHONE, TABLET, DESK])('sets no name under 12 px at $w × $h', async (size) => {
    const reading = await readNames(size, await feltMarkup(size))
    expect({ at: `${size.w} × ${size.h}`, smallest: reading.smallest >= 12 }).toEqual({ at: `${size.w} × ${size.h}`, smallest: true })
  }, 90_000)

  // The cards follow the table when it turns and the words do not (C5, K19): a name drawn
  // sideways or upside down is a defect, and a turned box is one whose drawn rectangle is its own
  // box on its side. Read off the drawing, so it holds however the turning is done.
  //
  // What is read is the felt's interface — the zones' names and the piles' — and not its
  // furniture. A seat's name card and its hand count lie on the table turned toward whoever sits
  // there, like a place card, and turn *with* it: that is C5's own revision (#20) and not
  // something the observer's quarter turn may undo.
  it.each([NARROW, PHONE, DESK])('leaves every word upright at $w × $h', async (size) => {
    const sideways = await measure(
      size,
      (page) =>
        page.evaluate(() => {
          const sel = '.byd-zone > span, .byd-pile-name, .byd-pile-n'
          return [...document.querySelectorAll<HTMLElement>(sel)]
            .filter((el) => el.checkVisibility())
            .filter((el) => {
              const r = el.getBoundingClientRect()
              return Math.abs(r.width - el.offsetWidth) > 1.5 || Math.abs(r.height - el.offsetHeight) > 1.5
            })
            .map((el) => `${(el.textContent ?? '').trim()}: ${Math.round(el.getBoundingClientRect().width)}×${Math.round(el.getBoundingClientRect().height)} of ${el.offsetWidth}×${el.offsetHeight}`)
        }),
      await feltMarkup(size),
    )
    expect({ at: `${size.w} × ${size.h}`, sideways }).toEqual({ at: `${size.w} × ${size.h}`, sideways: [] })
  }, 90_000)

  // Full insight is the whole of the role (C8): every seat's hand and every pile is on the felt
  // and inside the frame, turned or not. A felt that fits by leaving a hand off the screen has
  // not fitted anything.
  it.each([NARROW, PHONE, TABLET, DESK])('draws every hand and every pile, inside the frame, at $w × $h', async (size) => {
    const seen = await measure(
      size,
      (page) =>
        page.evaluate(() => {
          const frame = document.querySelector('.byd-table-frame')!.getBoundingClientRect()
          const inside = (r: DOMRect) => r.left >= frame.left - 1 && r.top >= frame.top - 1 && r.right <= frame.right + 1 && r.bottom <= frame.bottom + 1
          const boxes = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)].filter((el) => el.checkVisibility())
          const hands = boxes('.byd-hand')
          const piles = boxes('.byd-pile')
          return {
            hands: hands.length,
            piles: piles.length,
            // A hand is drawn when its cards are: the observer sees the cards themselves (C8).
            fanned: hands.filter((h) => h.querySelectorAll('.byd-hand-fan > i').length > 0).length,
            // The count pill is what `TV_AIR_PX` exists for: it hangs past its hand in the
            // frame's own pixels, so cutting that air cuts the pill (#76).
            out: [...boxes('.byd-hand-count'), ...boxes('.byd-pile-n')].filter((el) => !inside(el.getBoundingClientRect())).map((el) => (el.textContent ?? '').trim()),
          }
        }),
      await feltMarkup(size),
    )
    expect({ at: `${size.w} × ${size.h}`, ...seen }).toEqual({ at: `${size.w} × ${size.h}`, hands: SEATS, fanned: SEATS, piles: 2, out: [] })
  }, 90_000)
})
