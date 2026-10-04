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
import { ROW, helpAnchor, helpPlacement } from '../src/editor/HelpDrawer.js'
import { StatusLive } from '../src/status/StatusLive.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const shell = read('index.html')
const css = ['src/account/account.css', 'src/account/game-menu.css', 'src/buttons.css', 'src/a11y.css', 'src/help.css', 'src/help-box.css'].map(read).join('\n')
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
}, 60_000)

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
      // The sentence is one piece: the full stop after the code is not a flex gap away from it.
      // The code is inside the sentence, not a flex item of its own beside the words round it.
      expect(await page.locator('.byd-home-started > strong').count()).toBe(0)
      expect(await page.locator('.byd-home-started strong').count()).toBe(1)

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
          // A part that starts a line after the first brings its dot to the front of it: «· Språk» (#728).
          starting: parts.slice(1).filter((part) => part.getBoundingClientRect().left <= parts[0]!.getBoundingClientRect().left + 1).length,
          // In its own font's terms, since a machine's font sets how many letters a pixel holds.
          address: parts[0]!.getBoundingClientRect().width / parseFloat(getComputedStyle(parts[0]!).fontSize),
        }
      })
      console.log(`${width} px: the account line is ${account.lines} line(s), "Öppna bordet" ${Math.round(open.width)} × ${Math.round(open.height)}`)
      expect(account.loose).toBe(0)
      expect(account.parts).toBe(3)
      expect(account.starting).toBe(0)
      // The address gives way rather than the line, but stays long enough to say whose account it is.
      expect(account.address).toBeGreaterThanOrEqual(4)
      for (const content of account.led) expect(content).toMatch(/^"·"/)
    } finally {
      await page.close()
    }
  }, 60_000)
})

// The help on an empty account was laid straight over «＋ Nytt spel», the one thing it explains
// (#726, L32). With room over its line it opens there instead.
describe.each([390, 768, 1280])('an empty account at %i px (#726)', (width) => {
  it('opens the help over its line and leaves «＋ Nytt spel» in view', async () => {
    await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'tom@example.com' }) })
    history.replaceState(null, '', `/?server=${encodeURIComponent(run.http)}`)
    const { container } = render(
      <StatusLive>
        <HomePage />
      </StatusLive>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Hjälp om spel' }))
    await screen.findByRole('dialog')
    const html = container.innerHTML
    const height = 800
    const page = await browser.newPage({ viewport: { width, height } })
    try {
      await page.setContent(document_(html), { waitUntil: 'load' })
      const raw = await page.evaluate((ROW) => {
        const rect = (el: Element) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height } }
        const ask = document.querySelector('.byd-home-empty .byd-help-ask')!
        const box = document.querySelector('.byd-help-box') as HTMLElement
        return { ask: rect(ask), row: rect(ask.closest(ROW)!), wants: { w: box.offsetWidth, h: box.scrollHeight }, tile: rect(document.querySelector(ask.closest(ROW)!.getAttribute('data-help-explains')!)!) }
      }, ROW)
      const placed = helpPlacement(helpAnchor(raw.ask, raw.row), raw.wants, { w: width, h: height }, raw.tile)
      const box = await page.evaluate((style) => {
        const b = document.querySelector('.byd-help-box') as HTMLElement
        b.style.cssText = ''
        for (const [k, v] of Object.entries(style)) b.style.setProperty(k.startsWith('--') ? k : k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`), String(v))
        const r = b.getBoundingClientRect()
        return { x: r.left, y: r.top, w: r.width, h: r.height }
      }, placed.style as Record<string, string>)
      const overlaps = (a: typeof box, b: typeof box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
      expect(overlaps(box, raw.tile)).toBe(false)
      expect(box.y).toBeGreaterThanOrEqual(0)
    } finally {
      await page.close()
    }
  }, 60_000)
})

// The tiles on «Mina spel» (#725): a tall name in one tile stretched the rows of its neighbours,
// the place a card waits in stood 2 px lower than a drawn card, and the tile said nothing to the
// pointer before it was pressed.
describe('the game tiles at 1280 px (#725)', () => {
  async function tiles(): Promise<string> {
    await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'tiles@example.com' }) })
    for (const [id, name] of [['kort', 'Skogens herrar'], ['lang', 'En mycket lång speltitel som bryts över tre rader i sin bricka']] as const)
      await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, ...projectDoc(), name }) })
    history.replaceState(null, '', `/?server=${encodeURIComponent(run.http)}`)
    const { container } = render(
      <StatusLive>
        <HomePage />
      </StatusLive>,
    )
    await screen.findByText('Skogens herrar')
    return container.innerHTML
  }

  it('keeps every name in a row at one height, and the waiting card the height of a drawn one', async () => {
    const html = await tiles()
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    try {
      await page.setContent(document_(html), { waitUntil: 'load' })
      const seen = await page.evaluate(() => {
        const names = [...document.querySelectorAll('[data-project] strong')].map((el) => Math.round(el.getBoundingClientRect().top))
        const card = (sel: string) => document.querySelector(sel)?.getBoundingClientRect().height ?? null
        // A waiting place against the drawn box size the stylesheet reserves.
        const waiting = document.querySelector('.byd-home-card') as HTMLElement
        waiting.removeAttribute('role')
        waiting.innerHTML = ''
        waiting.setAttribute('data-waiting', '')
        const reserved = parseFloat(getComputedStyle(waiting).getPropertyValue('--byd-home-card-h'))
        return { names, waiting: card('.byd-home-card[data-waiting]'), reserved }
      })
      expect(seen.names).toHaveLength(2)
      expect(new Set(seen.names).size).toBe(1)
      expect(seen.waiting).toBeCloseTo(seen.reserved, 0)
    } finally {
      await page.close()
    }
  }, 60_000)

  it('answers the pointer before it presses', async () => {
    const html = await tiles()
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    try {
      await page.setContent(document_(html), { waitUntil: 'load' })
      const look = (sel: string) => page.locator(sel).evaluate((el) => { const s = getComputedStyle(el); return `${s.borderColor} ${s.backgroundColor}` })
      for (const sel of ['[data-project="kort"]', '[data-new]']) {
        await page.mouse.move(0, 0)
        const rest = await look(sel)
        await page.locator(sel).hover()
        expect({ [sel]: await look(sel) }).not.toEqual({ [sel]: rest })
      }
    } finally {
      await page.close()
    }
  }, 60_000)
})
