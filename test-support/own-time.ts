// A test's budget is the worker's own time, not the wall clock's (#848).
//
// On a loaded machine the operating system can leave a worker unrun for seconds at a time. The box
// these suites run on has been measured holding one for 4.4, 12.6 and 14.3 s inside a single file,
// with hundreds of millions of pages swapped out behind it, and at a load of 128 on eight cores a
// test that takes 1.3 s of CPU took 15–20 s of wall clock. Neither of those tests was doing
// anything wrong: `setup-editor` spends 0.2 s of its own and fell on its twenty seconds, and the
// server's deep history spends 1.3 s and fell on its fifteen. A deadline in wall clock is shorter
// than some stall, whatever number it is given, so no number in `budget.ts` or `pg-budget.ts`
// could have kept them green.
//
// So a test is held to its budget in the time the worker actually ran: the wall clock, less the
// stretches in which the process was not run at all. vitest's own `testTimeout` stays, raised to
// `TEST_CEILING`, as the backstop for the one thing this cannot see; everything else is
// `own-time-guard.ts`, installed by each package's setup file. #867 did the same for a single
// `waitFor` in the web suite; this is that, for the whole of a test.
//
// This half is the measurement and nothing else, so that a vitest config can read the ceiling
// without importing vitest's runtime into the main process.

/**
 * What vitest's `testTimeout` is in a package held to own time: a ceiling for what truly hangs,
 * and nothing a working test is meant to reach.
 *
 * A test that hangs on a promise is failed by the guard as soon as its own time passes its budget,
 * because a worker that is waiting is a worker that runs. What reaches the ceiling is the rest: a
 * worker the machine has held for most of two minutes, which is a machine to look at and not a
 * test. It is six times the largest budget there is (the web's twenty seconds), and above every
 * timeout a test in this repo asks for by name (ninety seconds, `export.test.ts`).
 */
export const TEST_CEILING = 120_000

// How often the watcher looks, and the least a gap must be to count as the worker held. The
// jitter of a busy scheduler is a few tens of milliseconds and is the worker's own time; a stall
// is a quarter of a second at least, and is not.
const TICK_MS = 50
const HELD_AT_LEAST_MS = 250

// Read off the real clock and the real timers, even where a test fakes them: a faked clock that
// jumps is not a stall, and a faked interval would never tick at all.
const realSetInterval = setInterval
const realClearInterval = clearInterval
const now = performance.now.bind(performance)

/** How long something has taken, and how much of that the worker was not run. */
export type Account = { took: number; held: number }

/** The worker's own time in an account: the wall clock less the time it was held. */
export const ownTime = (account: Account): number => account.took - account.held

/**
 * Starts watching for the worker being held, and calls `onTick` each time it looks.
 *
 * A worker that is waiting still runs its timers: an interval that is due is called within a few
 * milliseconds of when it was due. One that is held is not called at all, and when the process
 * runs again the gap since the last call is wall time in which the process spent no CPU. That
 * gap, less the interval itself and less the CPU that was spent, is time the worker did not run.
 * A render that took a second of its own is CPU and counts as the worker's own, as it always did.
 *
 * A worker that blocks itself without spending CPU — `Atomics.wait`, a synchronous child process —
 * looks the same from inside, and is counted as held. That is the price of measuring from inside
 * the process, and it is why the ceiling stays.
 */
export function watchHolds(onTick?: (account: Account) => void): { read(): Account; stop(): Account } {
  const started = now()
  let last = started
  let cpu = process.cpuUsage()
  let held = 0
  const look = (): Account => {
    const at = now()
    const used = process.cpuUsage(cpu)
    cpu = process.cpuUsage()
    const idle = at - last - TICK_MS - (used.user + used.system) / 1000
    if (idle >= HELD_AT_LEAST_MS) held += idle
    last = at
    return { took: at - started, held }
  }
  // The look comes first and on its own: `onTick?.(look())` skips the look along with the call
  // when there is no `onTick`, and a watcher that never looks takes every wait for a stall.
  const timer = realSetInterval(() => {
    const account = look()
    onTick?.(account)
  }, TICK_MS)
  return {
    read: look,
    stop: () => {
      realClearInterval(timer)
      return look()
    },
  }
}

/**
 * Holds this worker for `ms`, the way an overloaded machine does: nothing in it runs, no timer and
 * no socket, and it spends no CPU while it is held. For tests about what a held worker does.
 */
export function holdWorker(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`

/** What a test is told when its own time ran past its budget. */
export function overBudget(account: Account, budget: number): Error {
  return new Error(
    `Test spent ${seconds(ownTime(account))} of its own time, past its budget of ${seconds(budget)}. ` +
      `Wall clock ${seconds(account.took)}, of which the worker was held ${seconds(account.held)} and not run (own-time budget, #848).`,
  )
}

/**
 * The same account, added to vitest's own timeout, so that a test that reached the ceiling says
 * whether it hung or was held: a hang is own time, a held worker is not.
 */
export function withAccount(error: Error, account: Account, budget: number): Error {
  const own = ownTime(account)
  const verdict = account.held > own ? 'the machine held the worker; the test itself did not hang' : 'the test was running for most of it'
  const said = ` Own time ${seconds(own)} of a ${seconds(budget)} budget; wall clock ${seconds(account.took)}, of which the worker was held ${seconds(account.held)} and not run: ${verdict} (#848).`
  error.message += said
  // vitest's timeout carries the stack of the test's own definition, whose first line is not the
  // message; the line is put right so that every report shows the same sentence.
  if (error.stack) error.stack = `${error.name}: ${error.message}\n${error.stack.split('\n').filter((line) => /^\s+at /.test(line)).join('\n')}`
  return error
}
