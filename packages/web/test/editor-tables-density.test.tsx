// @vitest-environment jsdom
// The table column at the number of tables a real game reaches (#176).
//
// The fault the issue names is a fault of quantity, and the fixture's own sample hides it: one
// table looks fine however it is drawn. Measured on `origin/main` at five tables, the stack of
// six ways came to 334 px per table and the list to 2 350 px in a 554 px column, with the one
// table being played a screen below four nobody had touched. So the measurement here builds
// twelve tables across every state the column can show — played, started and never touched,
// ended — with names long enough to fight the column for room, and reads the heights out of a
// real engine against the stylesheet the editor ships.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { chromium, type Browser, type Page } from 'playwright'
import { EditorPage } from '../src/editor/EditorPage.js'
import { TableClient } from '../src/client.js'
import { tabId } from '../src/editor/EditorTabs.js'
import { projectDoc } from './project-doc.js'
import { registerRoom, startServer, asSeat, asTable, type Running } from './fixture.js'
import { atWidth } from './viewport.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const shell = read('index.html')
const css = `${read('src/editor/editor.css')}\n${read('src/buttons.css')}\n${read('src/a11y.css')}`

const document_ = (html: string) =>
  shell
    .replace('<script type="module" src="/src/main.tsx"></script>', '')
    .replace('</head>', `<style>${css}</style></head>`)
    .replace('<div id="root"></div>', `<div id="root">${html}</div>`)

// The three the audit measured, each with its own height (UX-KONTROLLER, L12).
const SCREENS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
] as const

// Twelve tables: four being played, six started and never touched, two over. Names long enough
// to be the thing that decides how wide a row wants to be — a playtest group is people, and
// people have names.
const PLAYERS = ['Beatrice Långström-Ekelund', 'Ada', 'Cornelius Wijkander', 'Bo']

// How many tables the fixture has made, which is what the list is finished arriving at when both
// folds are open.
let all = 0

async function startTable(): Promise<string> {
  all += 1
  const res = await fetch(`${run.http}/projects/${run.projectId}/sessions`, { method: 'POST' })
  if (!res.ok) throw new Error(`could not start a table: ${res.status}`)
  const made = (await res.json()) as { id: string; code: string; hostKey: string }
  registerRoom(made.id, made)
  return made.id
}

async function playedTable(who: string): Promise<string> {
  const id = await startTable()
  const player = TableClient.connect(await asSeat(run, id, 'A', who))
  await player.ready()
  await player.send({ v: 'seat.claim', seat: 'A', name: who })
  await player.send({ v: 'draw', from: 'draw', to: 'table', count: 1 })
  await waitFor(async () => expect((await run.store.read(id)).length).toBeGreaterThan(1))
  player.close()
  return id
}

async function endedTable(): Promise<string> {
  const id = await startTable()
  const table = TableClient.connect(await asTable(run, id))
  await table.ready()
  await table.send({ v: 'session.end' })
  await waitFor(async () => expect((await run.store.read(id)).map((l) => l.intent.v)).toContain('session.end'))
  table.close()
  return id
}

// Twelve tables: four being played, six started and never touched, two over.
async function twelveTables(): Promise<number> {
  for (const who of PLAYERS) await playedTable(who)
  for (let i = 0; i < 6; i++) await startTable()
  await endedTable()
  await endedTable()
  return PLAYERS.length
}

// The five the audit measured, in the state it measured them in: one table being played and four
// that were started and never touched. This is the number the 2 350 px was read off.
async function fiveTables(): Promise<number> {
  await playedTable(PLAYERS[0]!)
  for (let i = 0; i < 4; i++) await startTable()
  return 1
}

// The Bord tab, open, as markup, with every one of the twelve listed. `unfold` opens both folds,
// which is the column at its tallest and the state nothing else in the suite measures.
async function bord(width: number, playing: number, unfold = false): Promise<string> {
  atWidth(width)
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  const { unmount } = render(<EditorPage />)
  try {
    await screen.findByText('Skogens herrar')
    fireEvent.click(document.getElementById(tabId('tables'))!)
    // The four that are being played are the rows drawn at once, and each is live: the column is
    // not finished arriving until they have all said who is sitting at them.
    await waitFor(() => expect(document.querySelectorAll('.byd-table-row')).toHaveLength(playing))
    // Asked of the rows themselves: a seat's name is written on the felt beside the column too,
    // so a plain search for it is answered by the wrong half of the tab.
    for (const who of PLAYERS.slice(0, playing)) await waitFor(() => expect([...document.querySelectorAll('.byd-tables-line')].some((p) => p.textContent?.includes(who))).toBe(true))
    if (unfold) {
      for (const fold of [...document.querySelectorAll<HTMLElement>('.byd-tables-fold')]) fireEvent.click(fold)
      await waitFor(() => expect(document.querySelectorAll('.byd-table-row')).toHaveLength(all))
    }
    return document.querySelector('.byd-editor')!.outerHTML
  } finally {
    unmount()
  }
}

async function measure<T>(screen_: (typeof SCREENS)[number], read_: (page: Page) => Promise<T>, build: () => Promise<number> = twelveTables, unfold = false): Promise<T> {
  all = 0
  const playing = await build()
  const html = await bord(screen_.width, playing, unfold)
  const page = await browser.newPage({ viewport: { width: screen_.width, height: screen_.height } })
  try {
    await page.setContent(document_(html), { waitUntil: 'load' })
    return await read_(page)
  } finally {
    await page.close()
  }
}

// What the column costs, in the numbers the issue is written in.
const shape = (page: Page) =>
  page.evaluate(() => {
    const list = document.querySelector<HTMLElement>('.byd-tables')!
    const rows = [...document.querySelectorAll<HTMLElement>('.byd-table-row')]
    const controls = [...list.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [role="menuitem"]')].filter((el) => el.checkVisibility())
    return {
      rows: rows.length,
      tallestRow: Math.max(0, ...rows.map((r) => Math.round(r.getBoundingClientRect().height))),
      // What the column is actually made of, top to bottom. `scrollHeight` cannot answer this:
      // it never reports less than the box it is in, so a list that fits reads as exactly its own
      // box and the reading stops saying anything the moment the fit is achieved.
      list: Math.round(Math.max(...[...list.children].map((c) => c.getBoundingClientRect().bottom)) - list.getBoundingClientRect().top + list.scrollTop),
      column: Math.round(list.clientHeight),
      scrolls: list.scrollHeight - list.clientHeight > 1,
      sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      controls: controls.length,
    }
  })

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
  await run.projects.create(run.projectId, projectDoc())
})
afterEach(async () => {
  await run.stop()
})

describe.each(SCREENS)('the five the audit measured, at $width × $height', (screen_) => {
  // The very shape the 2 350 px was read off: one table being played, four started and never
  // touched. This is the number the issue's claim is about, and it is the one it has to answer.
  it('fits the whole column without scrolling, where it was 2 350 px in a 554 px space', async () => {
    const measured = await measure(screen_, shape, fiveTables)
    expect(measured.rows).toBe(1)
    expect(measured.list, `the column is ${measured.list} px in a ${measured.column} px space`).toBeLessThan(measured.column)
    expect(measured.scrolls).toBe(false)
    expect(measured.sideways).toBe(0)
    // Ten controls where there were thirty: the way standing ready and the menu button on the one
    // row, the fold over the other four, and the button that starts another table.
    expect(measured.controls).toBe(4)
  }, 120_000)
})

describe.each(SCREENS)('twelve tables in the column at $width × $height', (screen_) => {
  it('draws one row per table being played, and each of them is a row and not a card', async () => {
    const measured = await measure(screen_, shape)
    // Four rows, because eight of the twelve are behind a fold that has not been opened.
    expect(measured.rows).toBe(4)
    // A card was 470 px of column with 334 px of buttons in it. The bound is loose on purpose:
    // the words in a row are set in whatever font the machine has, and this suite runs on a Mac
    // and on a Linux runner (#138). What it refuses is a row that has gone back to being a card.
    expect(measured.tallestRow, `the tallest row is ${measured.tallestRow} px`).toBeLessThan(160)
    // Four live games do not fit a 483 px column and are not meant to — they are four games. What
    // the column must not do any more is spend its height on ways in: everything above the rows
    // is a lead, a heading, two folds and the button that starts another table.
    expect(measured.list - measured.tallestRow * 4, `the column spends ${measured.list - measured.tallestRow * 4} px on everything that is not a row`).toBeLessThan(260)
    expect(measured.sideways).toBe(0)
    // One way standing ready and one menu button per row, the two folds, and the new-table button.
    expect(measured.controls).toBe(11)
  }, 120_000)

  it('holds all twelve without spilling sideways once both folds are opened', async () => {
    const measured = await measure(screen_, shape, twelveTables, true)
    expect(measured.rows).toBe(12)
    expect(measured.sideways).toBe(0)
    // Twelve of the old cards were 5 640 px; what a row costs now is what twelve of them cost.
    expect(measured.list, `twelve rows come to ${measured.list} px`).toBeLessThan(12 * 160 + 400)
  }, 120_000)
})

describe('the Bord tab with twelve tables on it', () => {
  it('keeps the whole tab inside the window, and lets nothing but the column scroll', async () => {
    const measured = await measure(SCREENS[2], (page) =>
      page.evaluate(() => {
        const doc = document.documentElement
        const main = document.querySelector('main')!
        return { page: `${doc.scrollHeight - doc.clientHeight}/${doc.scrollWidth - doc.clientWidth}`, work: `${main.scrollHeight - main.clientHeight}/${main.scrollWidth - main.clientWidth}` }
      }),
    )
    expect(measured).toEqual({ page: '0/0', work: '0/0' })
  }, 120_000)

  it('wears the primary fill on nothing in the column: the view already has its one filled action', async () => {
    // L13 allows exactly one filled thing in a view, and in the editor that is "Uppdatera bordet".
    // A list is where that rule is easiest to lose: the row's one ready way is the *row's* first
    // action, and four live tables would otherwise put four more first actions in one view. The
    // fill is read out of the surface's own token through a probe, so the fact survives the day
    // the editor's blue changes.
    const measured = await measure(SCREENS[0], (page) =>
      page.evaluate(() => {
        const editor = document.querySelector<HTMLElement>('.byd-editor')!
        const probe = editor.appendChild(document.createElement('span'))
        probe.style.backgroundColor = 'var(--byd-primary-bg)'
        const fill = getComputedStyle(probe).backgroundColor
        probe.remove()
        if (fill === 'rgba(0, 0, 0, 0)') throw new Error('the editor binds no --byd-primary-bg')
        return [...document.querySelectorAll<HTMLElement>('.byd-tables :is(button, a[href], [role="menuitem"])')]
          .filter((el) => el.checkVisibility() && getComputedStyle(el).backgroundColor === fill)
          .map((el) => (el.getAttribute('aria-label') ?? el.textContent ?? el.tagName).trim().slice(0, 40))
      }),
    )
    expect(measured).toEqual([])
  }, 120_000)

  it('paints every control in the column without waiting for a pointer to rest on it (#184)', async () => {
    // A row menu that only appears under a pointer is exactly the trap this guard was written
    // for: a thumb has no hover to give, and a keyboard only finds such a control because
    // `:focus-visible` paints it back — which is the tab order rescuing the paint.
    const measured = await measure(
      SCREENS[0],
      (page) =>
        page.$$eval('.byd-tables :is(a[href], button, [role="menuitem"])', (els) =>
          els
            .filter((el) => el.checkVisibility() && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true }))
            .map((el) => `${(el.getAttribute('aria-label') ?? el.textContent ?? el.tagName).trim().slice(0, 24)}: ${getComputedStyle(el).opacity}`),
        ),
      twelveTables,
      true,
    )
    expect(measured).toEqual([])
  }, 120_000)
})
