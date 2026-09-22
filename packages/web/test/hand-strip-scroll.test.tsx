// The marked card is the one the five buttons under the strip act on, so a marked card outside
// the strip means playing a card nobody has seen (#415). Whether it is inside is a scrolling
// question, and jsdom lays nothing out and scrolls nothing — so the strip is measured in real
// Chromium at the phone's own 390 × 844, with the sheet that ships.
//
// The scrolling itself is an exported function rather than a React effect on purpose: markup put
// on a page never runs an effect, so a rule that lived in one could not be measured here at all.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser } from 'playwright'
import type { Snapshot } from '@byd/protocol'
import { HandStrip } from '../src/player/HandStrip.js'
import { keepInView } from '../src/player/strip.js'
import { tableOf } from './scene.js'
import { twoSeatSetup } from './fixture.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const css = `${read('src/player/player.css')}\n${read('src/buttons.css')}\n${read('src/table/texture.css')}`
const shell = read('index.html')

const PHONE = { width: 390, height: 844 }
const noop = (): undefined => undefined

// The seat's hand at every size the issue names, each one the real engine's own projection, drawn
// one card at a time the way a player fills a hand.
function hands(): Snapshot[] {
  const table = tableOf(twoSeatSetup())
  table.run(null, { v: 'seat.claim', seat: 'A', name: 'Ada' })
  const out: Snapshot[] = []
  for (let i = 0; i < 8; i++) {
    table.run(null, { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    out.push(table.view('A'))
  }
  return out
}

const handOf = (view: Snapshot) => view.components.filter((c) => c.zone === `hand:${view.seat}`)

const document_ = (body: string) =>
  shell
    .replace('<script type="module" src="/src/main.tsx"></script>', '')
    .replace('</head>', `<style>${css}</style></head>`)
    .replace('<div id="root"></div>', `<div id="root">${body}</div>`)

let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser.close()
}, 60_000)

// How much of the marked card lies outside the strip's visible width — the issue's own measure,
// read off the boxes Chromium painted and off `clientWidth`, never off a number we wrote.
const READ = `(strip, card) => {
  const s = strip.getBoundingClientRect()
  const left = s.left + strip.clientLeft
  const c = card.getBoundingClientRect()
  return {
    outside: Math.round(Math.max(0, left - c.left) + Math.max(0, c.right - (left + strip.clientWidth))),
    clientWidth: Math.round(strip.clientWidth),
    cardWidth: Math.round(c.width),
  }
}`

/** The marked card measured against the strip, before and after `keepInView` has had its say. */
async function measure(view: Snapshot, markedId: string) {
  const page = await browser.newPage({ viewport: PHONE })
  try {
    const body = renderToStaticMarkup(
      <HandStrip view={view} selected={new Set([markedId])} onTap={noop} onHold={noop} onLift={noop} onOpen={noop} />,
    )
    await page.setContent(document_(body), { waitUntil: 'load' })
    return await page.evaluate(
      ({ keep, read }) => {
        const strip = document.querySelector<HTMLElement>('.byd-strip[data-hand]')!
        const card = document.querySelector<HTMLElement>('[data-hand-card][data-selected="true"]')!
        const look = new Function(`return (${read})`)() as (s: HTMLElement, c: HTMLElement) => { outside: number; clientWidth: number; cardWidth: number }
        const before = look(strip, card)
        ;(new Function(`return (${keep})`)() as (s: HTMLElement, c: HTMLElement) => number)(strip, card)
        return { ...look(strip, card), before: before.outside }
      },
      { keep: String(keepInView), read: READ },
    )
  } finally {
    await page.close()
  }
}

describe('the marked card stays inside the strip (#415, K4)', () => {
  it('is measuring a strip that really does overflow, or it would prove nothing', async () => {
    const views = hands()
    const full = views[views.length - 1]!
    const got = await measure(full, handOf(full)[0]!.id)
    expect(handOf(full)).toHaveLength(8)
    // Eight cards at 62vw apiece in 390 px: the strip has to scroll, so the question is real.
    expect(got.cardWidth * handOf(full).length).toBeGreaterThan(got.clientWidth)
    // And the card really is out of sight before anything scrolls it — the 130 px of the issue,
    // near enough. Without this a `keepInView` that did nothing at all would read green here.
    expect(got.before).toBeGreaterThan(100)
  }, 60_000)

  it.each([1, 2, 3, 4, 5, 6, 7, 8])('holds the newly drawn card wholly in view with %i in hand', async (n) => {
    const view = hands()[n - 1]!
    const hand = handOf(view)
    expect(hand).toHaveLength(n)
    // The card that just arrived lies on top of the zone, which is where the marking follows it.
    const got = await measure(view, hand[0]!.id)
    expect(got.outside).toBe(0)
  }, 60_000)

  it.each([1, 2, 3, 4, 5, 6, 7, 8])('holds the oldest card wholly in view when it is the marked one, with %i in hand', async (n) => {
    // What a card played out of the middle leaves behind: the marking falls back to another card,
    // and that one has to be brought into view just the same.
    const view = hands()[n - 1]!
    const hand = handOf(view)
    const got = await measure(view, hand[hand.length - 1]!.id)
    expect(got.outside).toBe(0)
  }, 60_000)
})
