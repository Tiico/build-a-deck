// @vitest-environment jsdom
// Every thumbnail of a picture shows the whole picture (#1257).
//
// The thumbnails were drawn with `object-fit: cover` in a fixed 3:2 box, so a picture that was not
// 3:2 lost its edges in every one of them: a square coin a third of its height, a narrow banner
// four fifths of its width. The designer could not tell from Tabell or Media what was on a card.
// The prototype in `docs/ux-audits/2026-10-24-hela-bilden` chose variant D: the whole picture,
// on a ground lighter than the dark of a night picture.
//
// Measured on the painted pixels and not read off the stylesheet: the picture is one flat colour,
// and the box that colour covers in the photograph is the part of the picture that is seen. That
// box has the picture's own shape and touches the thumbnail on two sides, or the picture is cut.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { chromium, type Browser } from 'playwright'
import type { ProjectDoc } from '@byd/server'
import { MediaPanel } from '../src/editor/MediaPanel.js'
import { PictureLibraryDialog } from '../src/editor/PictureLibrary.js'
import { PictureSlot } from '../src/editor/PictureSlot.js'
import { projectDoc } from './project-doc.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const shell = read('index.html')
const css = `${read('src/editor/editor.css')}\n${read('src/buttons.css')}\n${read('src/a11y.css')}`

const BASE = 'http://api.local'
const HASH = '1'.repeat(64)

// A flat picture of one colour, made here: its shape is what matters.
function png(w: number, h: number, [r, g, b]: readonly [number, number, number]): string {
  const crc = (buf: Buffer): number => {
    let c = ~0
    for (const byte of buf) {
      c ^= byte
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
    }
    return ~c >>> 0
  }
  const chunk = (type: string, data: Buffer): Buffer => {
    const head = Buffer.alloc(4)
    head.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const tail = Buffer.alloc(4)
    tail.writeUInt32BE(crc(body))
    return Buffer.concat([head, body, tail])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr.set([8, 2, 0, 0, 0], 8)
  const pixel = Buffer.from([r, g, b])
  const row = Buffer.concat([Buffer.from([0]), ...Array.from({ length: w }, () => pixel)])
  const file = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: h }, () => row)))), chunk('IEND', Buffer.alloc(0))])
  return `data:image/png;base64,${file.toString('base64')}`
}

function deckWithArt(): ProjectDoc {
  const doc = projectDoc()
  doc.template.faces['front']!.base.push({ kind: 'image', id: 'art', x: 4, y: 4, w: 55, h: 36, bind: { field: 'art' } })
  doc.rows[0]!.fields['art'] = `asset:${HASH}`
  return doc
}

const markup = (ui: Parameters<typeof render>[0]): string => {
  const { container, unmount } = render(ui)
  const html = container.innerHTML
  unmount()
  return html
}

// Every surface that draws a thumbnail of one of the game's pictures, by the selector of its
// picture. The strip over the table and the properties panel's line are written out as the
// components write them, since neither stands alone outside its whole surface.
const SURFACES = [
  { what: 'the picture tile in Tabell (L75)', img: '.byd-picture-tile img', html: () => markup(<PictureSlot label="Bild" choose="Välj" replace="Byt" alt="bild" base={BASE} value={HASH} onChoose={() => undefined} onPick={() => undefined} onFiles={() => undefined} onClear={() => undefined} />) },
  { what: 'the strip of the game’s pictures over Tabell', img: '.byd-data-images img', html: () => `<div class="byd-data-images"><span>Spelets bilder</span><ul><li><span class="byd-thumb"><img src="${BASE}/assets/${HASH}" alt=""></span><small>1 kort</small></li></ul></div>` },
  { what: 'the picture in the properties panel', img: '.byd-props-picture img', html: () => `<div class="byd-props-picture"><span class="byd-thumb"><img src="${BASE}/assets/${HASH}" alt=""></span><span>bild</span></div>` },
  { what: 'the tile in Media', img: '.byd-media-tile img', html: () => markup(<MediaPanel doc={deckWithArt()} assetBase={BASE} />) },
  { what: 'the tile in the picture library', img: '.byd-library-tile img', html: () => markup(<PictureLibraryDialog target="art" count={1} replacing={0} pictures={[{ hash: HASH, name: 'bild', cards: ['kort'] }]} assetBase={BASE} onApply={() => undefined} onClose={() => undefined} />) },
] as const

// A square coin, a narrow banner and a wide panorama: one that is cut top and bottom by a 3:2
// box, and one cut on either side.
const SHAPES = [
  { what: 'square', w: 300, h: 300 },
  { what: 'narrow 1:3', w: 100, h: 300 },
  { what: 'wide 3:1', w: 600, h: 200 },
] as const

const RED = [224, 16, 16] as const
// A night picture in the very colour the thumbnails used to stand on.
const NIGHT = [20, 22, 28] as const

const page_ = (html: string, picture: string) =>
  shell
    .replace('<script type="module" src="/src/main.tsx"></script>', '')
    .replace('</head>', `<style>${css}</style></head>`)
    .replace('<div id="root"></div>', `<div id="root"><div class="byd-editor" style="width: 900px">${html.replaceAll(`${BASE}/assets/${HASH}`, picture)}</div></div>`)

type Seen = { box: { w: number; h: number }; seen: { w: number; h: number }; inside: boolean }

let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser.close()
}, 60_000)

// The thumbnail's box, and the box the picture's own colour covers in the photograph of it.
async function seen(html: string, img: string, picture: string): Promise<Seen> {
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } })
  try {
    await page.setContent(page_(html, picture), { waitUntil: 'load' })
    const shot = (await page.screenshot({ scale: 'css' })).toString('base64')
    return await page.evaluate(
      async ({ shot, img, red }) => {
        const el = document.querySelector<HTMLImageElement>(img)
        if (!el) throw new Error(`nothing matches ${img}`)
        await el.decode()
        const image = new Image()
        image.src = `data:image/png;base64,${shot}`
        await image.decode()
        const canvas = document.createElement('canvas')
        canvas.width = image.naturalWidth
        canvas.height = image.naturalHeight
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(image, 0, 0)
        const box = el.getBoundingClientRect()
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
        let left = Infinity
        let top = Infinity
        let right = -Infinity
        let bottom = -Infinity
        // A pixel of the picture is within a few steps of its colour on every channel; the
        // rounded corners and the line at its edge are antialiased and are not counted.
        for (let y = Math.floor(box.top) - 2; y < Math.ceil(box.bottom) + 2; y++)
          for (let x = Math.floor(box.left) - 2; x < Math.ceil(box.right) + 2; x++) {
            const i = (y * canvas.width + x) * 4
            if ([0, 1, 2].every((c) => Math.abs(data[i + c]! - red[c]!) <= 6)) {
              left = Math.min(left, x)
              top = Math.min(top, y)
              right = Math.max(right, x + 1)
              bottom = Math.max(bottom, y + 1)
            }
          }
        return {
          box: { w: box.width, h: box.height },
          seen: { w: right - left, h: bottom - top },
          inside: left >= Math.floor(box.left) && top >= Math.floor(box.top) && right <= Math.ceil(box.right) && bottom <= Math.ceil(box.bottom),
        }
      },
      { shot, img, red: RED },
    )
  } finally {
    await page.close()
  }
}

describe('a thumbnail shows the whole picture (#1257)', () => {
  for (const surface of SURFACES)
    it.each(SHAPES)(`${surface.what}: a $what picture is drawn whole, in its own shape`, async (shape) => {
      const { box, seen: drawn, inside } = await seen(surface.html(), surface.img, png(shape.w, shape.h, RED))
      // The picture as large as it fits in the thumbnail, and not one pixel of it cut.
      const r = shape.w / shape.h
      const whole = r > box.w / box.h ? { w: box.w, h: box.w / r } : { w: box.h * r, h: box.h }
      expect(inside).toBe(true)
      expect(Math.abs(drawn.w - whole.w), `width ${drawn.w} of ${whole.w}`).toBeLessThanOrEqual(2)
      expect(Math.abs(drawn.h - whole.h), `height ${drawn.h} of ${whole.h}`).toBeLessThanOrEqual(2)
    }, 60_000)
})

// Where the picture does not reach, the thumbnail shows its ground; a dark picture on a ground
// of the same dark would look like an empty tile, or like a cut one.
describe('a dark picture stands out from its ground (#1257)', () => {
  for (const surface of SURFACES)
    it(`${surface.what}: a night picture is told from the ground beside it`, async () => {
      const page = await browser.newPage({ viewport: { width: 1000, height: 800 } })
      try {
        await page.setContent(page_(surface.html(), png(100, 300, NIGHT)), { waitUntil: 'load' })
        const shot = (await page.screenshot({ scale: 'css' })).toString('base64')
        const [picture, ground] = await page.evaluate(
          async ({ shot, img }) => {
            const el = document.querySelector<HTMLImageElement>(img)!
            await el.decode()
            const image = new Image()
            image.src = `data:image/png;base64,${shot}`
            await image.decode()
            const canvas = document.createElement('canvas')
            canvas.width = image.naturalWidth
            canvas.height = image.naturalHeight
            const ctx = canvas.getContext('2d')!
            ctx.drawImage(image, 0, 0)
            const box = el.getBoundingClientRect()
            const at = (x: number, y: number) => [...ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data.slice(0, 3)]
            // The narrow picture stands in the middle; the ground is halfway out to the side.
            return [at(box.left + box.width / 2, box.top + box.height / 2), at(box.left + box.width / 8, box.top + box.height / 2)]
          },
          { shot, img: surface.img },
        )
        const lum = (c: number[]) => c.map((v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i]!, 0)
        expect(picture).toEqual([...NIGHT])
        expect((lum(ground!) + 0.05) / (lum(picture!) + 0.05), `ground ${ground} beside ${picture}`).toBeGreaterThanOrEqual(1.25)
      } finally {
        await page.close()
      }
    }, 60_000)
})
