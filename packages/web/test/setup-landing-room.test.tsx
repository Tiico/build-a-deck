// @vitest-environment jsdom
// The felt leaves a card's width of dark around the table (L30, #316). During the prototyping the
// table filled almost the whole felt, and an outline that landed off the table was clipped by the
// felt's edge — in the one case it exists for. Whether it is clipped is a layout fact and jsdom
// answers none of them, so the Bord tab's real markup is measured in real Chromium against the
// stylesheets that ship, the way the felt's names are (#43).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { chromium, type Browser, type Page } from 'playwright'
import { EditorPage } from '../src/editor/EditorPage.js'
import { CARD_MM } from '../src/table/drop.js'
import { edgeDoc } from './landing-doc.js'
import { startServer, type Running } from './fixture.js'
import { atWidth } from './viewport.js'
import { FELT_FONT, sheet } from './felt-labels.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const SHEETS = [FELT_FONT, 'src/table/table.css', 'src/table/texture.css', 'src/table/keyboard.css', 'src/editor/editor.css', 'src/buttons.css', 'src/a11y.css', 'src/dropping.css']
// The windows a designer actually has (L12).
const DESKS = [
  { w: 1440, h: 900 },
  { w: 1280, h: 800 },
] as const
type Size = { w: number; h: number }

let browser: Browser
let run: Running
let projects = 0
beforeAll(async () => {
  browser = await chromium.launch()
  run = await startServer()
}, 60_000)
afterAll(async () => {
  await browser.close()
  await run.stop()
}, 60_000)

async function onPage<T>(html: string, size: Size, look: (page: Page) => Promise<T>): Promise<T> {
  const page = await browser.newPage({ viewport: { width: size.w, height: size.h } })
  try {
    const shell = read('index.html')
      .replace('<script type="module" src="/src/main.tsx"></script>', '')
      .replace('</head>', `<style>${SHEETS.map(sheet).join('\n')}</style></head>`)
      .replace('<div id="root"></div>', `<div id="root" style="width:${size.w}px;height:${size.h}px">${html}</div>`)
    await page.setContent(shell, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
    return await look(page)
  } finally {
    await page.close()
  }
}

// The Bord tab with Krönikan selected, laying its cards to its right and so off the table. jsdom
// has no layout, so the box the felt's frame gets from the real stylesheet at a real window is
// read first and handed to the frame here, as `felt-names.test.tsx` does.
async function bordTab(felt: Size | null, desk: Size): Promise<string> {
  const clientBox = (side: 'Width' | 'Height') => Object.getOwnPropertyDescriptor(HTMLElement.prototype, `client${side}`) ?? ({ get: () => 0, configurable: true } as PropertyDescriptor)
  const before = { Width: clientBox('Width'), Height: clientBox('Height') }
  const hadObserver = (globalThis as { ResizeObserver?: unknown }).ResizeObserver
  if (felt) {
    for (const [side, size] of [['Width', felt.w] as const, ['Height', felt.h] as const])
      Object.defineProperty(HTMLElement.prototype, `client${side}`, {
        configurable: true,
        get(this: HTMLElement) {
          return this.classList.contains('byd-table-frame') ? size : 0
        },
      })
    class Stub {
      observe() {
        return undefined
      }
      disconnect() {
        return undefined
      }
    }
    ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = Stub
  }
  const project = `p${++projects}`
  await run.projects.create(project, edgeDoc('right'))
  atWidth(desk.w)
  history.replaceState(null, '', `/editor?project=${project}&server=${encodeURIComponent(run.http)}`)
  const { unmount } = render(<EditorPage />)
  try {
    await screen.findByText('Skogens herrar')
    fireEvent.click(screen.getByRole('tab', { name: 'Bord' }))
    const row = await waitFor(() => document.querySelector('[data-zone-row="discard"]') as HTMLElement)
    fireEvent.click(within(row).getByRole('button', { name: (n) => /Krönikan/.test(n) && !n.startsWith('Ta bort') }))
    await waitFor(() => {
      if (!document.querySelector('[data-landing="discard"]')) throw new Error('no outline yet')
    })
    return document.querySelector('.byd-setup')!.outerHTML
  } finally {
    unmount()
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', before.Width)
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', before.Height)
    if (hadObserver) (globalThis as { ResizeObserver?: unknown }).ResizeObserver = hadObserver
    else delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver
  }
}

type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number }
type Seen = { felt: Box; table: Box; outline: Box; mmPx: number }

describe.each(DESKS)('the felt keeps a card of dark around the table at $w × $h (L30)', (desk) => {
  it('draws the off-table outline whole, inside the felt, and leaves at least a card’s width on every side', async () => {
    const box = await onPage(await bordTab(null, desk), desk, (page) =>
      page.evaluate(() => {
        const r = document.querySelector('.byd-setup-felt')!.getBoundingClientRect()
        return { w: Math.round(r.width), h: Math.round(r.height) }
      }),
    )
    const seen = await onPage(await bordTab(box, desk), desk, (page) =>
      page.evaluate((): Seen => {
        const box = (sel: string): Box => {
          const r = document.querySelector(sel)!.getBoundingClientRect()
          return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }
        }
        const table = box('[data-table]')
        return { felt: box('.byd-setup-felt'), table, outline: box('[data-landing="discard"]'), mmPx: table.width / 900 }
      }),
    )
    const card = CARD_MM.w * seen.mmPx
    // The dark around the table, on each side, in cards — a card, less the table's own 1 px border,
    // which is drawn outside its millimetres, and a pixel of layout rounding: the fit spends exactly
    // a card on the side that binds.
    const air = {
      left: (seen.table.left - seen.felt.left) / card,
      right: (seen.felt.right - seen.table.right) / card,
      top: (seen.table.top - seen.felt.top) / card,
      bottom: (seen.felt.bottom - seen.table.bottom) / card,
    }
    const hair = 2 / card
    expect(Object.entries(air).filter(([, cards]) => cards < 1 - hair).map(([side]) => side), `sides with less than a card of dark: ${JSON.stringify(air)}`).toEqual([])
    // And the outline, which reaches past the table's right edge, lies wholly inside the felt.
    expect(seen.outline.right).toBeGreaterThan(seen.table.right)
    const inside = seen.outline.left >= seen.felt.left && seen.outline.right <= seen.felt.right && seen.outline.top >= seen.felt.top && seen.outline.bottom <= seen.felt.bottom
    expect({ inside, outline: seen.outline, felt: seen.felt }).toMatchObject({ inside: true })
    // The table is still drawn at a size worth having: its scale did not fall to a stamp.
    expect(seen.table.width).toBeGreaterThan(desk.w / 3)
  }, 60_000)
})
