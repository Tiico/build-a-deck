import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { askedForAnyPort } from '../../../test-support/listen-zero.js'
import { portBand, start } from './fixture.js'

// The lowest port this machine hands out to a `listen(0)`. Everything at or above it can be
// given to any process on the box that asks for "any port"; everything below it can only be had
// by asking for it by number.
function ephemeralFloor(): number {
  if (process.platform === 'linux') return Number(readFileSync('/proc/sys/net/ipv4/ip_local_port_range', 'utf8').trim().split(/\s+/)[0])
  if (process.platform === 'darwin') return Number(execFileSync('sysctl', ['-n', 'net.inet.ip.portrange.first']).toString().trim())
  return 49_152 // The IANA range, which is what Windows uses.
}

describe('the port a test server listens on', () => {
  it('is one no other worker can be handed by asking for any port', async () => {
    const run = await start()
    expect(Number(new URL(run.http).port)).toBeLessThan(ephemeralFloor())
    await run.stop()
  })

  // The rule is machine-wide and was written down in a package that does not read this one, so
  // nothing here ever said a word about breaking it: two files in this suite went on asking for
  // any port at all, and what that costs turns up in some other package's restart (#289). Asking
  // it of every file here is what keeps the next one from being written.
  it('is asked for by number in every file here, and never as "any port at all"', () => {
    expect(askedForAnyPort(import.meta.dirname)).toEqual([])
  })
})

// What keeps this package's ports out of every other package's: the block, and the fact that the
// reckoning in `fixture.ts` is cut out of it and nothing else. Growing past the block would not
// fail over there, in the suite whose numbers had been stepped on and which had changed nothing —
// it is caught here, where the growing was done.
describe('the block this package takes its ports from', () => {
  it('is the one it was given, between the render suite below it and the web suite above', () => {
    const { floor, ceiling } = portBand()
    // Above 10080, the highest port `fetch` will not speak to at all (#136); above the render
    // suite's ceiling; and up to, never past, the floor the web suite counts nine runs from.
    expect(floor).toBeGreaterThanOrEqual(10_600)
    expect(ceiling).toBeLessThanOrEqual(11_000)
  })

  it('is still wide enough for the runs and the workers it was cut for', () => {
    const { slices, workers } = portBand()
    // Six runs at once on the machine, which is how this repo is worked: several worktrees, each
    // able to start its own suite. Buying more of them by taking worker slots is the other way to
    // break this, so the workers are held to as well — two workers of one run sharing a slice is
    // not a rare collision but every single run.
    expect(slices).toBeGreaterThanOrEqual(6)
    expect(workers).toBeGreaterThanOrEqual(16)
  })
})
