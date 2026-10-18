import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'

// A table whose pages outweigh the app's heap (#1012). Every card's page carries the deck's
// typefaces and its picture as data URLs (DRIFT §4); 308 illustrated cards in two uploaded
// typefaces are 400 MB of pages, against a heap of 256 MB in the app's 512 MB container. The load
// test found the app dying at the start of such a table: every page was compiled first and queued
// after. A page has to be queued before the next is compiled, so a table never holds its pages
// all at once.
//
// The load runs in a Node of its own, because a heap limit is a property of a process.
const TSX = createRequire(import.meta.url).resolve('tsx')
const HEAP_MB = 96
const CARDS = 200
const FONT_MB = 2

it('starts a table whose pages together weigh several times the heap', { timeout: 60_000 }, async () => {
  // Non-vacuity: the pages, held together, would not fit — each card's front carries the face.
  expect(CARDS * FONT_MB).toBeGreaterThan(3 * HEAP_MB)
  const { stdout } = await promisify(execFile)(process.execPath, [`--max-old-space-size=${HEAP_MB}`, '--import', TSX, join(import.meta.dirname, 'heavy-table', 'load.ts')], {
    env: { ...process.env, HEAVY_CARDS: String(CARDS), HEAVY_FONT_MB: String(FONT_MB) },
    maxBuffer: 2 ** 20,
  })
  // Every card's front, and the one back they share.
  expect(JSON.parse(stdout)).toEqual({ loaded: true, queued: CARDS + 1, textures: CARDS + 1 })
})
