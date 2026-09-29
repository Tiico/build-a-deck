// @vitest-environment jsdom
// Mina spel measured in Chromium (#555): the page is mounted against a real server in jsdom, and
// what it drew is laid into Chromium with the stylesheets that ship, the way
// `start-help-layout.test.tsx` does for the login card.
//
// Nothing here pins a pixel of this machine's font: a target is held against the 44 px every
// control has, and the account line's dots against the parts they sit between.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { chromium, type Browser } from 'playwright'
import { HomePage } from '../src/account/HomePage.js'
import { StatusLive } from '../src/status/StatusLive.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const shell = read('index.html')
const css = ['src/account/account.css', 'src/account/game-menu.css', 'src/buttons.css', 'src/a11y.css'].map(read).join('\n')
const document_ = (html: string) =>
  shell
    .replace('<script type="module" src="/src/main.tsx"></script>', '')
    .replace('</head>', `<style>${css}</style></head>`)
    .replace('<div id="root"></div>', `<div id="root">${html}</div>`)

let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser?.close()
})

let run: Running
beforeEach(async () => {
  run = await startServer({ auth: true, authBypass: true })
})
afterEach(async () => {
  await run.stop()
})

// Logged in with the address the audit used, one game, and a table just started from its menu.
async function started(): Promise<string> {
  await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'lasbarhet@example.com' }) })
  await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: run.projectId, ...projectDoc() }) })
  history.replaceState(null, '', `/?server=${encodeURIComponent(run.http)}`)
  const { container } = render(
    <StatusLive>
      <HomePage />
    </StatusLive>,
  )
  await screen.findByText('Skogens herrar')
  const card = document.querySelector(`[data-project="${run.projectId}"]`) as HTMLElement
  fireEvent.click(within(card).getByRole('button', { name: 'Fler val för Skogens herrar' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Starta bord' }))
  await screen.findByRole('link', { name: /^Öppna bordet/ })
  return container.innerHTML
}

describe.each([390, 320, 1280])('Mina spel at %i px (#555)', (width) => {
  it('gives "Öppna bordet" the 44 px every control has, and never ends a line of the account on a dot', async () => {
    const html = await started()
    const page = await browser.newPage({ viewport: { width, height: 800 } })
    try {
      await page.setContent(document_(html), { waitUntil: 'load' })
      const open = (await page.locator('.byd-home-started a').boundingBox())!
      expect(open.height).toBeGreaterThanOrEqual(44)

      const account = await page.evaluate(() => {
        const who = document.querySelector('.byd-who')!
        // A dot written as text can be left alone at the end of a line when the next part wraps.
        const loose = [...who.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.includes('·')).length
        const parts = [...who.children]
        return {
          loose,
          parts: parts.length,
          // Each part after the first leads with its own dot, so the dot wraps with it.
          led: parts.slice(1).map((part) => getComputedStyle(part, '::before').content),
          lines: new Set(parts.map((part) => { const r = part.getBoundingClientRect(); return Math.round((r.top + r.bottom) / 2) })).size,
        }
      })
      console.log(`${width} px: the account line is ${account.lines} line(s), "Öppna bordet" ${Math.round(open.width)} × ${Math.round(open.height)}`)
      expect(account.loose).toBe(0)
      expect(account.parts).toBe(3)
      for (const content of account.led) expect(content).toMatch(/^"·"/)
    } finally {
      await page.close()
    }
  })
})
