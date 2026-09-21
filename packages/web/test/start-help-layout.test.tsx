// @vitest-environment jsdom
// What the question mark costs the start, the account and the guided start, measured (L36, #304).
//
// L36 was decided on pixels: three surfaces went from 280 px of prose to 88 with the pattern, and
// the gain holds because the box is layered over the surface, never in its flow. jsdom answers
// none of that, so the surfaces' own markup is laid into real Chromium against the stylesheets
// that ship, the way `help-layout.test.tsx` does for the editor. The box's placement is the
// component's own reading (`helpPlacement`, pure) laid against a rectangle Chromium measured.
//
// Nothing here pins a pixel of this machine's font: a card is measured against itself with the
// help open and closed, a target against the 44 px every control has, and a box against the
// window. The heights are printed for the record and never asserted.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { chromium, type Browser } from 'playwright'
import { LoginCard } from '../src/account/LoginCard.js'
import { NewProjectPage } from '../src/wizard/NewProjectPage.js'
import { ROW, helpAnchor, helpPlacement, type HelpPlacement } from '../src/editor/HelpDrawer.js'
import { atWidth } from './viewport.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const shell = read('index.html')
const css = ['src/help.css', 'src/account/account.css', 'src/wizard/wizard.css', 'src/buttons.css', 'src/a11y.css'].map(read).join('\n')
const document_ = (html: string) =>
  shell
    .replace('<script type="module" src="/src/main.tsx"></script>', '')
    .replace('</head>', `<style>${css}</style></head>`)
    .replace('<div id="root"></div>', `<div id="root">${html}</div>`)

type Rect = { x: number; y: number; w: number; h: number }
type Reading = { surface: Rect; ask: Rect | null; row: Rect | null; box: Rect | null; boxWants: { w: number; h: number } | null; sideways: number }
type Surface = { name: string; root: string; card: string; topic: string; mount(): void; width: number; height: number }

let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser.close()
}, 60_000)

// The surface as markup, closed and with its help open.
function markup(surface: Surface): { closed: string; open: string } {
  atWidth(surface.width)
  localStorage.clear()
  sessionStorage.clear()
  const { unmount } = render(surface.mount() as unknown as React.ReactElement)
  try {
    const closed = document.querySelector(surface.root)!.outerHTML
    fireEvent.click(screen.getByRole('button', { name: `Hjälp om ${surface.topic}` }))
    screen.getByRole('dialog', { name: surface.topic })
    return { closed, open: document.querySelector(surface.root)!.outerHTML }
  } finally {
    unmount()
  }
}

const rectOf = `(el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height } }`

async function measure(surface: Surface): Promise<{ closed: Reading; open: Reading }> {
  const { closed, open } = markup(surface)
  const page = await browser.newPage({ viewport: { width: surface.width, height: surface.height } })
  const readSurface = (placed: HelpPlacement | null): Promise<Reading> =>
    page.evaluate(
      ({ card, topic, placed, rectOf, ROW }) => {
        const rect = new Function('el', `return (${rectOf})(el)`) as (el: Element) => Rect
        // The ring by its name: on a desk the wizard has three, one per step.
        const ask = document.querySelector(`.byd-help-ask[aria-label="Hjälp om ${topic}"]`)
        const box = document.querySelector('.byd-help-box') as HTMLElement | null
        if (box && placed) {
          box.style.cssText = ''
          for (const [k, v] of Object.entries(placed.style)) box.style.setProperty(k.startsWith('--') ? k : k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`), String(v))
        }
        return {
          surface: rect(document.querySelector(card)!),
          ask: ask ? rect(ask) : null,
          row: ask?.closest(ROW) ? rect(ask.closest(ROW)!) : null,
          box: box ? rect(box) : null,
          boxWants: box ? { w: box.offsetWidth, h: box.scrollHeight } : null,
          sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        }
      },
      { card: surface.card, topic: surface.topic, placed, rectOf, ROW },
    )
  try {
    await page.setContent(document_(closed), { waitUntil: 'load' })
    const before = await readSurface(null)
    await page.setContent(document_(open), { waitUntil: 'load' })
    const raw = await readSurface(null)
    const placed = helpPlacement(helpAnchor(raw.ask!, raw.row), raw.boxWants!, { w: surface.width, h: surface.height })
    const after = await readSurface(placed)
    return { closed: before, open: after }
  } finally {
    await page.close()
  }
}

const inside = (a: Rect, w: number, h: number) => a.x >= 0 && a.y >= 0 && a.x + a.w <= w && a.y + a.h <= h
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

const login = (width: number, height: number): Surface => ({
  name: `the login card at ${width}`,
  root: '.byd-account',
  card: '.byd-login',
  topic: 'inloggningen',
  width,
  height,
  mount: () => (
    <div className="byd-account" data-page="login">
      <LoginCard http="http://server.local" next="/" onNavigate={() => undefined} />
    </div>
  ),
})
// Below the desk the wizard is one step at a time and opens on the first; on a desk the second
// step's question mark stands in the narrower column.
const wizard = (width: number, height: number): Surface => ({
  name: `the guided start at ${width}`,
  root: '.byd-wizard',
  card: '.byd-wizard',
  topic: width < 1024 ? 'spelet' : 'fälten',
  width,
  height,
  mount: () => {
    history.replaceState(null, '', '/new')
    return <NewProjectPage onNavigate={() => undefined} />
  },
})

describe.each([login(390, 844), login(1280, 800), wizard(1280, 800), wizard(390, 844)])('$name', (surface) => {
  it('is the same height with the help open, the question mark is a target, and the box stands inside the window', async () => {
    const { closed, open } = await measure(surface)
    console.log(`${surface.name}: card ${Math.round(closed.surface.h)} px closed, ${Math.round(open.surface.h)} px open`)
    expect(open.surface.h).toBe(closed.surface.h)
    expect(closed.ask).not.toBeNull()
    expect(closed.ask!.w).toBeGreaterThanOrEqual(44)
    expect(closed.ask!.h).toBeGreaterThanOrEqual(44)
    expect(open.box).not.toBeNull()
    expect(inside(open.box!, surface.width, surface.height)).toBe(true)
    expect(overlaps(open.box!, open.ask!)).toBe(false)
    // And it hangs from its own ring, not from another step's: directly under it, or over its row.
    const rowTop = Math.min(open.ask!.y, open.row?.y ?? open.ask!.y)
    const rowBottom = Math.max(open.ask!.y + open.ask!.h, open.row ? open.row.y + open.row.h : 0)
    const hangs = Math.abs(open.box!.y - rowBottom) <= 8 || Math.abs(rowTop - (open.box!.y + open.box!.h)) <= 8
    expect(hangs).toBe(true)
    expect(closed.sideways).toBe(0)
    expect(open.sideways).toBe(0)
  }, 90_000)
})
