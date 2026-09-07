// @vitest-environment jsdom
// Target size and reduced motion are layout and media questions; jsdom answers neither, so the
// player view's own markup and its own stylesheet are measured in a real engine at phone widths.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { chromium, type Browser, type Page } from 'playwright'
import type { ReactNode } from 'react'
import type { Snapshot } from '@byd/protocol'
import { contrastRatio, flatten } from '../src/player/contrast.js'
import { TableClient } from '../src/client.js'
import { HandStrip } from '../src/player/HandStrip.js'
import { PlaySheet } from '../src/player/PlaySheet.js'
import { TableSummary } from '../src/player/TableSummary.js'
import { SessionButtons, SessionOverlays } from '../src/player/SessionOverlays.js'
import { EndSheet, FlagSheet } from '../src/player/SessionSheets.js'
import { Survey } from '../src/player/Survey.js'
import { asSeat, createSession, startServer, type Running } from './fixture.js'

// The shipped document and the shipped stylesheet, verbatim. (jsdom replaces the global URL,
// which node:fs will not take, so the paths are joined rather than resolved from import.meta.url.)
const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const shell = read('index.html')
const css = read('src/player/player.css')

const document_ = (body: ReactNode) =>
  shell
    .replace('<script type="module" src="/src/main.tsx"></script>', '')
    .replace('</head>', `<style>${css}</style></head>`)
    .replace('<div id="root"></div>', `<div id="root">${renderToStaticMarkup(body)}</div>`)

const noop = (): undefined => undefined

// The client is only ever a click target in these surfaces; nothing is sent.
const idle = { send: async () => undefined } as unknown as Parameters<typeof SessionButtons>[0]['client']

// PlayerPage itself needs a live socket, so its head is repeated here; everything below it is the
// real component. Keep the two in step when the head changes.
function surfaces(view: Snapshot) {
  const overlays = (v: Snapshot) => (
    <div className="byd-player">
      <SessionOverlays client={idle} view={v} seat="A" name="Ada" http="" sessionId="s1" sheet={null} onSheet={noop} toast="Ögonblicket är flaggat" onToast={noop} version="v1" />
    </div>
  )
  const proposal = { id: 'p1', toSeq: 1, by: 'B', confirmed: [] as string[], waiting: ['A'] }
  return {
    hand: (
      <div className="byd-player">
        <header>
          <strong>Ada</strong>
          <span>{view.components.length} kort</span>
          <SessionButtons client={idle} view={view} onSheet={noop} />
        </header>
        <TableSummary view={view} activity={[]} />
        <HandStrip view={view} selected={new Set()} onTap={noop} onHold={noop} onLift={noop} />
        <p className="byd-hint">tryck = titta · dra upp = spela · håll = välj flera</p>
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
    survey: (
      <div className="byd-player">
        <Survey who="Ada" version="v1" onSubmit={async () => undefined} />
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
  const id = await createSession(run)
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
  it('gives every control a 44 by 44 pixel hit area', async () => {
    const measured = await eachSurface(width, (page) =>
      page.$$eval('button, textarea', (els) =>
        els
          .map((el) => ({ label: (el.textContent ?? el.tagName).trim().slice(0, 24), box: el.getBoundingClientRect() }))
          .filter(({ box }) => box.width < 44 || box.height < 44)
          .map(({ label, box }) => `${label}: ${Math.round(box.width)}×${Math.round(box.height)}`),
      ),
    )
    expect(measured).toEqual(Object.fromEntries(Object.keys(measured).map((name) => [name, []])))
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
