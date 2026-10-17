// @vitest-environment jsdom
// Target size and reduced motion are layout and media questions; jsdom answers neither, so the
// player view's own markup and its own stylesheet are measured in a real engine at phone widths.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render } from '@testing-library/react'
import { chromium, type Browser, type Page } from 'playwright'
import type { ReactNode } from 'react'
import type { Snapshot, VisibleComponentState } from '@byd/protocol'
import { contrastRatio, flatten } from '../src/player/contrast.js'
import { TableClient } from '../src/client.js'
import { FootPlay, HandActions } from '../src/player/HandActions.js'
import { DEFAULT_BODY_PT, SCREENS, textPxOnCard } from './legibility.js'
import { READING_VIEWS } from '../src/legibility.js'
import { HandStrip } from '../src/player/HandStrip.js'
import { HeldCard } from '../src/player/HeldCard.js'
import { Texture } from '../src/table/Texture.js'
import { CountersRow, MineActions, MineStrip } from '../src/player/SeatExtras.js'
import { PlaySheet } from '../src/player/PlaySheet.js'
import { TableSummary } from '../src/player/TableSummary.js'
import { SessionButtons, SessionOverlays } from '../src/player/SessionOverlays.js'
import { EndSheet, ExitSheet, FlagSheet } from '../src/player/SessionSheets.js'
import { RuleShelf } from '../src/rules/RuleDrawer.js'
import { Help } from '../src/editor/HelpDrawer.js'
import { Survey } from '../src/player/Survey.js'
import { ActionPanel } from '../src/table/ActionPanel.js'
import { CardLook } from '../src/table/CardLook.js'
import { intentsForPlace, landedKeyFor, type Thing } from '../src/table/keyboard.js'
import { asSeat, createSession, seatSetup, startServer, type Running } from './fixture.js'

// The shipped document and the shipped stylesheet, verbatim. (jsdom replaces the global URL,
// which node:fs will not take, so the paths are joined rather than resolved from import.meta.url.)
const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const shell = read('index.html')
// The address panel (#1) is drawn on all three routes and brings its own stylesheet, so the
// phone is measured with both of the sheets it actually ships with.
// The rulebook's own button rides in the same row on the phone (B7), so the row is measured with
// the sheet that shapes it too (#31).
// A card face that is not there yet is drawn by the texture's own sheet, and that is the sheet
// that lays something over a card: without it the state that covered the verbs in #78 is not on
// the page at all, and the measurement is of a screen the player never sees.
const css = `${read('src/player/player.css')}\n${read('src/buttons.css')}\n${read('src/table/keyboard.css')}\n${read('src/rules/rules-open.css')}
${read('src/rules/rules.css')}\n${read('src/table/texture.css')}\n${read('src/help.css')}`

// A surface is a React tree, or the markup of one where a state the server render cannot reach
// has been put in its place.
const document_ = (body: ReactNode | string) =>
  shell
    .replace('<script type="module" src="/src/main.tsx"></script>', '')
    .replace('</head>', `<style>${css}</style></head>`)
    .replace('<div id="root"></div>', `<div id="root">${typeof body === 'string' ? body : renderToStaticMarkup(body)}</div>`)

const noop = (): undefined => undefined

// A card that lies in front of the seat, with a face the render farm still owes it.
const FACES = 'http://faces.test'
const FRONT = 'a'.repeat(64)
const mineCard = (id: string): VisibleComponentState => ({
  id,
  type: { id: 'card.standard.63x88', version: 1 },
  zone: 'mine:A',
  face: 'back',
  x: 0,
  y: 0,
  rot: 0,
  cardRef: 'dragon',
  faces: { front: FRONT },
})
const inFront = (v: Snapshot): Snapshot => ({ ...v, components: [...v.components, mineCard('m1'), mineCard('m2')] })

// The face after the render farm has given up. A server render only ever produces the waiting
// state — the component reaches the lost one by trying and failing — so it is taken from a real
// mount here and put in the waiting state's place in the surface the browser measures.
function lost(html: string): string {
  vi.useFakeTimers()
  const { container, unmount } = render(<Texture faces={FACES} c={mineCard('m1')} retry />)
  const img = () => container.querySelector('img') as HTMLImageElement
  const pending = container.innerHTML
  for (let i = 0; i <= 8; i++) {
    act(() => {
      fireEvent.error(img())
    })
    act(() => vi.advanceTimersByTime(1500 * (i + 1)))
  }
  const failed = container.innerHTML
  unmount()
  vi.useRealTimers()
  expect(pending).toMatch(/data-texture="pending"/)
  expect(failed).toMatch(/data-texture="failed"/)
  // The state the component draws when it has given up, put where the waiting one stood. (The
  // two renderers write the same element with its attributes in a different order, so the state
  // is found by what it is rather than by matching the waiting markup letter for letter.)
  const state = failed.slice(failed.indexOf('<span class="byd-texture-state"'))
  const out = html.replace(/data-state="pending"/g, 'data-state="failed"').replace(/<span class="byd-texture-state" data-texture="pending">.*?<\/span>/g, state)
  expect(out).toMatch(/data-texture="failed"/)
  expect(out).not.toMatch(/pending/)
  return out
}

// The client is only ever a click target in these surfaces; nothing is sent.
const idle = { send: async () => undefined, activity: [] } as unknown as Parameters<typeof SessionButtons>[0]['client']

// PlayerPage itself needs a live socket, so its head is repeated here; everything below it is the
// real component. Keep the two in step when the head changes.
function surfaces(view: Snapshot) {
  const overlays = (v: Snapshot) => (
    <div className="byd-player">
      <SessionOverlays client={idle} view={v} seat="A" sheet={null} onSheet={noop} onLeft={noop} toast="Ögonblicket är flaggat" onToast={noop} version="v1" />
    </div>
  )
  const proposal = { id: 'p1', toSeq: 1, by: 'B', confirmed: [] as string[], waiting: ['A'] }
  return {
    hand: (
      <div className="byd-player">
        <header>
          <strong>Ada</strong>
          <span>{view.components.length} kort</span>
          {/* The help pattern's question mark stands in the chrome on this screen (L32, #305),
              so the row it has to share is measured with it in place. */}
          <Help topic="handen">
            <p>Tryck på ett kort för att läsa det i full storlek.</p>
          </Help>
          <SessionButtons client={idle} view={view} sheet={null} onSheet={noop} />
        </header>
        {/* The overview since #79: a pile that has a card is a control that draws it (K14). */}
        <TableSummary view={view} activity={[]} onDraw={noop} />
        <HandStrip view={view} selected={new Set()} onTap={noop} onHold={noop} onLift={noop} onOpen={noop} />
        <p className="byd-hint">Tryck för att läsa · håll för att välja flera</p>
      </div>
    ),
    handActions: <div className="byd-player"><HandActions view={view} cards={view.components.filter(c => c.zone === 'hand:A').slice(0, 1)} pending={false} onPlay={noop} onMore={noop} /></div>,
    // The cards in front of the seat (C4): a strip of faces, each one control (#78).
    mine: (
      <div className="byd-player">
        <MineStrip view={inFront(view)} faces={FACES} onOpen={noop} onPlay={noop} />
      </div>
    ),
    // One of them held up, with its verbs — where they live since #78 — while its face is still
    // on its way, and again once the face is finally lost. Both are what a thumb has to reach
    // past: the state lies over the card, and the lost one carries a control of its own.
    inspect: (
      <div className="byd-player">
        <HeldCard card={mineCard('m1')} faces={FACES} onClose={noop} actions={<MineActions view={inFront(view)} card={mineCard('m1')} onFlip={noop} onTake={noop} onPlay={noop} />} />
      </div>
    ),
    inspectLost: lost(
      renderToStaticMarkup(
        <div className="byd-player">
          <HeldCard card={mineCard('m1')} faces={FACES} onClose={noop} actions={<MineActions view={inFront(view)} card={mineCard('m1')} onFlip={noop} onTake={noop} onPlay={noop} />} />
        </div>,
      ),
    ),
    // The seat's own counters under the head (C4): two pills, as the wizard lays a table out.
    counters: (
      <div className="byd-player">
        <CountersRow view={view} onSet={noop} />
      </div>
    ),
    play: (
      <div className="byd-player">
        <PlaySheet view={view} count={1} label="dragon" onPlay={noop} onClose={noop} />
      </div>
    ),
    flag: (
      <div className="byd-player">
        <FlagSheet onFlag={noop} onClose={noop} />
      </div>
    ),
    end: (
      <div className="byd-player">
        <EndSheet version="v1" onEnd={noop} onClose={noop} />
      </div>
    ),
    exit: (
      <div className="byd-player">
        <ExitSheet pile="Draghög" onLeave={noop} onEnd={noop} onClose={noop} />
      </div>
    ),
    survey: (
      <div className="byd-player">
        <Survey who="Ada" version="v1" onSubmit={async () => undefined} saveUrl="http://claim.invalid/claim?token=t" />
      </div>
    ),
    // The thanks, with the way to an account under them (G1): offered once the answers are sent
    // (#690), and the one link a thumb has to land on.
    thanks: (() => {
      sessionStorage.setItem('byd.survey.sent.viewport:A', '1')
      return (
        <div className="byd-player">
          <Survey who="Ada" version="v1" onSubmit={async () => undefined} saveUrl="http://claim.invalid/claim?token=t" remember="viewport:A" />
        </div>
      )
    })(),
    // Enter on a hand card: the verbs and the named places (#1, variant C).
    address: (() => {
      const card = view.components.find((c) => c.zone === 'hand:A')!
      const thing: Thing = { key: `card:${card.id}`, kind: 'card', id: card.id, name: card.cardRef ?? 'Dolt kort', zone: card.zone }
      return (
        <div className="byd-player">
          <ActionPanel
            view={view}
            thing={thing}
            cards={[]}
            onClose={noop}
            onRun={noop}
            onLook={noop}
            onSet={noop}
            intentsFor={(place, moving) => intentsForPlace(view, place, thing, moving)}
            landedKey={(place) => landedKeyFor(view, place, thing)}
          />
        </div>
      )
    })(),
    look: (
      <div className="byd-player">
        <CardLook card={view.components.find((c) => c.zone === 'hand:A')!} onClose={noop} />
      </div>
    ),
    rewindMine: overlays({ ...view, rewind: { ...proposal, by: 'A', waiting: ['B'] } } as Snapshot),
    rewindAsk: overlays({ ...view, rewind: proposal } as Snapshot),
  }
}

let run: Running
let browser: Browser
let view: Snapshot

beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser.close()
}, 60_000)
beforeEach(async () => {
  run = await startServer()
  // The table as the wizard makes it: an area in front of every seat and two counters each.
  const id = await createSession(run, 's1', undefined, seatSetup())
  const client = TableClient.connect(await asSeat(run, id, 'A', 'Ada'))
  await client.ready()
  await client.send({ v: 'seat.claim', seat: 'A', name: 'Ada' })
  await client.send({ v: 'draw', from: 'draw', to: 'hand:A', count: 4 })
  await client.synced(2)
  view = client.view!
  client.close()
})
afterEach(async () => {
  await run.stop()
})

const WIDTHS = [320, 390] as const

// Every surface a seat can be looking at, measured at one width; the result is keyed by surface
// so a failure names the screen and not just the number.
async function eachSurface<T>(width: number, measure: (page: Page) => Promise<T>): Promise<Record<string, T>> {
  const page = await browser.newPage({ viewport: { width, height: 844 } })
  try {
    const out: Record<string, T> = {}
    for (const [name, body] of Object.entries(surfaces(view))) {
      await page.setContent(document_(body), { waitUntil: 'load' })
      out[name] = await measure(page)
    }
    return out
  } finally {
    await page.close()
  }
}

describe.each(WIDTHS)('the player view at %ipx', (width) => {
  it('shows more than one hand card and keeps the direct private-area actions readable', async () => {
    const page = await browser.newPage({ viewport: { width, height: 844 } })
    try {
      await page.setContent(document_(surfaces(view).hand))
      const card = await page.locator('[data-hand-card]').first().boundingBox()
      expect(card!.width).toBeLessThanOrEqual(160)
      await page.setContent(document_(surfaces(view).mine))
      const cast = page.getByRole('button', { name: /^Kasta/ }).first()
      const box = await cast.boundingBox()
      expect(box!.width).toBeGreaterThanOrEqual(130)
      expect(box!.height).toBeGreaterThanOrEqual(44)
    } finally { await page.close() }
  }, 60_000)

  it('gives every control a 44 by 44 pixel hit area', async () => {
    // Links count as controls too: the survey's save link is the one a phone shows (UX-36, #81).
    const measured = await eachSurface(width, (page) =>
      page.$$eval('button, textarea, a[href]', (els) =>
        els
          .map((el) => ({ label: (el.textContent ?? el.tagName).trim().slice(0, 24), box: el.getBoundingClientRect() }))
          .filter(({ box }) => box.width < 44 || box.height < 44)
          .map(({ label, box }) => `${label}: ${Math.round(box.width)}×${Math.round(box.height)}`),
      ),
    )
    expect(measured).toEqual(Object.fromEntries(Object.keys(measured).map((name) => [name, []])))
  }, 60_000)

  // Whether a control is big enough is one question; whether the press gets to it is another,
  // and only the engine answers it. On the cards in front of the seat the rendered face lay over
  // the whole card, buttons and all, so the finger that landed on `Ta upp` reached the card's
  // name instead — and always, when the face was still on its way or finally lost (#78, UX-33).
  it('puts every control under the finger that lands on it', async () => {
    const measured = await eachSurface(width, (page) =>
      page.$$eval('button, textarea, a[href]', (els) =>
        els.flatMap((el) => {
          // A strip scrolls sideways, so a control is asked about where it is when it is looked
          // at: brought into view first, and then pressed in the middle.
          el.scrollIntoView({ block: 'center', inline: 'center' })
          const box = el.getBoundingClientRect()
          const at = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
          if (at && (at === el || el.contains(at))) return []
          const what = at ? [at.tagName.toLowerCase(), at.getAttribute('class'), at.getAttribute('data-texture')].filter(Boolean).join(' ') : 'nothing at all'
          return [`${(el.textContent ?? '').trim().slice(0, 24) || el.tagName}: ${what}`]
        }),
      ),
    )
    expect(measured).toEqual(Object.fromEntries(Object.keys(measured).map((name) => [name, []])))
  }, 60_000)

  // The row's − and + were 34 px wide (UX-36, #81). Widening them must not push the row onto a
  // second line: every pill keeps the same top edge and stays inside the screen.
  it('keeps the counters on one line while every − and + is 44 px wide', async () => {
    const page = await browser.newPage({ viewport: { width, height: 844 } })
    try {
      await page.setContent(document_(surfaces(view).counters), { waitUntil: 'load' })
      const pills = await page.$$eval('.byd-counter', (els) =>
        els.map((el) => {
          const box = el.getBoundingClientRect()
          const sides = [...el.querySelectorAll('button')].map((b) => Math.round(b.getBoundingClientRect().width))
          return { top: Math.round(box.top), right: Math.round(box.right), sides }
        }),
      )
      expect(pills).toHaveLength(2)
      expect(new Set(pills.map((p) => p.top)).size).toBe(1)
      expect(Math.max(...pills.map((p) => p.right))).toBeLessThanOrEqual(width)
      expect(pills.flatMap((p) => p.sides).every((w) => w >= 44)).toBe(true)
    } finally {
      await page.close()
    }
  }, 60_000)

  it('reads at AA everywhere a player has text in front of them', async () => {
    // Everything with text of its own, with the colour stack behind it, straight from the engine.
    const measured = await eachSurface(width, (page) =>
      page.$$eval('*', (els) =>
        els
          .filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== ''))
          .map((el) => {
            const box = el.getBoundingClientRect()
            const style = getComputedStyle(el)
            const behind: string[] = []
            for (let at: Element | null = el; at; at = at.parentElement) behind.unshift(getComputedStyle(at).backgroundColor)
            return {
              what: (el.textContent ?? '').trim().slice(0, 32),
              ink: style.color,
              behind,
              // WCAG's split: 24px, or 18.66px when bold.
              large: parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700),
              seen: box.width > 1 && box.height > 1 && style.visibility !== 'hidden' && style.opacity !== '0',
            }
          })
          .filter((t) => t.seen),
      ),
    )
    const failures = Object.fromEntries(
      Object.entries(measured).map(([surface, texts]) => [
        surface,
        texts
          .map((t) => ({ ...t, ratio: contrastRatio(t.ink, flatten(['#fff', ...t.behind])) }))
          .filter((t) => t.ratio < (t.large ? 3 : 4.5))
          .map((t) => `${t.what}: ${t.ratio.toFixed(2)}:1`),
      ]),
    )
    expect(failures).toEqual(Object.fromEntries(Object.keys(failures).map((surface) => [surface, []])))
  }, 60_000)

  it('never makes the page scroll sideways', async () => {
    const measured = await eachSurface(width, (page) =>
      page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    )
    expect(measured).toEqual(Object.fromEntries(Object.keys(measured).map((name) => [name, 0])))
  }, 60_000)
})

// The phone's control row (#31). The prototype measured this row at 375 px and its finding is what
// chose the variant: the row is already full. A fourth control does not squeeze in, it falls to a
// second line — and in the variant that put `Lämna` beside the red `Avsluta`, it fell directly
// underneath it, which is two exits stacked on one another. C keeps the row to three by replacing
// a control rather than adding one, and this is the measurement that keeps it three.
describe("the seat's control row at 375px (#31)", () => {
  it('holds its three controls on one line, and shows what a fourth would do to them', async () => {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
    const row = async (extra: ReactNode = null) => {
      await page.setContent(
        document_(
          <div className="byd-player">
            <header>
              <strong>Ada</strong>
              <span>{view.components.length} kort</span>
              <SessionButtons client={idle} view={view} sheet={null} onSheet={noop} />
              {extra}
            </header>
          </div>,
        ),
        { waitUntil: 'load' },
      )
      return await page.$$eval('.byd-player > header button', (els) =>
        els.map((el) => {
          const box = el.getBoundingClientRect()
          return { label: (el.textContent ?? '').trim(), top: Math.round(box.top), right: Math.round(box.right) }
        }),
      )
    }
    try {
      const three = await row()
      expect(three.map((c) => c.label)).toEqual(['Ångra', 'Flagga', 'Ut…'])
      // One line: every control shares a top edge, and none is pushed off the screen.
      expect(new Set(three.map((c) => c.top)).size).toBe(1)
      expect(Math.max(...three.map((c) => c.right))).toBeLessThanOrEqual(375)

      // The control, and the reason the variant was chosen: a fourth control in the same row —
      // here the rulebook's own button, which every game with rules brings (B7) — lands on a
      // second line. The single line above is therefore a row that fits, not a measurement that
      // cannot tell the difference.
      const four = await row(<RuleShelf rules={null} placement="phone" />)
      expect(four).toHaveLength(4)
      expect(new Set(four.map((c) => c.top)).size).toBe(2)
    } finally {
      await page.close()
    }
  }, 60_000)
})

// Ett kort läses med en handling i golvets storlek (K26, #506 beslut 2; #507 beslut A). Talet är
// måttstockens och inte det här testets: kortets ritade bredd ger dess brödtext i px, och den ska
// ligga i telefonens spann för brödtext man ska läsa — inte under, och inte större än den behöver.
describe('a card held up on the phone reads at the floor, at every phone and tablet size (K26, #507)', () => {
  const SIZES = [[320, 568], [390, 844], [768, 1024]] as const
  const hand = () => view.components.filter((c) => c.zone === 'hand:A').reverse()
  const held = {
    // Ur handen: med handens eget andra tryck under kortet.
    hand: () => {
      const row = hand()
      return <div className="byd-player"><HeldCard card={row[1]!} row={row} onStep={noop} onClose={noop} actions={<FootPlay view={view} cards={[row[1]!]} pending={false} onPlay={noop} onMore={noop} />} /></div>
    },
    // Framför dig: med de tre verb ett liggande kort har (#78), som är det högsta raden kan bli.
    mine: () => {
      const v = inFront(view)
      const row = v.components.filter((c) => c.zone === 'mine:A')
      return <div className="byd-player"><HeldCard card={row[0]!} row={row} onStep={noop} onClose={noop} actions={<MineActions view={v} card={row[0]!} onFlip={noop} onTake={noop} onPlay={noop} />} /></div>
    },
    // En annan yta: bara läsas.
    area: () => {
      const row = inFront(view).components.filter((c) => c.zone === 'mine:A')
      return <div className="byd-player"><HeldCard card={row[0]!} row={row} onStep={noop} onClose={noop} /></div>
    },
  }

  it.each(SIZES.flatMap(([w, h]) => Object.keys(held).map((kind) => [w, h, kind] as const)))('at %i × %i, held up from the %s', async (width, height, kind) => {
    const page = await browser.newPage({ viewport: { width, height } })
    try {
      await page.setContent(document_(held[kind as keyof typeof held]()), { waitUntil: 'load' })
      const seen = await page.evaluate(`(() => {
        const card = document.querySelector('[data-inspect]').getBoundingClientRect()
        const controls = [...document.querySelectorAll('.byd-inspect button')].map((b) => { const r = b.getBoundingClientRect(); return { name: b.getAttribute('aria-label') || b.textContent, w: Math.round(r.width), h: Math.round(r.height), bottom: Math.round(r.bottom), right: Math.round(r.right), left: Math.round(r.left) } })
        return { card: card.width, top: Math.round(card.top), controls }
      })()`) as { card: number; top: number; controls: { name: string; w: number; h: number; bottom: number; right: number; left: number }[] }
      const body = Number(textPxOnCard(DEFAULT_BODY_PT, seen.card).toFixed(1))
      // At its narrowest it is the width the reading views give the phone (#512), which is what the
      // editor's eye draws the wall at.
      const phone = READING_VIEWS.find((v) => v.key === 'phone')!
      if (width === phone.window.w && height === phone.window.h) expect(Math.round(seen.card)).toBe(phone.width)
      expect({ width, height, kind, body: body >= SCREENS.phone.bodyPx.min && body <= SCREENS.phone.bodyPx.max }).toEqual({ width, height, kind, body: true })
      // Everything on it is reachable: on the screen, and big enough for a thumb.
      expect(seen.top).toBeGreaterThanOrEqual(0)
      for (const c of seen.controls) {
        expect({ ...c, fits: c.bottom <= height && c.left >= 0 && c.right <= width, big: c.w >= 44 && c.h >= 44 }).toMatchObject({ fits: true, big: true })
      }
    } finally {
      await page.close()
    }
  }, 60_000)

  // A card whose smallest text is 6.5 pt (#523): the phone holds it up wider, until that text
  // reaches the floor for all text — and at 320 the screen itself is the limit, which is the one
  // place the issue says the phone cannot reach it.
  it.each([[320, 568], [390, 844], [768, 1024]] as const)('holds a card with 6.5 pt text up until it reads, or the screen ends, at %i × %i', async (width, height) => {
    const row = hand()
    const page = await browser.newPage({ viewport: { width, height } })
    try {
      await page.setContent(document_(<div className="byd-player"><HeldCard card={row[1]!} row={row} onStep={noop} onClose={noop} smallestPt={6.5} actions={<FootPlay view={view} cards={[row[1]!]} pending={false} onPlay={noop} onMore={noop} />} /></div>), { waitUntil: 'load' })
      const card = (await page.evaluate(`document.querySelector('[data-inspect]').getBoundingClientRect().width`)) as number
      const reads = textPxOnCard(6.5, card) >= SCREENS.phone.floorPx - 0.05
      const edge = card >= width - 16 - 0.5
      expect({ width, card: Math.round(card), readsOrEdge: reads || edge }).toEqual({ width, card: Math.round(card), readsOrEdge: true })
      if (width > 320) expect(reads).toBe(true)
    } finally {
      await page.close()
    }
  }, 60_000)

  // The strip is small at rest now that one tap reads (#507 fynd 1): it follows the screen rather
  // than standing at one width from 320 to 768.
  it('draws the hand strip at a width that follows the screen', async () => {
    const widths: number[] = []
    for (const width of [320, 768]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } })
      await page.setContent(document_(<div className="byd-player"><HandStrip view={view} selected={new Set()} onTap={noop} onHold={noop} onLift={noop} onOpen={noop} /></div>), { waitUntil: 'load' })
      widths.push(await page.evaluate(`document.querySelector('[data-hand-card]').getBoundingClientRect().width`) as number)
      await page.close()
    }
    expect(widths[1]).toBeGreaterThan(widths[0]!)
  }, 60_000)
})
