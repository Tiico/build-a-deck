import type { Server as SocketServer } from 'node:net'
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
