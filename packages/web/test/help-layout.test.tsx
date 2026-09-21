// @vitest-environment jsdom
// What the help pattern costs the surface, measured (L32, #303).
//
// The decision was made on pixels: `canvas.hint.base` stood six lines tall in the 220 px layer
// column, a third of the list's height, and three surfaces together went from 209 px of prose to
// 69 with the pattern chosen because it is the one where the gain holds — the box is layered over
// the work, so the surface is the same height with the help open as closed. That is a layout fact
// and jsdom answers none of it, so the editor's own markup is laid into real Chromium against the
// stylesheets that ship, the way `editor-spacing.test.tsx` does.
//
// Nothing here pins a pixel of this machine's font. A line is measured against its own
// line-height, so the same rule holds where the face is wider (DejaVu on CI is thirteen per cent
// wider than SF Pro), and a box is measured against the window and against the line it stands
// beside, never against a number written here.
//
// The box's placement is the component's reading (`helpPlacement`, pure) laid against a rectangle
// Chromium has really measured: the markup on the page is static, so the reading is taken here
// and handed back to the page, and what is asserted is where the box then stands.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { chromium, type Browser, type Page } from 'playwright'
import { EditorPage } from '../src/editor/EditorPage.js'
import { ROW, helpAnchor, helpPlacement, type HelpPlacement } from '../src/editor/HelpDrawer.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { atWidth } from './viewport.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const shell = read('index.html')
const css = ['src/help.css', 'src/editor/editor.css', 'src/buttons.css', 'src/a11y.css', 'src/rules/rules-open.css', 'src/rules/rules.css'].map(read).join('\n')
const document_ = (html: string, extra = '') =>
  shell
    .replace('<script type="module" src="/src/main.tsx"></script>', '')
    .replace('</head>', `<style>${css}\n${extra}</style></head>`)
    .replace('<div id="root"></div>', `<div id="root">${html}</div>`)

const HEIGHT = 800

// The three surfaces L32 measured: the layer column's foot, the Bord tab's lead over the list,
// and the line over the felt in the setup. Each is a line with a question mark in it.
type Surface = { name: string; tab: 'Mall' | 'Bord'; line: string; topic: string; column: string }
const SURFACES: readonly Surface[] = [
  { name: 'Lager', tab: 'Mall', line: '.byd-canvas-layers .byd-canvas-hint', topic: 'lagerlistan', column: '.byd-canvas-layers' },
  { name: 'Bord', tab: 'Bord', line: '.byd-tables > .byd-tables-lead', topic: 'borden', column: '.byd-tables' },
  { name: 'Uppställningen', tab: 'Bord', line: '.byd-setup-said', topic: 'zonerna', column: '.byd-setup-canvas' },
]

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

// The editor with the surface's tab open, as markup, closed and with that surface's help open.
async function markup(width: number, surface: Surface): Promise<{ closed: string; open: string }> {
  atWidth(width)
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  await run.answering()
  const { unmount } = render(<EditorPage />)
  try {
    await screen.findByText('Skogens herrar')
    // Under the desk the template is stages, and the layers are one of them in the mode's place.
    fireEvent.click(screen.getByRole('tab', { name: surface.tab === 'Mall' && width < 1024 ? 'Lager' : surface.tab }))
    await waitFor(() => expect(document.querySelector(surface.line)).not.toBeNull())
    const closed = document.querySelector('.byd-editor')!.outerHTML
    fireEvent.click(screen.getByRole('button', { name: `Hjälp om ${surface.topic}` }))
    await screen.findByRole('dialog', { name: surface.topic })
    const open = document.querySelector('.byd-editor')!.outerHTML
    return { closed, open }
  } finally {
    unmount()
  }
}

type Rect = { x: number; y: number; w: number; h: number }
type Reading = { line: Rect; lineHeight: number; column: Rect; ask: Rect | null; row: Rect | null; box: Rect | null; boxWants: { w: number; h: number } | null; under: string | null }

const rectOf = `(el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height } }`

async function readSurface(page: Page, surface: Surface, placed: HelpPlacement | null): Promise<Reading> {
  return page.evaluate(
    ({ line, column, placed, rectOf, ROW }) => {
      const rect = new Function('el', `return (${rectOf})(el)`) as (el: Element) => Rect
      const lineEl = document.querySelector(line)!
      const ask = document.querySelector(`${line} .byd-help-ask`) ?? document.querySelector(`${column} .byd-help-ask`)
      const box = document.querySelector('.byd-help-box') as HTMLElement | null
      if (box && placed) {
        box.setAttribute('data-place-y', placed.y)
        box.setAttribute('data-place-x', placed.x)
        box.style.cssText = ''
        for (const [k, v] of Object.entries(placed.style)) box.style.setProperty(k.startsWith('--') ? k : k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`), String(v))
      }
      let under: string | null = null
      if (box) {
        const b = rect(box)
        const hit = document.elementFromPoint(b.x + b.w / 2, b.y + b.h / 2)
        under = hit ? (box.contains(hit) ? 'box' : hit.className || hit.tagName) : null
      }
      return {
        line: rect(lineEl),
        // `normal` is not a number; it is the face's own, near 1.2.
        lineHeight: parseFloat(getComputedStyle(lineEl).lineHeight) || 1.2 * parseFloat(getComputedStyle(lineEl).fontSize),
        column: rect(document.querySelector(column)!),
        ask: ask ? rect(ask) : null,
        row: ask?.closest(ROW) ? rect(ask.closest(ROW)!) : null,
        box: box ? rect(box) : null,
        boxWants: box ? { w: box.offsetWidth, h: box.scrollHeight } : null,
        under,
      }
    },
    { line: surface.line, column: surface.column, placed, rectOf, ROW },
  )
}

// The surface on a page at a width: closed, then open with the box laid where the component's
// reading puts it against the question mark Chromium measured.
async function measure(width: number, surface: Surface, extra = ''): Promise<{ closed: Reading; open: Reading; placed: HelpPlacement }> {
  const { closed, open } = await markup(width, surface)
  const page = await browser.newPage({ viewport: { width, height: HEIGHT } })
  try {
    await page.setContent(document_(closed, extra), { waitUntil: 'load' })
    const before = await readSurface(page, surface, null)
    await page.setContent(document_(open, extra), { waitUntil: 'load' })
    const raw = await readSurface(page, surface, null)
    const placed = helpPlacement(helpAnchor(raw.ask!, raw.row), raw.boxWants!, { w: width, h: HEIGHT })
    const after = await readSurface(page, surface, placed)
    return { closed: before, open: after, placed }
  } finally {
    await page.close()
  }
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
const inside = (a: Rect, w: number, h: number) => a.x >= 0 && a.y >= 0 && a.x + a.w <= w && a.y + a.h <= h

describe.each([1280, 1024])('the three surfaces L32 measured, at %ipx', (width) => {
  it.each(SURFACES)('$name: the line is at most two lines, and the same height with the help open', async (surface) => {
    const { closed, open } = await measure(width, surface)
    // Six lines it was; two is the ceiling, so a wider face on CI may wrap once and still pass.
    expect(closed.line.h).toBeLessThan(3 * closed.lineHeight)
    expect(open.line.h).toBe(closed.line.h)
    expect(open.column.h).toBe(closed.column.h)
  }, 90_000)

  it.each(SURFACES)('$name: the box stands inside the window, never over the line it is about, and is not clipped', async (surface) => {
    const { open } = await measure(width, surface)
    expect(open.box).not.toBeNull()
    expect(inside(open.box!, width, HEIGHT)).toBe(true)
    expect(overlaps(open.box!, open.line)).toBe(false)
    expect(overlaps(open.box!, open.ask!)).toBe(false)
    expect(open.under).toBe('box')
  }, 90_000)
})

describe('the layer column, where the cost was measured (L32)', () => {
  it('flips the box upward at the foot of the window, and the box reaches no further than the line', async () => {
    const { open, placed } = await measure(1280, SURFACES[0]!)
    expect(placed.y).toBe('up')
    expect(open.box!.y + open.box!.h).toBeLessThanOrEqual(open.ask!.y)
  }, 90_000)
})

describe('at 768, where the editor is stages', () => {
  it.each(SURFACES)('$name: the question mark is a target and the box is inside the window', async (surface) => {
    const { closed, open } = await measure(768, surface)
    expect(closed.ask).not.toBeNull()
    expect(closed.ask!.w).toBeGreaterThanOrEqual(44)
    expect(closed.ask!.h).toBeGreaterThanOrEqual(44)
    expect(inside(open.box!, 768, HEIGHT)).toBe(true)
    expect(overlaps(open.box!, open.line)).toBe(false)
  }, 90_000)
})

// Text at 200 % (UX-KONTROLLER: textskalning). Chromium cannot zoom text alone, and the editor
// sets its faces in px, so a doubling on `html` reaches nothing; the doubling is written on the
// box and the line themselves instead, which is what a text-only zoom does to them.
const DOUBLED = '.byd-help-box { font-size: 24px; } .byd-canvas-hint, .byd-tables-lead, .byd-setup-said { font-size: 24px; }'

describe('with the text doubled', () => {
  it.each(SURFACES)('$name: the box still fits inside the window and stays off the line', async (surface) => {
    const { open } = await measure(1280, surface, DOUBLED)
    expect(inside(open.box!, 1280, HEIGHT)).toBe(true)
    expect(overlaps(open.box!, open.line)).toBe(false)
    expect(open.under).toBe('box')
  }, 90_000)
})
