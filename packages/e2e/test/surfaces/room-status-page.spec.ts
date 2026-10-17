import type { Browser, Page } from '@playwright/test'
import { makeTable } from '../../support/api.js'
import { expect, test } from '../../support/test.js'
import { DEFAULT_TIMING } from '../../../web/src/status/connection.js'

// D5's status page and the shell before it (#749) in the room's sizes (#925, K26, D5).
//
// The page form drew its mark in 12 px, its heading in 26 and its text and buttons in 14 on every
// screen — on the TV, read from a sofa three metres away, all of it under K26's floor of 24 and the
// text at half of it. The decision (beställaren, 2026-10-17) was variant B of the prototype in
// `docs/ux-audits/2026-10-08-statussidan-tv/prototyper/`: on the TV the mark 24, the heading 48, the
// text 32 and the buttons 28 with a height of 64, in fixed px like the rest of the room's chrome;
// table mode gets the room's floor, 24 / 36 / 24 / 24 with buttons 56 high, since it is the shared
// screen read from the other side of the table. The shell takes the same sizes, so the handover
// still changes the words and not the picture (`shell.spec.ts`).
//
// What is asserted is the computed size of every word and the rectangle of the block: never the
// width of a line of text, which is a fact about the machine's font (system-ui is another face on
// CI's Linux).

type Sizes = { mark: number; heading: number; text: number; button: number; buttonHeight: number }
type Screen = { name: string; viewport: { width: number; height: number }; mode: 'tv' | 'table'; floor: Sizes }

const TV_SIZES: Sizes = { mark: 24, heading: 48, text: 32, button: 28, buttonHeight: 64 }
const TABLE_SIZES: Sizes = { mark: 24, heading: 36, text: 24, button: 24, buttonHeight: 56 }
const SCREENS: Screen[] = [
  { name: 'tv 1280 × 720', viewport: { width: 1280, height: 720 }, mode: 'tv', floor: TV_SIZES },
  { name: 'tv 1920 × 1080', viewport: { width: 1920, height: 1080 }, mode: 'tv', floor: TV_SIZES },
  { name: 'table mode 1280 × 800', viewport: { width: 1280, height: 800 }, mode: 'table', floor: TABLE_SIZES },
]

type Measured = {
  words: { role: keyof Sizes; px: number; height: number; said: string }[]
  block: { top: number; bottom: number; left: number; right: number }
  window: { width: number; height: number }
  sideways: boolean
}

// Every word the page paints, by its part, and the box all of them stand in.
const measure = (page: Page, root: string): Promise<Measured> =>
  page.evaluate((root) => {
    const el = document.querySelector(root)
    if (!el) throw new Error(`nothing stands at ${root}`)
    const shown = (e: Element) => {
      const cs = getComputedStyle(e)
      const r = e.getBoundingClientRect()
      return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0 && !e.closest('noscript')
    }
    const parts: [string, string][] = [
      ['mark', '.byd-status-mark, .m'],
      ['heading', 'h1, h2'],
      ['text', 'p'],
      ['button', '.byd-status-act, button'],
    ]
    const words = parts.flatMap(([role, sel]) =>
      [...el.querySelectorAll(sel)]
        .filter((e) => shown(e) && (e.textContent ?? '').trim() !== '')
        .map((e) => ({ role, px: parseFloat(getComputedStyle(e).fontSize), height: e.getBoundingClientRect().height, said: (e.textContent ?? '').trim().slice(0, 40) })),
    )
    const kids = [...el.children].filter(shown).map((e) => e.getBoundingClientRect())
    return {
      words: words as Measured['words'],
      block: {
        top: Math.min(...kids.map((r) => r.top)),
        bottom: Math.max(...kids.map((r) => r.bottom)),
        left: Math.min(...kids.map((r) => r.left)),
        right: Math.max(...kids.map((r) => r.right)),
      },
      window: { width: innerWidth, height: innerHeight },
      sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }
  }, root)

function holdsTheRoomsSizes(m: Measured, screen: Screen, state: string, buttons: boolean) {
  const at = `${screen.name}, ${state}`
  // Not vacuous: the page says its mark, its heading and its line, and offers its ways out.
  for (const role of ['mark', 'heading', 'text'] as const) expect(m.words.some((w) => w.role === role), `${at}: a ${role}`).toBe(true)
  expect(m.words.some((w) => w.role === 'button'), `${at}: a way out`).toBe(buttons)
  const under = m.words.filter((w) => w.px < screen.floor[w.role] || (w.role === 'button' && w.height < screen.floor.buttonHeight))
  expect.soft(under, at).toEqual([])
  // The whole block is on the screen, and the page does not scroll sideways.
  expect.soft(m.block.top, at).toBeGreaterThanOrEqual(0)
  expect.soft(m.block.left, at).toBeGreaterThanOrEqual(0)
  expect.soft(m.block.bottom, at).toBeLessThanOrEqual(m.window.height)
  expect.soft(m.block.right, at).toBeLessThanOrEqual(m.window.width)
  expect.soft(m.sideways, at).toBe(false)
}

const context = (browser: Browser, baseURL: string | undefined, screen: Screen) =>
  browser.newContext({ viewport: screen.viewport, locale: 'sv-SE', ...(baseURL ? { baseURL } : {}) })

// The entry, read off the built document, so that only the app is held back and not the shell.
async function stallEntry(page: Page): Promise<void> {
  await page.route('**/assets/*.js', (r) => r.abort())
}

test.describe('the status page on the room’s screens is drawn in the room’s sizes (#925)', () => {
  for (const screen of SCREENS) {
    test(`the shell, loading and slow, on ${screen.name}`, async ({ browser, baseURL }) => {
      const ctx = await context(browser, baseURL, screen)
      try {
        const page = await ctx.newPage()
        await page.clock.install()
        await stallEntry(page)
        // The mode is in the query, not the path: `/table` is both screens.
        await page.goto(`/table?session=whatever&host=x&mode=${screen.mode}`, { waitUntil: 'load' })
        await expect(page.locator('#byd-shell [data-k="h"]')).not.toBeEmpty()
        holdsTheRoomsSizes(await measure(page, '#byd-shell'), screen, 'loading', false)
        await page.clock.runFor(DEFAULT_TIMING.slowAfterMs + 500)
        await expect(page.locator('#byd-shell[data-slow]')).toBeAttached()
        holdsTheRoomsSizes(await measure(page, '#byd-shell'), screen, 'slow', false)
        // Past twenty seconds it offers the reload, in the room's buttons.
        await page.clock.runFor(20_000)
        await expect(page.locator('#byd-shell button')).toBeVisible()
        holdsTheRoomsSizes(await measure(page, '#byd-shell'), screen, 'slow, with the reload', true)
      } finally {
        await ctx.close()
      }
    })

    test(`the app’s page, connecting, slow and offline, on ${screen.name}`, async ({ browser, baseURL, request }) => {
      test.setTimeout(90_000)
      const table = await makeTable(request)
      const ctx = await context(browser, baseURL, screen)
      try {
        const page = await ctx.newPage()
        // The line is taken and never answered, so the table waits, says it is slow, and gives up
        // at the initial connection's time limit (D5) — the page a dead server gives.
        await page.routeWebSocket('**/sessions/**', () => undefined)
        await page.goto(screen.mode === 'tv' ? table.tvUrl : table.tableUrl)
        const notice = (state: string) => `.byd-status[data-surface='page'][data-status-notice='${state}']`
        await expect(page.locator(notice('connecting'))).toBeVisible()
        holdsTheRoomsSizes(await measure(page, notice('connecting')), screen, 'connecting', false)
        await expect(page.locator(notice('slow'))).toBeVisible({ timeout: DEFAULT_TIMING.slowAfterMs + 5_000 })
        holdsTheRoomsSizes(await measure(page, notice('slow')), screen, 'slow', true)
        await expect(page.locator(notice('offline'))).toBeVisible({ timeout: DEFAULT_TIMING.connectTimeoutMs + 10_000 })
        holdsTheRoomsSizes(await measure(page, notice('offline')), screen, 'offline', true)
      } finally {
        await ctx.close()
      }
    })

    test(`the app’s page, missing and forbidden, on ${screen.name}`, async ({ browser, baseURL, request }) => {
      const table = await makeTable(request)
      const ctx = await context(browser, baseURL, screen)
      try {
        const page = await ctx.newPage()
        // A table the server has never heard of.
        await page.goto(`/table?session=no-such-table&host=x&mode=${screen.mode}`)
        const missing = ".byd-status[data-surface='page'][data-status-notice='missing']"
        await expect(page.locator(missing)).toBeVisible()
        holdsTheRoomsSizes(await measure(page, missing), screen, 'missing', true)
        // A live table opened with a wrong host key: the door is shut (401/403).
        const url = (screen.mode === 'tv' ? table.tvUrl : table.tableUrl).replace(/host=[^&]*/, 'host=wrong')
        await page.goto(url)
        const shut = ".byd-status[data-surface='page'][data-tone='shut']"
        await expect(page.locator(shut)).toBeVisible()
        holdsTheRoomsSizes(await measure(page, shut), screen, 'forbidden', true)
      } finally {
        await ctx.close()
      }
    })
  }
})
