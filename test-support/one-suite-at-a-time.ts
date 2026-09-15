import { closeSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// One test run at a time on this machine, whoever started it.
//
// The budgets say how long a test may take (`jsdom-suite-budget`, `browser-suite-budget`,
// `render-budget`, #92). Nothing said how much work the machine may be asked to do at once, and
// that is the other half of the same fact: a number is only ever generous against a machine that
// has some room left.
//
// Thirty-one files in the web suite launch Chromium, vitest runs as many files at once as there
// are cores less one, and this repo is worked on in several worktrees at a time. The three
// multiply, and none of them knows about the other two. Measured on 2026-09-15 on an eight-core
// machine with three sessions running suites: a load average of 600, the web suite taking 1153
// seconds against 145 with the box to itself, and `felt-names` cut off at its sixty seconds on a
// body that takes ten when it is given a core. Nothing was wrong with the code on either run —
// the trunk's own gate failed three times in a row and the work could not be merged.
//
// Raising the numbers again is not the answer: a budget large enough to survive a machine at
// four times its capacity is no longer a budget, and a test that hangs has to keep failing. So
// the run waits for the machine instead of racing the rest of it. The lock is a file in the OS's
// temp directory, which is what every worktree on the box has in common.
//
// It is deliberately a gate and never a wall. A run that waits out its patience goes anyway: a
// wedged lock must cost minutes, not a working afternoon. And a slot is taken back from a holder
// that has died or stopped saying it is alive, because a worker felled mid-test must not leave
// the machine locked behind it.

export type LockOptions = {
  /** The lock file. One per machine by default, which is the whole point of it. */
  at?: string
  /** How old a holder's last word may be before the machine is taken from it. */
  staleMs?: number
  /** How long to wait for the machine before going anyway. */
  waitMs?: number
  pollMs?: number
  /** How often a holder says it is still there. */
  beatMs?: number
  /** Whether a process is running. A seam, so the rule can be tested without killing anything. */
  alive?: (pid: number) => boolean
}

type Held = { pid: number; at: number }

const DEFAULTS = {
  at: join(tmpdir(), 'byd-one-suite-at-a-time'),
  // Six heartbeats' grace. A holder that is merely busy is not a holder that is gone.
  staleMs: 30_000,
  // Long enough for a handful of suites to go before this one, short enough that a wedge is a
  // coffee and not an afternoon. The web suite is about 150 seconds with the box to itself.
  waitMs: 20 * 60_000,
  pollMs: 250,
  beatMs: 5_000,
  alive: (pid: number): boolean => {
    try {
      // Signal 0 asks after a process without touching it: it throws if there is none.
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  },
}

/**
 * Waits for the machine, then holds it. Resolves with the way to let it go, which is safe to
 * call more than once.
 */
export async function takeTheMachine(options: LockOptions = {}): Promise<() => Promise<void>> {
  const o = { ...DEFAULTS, ...options }
  const until = Date.now() + o.waitMs
  for (;;) {
    if (claim(o.at)) return hold(o)
    const holder = whoHolds(o.at)
    // Nobody readable in there, a holder that is gone, or one that has stopped saying it is
    // alive: the machine is free whatever the file says.
    if (holder === null || !o.alive(holder.pid) || Date.now() - holder.at > o.staleMs) {
      rmSync(o.at, { force: true })
      continue
    }
    // Waited long enough. Going anyway is worse than waiting and better than never running.
    if (Date.now() >= until) return async () => undefined
    await new Promise((r) => setTimeout(r, o.pollMs))
  }
}

/** The vitest global setup: hold the machine for the whole run, let go when it ends. */
export default async function setup(): Promise<() => Promise<void>> {
  if (process.env['BYD_TEST_LOCK'] === 'off') return async () => undefined
  return takeTheMachine()
}

// `wx` creates the file or fails; there is no window between the two, which is the whole of why
// the lock is a file and not a value read and then written.
function claim(at: string): boolean {
  try {
    const fd = openSync(at, 'wx')
    closeSync(fd)
    say(at)
    return true
  } catch {
    return false
  }
}

function whoHolds(at: string): Held | null {
  try {
    const held = JSON.parse(readFileSync(at, 'utf8')) as Partial<Held>
    return typeof held.pid === 'number' && typeof held.at === 'number' ? { pid: held.pid, at: held.at } : null
  } catch {
    // Unreadable, half-written, or gone between the two calls: not a holder.
    return null
  }
}

function say(at: string): void {
  try {
    writeFileSync(at, JSON.stringify({ pid: process.pid, at: Date.now() } satisfies Held))
  } catch {
    // The file went while we were holding it — someone decided we were dead. Saying so again
    // would be a second holder, so this says nothing and lets the run finish.
  }
}

function hold(o: Required<LockOptions>): () => Promise<void> {
  // Unref'd: saying we are alive must never be the reason a process stays up.
  const beat = setInterval(() => say(o.at), o.beatMs)
  beat.unref?.()
  let let_go = false
  const release = (): void => {
    if (let_go) return
    let_go = true
    clearInterval(beat)
    // Only ours: a slot already taken from us belongs to whoever took it.
    if (whoHolds(o.at)?.pid === process.pid) rmSync(o.at, { force: true })
  }
  // A run that is felled — a signal, a crash — still lets the next one in.
  process.once('exit', release)
  return async () => release()
}
