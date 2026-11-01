import { deflateSync } from 'node:zlib'
import type { ProjectDoc } from '@byd/server'
import { applyRecipe, openingSetup, recipeOf } from '@byd/server/doc'

/**
 * The hashes of what a designer has uploaded before the load game can be written. `tiles` and
 * `board` are the pictures of a tile deck and a main board on top of the cards (#1533); a game
 * without them is the card game #1012 measured.
 */
export type LoadAssets = { pictures: readonly string[]; back: string; fonts: { title: string; body: string }; tiles?: readonly string[]; board?: string }

const SEATS = 8
// What changes between two versions of the load game. A frame colour sits on every front, so a
// new one is the change that redraws the whole deck — the heaviest save a designer can make.
const FRAMES = ['#f4ead8', '#e8f0d8', '#d8e4f0', '#f0d8e4', '#ece0c8', '#d8f0ec']

/**
 * The game the memory load test plays (#1012): `cards` cards, each with an illustration, a title in
 * one uploaded typeface and a rules text in another, for an eight-seat table. With fewer pictures
 * than cards the pictures are dealt out in turn, as in a deck whose cards share their art. It is
 * `generation` that a saved version changes.
 */
export function loadGame(o: { name: string; generation: number; cards: number; assets: LoadAssets }): ProjectDoc {
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
    rows: Array.from({ length: o.cards }, (_, i) => ({
      id: `kort-${i + 1}`,
      fields: { title: `Kort ${i + 1}`, body: RULES_TEXT, art: `asset:${assets.pictures[i % assets.pictures.length] ?? ''}`, antal: 1 },
    })),
    icons: {},
    fonts: {
      Rubrik: { stack: '"Rubrik", Georgia, serif', asset: `asset:${assets.fonts.title}` },
      Brödtext: { stack: '"Brödtext", Arial, sans-serif', asset: `asset:${assets.fonts.body}` },
    },
    setup: setupOf(frame, o.generation, assets.board),
    ...(assets.tiles && assets.tiles.length > 0 ? { decks: [tileDeck(frame, o.generation, assets.tiles)] } : {}),
  }
}

// The table for eight seats, and with a board picture a main board on the felt and a player board
// for every seat (#1480), laid by the recipe as the editor lays them. The boards wear the version's
// frame, so a saved version redraws them with the cards.
function setupOf(frame: string, generation: number, board: string | undefined): ProjectDoc['setup'] {
  const opening = openingSetup({ players: SEATS, counters: [{ name: 'Poäng', start: 0 }] })
  if (board === undefined) return opening
  const face = (w: number, h: number, art: string | undefined) => ({
    base: [
      { kind: 'shape' as const, id: 'frame', x: 0, y: 0, w, h, shape: 'rect' as const, fill: frame },
      ...(art ? [{ kind: 'image' as const, id: 'art', x: 10, y: 10, w: w - 20, h: h - 20, bind: { literal: `asset:${art}` }, fit: 'cover' as const }] : []),
      { kind: 'text' as const, id: 'version', x: 12, y: h - 18, w: 80, h: 8, bind: { literal: `v${generation}` }, font: { family: 'Brödtext', sizePt: 14 }, color: '#111' },
    ],
    variants: {},
  })
  const boards = [
    { id: 'huvudbrade', type: { id: 'board.rect610', version: 1 }, zone: opening.floor, faces: { front: face(610, 457, board) } },
    { id: 'spelarbrade', type: { id: 'board.player', version: 1 }, role: 'mine', faces: { front: face(240, 150, undefined) } },
  ]
  const withBoards = { ...opening, boards }
  const laid = applyRecipe(withBoards, recipeOf(withBoards))
  return { ...laid, zones: [...laid.zones, TILE_PILE] }
}

/**
 * The game whose print package the load test asks for (#1531, #1533): the big main board under a
 * photograph that runs out into the bleed, which is the heaviest file a print package draws, and
 * one card, whose sides reach the bleed too so that the physical checks (E5) let the package through.
 */
export function printGame(o: { name: string; photo: string }): ProjectDoc {
  const full = (fill: string) => ({ base: [{ kind: 'shape' as const, id: 'bg', x: -3, y: -3, w: 69, h: 94, shape: 'rect' as const, fill }], variants: {} })
  const opening = openingSetup({ players: 2, counters: [] })
  const withBoard = {
    ...opening,
    boards: [{ id: 'huvudbrade', type: { id: 'board.rect610', version: 1 }, zone: opening.floor, faces: { front: { base: [{ kind: 'image' as const, id: 'art', x: -3, y: -3, w: 616, h: 463, bind: { literal: `asset:${o.photo}` }, fit: 'cover' as const }], variants: {} } } }],
  }
  return {
    name: o.name,
    template: { faces: { front: full('#f4ead8'), back: full('#2f4068') } },
    rows: [{ id: 'kort-1', fields: { title: 'Kort 1' } }],
    icons: {},
    setup: applyRecipe(withBoard, recipeOf(withBoard)),
  }
}

// The pile the tiles start in, face down and seen by nobody, beside the felt.
const TILE_PILE = { id: 'brickor', kind: 'pile' as const, name: 'Brickorna', visibility: 'none' as const, geometry: { x: -160, y: 0, w: 0, h: 0, rot: 0 } }

// A tile deck of hexagons (#1484), each tile with its own picture and a name, its back one colour.
function tileDeck(frame: string, generation: number, pictures: readonly string[]): NonNullable<ProjectDoc['decks']>[number] {
  return {
    id: 'brickor',
    name: 'Brickor',
    type: { id: 'tile.hex.52', version: 1 },
    template: {
      faces: {
        front: {
          base: [
            { kind: 'shape', id: 'frame', x: 0, y: 0, w: 52, h: 60, shape: 'rect', fill: frame },
            { kind: 'image', id: 'art', x: 6, y: 12, w: 40, h: 30, bind: { field: 'art' }, fit: 'cover' },
            { kind: 'text', id: 'title', x: 8, y: 43, w: 36, h: 7, bind: { field: 'title' }, font: { family: 'Rubrik', sizePt: 9, weight: 700 }, color: '#111' },
            { kind: 'text', id: 'version', x: 20, y: 51, w: 12, h: 3, bind: { literal: `v${generation}` }, font: { family: 'Brödtext', sizePt: 6 }, color: '#555' },
          ],
          variants: {},
        },
        back: { base: [{ kind: 'shape', id: 'bg', x: 0, y: 0, w: 52, h: 60, shape: 'rect', fill: '#3c5a2f' }], variants: {} },
      },
    },
    rows: pictures.map((art, i) => ({ id: `bricka-${i + 1}`, fields: { title: `Bricka ${i + 1}`, art: `asset:${art}` } })),
    zone: TILE_PILE.id,
  }
}

// A rules text of the length a real card carries, so that a front is laid out and not just painted.
const RULES_TEXT = 'När du spelar det här kortet: dra två kort och lägg ett av dem framför dig. Om du har tre eller fler kort framför dig får varje annan spelare kasta ett kort.'

/**
 * A picture for the load deck (#1012): a PNG of a real card illustration's dimensions and of a
 * chosen weight on disk.
 *
 * Both numbers matter and for different containers. The weight is what is stored, and what the
 * render worker reads by hash for a page (DRIFT §4, #1028); the dimensions are what Chromium decodes into a
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
