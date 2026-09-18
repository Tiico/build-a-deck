import { createServer } from 'node:net'

// Where this suite's stack is allowed to listen.
//
// The band and the reasoning behind it are `packages/web/test/fixture.ts`'s, and they are
// repeated here rather than shared because the two suites bind for different reasons — that one
// stands up a server per test, this one stands up one per run — and a number that has to mean
// both would be a number neither owns.
//
// What carries over is why the band exists at all. `listen(0)` is handed a port out of the
// operating system's ephemeral range, which is the range every other process on the machine draws
// from too, so a port that is free when it is probed can be taken by the time it is asked for
// (#58). Ports below 30000 are outside that range everywhere this suite runs — it starts at 32768
// on Linux and 49152 on macOS and Windows — so nothing the kernel hands out on its own can land
// on one. The floor is above 10080 because that is the highest port WHATWG Fetch refuses to speak
// to at all (#136): a server given one starts perfectly well and then every request to it fails,
// about a port nothing in the test named.
const FLOOR = 11_000
const CEILING = 30_000

// A run on this machine is not the only run on this machine. Worktrees are how this repo is
// worked — several sessions, each with its own checkout, each able to start its own stack — so
// the walk starts somewhere derived from the process rather than at the floor, and every one of
// them stepping on the same first port is not the common case but the certain one.
const start = FLOOR + (process.pid * 7 % (CEILING - FLOOR))

/**
 * A port in the band that nothing is listening on, walking from this process's own starting
 * point. The port is released before it is returned, so this is a claim and not a reservation:
 * whoever takes it must be ready to be told it is in use and ask again. That is what
 * `free(after)` is for — the caller walks on from the number that failed.
 */
export async function free(after = start): Promise<number> {
  for (let i = 0; i < CEILING - FLOOR; i++) {
    const port = FLOOR + (((after - FLOOR + i) % (CEILING - FLOOR)) + (CEILING - FLOOR)) % (CEILING - FLOOR)
    if (await bindable(port)) return port
  }
  throw new Error(`no free port between ${FLOOR} and ${CEILING}`)
}

const bindable = (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const probe = createServer()
    // `listen` says it failed by emitting `error` rather than by throwing, so a port in use
    // reaches the process as an unhandled event unless it is listened for here.
    probe.once('error', () => resolve(false))
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)))
  })
