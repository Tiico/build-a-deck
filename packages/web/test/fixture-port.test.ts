import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:net'
import { describe, expect, it, vi } from 'vitest'
import { portBand, startServer } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// The lowest port this machine hands out to a `listen(0)`. Everything at or above it can be
// given to any process on the box that asks for "any port"; everything below it can only be had
// by asking for it by number.
function ephemeralFloor(): number {
  if (process.platform === 'linux') return Number(readFileSync('/proc/sys/net/ipv4/ip_local_port_range', 'utf8').trim().split(/\s+/)[0])
  if (process.platform === 'darwin') return Number(execFileSync('sysctl', ['-n', 'net.inet.ip.portrange.first']).toString().trim())
  return 49_152 // The IANA range, which is what Windows uses.
}

const hold = async (port: number): Promise<Server> => {
  const s = createServer()
  await new Promise<void>((resolve, reject) => {
    s.once('error', reject)
    s.listen(port, '127.0.0.1', resolve)
  })
  return s
}

// A restart keeps the port it had, which is the whole point of it: from the client's side it
// looks like a deploy on the box, and the client reconnects to the address it already has. That
// only works if nothing else can take the port while the fixture is between servers (#58).
describe('the port a test server listens on', () => {
  it('is one no other worker can be handed by asking for any port', async () => {
    const run = await startServer()
    expect(Number(new URL(run.http).port)).toBeLessThan(ephemeralFloor())
    await run.stop()
  })

  it('is the same one after a restart, so a client finds the address it already had', async () => {
    const run = await startServer()
    const address = run.http
    expect((await fetch(`${address}/health`)).status).toBe(200)
    await run.restart()
    // Nothing was told a new address, and the server is answering at the old one.
    expect(run.http).toBe(address)
    expect((await fetch(`${address}/health`)).status).toBe(200)
    await run.stop()
  })

  it('is named in a plain error when something else holds it, rather than felling a test', async () => {
    const run = await startServer()
    const port = Number(new URL(run.http).port)
    await run.stop()
    const squatter = await hold(port)
    await expect(run.restart()).rejects.toThrow(new RegExp(`127\\.0\\.0\\.1:${port}`))
    await new Promise<void>((resolve) => squatter.close(() => resolve()))
  })
})

// The ports `fetch` refuses to speak to at all, as WHATWG Fetch lists them. Reference data and
// not a measurement — but only the candidates: which of them a run's own `fetch` actually turns
// away is asked below, of `fetch` itself.
// https://fetch.spec.whatwg.org/#bad-port
const SPEC_BAD_PORTS = [
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697, 10_080,
]

// Whether this `fetch` turns the port away before it ever opens a socket. Nothing listens on any
// of these, so a port it is willing to speak to answers with a refused connection, and one it is
// not answers `bad port` — the two are told apart by the cause, not by a port number.
async function turnedAway(port: number): Promise<boolean> {
  try {
    await fetch(`http://127.0.0.1:${port}/`)
    return false
  } catch (err) {
    return (err as { cause?: { message?: string } }).cause?.message === 'bad port'
  }
}

// A port the fixture hands out has to be one the tests can then reach, and `listen` is not the
// judge of that: binding 10080 succeeds, and every `fetch` to the address that comes out of it
// fails — not as a refused connection but as `TypeError: fetch failed, Caused by: bad port`, from
// inside whatever test was using the fixture. The band ran 10000–30000 and 10080 sat in it, in
// the slice `RUN_SLOT` 0 and `WORKER_SLOT` 1 draw from, so one worker in nine runs would take it
// as its seventeenth fixture and fell two files with an error about neither of them (#136, #111).
describe('the band a test server takes its port from', () => {
  it('holds no port that fetch refuses to speak to', async () => {
    const { floor, ceiling } = portBand()
    const refused = []
    for (const port of SPEC_BAD_PORTS) if (await turnedAway(port)) refused.push(port)
    // The reading is not vacuous: this `fetch` does enforce the list, so the emptiness below is
    // the band avoiding those ports and not the check having quietly stopped working.
    expect(refused.length).toBeGreaterThan(0)
    expect(refused.filter((port) => port >= floor && port < ceiling)).toEqual([])
  })

  // Moving the floor is the cheap way out of the rule above, and moving it too far is the next
  // bug: the band is cut into a slice per run so that two suites on one box never want the same
  // number, and a band with fewer slices in it is a band where they collide again (#109).
  it('is still wide enough for the nine runs it was cut for', () => {
    const { floor, ceiling } = portBand()
    expect(Math.floor((ceiling - floor) / (64 * 32))).toBeGreaterThanOrEqual(9)
  })
})
