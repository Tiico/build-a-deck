// @vitest-environment jsdom
// What `/online` shows a player holding a phone (C2's revision of 2026-09-16, #99).
//
// The felt used to be drawn there whatever the screen. A whole four-seat table on a phone put the
// cards at 16–20 px on their short side — K9's floor for something dragged and pressed is 45 — and
// #77 measured three ways of laying it out before establishing that the best any of them reached
// was 23. The cause is the count of things on the felt and not how they are drawn, so the answer
// is not a better layout: the phone is the player's control and not the board. The board is the
// TV in the room, or a screen wide enough to carry it.
//
// So this is the gate K17 went without: whether a felt is drawn at all at a phone's size, and
// whether the hand there is the strip K10 gives a phone. Presence is a question about the
// document, but the sideways scroll under it is a question only an engine with the real box model
// can answer — and a surface that fits by hiding what runs past the edge fits nothing.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { chromium, type Browser, type Page } from 'playwright'
import { CARD_STANDARD_63x88, type SetupDef } from '@byd/engine'
import { TableClient } from '../src/client.js'
import { OnlinePage } from '../src/online/OnlinePage.js'
import { admit, asTable, createSession, roomOf, startServer, type Running } from './fixture.js'
import { atWindow, type Size } from './felt-frame.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const shell = read('index.html')
const css = ['src/table/table.css', 'src/table/texture.css', 'src/player/player.css', 'src/online/online.css', 'src/table/keyboard.css', 'src/status/status.css', 'src/a11y.css', 'src/buttons.css'].map(read).join('\n')

const document_ = (html: string) =>
  shell
    .replace('<script type="module" src="/src/main.tsx"></script>', '')
    .replace('</head>', `<style>${css}</style></head>`)
    .replace('<div id="root"></div>', `<div id="root">${html}</div>`)

// A phone held upright, and a desk window. The phone is the one #99 measured at; the desk is here
// because the whole of what this change must not do is happen to a screen that can carry a felt.
const PHONE: Size = { w: 390, h: 844 }
const DESK: Size = { w: 1280, h: 800 }

const CARD = { id: CARD_STANDARD_63x88.id, version: 1 }
const rect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h, rot: 0 })
const point = (x: number, y: number) => ({ x, y, w: 0, h: 0, rot: 0 })

// The table #99 was measured on: four seats, four hands, the two piles. It is the wizard's own
// opening table, and the reason a phone cannot hold it.
function fourSeatSetup(): SetupDef {
  return {
    seats: ['A', 'B', 'C', 'D'],
    floor: 'table',
    zones: [
      { id: 'draw', kind: 'pile', name: 'Draghög', visibility: 'none', geometry: point(-200, 0) },
      { id: 'discard', kind: 'pile', name: 'Kasthög', visibility: 'all', geometry: point(200, 0) },
      { id: 'table', kind: 'area', name: 'Spelyta', visibility: 'all', geometry: rect(-500, -300, 1000, 600) },
      { id: 'hand:A', kind: 'hand', name: 'Hand', visibility: 'owner', owner: 'A', returnTo: 'draw', geometry: rect(-300, 320, 600, 100) },
      { id: 'hand:B', kind: 'hand', name: 'Hand', visibility: 'owner', owner: 'B', returnTo: 'draw', geometry: rect(-300, -420, 600, 100) },
      { id: 'hand:C', kind: 'hand', name: 'Hand', visibility: 'owner', owner: 'C', returnTo: 'draw', geometry: rect(-600, -150, 100, 300) },
      { id: 'hand:D', kind: 'hand', name: 'Hand', visibility: 'owner', owner: 'D', returnTo: 'draw', geometry: rect(500, -150, 100, 300) },
      { id: 'mine:A', kind: 'area', name: 'Framför A', visibility: 'owner', owner: 'A', geometry: rect(-300, 220, 380, 90) },
    ],
    components: Array.from({ length: 20 }, (_, i) => ({ type: CARD, cardRef: `Kort ${i}`, zone: 'draw', face: 'back' as const })),
  }
}

// `/online` at a seat that holds five cards, mounted at `size`, handed back as the markup a
// browser gets. The wait is on a zone's name, which both surfaces say — the felt draws it and the
// overview writes it — so the same mounting serves the reading before the change and after it.
async function online(size: Size): Promise<string> {
  atWindow(size)
  const id = await createSession(run, `phone-${size.w}x${size.h}`, undefined, fourSeatSetup())
  const host = TableClient.connect(await asTable(run, id))
  await host.ready()
  await host.send({ v: 'draw', from: 'draw', to: 'hand:A', count: 5 })
  const token = await admit(run, id, 'A', 'Ada')
  history.replaceState(null, '', `/online?session=${id}&seat=A&name=Ada&token=${token}&code=${roomOf(id).code}&server=${encodeURIComponent(run.url)}`)
  const { unmount } = render(<OnlinePage />)
  try {
    // The overview names a zone once per row and the felt draws it once per zone, so the wait is
    // on there being any of them at all — the count is what the reading below is for.
    await screen.findAllByText(/Draghög/)
    return document.querySelector('#root, body')!.innerHTML
  } finally {
    unmount()
    host.close()
  }
}

async function measure<T>(size: Size, read_: (page: Page) => Promise<T>): Promise<T> {
  const html = await online(size)
  const page = await browser.newPage({ viewport: { width: size.w, height: size.h } })
  try {
    await page.setContent(document_(html), { waitUntil: 'load' })
    return await read_(page)
  } finally {
    await page.close()
  }
}

// What a surface is made of, counted rather than described: a felt, the fan or the column the wide
// screens give a hand, and the strip a phone gives it.
const made = (page: Page) =>
  page.evaluate(() => ({
    felts: document.querySelectorAll('[data-table]').length,
    // The column a landscape window stands a hand in carries `data-hand-fan` too — it is the same
    // hand in another shape — so the fan proper is the one that is not a column.
    fans: document.querySelectorAll('[data-hand-fan]:not([data-hand-column])').length,
    columns: document.querySelectorAll('[data-hand-column]').length,
    strips: document.querySelectorAll('.byd-strip[data-hand]').length,
    cards: document.querySelectorAll('.byd-strip[data-hand] [data-hand-card]').length,
    sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }))

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

describe(`a player at ${PHONE.w} × ${PHONE.h}`, () => {
  it('is given the controls and not the board: no felt, and the hand as the strip', async () => {
    const measured = await measure(PHONE, made)
    // The five cards are counted as well as the strip, so a strip that arrived empty — or a
    // selector that stopped matching — cannot report a clean surface.
    expect(measured).toEqual({ felts: 0, fans: 0, columns: 0, strips: 1, cards: 5, sideways: 0 })
  }, 90_000)
})

describe(`a player at ${DESK.w} × ${DESK.h}`, () => {
  it('still gets the board and its own hand in one window, as C2 has it', async () => {
    const measured = await measure(DESK, made)
    // A landscape window puts the hand in a column at the window's inline end (#77), beside a
    // felt that keeps the height. None of that is #99's to change.
    expect(measured).toEqual({ felts: 1, fans: 0, columns: 1, strips: 0, cards: 0, sideways: 0 })
  }, 90_000)
})
