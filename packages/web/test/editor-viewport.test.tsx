// @vitest-environment jsdom
// The editor at the widths the audit checks (UX-KONTROLLER: 390, 768 and 1280, and 1024 where
// the desk begins). Whether the document scrolls sideways, and how big a target is, are layout
// questions that only an engine with the real box model can answer — so the markup the editor
// actually mounts is measured in Chromium against the stylesheet it actually ships (#5).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { chromium, type Browser, type Page } from 'playwright'
import { EditorPage } from '../src/editor/EditorPage.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { atWidth } from './viewport.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const shell = read('index.html')
const css = `${read('src/editor/editor.css')}\n${read('src/a11y.css')}`

const document_ = (html: string) =>
  shell
    .replace('<script type="module" src="/src/main.tsx"></script>', '')
    .replace('</head>', `<style>${css}</style></head>`)
    .replace('<div id="root"></div>', `<div id="root">${html}</div>`)

// Every surface the editor can be showing at a width: one per tab in whichever strip the room
// mounts — the modes in the header on a desk, the stages in the bar on a smaller screen.
async function surfaces(width: number): Promise<Record<string, string>> {
  atWidth(width)
  history.replaceState(null, '', `/editor?project=p1&server=${encodeURIComponent(run.http)}`)
  const { unmount } = render(<EditorPage />)
  try {
    await screen.findByText('Skogens herrar')
    const out: Record<string, string> = {}
    const tabs = () => [...document.querySelectorAll<HTMLElement>('[role="tablist"][aria-label="Editorlägen"] [role="tab"], [role="tablist"][aria-label="Editorns etapper"] [role="tab"]')]
    for (let i = 0; i < tabs().length; i++) {
      const tab = tabs()[i]!
      const name = tab.textContent?.trim() ?? String(i)
      fireEvent.click(tab)
      out[name] = document.querySelector('.byd-editor')!.outerHTML
    }
    return out
  } finally {
    unmount()
  }
}

// The same surfaces, in a real engine at that width, measured by `read_`.
async function measure<T>(width: number, read_: (page: Page) => Promise<T>): Promise<Record<string, T>> {
  const marked = await surfaces(width)
  const page = await browser.newPage({ viewport: { width, height: 800 } })
  try {
    const out: Record<string, T> = {}
    for (const [name, html] of Object.entries(marked)) {
      await page.setContent(document_(html), { waitUntil: 'load' })
      out[name] = await read_(page)
    }
    return out
  } finally {
    await page.close()
  }
}

const nothing = <T,>(measured: Record<string, T>, empty: T) => Object.fromEntries(Object.keys(measured).map((name) => [name, empty]))

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
  await run.projects.create('p1', projectDoc())
})
afterEach(async () => {
  await run.stop()
})

const WIDTHS = [390, 768, 1024, 1280] as const

// Everything a pointer or a thumb is meant to hit. A control inside a label is hit through the
// label — that is the target the eye sees and the one the browser forwards the click from.
const TARGETS = 'button, a[href], input, select, textarea, [role="option"], [role="tab"]'

describe.each(WIDTHS)('the editor at %ipx', (width) => {
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

  // The editor's tick boxes (#45). A browser's own is 13 by 13, painted in whatever the platform
  // likes and stretched to whatever cell it lands in; the editor draws one box — one size, one
  // blue, and dark like the room it stands in — wherever a tick stands, so ticking a card and
  // ticking a rule look like the same act. The size and the blue are read back out of the
  // stylesheet through a probe, so the test says "the box the editor declares" and not a number
  // of its own.
  it('draws every tick box as the one box the editor declares', async () => {
    const measured = await measure(width, (page) =>
      page.$$eval("input[type='checkbox']", (els) => {
        const probe = document.querySelector('.byd-editor')!.appendChild(document.createElement('span'))
        probe.style.cssText = 'display: block; width: var(--byd-tick); height: var(--byd-tick); color: var(--byd-editor-primary-mark)'
        const want = `${probe.offsetWidth}×${probe.offsetHeight} ${getComputedStyle(probe).color} on dark`
        probe.remove()
        return els
          .filter((el) => el.checkVisibility())
          .map((el) => {
            const box = el.getBoundingClientRect()
            return {
              what: (el.getAttribute('aria-label') ?? el.parentElement?.textContent ?? el.tagName).trim().slice(0, 24),
              drawn: `${Math.round(box.width)}×${Math.round(box.height)} ${getComputedStyle(el).accentColor} on ${getComputedStyle(el).colorScheme}`,
            }
          })
          .filter(({ drawn }) => drawn !== want)
          .map(({ what, drawn }) => `${what}: ${drawn}, not ${want}`)
      }),
    )
    expect(measured).toEqual(nothing(measured, [] as string[]))
  }, 90_000)

  // A tick is hit through the label around it, and that target grows *around* the drawn box and
  // never with it (#45): a row in the card table stays the height of one target and the rule
  // under it, so a taller tick can never push a card off the screen. Both numbers are read out of
  // the stylesheet, so the fact stays true when the editor changes what a target is worth.
  it('keeps a row in the card table the height of one target', async () => {
    const measured = await measure(width, (page) =>
      page.$$eval('.byd-data tbody tr', (els) => {
        const editor = document.querySelector('.byd-editor')!
        const probe = editor.appendChild(document.createElement('span'))
        probe.style.cssText = 'display: block; height: var(--byd-tap)'
        const tap = probe.offsetHeight
        probe.remove()
        return els
          .filter((el) => el.checkVisibility())
          .map((el) => ({ what: el.getAttribute('data-card-ref') ?? '?', h: Math.round(el.getBoundingClientRect().height) }))
          .filter(({ h }) => h > tap + 1)
          .map(({ what, h }) => `${what}: ${h}`)
      }),
    )
    expect(measured).toEqual(nothing(measured, [] as string[]))
  }, 90_000)

  it('has exactly one panel on the screen at a time', async () => {
    // A `hidden` panel is only hidden while nothing in the stylesheet gives it a `display` of its
    // own; a mode that is closed but drawn is a second copy of the editor under the first.
    const measured = await measure(width, (page) => page.$$eval('.byd-editor > main > [role="tabpanel"]', (els) => els.filter((el) => el.checkVisibility()).length))
    expect(measured).toEqual(nothing(measured, 1))
  }, 90_000)

  it('never makes the page scroll sideways', async () => {
    const measured = await measure(width, (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
    expect(measured).toEqual(nothing(measured, 0))
  }, 90_000)
})
