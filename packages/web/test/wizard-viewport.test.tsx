// @vitest-environment jsdom
// The starter flow at the widths the audit checks (#4). What a control is worth to a thumb, and
// whether the card fits the room it is given, are questions for an engine with the real box
// model — so the markup the wizard mounts is measured in Chromium with the stylesheet it ships.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { chromium, type Browser, type Page } from 'playwright'
import { contrastRatio, flatten } from '../src/player/contrast.js'
import { NewProjectPage } from '../src/wizard/NewProjectPage.js'
import { atWidth } from './viewport.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const shell = read('index.html')
const css = `${read('src/wizard/wizard.css')}\n${read('src/a11y.css')}`

const document_ = (html: string) =>
  shell
    .replace('<script type="module" src="/src/main.tsx"></script>', '')
    .replace('</head>', `<style>${css}</style></head>`)
    .replace('<div id="root"></div>', `<div id="root">${html}</div>`)

// Every screen the wizard has at a width: one per step below the desk, and the one page above it.
async function surfaces(width: number): Promise<Record<string, string>> {
  atWidth(width)
  history.replaceState(null, '', '/new')
  const { unmount } = render(<NewProjectPage />)
  try {
    await screen.findByText(/Ge spelet en flygande start/)
    const steps = () => [...document.querySelectorAll<HTMLElement>('[role="tablist"][aria-label="Steg"] [role="tab"]')]
    if (steps().length === 0) return { 'hela sidan': document.querySelector('.byd-wizard')!.outerHTML }
    const out: Record<string, string> = {}
    for (let i = 0; i < steps().length; i++) {
      const step = steps()[i]!
      const name = step.textContent?.trim() ?? String(i)
      fireEvent.click(step)
      out[name] = document.querySelector('.byd-wizard')!.outerHTML
    }
    return out
  } finally {
    unmount()
  }
}

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

let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser.close()
}, 60_000)

const WIDTHS = [390, 768, 1024] as const
const TARGETS = 'button, a[href], input, select, textarea, [role="tab"]'

describe.each(WIDTHS)('the wizard at %ipx', (width) => {
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

  it('reads at AA everywhere the wizard has words of its own', async () => {
    // Everything with text of its own, with the colour stack behind it, straight from the engine.
    // The card in the preview is drawn by the compiler against its own shapes, so it is left to
    // the template's own contrast check rather than measured against a background it never has.
    const measured = await measure(width, (page) =>
      page.$$eval('.byd-wizard *:not(.byd-preview *)', (els) =>
        els
          .filter((el) => [...el.childNodes].some((node) => node.nodeType === 3 && (node.textContent ?? '').trim() !== ''))
          .filter((el) => el.checkVisibility())
          .map((el) => {
            const style = getComputedStyle(el)
            const behind: string[] = []
            for (let at: Element | null = el; at; at = at.parentElement) behind.unshift(getComputedStyle(at).backgroundColor)
            return {
              what: (el.textContent ?? '').trim().slice(0, 28),
              ink: style.color,
              behind,
              // WCAG's split: 24 px, or 18.66 px when bold.
              large: parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700),
            }
          }),
      ),
    )
    const failed = Object.fromEntries(
      Object.entries(measured).map(([surface, texts]) => [
        surface,
        texts
          .map((t) => ({ ...t, ratio: contrastRatio(t.ink, flatten(['#fff', ...t.behind])) }))
          .filter((t) => t.ratio < (t.large ? 3 : 4.5))
          .map((t) => `${t.what}: ${t.ratio.toFixed(2)}:1`),
      ]),
    )
    expect(failed).toEqual(nothing(failed, [] as string[]))
  }, 90_000)

  it('has exactly one step on the screen at a time', async () => {
    // A `hidden` panel is only hidden while nothing in the stylesheet gives it a `display` of its
    // own; a step that is closed but drawn leaves a gap above the one that is open, and a tab
    // stop in the middle of nowhere.
    const measured = await measure(width, (page) => page.$$eval('[role="tabpanel"]', (els) => els.filter((el) => el.checkVisibility()).length))
    const steps = Object.keys(measured).length
    expect(measured).toEqual(nothing(measured, steps > 1 ? 1 : 0))
  }, 90_000)

  it('shows the whole card in the space the preview is given', async () => {
    // A preview that clips is a preview that lies about the card it is previewing.
    const measured = await measure(width, (page) =>
      page.$$eval('.byd-wizard-preview', (els) =>
        els.filter((el) => el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight).map((el) => `${el.scrollWidth}×${el.scrollHeight} i ${el.clientWidth}×${el.clientHeight}`),
      ),
    )
    expect(measured).toEqual(nothing(measured, [] as string[]))
  }, 90_000)
})
