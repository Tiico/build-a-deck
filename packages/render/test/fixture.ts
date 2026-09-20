import type { Server as SocketServer } from 'node:net'
import { inflateSync } from 'node:zlib'
import { CARD_STANDARD_63x88 } from '@byd/engine'
import { compile, type FaceTemplate } from '@byd/template'

export const face: FaceTemplate = {
  base: [
    { kind: 'shape', id: 'frame', x: 1, y: 1, w: 61, h: 86, shape: 'rect', fill: '#f4ead8', stroke: '#333', strokeMm: 0.5, radiusMm: 3 },
    { kind: 'text', id: 'title', x: 5, y: 5, w: 53, h: 10, bind: { field: 'title' }, font: { family: 'sans-serif', sizePt: 14, weight: 700 }, color: '#111' },
    { kind: 'text', id: 'body', x: 5, y: 30, w: 53, h: 40, bind: { field: 'body' }, font: { family: 'sans-serif', sizePt: 9 }, color: '#222' },
  ],
  variants: {},
}

export const compiled = (row: Record<string, string>, bleed = false) =>
  compile({ type: CARD_STANDARD_63x88, face, row, icons: {}, bleed })

// PNG dimensions from the IHDR chunk.
export function pngSize(png: Uint8Array): { w: number; h: number } {
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength)
  return { w: dv.getUint32(16), h: dv.getUint32(20) }
}

// One pixel out of a screenshot, so a test can say what colour the press actually laid down
// rather than what the stylesheet asked for. Chromium writes 8-bit truecolour, with or without
// an alpha channel and never interlaced, which is the whole of what this reads: a fuller decoder
// would be a second thing to trust, and the point here is to trust the pixels.
export function pngPixel(png: Uint8Array, x: number, y: number): { r: number; g: number; b: number } {
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength)
  const width = dv.getUint32(16)
  const depth = png[24]
  const colour = png[25]
  if (depth !== 8 || (colour !== 2 && colour !== 6)) throw new Error(`unexpected PNG: depth ${depth}, colour type ${colour}`)
  const channels = colour === 6 ? 4 : 3
  const raw = inflateSync(Buffer.from(concatIdat(png)))
  const stride = width * channels + 1
  // Undoing the per-scanline filters needs every line above the one asked for, so the picture is
  // unfiltered from the top down into a single buffer and the pixel read out of that.
  const out = new Uint8Array(width * channels * (raw.length / stride))
  for (let row = 0; row * stride < raw.length; row++) {
    const filter = raw[row * stride]
    for (let i = 0; i < width * channels; i++) {
      const cur = raw[row * stride + 1 + i] ?? 0
      const a = i >= channels ? (out[row * width * channels + i - channels] ?? 0) : 0
      const b = row > 0 ? (out[(row - 1) * width * channels + i] ?? 0) : 0
      const c = row > 0 && i >= channels ? (out[(row - 1) * width * channels + i - channels] ?? 0) : 0
      out[row * width * channels + i] = (cur + unfilter(filter ?? 0, a, b, c)) & 255
    }
  }
  const at = y * width * channels + x * channels
  return { r: out[at] ?? 0, g: out[at + 1] ?? 0, b: out[at + 2] ?? 0 }
}

function unfilter(filter: number, a: number, b: number, c: number): number {
  switch (filter) {
    case 0:
      return 0
    case 1:
      return a
    case 2:
      return b
    case 3:
      return (a + b) >> 1
    case 4: {
      const p = a + b - c
      const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)]
      return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
    }
    default:
      throw new Error(`unknown PNG filter ${filter}`)
  }
}

// A PNG may split its pixels over several IDAT chunks; the stream is the chunks joined.
function concatIdat(png: Uint8Array): Uint8Array {
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength)
  const parts: Uint8Array[] = []
  for (let at = 8; at + 8 <= png.length; ) {
    const length = dv.getUint32(at)
    const type = String.fromCharCode(...png.subarray(at + 4, at + 8))
    if (type === 'IDAT') parts.push(png.subarray(at + 8, at + 8 + length))
    if (type === 'IEND') break
    at += 12 + length
  }
  const total = parts.reduce((n, part) => n + part.length, 0)
  const all = new Uint8Array(total)
  let at = 0
  for (const part of parts) {
    all.set(part, at)
    at += part.length
  }
  return all
}

// A fixture never takes its port with `listen(0)` (#58). `listen(0)` is handed a port out of the
// operating system's ephemeral range, and that is the range every other worker on the machine
// draws from too: a neighbour asking for any port at all can be given the very number another
// suite is between servers on, and the EADDRINUSE then lands inside whatever test happened to be
// running, about a port nothing in that test named. Ports below 30000 are outside the ephemeral
// range everywhere this suite runs — it starts at 32768 on Linux and 49152 on macOS and Windows —
// so nothing the kernel hands out on its own can land on one. The floor is above 10080 for a
// second reason, which cost a green suite to find (#136): 10080 is the highest port on WHATWG
// Fetch's list of ports `fetch` will not speak to at all, so a server given one starts perfectly
// well and then every request to the address it hands out fails.
//
// The rule is machine-wide, and so is the collision it prevents: it happens between packages and
// not inside one, which is why it went on being broken here long after the web suite had written
// it down (#289). Every test package therefore has its own block of the band:
//
//   10_100 – 10_200  packages/e2e            one stack per run, walking for a free number
//   10_200 – 10_600  packages/render/test    ← this one
//   10_600 – 11_000  packages/server/test
//   11_000 – 30_000  packages/web/test
//
// The blocks are what makes two packages asking for one number impossible rather than unlikely,
// and they stay that way because no package can leave its own block quietly: the reckoning below
// is cut out of this block and nothing else, and `fixture-port.test.ts` beside this file fails the
// moment it no longer fits. A block is cheaper to hold to than a shared module would be — the same
// rule, written once per package, with no package reaching into another package's tests.
const PORT_FLOOR = 10_200
const PORT_CEILING = 10_600

// Four ports per worker: room to walk over a number another program on the machine happens to be
// holding, rather than the distance the web suite buys with sixty-four. That distance is against a
// client outliving its own server and knocking on a later fixture's door (#109), and only one file
// in this package binds anything at all — a stand-in for S3, standing for one `describe` — so a
// port here is never handed out again while anything still has the address.
const PORTS_PER_WORKER = 4
// Sixteen worker slots: twice the cores of the eight-core machine the numbers in
// `test-support/one-suite-at-a-time.ts` were measured on, so a larger box does not quietly put two
// of its workers in one slice.
const WORKERS_PER_RUN = 16
const PORTS_PER_RUN = PORTS_PER_WORKER * WORKERS_PER_RUN

/**
 * This package's block and what has been cut out of it, for the test that holds it to the rule.
 *
 * `slices` is how many runs can be on this machine at once before two of them draw from the same
 * numbers — several worktrees at a time is how this repo is worked — and it is counted here rather
 * than by the caller, so that a guard on it cannot drift away from the numbers it is guarding.
 */
export function portBand(): { floor: number; ceiling: number; workers: number; slices: number } {
  return { floor: PORT_FLOOR, ceiling: PORT_CEILING, workers: WORKERS_PER_RUN, slices: Math.floor((PORT_CEILING - PORT_FLOOR) / PORTS_PER_RUN) }
}

const WORKER_SLOT = ((Number(process.env['VITEST_POOL_ID']) || 1) - 1) % WORKERS_PER_RUN
const RUN_SLOT = (process.ppid || process.pid) % portBand().slices
const SLICE = PORT_FLOOR + RUN_SLOT * PORTS_PER_RUN + WORKER_SLOT * PORTS_PER_WORKER
let nth = 0

// `listen` says it failed by emitting `error`, not by throwing. Without this the EADDRINUSE below
// would reach the worker as an uncaught exception and fell whatever test was running, which is how
// #58 was first seen.
// An `http.Server` is a `net.Server` with a protocol on top, and the port is the socket's
// business, so this is written against the plain socket server: anything in this package that has
// to listen can then take its port out of the same block, whether it speaks HTTP or not.
function listenOn(server: SocketServer, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const failed = (err: Error) => {
      server.removeListener('listening', listening)
      reject(err)
    }
    const listening = () => {
      server.removeListener('error', failed)
      resolve()
    }
    server.once('error', failed)
    server.once('listening', listening)
    server.listen(port, '127.0.0.1')
  })
}

/**
 * Listens on a port out of this worker's own slice of the block above, and says which one.
 *
 * It steps over anything another program on the machine happens to be holding, and gives up by
 * naming every number it tried: a fixture that cannot find a door has to say so itself, rather
 * than leave the next `fetch` to explain it.
 */
export async function listenInBand(server: SocketServer): Promise<number> {
  const tried: number[] = []
  for (let i = 0; i < PORTS_PER_WORKER; i++) {
    const port = SLICE + (nth % PORTS_PER_WORKER)
    nth += 1
    tried.push(port)
    try {
      await listenOn(server, port)
      return port
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw err
    }
  }
  throw new Error(`test fixture found no free port among 127.0.0.1:${tried.join(', ')}`)
}
