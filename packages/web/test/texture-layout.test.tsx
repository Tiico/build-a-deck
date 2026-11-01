// @vitest-environment jsdom
// Whether a fallback covers its card without moving it is a layout question, and jsdom answers
// none. So the real component's markup, in each of its three states, is measured in a real engine
// inside each container the app puts a card in.
import { readFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render } from '@testing-library/react'
import { chromium, type Browser } from 'playwright'
import type { VisibleComponentState } from '@byd/protocol'
import { BackTexture, Texture } from '../src/table/Texture.js'
import { TileInCard } from '../src/table/TileInCard.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const SHEETS = ['src/table/table.css', 'src/table/texture.css', 'src/online/online.css', 'src/player/player.css', 'src/buttons.css']

// A rendered face, written out here rather than fetched, so the browser has real pixels with a
// real natural size to lay out. A card that gives its face no size of its own is drawn at this
// size instead, which is the whole of the bug in #78 — so the picture has to be this big.
const PNG_630x880 = pngOf(630, 880)
function pngOf(w: number, h: number): Buffer {
  const chunk = (type: string, body: Buffer) => {
    const out = Buffer.concat([Buffer.from(type, 'ascii'), body])
    const head = Buffer.alloc(4)
    head.writeUInt32BE(body.length)
    const tail = Buffer.alloc(4)
    tail.writeUInt32BE(crc32(out))
    return Buffer.concat([head, out, tail])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // one byte a channel
  ihdr[9] = 0 // greyscale
  // Each row is a filter byte and then one grey byte a pixel; one flat colour compresses to nothing.
  const raw = Buffer.concat(Array.from({ length: h }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(w, 0x88)])))
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (const byte of buf) {
    c ^= byte
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1
  }
  return (c ^ 0xffffffff) >>> 0
}

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

type State = 'pending' | 'ready' | 'failed'

// The markup the component actually produces, in each state, taken from a real mount: as the
// quiet face most cards get, or as the face a view that holds the card up asks for (#82).
function markup(retry: boolean): Record<State, string> {
  vi.useFakeTimers()
  const { container, unmount } = render(<Texture faces="http://faces.test" c={card} retry={retry} />)
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

// Every place the app puts a card face, with the ancestry its stylesheet expects, and whether
// it holds the card up — the one kind of view a lost face offers its way back in (#82).
type Holder = { up: boolean; wrap(inner: string): string }
const HOLDERS: Record<string, Holder> = {
  'a loose card on the table': {
    up: false,
    wrap: (inner) => `<div class="byd-table-frame"><div class="byd-card" style="position:absolute;left:20px;top:20px;width:90px;height:126px">${inner}<span>wizard</span></div></div>`,
  },
  'the top of a pile': {
    up: false,
    wrap: (inner) => `<div class="byd-pile" style="position:absolute;left:20px;top:20px;width:90px;height:126px"><div class="byd-pile-top">${inner}<span>wizard</span></div></div>`,
  },
  // The fan's box is millimetres of felt written out by the renderer (#23), so the holder says
  // it here the way the renderer would at life size.
  "a card in another seat's hand": {
    up: false,
    wrap: (inner) => `<div class="byd-hand" style="left:200px;top:200px"><div class="byd-hand-fan"><i class="byd-hand-card" style="left:-27px;top:-25px;width:54px;height:75px">${inner}<span>wizard</span></i></div></div>`,
  },
  'a card in the phone hand': {
    up: false,
    wrap: (inner) => `<div class="byd-player"><div class="byd-grid"><button class="byd-grid-card">${inner}<strong>wizard</strong></button></div></div>`,
  },
  // The cards in front of the seat (C4): the face is a box of its own inside the control, so the
  // image has a size to fill and the state has a card to lie on rather than the whole card (#78).
  'a card in front of the seat on the phone': {
    up: false,
    wrap: (inner) =>
      `<div class="byd-player"><section class="byd-mine"><div class="byd-mine-strip"><button class="byd-mine-card" data-face="front"><i class="byd-mine-face">${inner}</i><strong>wizard</strong></button></div></section></div>`,
  },
  'a card held up on the phone': {
    up: true,
    // The held card as `HeldCard` draws it: the card is the `[data-inspect]` box (#483), and the rule
    // that sizes it is written for that box and not for every `div` in the view.
    wrap: (inner) => `<div class="byd-player"><div class="byd-inspect"><div data-inspect="c1" data-face="front">${inner}<span>wizard</span></div></div></div>`,
  },
  'a card in the online fan': { up: false, wrap: (inner) => `<div class="byd-fan"><div class="byd-fan-card">${inner}<span>wizard</span></div></div>` },
}

type Box = { x: number; y: number; w: number; h: number }
type Measured = { holder: Box | null; image: Box; fallback: Box | null; imageVisible: boolean; nameVisible: boolean; retry: Box | null; retryVisible: boolean }

let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser.close()
}, 60_000)

async function measure(state: State): Promise<Record<string, Measured>> {
  const faces = { quiet: markup(false), held: markup(true) }
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } })
  try {
    // A face that answers, at the size the renderer actually makes one (63 × 88 mm at 300 dpi).
    // Without it every image here is broken and collapses to nothing, and a card with no rule
    // for the size of its face measures the same as one that has it (#78).
    await page.route('**/faces/**', (route) => route.fulfill({ contentType: 'image/png', body: PNG_630x880 }))
    const body = Object.entries(HOLDERS)
      .map(([name, h]) => `<section data-case="${name}">${h.wrap((h.up ? faces.held : faces.quiet)[state])}</section>`)
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
              // The markup's own name beside the face, not what the state draws inside itself.
              nameVisible: shown(root.querySelector('span:not([data-texture]):not([data-texture] *), strong')),
              // The way back belongs to the state box; a card that is itself a control must not
              // be mistaken for one (UX-37, #82).
              retry: box(root.querySelector('[data-texture] button')),
              retryVisible: shown(root.querySelector('[data-texture] button')),
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
    const seen = await measure('pending')
    for (const [name, m] of Object.entries(seen)) {
      expect({ [name]: m.fallback }).toEqual({ [name]: m.image })
      expect({ [name]: m.image.w > 0 && m.image.h > 0 }).toEqual({ [name]: true })
      // The image box is the card's own box, so the fallback can never spill onto the felt.
      expect({ [name]: m.image.w <= m.holder!.w && m.image.h <= m.holder!.h }).toEqual({ [name]: true })
      // And the card is the size the view gives it, not the size the renderer made the picture:
      // a face with no rule for its size draws at 630 × 880 and takes the screen with it (#78).
      expect({ [name]: m.holder!.w <= 420 && m.holder!.h <= 900 }).toEqual({ [name]: true })
      // The name is said once — by the fallback, not by the markup underneath it.
      expect({ [name]: m.nameVisible }).toEqual({ [name]: false })
    }
  }, 60_000)

  it('leaves the card the same size when the render lands, so nothing on the table moves', async () => {
    const before = await measure('pending')
    const after = await measure('ready')
    for (const name of Object.keys(HOLDERS)) {
      expect({ [name]: after[name]!.holder }).toEqual({ [name]: before[name]!.holder })
      expect({ [name]: after[name]!.image }).toEqual({ [name]: before[name]!.image })
      expect({ [name]: after[name]!.fallback }).toEqual({ [name]: null })
    }
  }, 60_000)

  it('hides the broken image behind the failure in every consumer', async () => {
    const seen = await measure('failed')
    for (const [name, m] of Object.entries(seen)) {
      expect({ [name]: m.imageVisible }).toEqual({ [name]: false })
      expect({ [name]: m.fallback }).toEqual({ [name]: m.image })
    }
  }, 60_000)

  it('offers a pressable retry on the card held up, and no control at all on a card that is one', async () => {
    const seen = await measure('failed')
    for (const [name, m] of Object.entries(seen)) {
      // A card that is a control cannot hold one, and a card narrower than a thumb could not
      // press one (UX-37, #82); both are read by holding the card up, which carries the retry.
      const up = HOLDERS[name]!.up
      expect({ [name]: m.retryVisible }).toEqual({ [name]: up })
      // UX-KONTROLLER: a target you press with a thumb is at least 44 by 44.
      if (up) expect({ [name]: m.retry!.h >= 44 && m.retry!.w >= 44 }).toEqual({ [name]: true })
    }
    // Whatever the table's scale, the way back is never more than a look away.
    expect(seen['a card held up on the phone']!.retryVisible).toBe(true)
  }, 60_000)
})

// Variant C of #1546 (beställarens beslut 2026-11-01): a side drawn before its texture is the
// skeleton clipped to its shape, with the name in the shape's inscribed box and a spinner. Since
// beslut A a tile or a board can be seen before it is drawn, and in a hexagon the name stood in
// the narrow point (#1544). Measured in a real engine, at the size a tile is held up on the phone.
describe('a tile or a board that is not drawn yet, measured in its shape (#1546)', () => {
  const tileOfShape = (id: string): VisibleComponentState => ({ ...card, id: `t-${id}`, type: { id, version: 1 }, cardRef: 'skog' })
  const TILE_CASES: Record<string, { c: VisibleComponentState; inner: (b: Box) => Box }> = {
    // A hexagon with a point up: its widest band is between a quarter and three quarters of its height.
    hexagon: { c: tileOfShape('tile.hex.52'), inner: (b) => ({ x: b.x, y: b.y + b.h * 0.25, w: b.w, h: b.h * 0.5 }) },
    // A disc: the square inside it.
    'round tile': { c: tileOfShape('tile.round.44'), inner: (b) => ({ x: b.x + b.w * 0.146, y: b.y + b.h * 0.146, w: b.w * 0.708, h: b.h * 0.708 }) },
    'square tile': { c: tileOfShape('tile.square.45'), inner: (b) => b },
  }
  const inside = (a: Box, b: Box) => a.x >= b.x - 1 && a.y >= b.y - 1 && a.x + a.w <= b.x + b.w + 1 && a.y + a.h <= b.y + b.h + 1

  async function measureShapes(): Promise<Record<string, { face: Box; name: Box | null; spinner: Box | null }>> {
    const markups: Record<string, string> = {}
    for (const [name, { c }] of Object.entries(TILE_CASES)) {
      const { container, unmount } = render(
        <TileInCard c={c}>
          <Texture faces="http://faces.test" c={c} />
        </TileInCard>,
      )
      markups[name] = container.innerHTML
      unmount()
    }
    const board = render(<BackTexture faces="http://faces.test" hash={'d'.repeat(64)} part="board" />)
    markups['board'] = board.container.innerHTML
    board.unmount()
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
    try {
      const body = Object.entries(markups)
        .map(([name, html]) =>
          name === 'board'
            ? `<section data-case="board"><div class="byd-board" style="position:absolute;left:400px;top:20px;width:420px;height:315px">${html}</div></section>`
            : `<section data-case="${name}"><div class="byd-card" style="position:relative;display:inline-block;width:180px;height:252px;margin:8px">${html}</div></section>`,
        )
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
          return r.width > 2 && r.height > 2 ? { x: r.x, y: r.y, w: r.width, h: r.height } : null
        }
        return Object.fromEntries(
          names.map((name) => {
            const root = document.querySelector(`[data-case="${name}"]`)!
            const state = root.querySelector('[data-texture="pending"]')!
            // The words themselves, not the box they may stretch across.
            const word = state.querySelector('b')
            let said: { x: number; y: number; w: number; h: number } | null = null
            if (word) {
              const range = document.createRange()
              range.selectNodeContents(word)
              const r = range.getBoundingClientRect()
              said = { x: r.x, y: r.y, w: r.width, h: r.height }
            }
            return [name, { face: box(root.querySelector('.byd-tile-face') ?? state)!, name: said, spinner: box(state.querySelector('[data-texture-spinner]')) }]
          }),
        )
      }, [...Object.keys(TILE_CASES), 'board'])
    } finally {
      await page.close()
    }
  }

  it('sets the name inside the widest part of its shape and turns a spinner, for every tile', async () => {
    const seen = await measureShapes()
    for (const [name, { inner }] of Object.entries(TILE_CASES)) {
      const m = seen[name]!
      expect({ [name]: m.name !== null && inside(m.name, inner(m.face)) }).toEqual({ [name]: true })
      expect({ [name]: m.spinner !== null && inside(m.spinner, inner(m.face)) }).toEqual({ [name]: true })
    }
  }, 60_000)

  it('turns a spinner in the middle of a board, which names nothing', async () => {
    const m = (await measureShapes())['board']!
    expect(m.name).toBeNull()
    expect(m.spinner).not.toBeNull()
    const middle = { x: m.face.x + m.face.w / 2, y: m.face.y + m.face.h / 2 }
    expect(Math.abs(m.spinner!.x + m.spinner!.w / 2 - middle.x)).toBeLessThan(m.face.w * 0.1)
    expect(Math.abs(m.spinner!.y + m.spinner!.h / 2 - middle.y)).toBeLessThan(m.face.h * 0.25)
  }, 60_000)
})
