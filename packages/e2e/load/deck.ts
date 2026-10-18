import { deflateSync } from 'node:zlib'
import type { ProjectDoc } from '@byd/server'
import { openingSetup } from '@byd/server/doc'

/** The hashes of what a designer has uploaded before the load game can be written. */
export type LoadAssets = { pictures: readonly string[]; back: string; fonts: { title: string; body: string } }

const SEATS = 8
// What changes between two versions of the load game. A frame colour sits on every front, so a
// new one is the change that redraws the whole deck — the heaviest save a designer can make.
const FRAMES = ['#f4ead8', '#e8f0d8', '#d8e4f0', '#f0d8e4', '#ece0c8', '#d8f0ec']

/**
 * The game the memory load test plays (#1012): as many cards as the designer has pictures, each
 * with its own illustration, a title in one uploaded typeface and a rules text in another, for an
 * eight-seat table. It is `generation` that a saved version changes.
 */
export function loadGame(o: { name: string; generation: number; assets: LoadAssets }): ProjectDoc {
  const { assets } = o
  const frame = FRAMES[o.generation % FRAMES.length] ?? '#ffffff'
  return {
    name: o.name,
    template: {
      faces: {
        front: {
          base: [
            { kind: 'shape', id: 'frame', x: 1, y: 1, w: 61, h: 86, shape: 'rect', fill: frame, stroke: '#333', strokeMm: 0.5, radiusMm: 3 },
            { kind: 'image', id: 'art', x: 4, y: 14, w: 55, h: 40, bind: { field: 'art' }, fit: 'cover' },
            { kind: 'text', id: 'title', x: 5, y: 4, w: 53, h: 9, bind: { field: 'title' }, font: { family: 'Rubrik', sizePt: 13, weight: 700 }, color: '#111' },
            { kind: 'text', id: 'body', x: 5, y: 57, w: 53, h: 26, bind: { field: 'body' }, font: { family: 'Brödtext', sizePt: 8.5 }, color: '#222' },
            { kind: 'text', id: 'version', x: 5, y: 83, w: 53, h: 3, bind: { literal: `v${o.generation}` }, font: { family: 'Brödtext', sizePt: 6 }, color: '#555' },
          ],
          variants: {},
        },
        back: {
          base: [
            { kind: 'shape', id: 'bg', x: 0, y: 0, w: 63, h: 88, shape: 'rect', fill: '#2f4068' },
            { kind: 'image', id: 'mark', x: 6, y: 9, w: 51, h: 70, bind: { literal: `asset:${assets.back}` }, fit: 'contain' },
          ],
          variants: {},
        },
      },
    },
    rows: assets.pictures.map((hash, i) => ({
      id: `kort-${i + 1}`,
      fields: { title: `Kort ${i + 1}`, body: RULES_TEXT, art: `asset:${hash}`, antal: 1 },
    })),
    icons: {},
    fonts: {
      Rubrik: { stack: '"Rubrik", Georgia, serif', asset: `asset:${assets.fonts.title}` },
      Brödtext: { stack: '"Brödtext", Arial, sans-serif', asset: `asset:${assets.fonts.body}` },
    },
    setup: openingSetup({ players: SEATS, counters: [{ name: 'Poäng', start: 0 }] }),
  }
}

// A rules text of the length a real card carries, so that a front is laid out and not just painted.
const RULES_TEXT = 'När du spelar det här kortet: dra två kort och lägg ett av dem framför dig. Om du har tre eller fler kort framför dig får varje annan spelare kasta ett kort.'

/**
 * A picture for the load deck (#1012): a PNG of a real card illustration's dimensions and of a
 * chosen weight on disk.
 *
 * Both numbers matter and for different containers. The weight is what the app and Postgres carry,
 * since a deck travels as data URLs (DRIFT §4); the dimensions are what Chromium decodes into a
 * bitmap in the render worker, which is four bytes a pixel whatever the file weighed. So the
 * picture is flat colour that compresses to nothing, with a band of noise across the top that
 * compresses not at all and is as tall as the weight asks.
 */
export function picture(seed: number, size: { width: number; height: number; bytes: number }): Uint8Array {
  const { width, height } = size
  const stride = width * 3 + 1
  const noisy = Math.min(height, Math.ceil(size.bytes / (width * 3)))
  const raw = Buffer.alloc(stride * height)
  const rand = mulberry32(seed)
  const tint = [rand() * 255, rand() * 255, rand() * 255].map(Math.floor)
  for (let y = 0; y < height; y++) {
    const row = y * stride
    raw[row] = 0
    for (let x = 0; x < width * 3; x++) raw[row + 1 + x] = y < noisy ? Math.floor(rand() * 256) : (tint[x % 3] ?? 0)
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 2, 0, 0, 0], 8)
  return Buffer.concat([PNG_SIGNATURE, chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0)
  return Buffer.concat([head, data, crc])
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(bytes: Buffer): number {
  let c = 0xffffffff
  for (const b of bytes) c = (CRC_TABLE[(c ^ b) & 0xff] ?? 0) ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// A seeded generator, so the same run uploads the same files and two runs are comparable.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
