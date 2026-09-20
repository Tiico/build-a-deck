// @vitest-environment jsdom
// The library window fits the room it opens in (#296). The contract is a layout one — the whole
// dialog inside the viewport, the target and the actions on screen while the grid scrolls — and
// jsdom lays nothing out, so the window's own markup is measured in real Chromium against the
// stylesheets the editor ships, at the two widths the editor is reviewed at and at the one it
// only has to survive (L12). A library of real size is what makes the question hard: a hundred
// and twenty pictures are eight screens of grid, and a dialog that grew with them would put
// «Använd bilden» a screen and a half below the pictures it is about.
//
// Nothing here is a font pixel: every reading is a box against the viewport or a box against
// another box, so a Mac and a Linux machine measure the same thing.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { chromium, type Browser, type Page } from 'playwright'
import { PictureLibraryDialog, type LibraryPicture } from '../src/editor/PictureLibrary.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const shell = read('index.html')
const css = `${read('src/editor/editor.css')}\n${read('src/buttons.css')}\n${read('src/a11y.css')}`

// Inside the editor's root, so the button language binds the roles the window wears (L13).
const document_ = (html: string) =>
  shell
    .replace('<script type="module" src="/src/main.tsx"></script>', '')
    .replace('</head>', `<style>${css}</style></head>`)
    .replace('<div id="root"></div>', `<div id="root"><div class="byd-editor">${html}</div></div>`)

// The pictures are named and unnamed by turns, and the hash is the only thing that has to differ.
const pictures = (n: number): LibraryPicture[] =>
  Array.from({ length: n }, (_, i) => ({
    hash: i.toString(16).padStart(64, '0'),
    name: i % 3 === 0 ? undefined : `bild-${i + 1}`,
    cards: i % 4 === 0 ? [] : [`kort-${i + 1}`],
  }))

function markupOf(n: number): string {
  const { container, unmount } = render(<PictureLibraryDialog target="3 markerade kort, bildfältet art" count={3} replacing={1} pictures={pictures(n)} assetBase="http://api.local" onApply={() => undefined} onClose={() => undefined} />)
  const html = container.innerHTML
  unmount()
  return html
}

type Fit = {
  viewport: { w: number; h: number }
  dialog: { top: number; left: number; right: number; bottom: number }
  // The parts that have to stay reachable, as whether each one is wholly inside the viewport.
  target: boolean
  search: boolean
  use: boolean
  cancel: boolean
  // Whether the grid is the thing that scrolls: more content than box, in a box that scrolls.
  gridScrolls: boolean
  tiles: number
  tapFloor: number
  shortest: number
}

const FIT = () => {
  const inView = (el: Element | null): boolean => {
    if (!el) return false
    const r = el.getBoundingClientRect()
    return r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth
  }
  const dialog = document.querySelector('.byd-library')!
  const r = dialog.getBoundingClientRect()
  const scroll = document.querySelector('.byd-library-scroll')!
  const buttons = [...dialog.querySelectorAll<HTMLElement>('button, input')].filter((el) => el.checkVisibility())
  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    dialog: { top: r.top, left: r.left, right: r.right, bottom: r.bottom },
    target: inView(dialog.querySelector('.byd-library-target')),
    search: inView(dialog.querySelector('input[type="search"]')),
    use: inView(dialog.querySelector('.byd-primary')),
    cancel: inView(dialog.querySelector('.byd-secondary')),
    gridScrolls: scroll.scrollHeight > scroll.clientHeight && getComputedStyle(scroll).overflowY === 'auto',
    tiles: dialog.querySelectorAll('.byd-library-tile').length,
    tapFloor: parseFloat(getComputedStyle(dialog).getPropertyValue('--byd-tap')),
    shortest: Math.min(...buttons.map((el) => el.getBoundingClientRect().height)),
  }
}

let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser.close()
}, 60_000)

async function measure(html: string, size: { w: number; h: number }): Promise<Fit> {
  const page: Page = await browser.newPage({ viewport: { width: size.w, height: size.h } })
  try {
    await page.setContent(document_(html), { waitUntil: 'load' })
    return (await page.evaluate(FIT)) as Fit
  } finally {
    await page.close()
  }
}

describe('the library window fits the editor’s room (#296, L12)', () => {
  it.each([
    { w: 1280, h: 800 },
    { w: 1024, h: 768 },
  ])('stands wholly inside $w×$h with a hundred and twenty pictures, and the grid is what scrolls', async (size) => {
    const fit = await measure(markupOf(120), size)
    expect(fit.tiles).toBe(120)
    expect(fit.dialog.top).toBeGreaterThanOrEqual(0)
    expect(fit.dialog.left).toBeGreaterThanOrEqual(0)
    expect(fit.dialog.bottom).toBeLessThanOrEqual(size.h)
    expect(fit.dialog.right).toBeLessThanOrEqual(size.w)
    expect({ target: fit.target, search: fit.search, use: fit.use, cancel: fit.cancel }).toEqual({ target: true, search: true, use: true, cancel: true })
    expect(fit.gridScrolls).toBe(true)
    // Every control in the window is at least the editor's own tap floor tall (#50).
    expect(fit.tapFloor).toBeGreaterThan(0)
    expect(fit.shortest).toBeGreaterThanOrEqual(fit.tapFloor)
  }, 60_000)

  // Under desktop width the editor only has to survive (L12): the window is still inside the
  // viewport and the way out of it is still on the screen.
  it('degrades at 768 px without losing the actions', async () => {
    const fit = await measure(markupOf(120), { w: 768, h: 1024 })
    expect(fit.dialog.left).toBeGreaterThanOrEqual(0)
    expect(fit.dialog.right).toBeLessThanOrEqual(768)
    expect(fit.dialog.bottom).toBeLessThanOrEqual(1024)
    expect({ use: fit.use, cancel: fit.cancel, search: fit.search }).toEqual({ use: true, cancel: true, search: true })
    expect(fit.gridScrolls).toBe(true)
  }, 60_000)

  // The small library does not scroll, and the empty one has nothing to scroll: the control
  // that says the reading above is not vacuous.
  it('needs no scroll for eight pictures', async () => {
    const fit = await measure(markupOf(8), { w: 1280, h: 800 })
    expect(fit.tiles).toBe(8)
    expect(fit.gridScrolls).toBe(false)
    expect({ use: fit.use, cancel: fit.cancel }).toEqual({ use: true, cancel: true })
  }, 60_000)
})
