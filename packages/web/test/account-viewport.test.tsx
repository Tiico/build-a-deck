// @vitest-environment jsdom
// The way in, at the widths the audit checks. `/` is the first screen a creator ever sees and
// the last one they come back to, and it is the only route with no measured check of its own —
// which is how a 28 px language picker and a 16 px way out reached it (UX-kontroll 2026-09-10).
// The markup the account pages mount is measured in Chromium with the stylesheet they ship.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { chromium, type Browser, type Page } from 'playwright'
import { HomePage } from '../src/account/HomePage.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const shell = read('index.html')
const css = `${read('src/account/account.css')}\n${read('src/a11y.css')}`

const document_ = (html: string) =>
  shell
    .replace('<script type="module" src="/src/main.tsx"></script>', '')
    .replace('</head>', `<style>${css}</style></head>`)
    .replace('<div id="root"></div>', `<div id="root">${html}</div>`)

let run: Running
let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser.close()
}, 60_000)
beforeEach(async () => {
  run = await startServer({ auth: true, authBypass: true })
})
afterEach(async () => {
  await run.stop()
})

// The two shapes `/` has: the login card for whoever is not logged in, and the games for whoever
// is. Both come out of the real page against a real server.
async function surfaces(): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  history.replaceState(null, '', `/?server=${encodeURIComponent(run.http)}`)
  const card = render(<HomePage />)
  await screen.findByLabelText('E-post')
  out['inloggningskortet'] = card.container.innerHTML
  card.unmount()

  await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'ada@example.com', next: '/' }) })
  // With a game on it, so the card and its own menu are measured too and not only the empty grid.
  await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'p1', ...projectDoc() }) })
  const games = render(<HomePage />)
  await screen.findByText('Mina spel')
  await screen.findByRole('button', { name: /^Fler val/ })
  out['mina spel'] = games.container.innerHTML
  games.unmount()
  return out
}

async function measure<T>(width: number, read_: (page: Page) => Promise<T>): Promise<Record<string, T>> {
  const marked = await surfaces()
  const page = await browser.newPage({ viewport: { width, height: 800 } })
  try {
    const out: Record<string, T> = {}
    for (const [name, html] of Object.entries(marked)) {
      await page.setContent(document_(`<div class="byd-account">${html}</div>`), { waitUntil: 'load' })
      out[name] = await read_(page)
    }
    return out
  } finally {
    await page.close()
  }
}

const nothing = <T,>(measured: Record<string, T>, empty: T) => Object.fromEntries(Object.keys(measured).map((name) => [name, empty]))
const TARGETS = 'button, a[href], input, select, textarea'

describe.each([390, 768, 1024])('the way in at %ipx', (width) => {
  it('gives every control a 44 by 44 pixel hit area', async () => {
    const measured = await measure(width, (page) =>
      page.$$eval(TARGETS, (els) =>
        els
          .filter((el) => el.checkVisibility())
          .map((el) => {
            const target = el.closest('label') ?? el
            const box = target.getBoundingClientRect()
            return { what: (el.getAttribute('aria-label') ?? el.textContent ?? el.tagName).trim().slice(0, 24), w: Math.round(box.width), h: Math.round(box.height) }
          })
          .filter(({ w, h }) => w < 44 || h < 44)
          .map(({ what, w, h }) => `${what}: ${w}×${h}`),
      ),
    )
    expect(measured).toEqual(nothing(measured, [] as string[]))
  }, 90_000)

  it('never makes the page scroll sideways', async () => {
    const measured = await measure(width, (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
    expect(measured).toEqual(nothing(measured, 0))
  }, 90_000)
})
