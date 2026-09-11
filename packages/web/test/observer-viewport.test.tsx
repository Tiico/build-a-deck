// @vitest-environment jsdom
// The observer's screen at the widths the audit checks (#6). She watches rather than works, so
// the table is the screen and the one rule is that nothing the page draws about her may cover
// what the table is doing. Overlap is geometry, so it is measured in a real engine.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { chromium, type Browser, type Page } from 'playwright'
import { contrastRatio, flatten } from '../src/player/contrast.js'
import { TableClient } from '../src/client.js'
import { ObserverPage } from '../src/observer/ObserverPage.js'
import { admit, asSeat, createSession, startServer, type Running } from './fixture.js'
import { atWidth } from './viewport.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const shell = read('index.html')
const css = ['src/table/table.css', 'src/table/texture.css', 'src/player/player.css', 'src/status/status.css', 'src/a11y.css', 'src/buttons.css'].map(read).join('\n')

const document_ = (html: string) =>
  shell
    .replace('<script type="module" src="/src/main.tsx"></script>', '')
    .replace('</head>', `<style>${css}</style></head>`)
    .replace('<div id="root"></div>', `<div id="root">${html}</div>`)

// The observer's page as it mounts against a real session, with two seats holding cards.
async function markup(width: number): Promise<string> {
  atWidth(width)
  const id = await createSession(run)
  const ada = TableClient.connect(await asSeat(run, id, 'A'))
  await ada.ready()
  await ada.send({ v: 'seat.claim', seat: 'A', name: 'Ada' }, { v: 'draw', from: 'draw', to: 'hand:A', count: 3 })
  history.replaceState(null, '', `/observe?session=${id}&name=Eva&token=${await admit(run, id, null, 'Eva')}&server=${encodeURIComponent(run.url)}`)
  const { unmount } = render(<ObserverPage />)
  try {
    await screen.findByText(/Du är observatör/)
    await waitFor(() => expect(document.querySelector('[data-tv]')).toBeTruthy())
    return document.querySelector('#root, body')!.innerHTML
  } finally {
    unmount()
    ada.close()
  }
}

async function measure<T>(width: number, read_: (page: Page) => Promise<T>): Promise<T> {
  const html = await markup(width)
  const page = await browser.newPage({ viewport: { width, height: 800 } })
  try {
    await page.setContent(document_(html), { waitUntil: 'load' })
    return await read_(page)
  } finally {
    await page.close()
  }
}

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
})
afterEach(async () => {
  await run.stop()
})

const WIDTHS = [390, 768, 1280] as const

describe.each(WIDTHS)('the observer at %ipx', (width) => {
  it('never draws her own chrome over the game or over what is said about it', async () => {
    const covered = await measure(width, (page) =>
      page.evaluate(() => {
        const box = (sel: string) => document.querySelector(sel)?.getBoundingClientRect() ?? null
        // Everything the observer's own page adds around the table, whatever shape it is in.
        const chrome = [...document.querySelectorAll('.byd-observer-banner, .byd-observer-handle')]
        // The game, and the words the table says about itself.
        const content = ['[data-tv] > main', '#tv-inspect', '#tv-feed', '#tv-seats'].map((sel) => [sel, box(sel)] as const)
        const over: string[] = []
        for (const el of chrome) {
          const a = el.getBoundingClientRect()
          for (const [sel, b] of content) {
            if (!b || b.width === 0 || b.height === 0) continue
            const overlap = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
            if (overlap > 0) over.push(`${el.className} över ${sel}: ${Math.round(overlap)} px²`)
          }
        }
        return over
      }),
    )
    expect(covered).toEqual([])
  }, 90_000)

  it('gives the table the screen', async () => {
    // The table's share of the window: at 390 it used to be a 50 px strip beside an activity
    // column nobody had asked for.
    const share = await measure(width, (page) =>
      page.evaluate(() => {
        const table = document.querySelector('[data-tv] > main')!.getBoundingClientRect()
        return { width: Math.round((table.width / window.innerWidth) * 100), height: Math.round((table.height / window.innerHeight) * 100) }
      }),
    )
    expect(share.width).toBeGreaterThanOrEqual(width < 1024 ? 90 : 60)
    expect(share.height).toBeGreaterThanOrEqual(40)
  }, 90_000)

  it('reads at AA on the handle and in her own sentence', async () => {
    // Only what the observer's page says about her: the table's own cards are drawn by the
    // compiler against their own shapes and are the template's contrast question, not this one.
    const measured = await measure(width, (page) =>
      page.$$eval('.byd-observer-handle, .byd-observer-handle *, .byd-observer-note', (els) =>
        els
          .filter((el) => [...el.childNodes].some((node) => node.nodeType === 3 && (node.textContent ?? '').trim() !== ''))
          .filter((el) => el.checkVisibility())
          .map((el) => {
            const style = getComputedStyle(el)
            const behind: string[] = []
            for (let at: Element | null = el; at; at = at.parentElement) behind.unshift(getComputedStyle(at).backgroundColor)
            return { what: (el.textContent ?? '').trim().slice(0, 28), ink: style.color, behind, large: parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700) }
          }),
      ),
    )
    expect(measured.length).toBeGreaterThan(0)
    expect(
      measured
        .map((t) => ({ ...t, ratio: contrastRatio(t.ink, flatten(['#0d0f14', ...t.behind])) }))
        .filter((t) => t.ratio < (t.large ? 3 : 4.5))
        .map((t) => `${t.what}: ${t.ratio.toFixed(2)}:1`),
    ).toEqual([])
  }, 90_000)

  it('never makes the page scroll sideways, and gives every control a 44 by 44 pixel hit area', async () => {
    const measured = await measure(width, (page) =>
      page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        small: [...document.querySelectorAll('button, a[href], input, select, textarea')]
          .filter((el) => (el as HTMLElement).checkVisibility())
          .map((el) => ({ what: (el.getAttribute('aria-label') ?? el.textContent ?? el.tagName).trim().slice(0, 24), box: (el.closest('label') ?? el).getBoundingClientRect() }))
          .filter(({ box }) => box.width < 44 || box.height < 44)
          .map(({ what, box }) => `${what}: ${Math.round(box.width)}×${Math.round(box.height)}`),
      })),
    )
    expect(measured).toEqual({ overflow: 0, small: [] })
  }, 90_000)
})
