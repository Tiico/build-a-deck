// @vitest-environment jsdom
// Whether a fallback covers its card without moving it is a layout question, and jsdom answers
// none. So the real component's markup, in each of its three states, is measured in a real engine
// inside each container the app puts a card in.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render } from '@testing-library/react'
import { chromium, type Browser } from 'playwright'
import type { VisibleComponentState } from '@byd/protocol'
import { Texture } from '../src/table/Texture.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const SHEETS = ['src/table/table.css', 'src/table/texture.css', 'src/online/online.css', 'src/player/player.css']

const card: VisibleComponentState = {
  id: 'c1',
  type: { id: 'card.standard.63x88', version: 1 },
  zone: 'table',
  face: 'front',
  x: 0,
  y: 0,
  rot: 0,
  cardRef: 'wizard',
  faces: { front: 'a'.repeat(64) },
}

// The markup the component actually produces, in each state, taken from a real mount.
function markup(): { pending: string; ready: string; failed: string } {
  vi.useFakeTimers()
  const { container, unmount } = render(<Texture faces="http://faces.test" c={card} />)
  const img = () => container.querySelector('img') as HTMLImageElement
  const pending = container.innerHTML
  fireEvent.load(img())
  const ready = container.innerHTML
  act(() => {
    fireEvent.error(img())
  })
  for (let i = 0; i <= 8; i++) {
    fireEvent.error(img())
    act(() => vi.advanceTimersByTime(1500 * (i + 1)))
  }
  const failed = container.innerHTML
  unmount()
  vi.useRealTimers()
  expect(pending).toMatch(/data-texture="pending"/)
  expect(failed).toMatch(/data-texture="failed"/)
  expect(ready).not.toMatch(/data-texture=/)
  return { pending, ready, failed }
}

// Every place the app puts a card face, with the ancestry its stylesheet expects.
const HOLDERS = {
  'a loose card on the table': (inner: string) =>
    `<div class="byd-table-frame"><div class="byd-card" style="position:absolute;left:20px;top:20px;width:90px;height:126px">${inner}<span>wizard</span></div></div>`,
  'the top of a pile': (inner: string) =>
    `<div class="byd-pile" style="position:absolute;left:20px;top:20px;width:90px;height:126px"><div class="byd-pile-top">${inner}<span>wizard</span></div></div>`,
  "a card in another seat's hand": (inner: string) =>
    `<div class="byd-hand" style="left:200px;top:200px"><div class="byd-hand-fan"><i class="byd-hand-card">${inner}<span>wizard</span></i></div></div>`,
  'a card in the phone hand': (inner: string) =>
    `<div class="byd-player"><div class="byd-strip"><div class="byd-strip-card">${inner}<strong>wizard</strong></div></div></div>`,
  'a card held up on the phone': (inner: string) =>
    `<div class="byd-player"><div class="byd-inspect"><div>${inner}<span>wizard</span></div></div></div>`,
  'a card in the online fan': (inner: string) => `<div class="byd-fan"><div class="byd-fan-card">${inner}<span>wizard</span></div></div>`,
} as const

type Box = { x: number; y: number; w: number; h: number }
type Measured = { holder: Box | null; image: Box; fallback: Box | null; imageVisible: boolean; nameVisible: boolean; retry: Box | null; retryVisible: boolean }

let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser.close()
}, 60_000)

async function measure(inner: string): Promise<Record<string, Measured>> {
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } })
  try {
    const body = Object.entries(HOLDERS)
      .map(([name, wrap]) => `<section data-case="${name}">${wrap(inner)}</section>`)
      .join('')
    const shell = read('index.html')
      .replace('<script type="module" src="/src/main.tsx"></script>', '')
      .replace('</head>', `<style>${SHEETS.map(read).join('\n')}</style></head>`)
      .replace('<div id="root"></div>', `<div id="root">${body}</div>`)
    await page.setContent(shell, { waitUntil: 'load' })
    return await page.evaluate((names) => {
      const box = (el: Element | null) => {
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
      }
      // Visible to the eye: painted, and big enough to read — the phone keeps a 1px
      // screen-reader copy of the name that no one sees.
      const shown = (el: Element | null) => {
        if (!el) return false
        const r = el.getBoundingClientRect()
        return getComputedStyle(el).visibility === 'visible' && r.width > 2 && r.height > 2
      }
      return Object.fromEntries(
        names.map((name) => {
          const root = document.querySelector(`[data-case="${name}"]`)!
          // The card box is the deepest element that holds the face: the one the image fills.
          const img = root.querySelector('img')!
          const holder = img.parentElement!
          return [
            name,
            {
              holder: box(holder),
              image: box(img)!,
              fallback: box(root.querySelector('[data-texture]')),
              imageVisible: shown(img),
              nameVisible: shown(root.querySelector('span:not([data-texture]), strong')),
              retry: box(root.querySelector('button')),
              retryVisible: shown(root.querySelector('button')),
            },
          ]
        }),
      )
    }, Object.keys(HOLDERS))
  } finally {
    await page.close()
  }
}

describe('the waiting card, measured where it is actually drawn', () => {
  it('lays the fallback exactly over the image in every consumer, and never outside its card', async () => {
    const { pending } = markup()
    const seen = await measure(pending)
    for (const [name, m] of Object.entries(seen)) {
      expect({ [name]: m.fallback }).toEqual({ [name]: m.image })
      expect({ [name]: m.image.w > 0 && m.image.h > 0 }).toEqual({ [name]: true })
      // The image box is the card's own box, so the fallback can never spill onto the felt.
      expect({ [name]: m.image.w <= m.holder!.w && m.image.h <= m.holder!.h }).toEqual({ [name]: true })
      // The name is said once — by the fallback, not by the markup underneath it.
      expect({ [name]: m.nameVisible }).toEqual({ [name]: false })
    }
  }, 60_000)

  it('leaves the card the same size when the render lands, so nothing on the table moves', async () => {
    const { pending, ready } = markup()
    const before = await measure(pending)
    const after = await measure(ready)
    for (const name of Object.keys(HOLDERS)) {
      expect({ [name]: after[name]!.holder }).toEqual({ [name]: before[name]!.holder })
      expect({ [name]: after[name]!.image }).toEqual({ [name]: before[name]!.image })
      expect({ [name]: after[name]!.fallback }).toEqual({ [name]: null })
    }
  }, 60_000)

  it('hides the broken image behind the failure in every consumer', async () => {
    const { failed } = markup()
    const seen = await measure(failed)
    for (const [name, m] of Object.entries(seen)) {
      expect({ [name]: m.imageVisible }).toEqual({ [name]: false })
      expect({ [name]: m.fallback }).toEqual({ [name]: m.image })
    }
  }, 60_000)

  it('offers a pressable retry on every card with room for one, and none on a card without', async () => {
    const { failed } = markup()
    const seen = await measure(failed)
    for (const [name, m] of Object.entries(seen)) {
      // A card narrower than this cannot hold a thumb-sized target without swallowing the card,
      // so it gets none; it is read by holding it up, and the held-up card carries the retry.
      const room = m.image.w >= 96
      expect({ [name]: m.retryVisible }).toEqual({ [name]: room })
      // UX-KONTROLLER: a target you press with a thumb is at least 44 by 44.
      if (room) expect({ [name]: m.retry!.h >= 44 && m.retry!.w >= 44 }).toEqual({ [name]: true })
    }
    // Whatever the table's scale, the way back is never more than a look away.
    expect(seen['a card held up on the phone']!.retryVisible).toBe(true)
    expect(seen["a card in another seat's hand"]!.retryVisible).toBe(false)
  }, 60_000)
})
