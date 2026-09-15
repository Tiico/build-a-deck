import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Launching Chromium is slow and closing it is slow too, and five of these suites run at once.
// A `beforeAll` that says so while `afterAll` keeps vitest's 10 s default is the shape that bit
// us: every test passes and the suite still exits 1, because the teardown hook timed out. That
// failure says nothing about which test broke, so it costs an afternoon to find. Two of them
// were fixed by hand; this is what stops the third from being written.
const DIR = import.meta.dirname
const BUDGET = /60_?000/
// What a hook is given, and the least a test in this class may ask for.
const HOOK_BUDGET = 60_000

const SELF = 'browser-suite-budget.test.ts'

const suites = readdirSync(DIR)
  .filter((name) => name !== SELF && /\.tsx?$/.test(name))
  .map((name) => ({ name, source: readFileSync(join(DIR, name), 'utf8') }))
  .filter((file) => file.source.includes('chromium.launch'))

describe('every suite that launches a browser', () => {
  it('is found at all, so this guard cannot pass by matching nothing', () => {
    expect(suites.length).toBeGreaterThan(5)
  })

  it.each(suites.map((s) => s.name))('gives %s the same budget to close as to open', (name) => {
    const source = suites.find((s) => s.name === name)!.source
    for (const hook of ['beforeAll', 'afterAll']) {
      // The hook's own call, up to the timeout argument that follows its body.
      const at = source.indexOf(`${hook}(`)
      expect(at, `${name} launches a browser but has no ${hook}`).toBeGreaterThan(-1)
      const tail = source.slice(at, source.indexOf('\n})', at) + 40)
      expect(BUDGET.test(tail), `${name}: ${hook} needs an explicit 60_000; vitest's 10 s default flakes under load`).toBe(true)
    }
  })

  // And to the tests themselves, which is the half this guard was missing (#92 again).
  //
  // A suite that launches a browser is excused the jsdom budget — `jsdom-suite-budget` skips
  // anything matching `chromium.launch`, because this class is that one's — and until now all this
  // asked of it was its two hooks. So a file could open Chromium, give the hooks their sixty
  // seconds, and leave every `it` in it on vitest's five-second default. Nothing said so, and
  // nothing failed until the machine was busy.
  //
  // `data-table-csv-pair.test.tsx` was such a file, and it failed as `Test timed out in 5000ms.`
  // in a full run while passing three times out of three on its own. Five seconds is not a budget
  // for work that includes starting a browser: opening one is most of it before the test has done
  // anything, which is why the hooks were given sixty in the first place.
  it.each(suites.map((s) => s.name))('gives every test in %s a budget of its own, not vitest’s default', (name) => {
    const source = suites.find((s) => s.name === name)!.source
    expect(withoutBudget(source), `${name}: a test that opens a browser needs an explicit timeout, as the hooks do`).toEqual([])
  })
})

/**
 * The tests in a suite that are left on the default, named by the line they start on.
 *
 * A test is written in one of two shapes and ends in one of two ways. Written inline it is
 * `it('…', async () => {` and closes `}, 60_000)` — the budget beside the brace. Written out over
 * several lines, which is what a long `it.each` heading needs, the call itself closes on a line
 * of its own and the budget is the last argument above it. Both are found by indentation, which
 * is what tells a test's own ending from every closure inside it; a line a space out either way
 * is still the ending, since that is a slip of the finger and not a different structure.
 *
 * Any number at least the hooks' own is a budget. A test may ask for more — some of these draw a
 * felt at eight seats in four windows — and asking for more is not the fault this looks for. The
 * fault is asking for nothing and being handed five seconds by a default nobody chose.
 */
function withoutBudget(source: string): string[] {
  const lines = source.split('\n')
  const bare: string[] = []
  for (const [i, line] of lines.entries()) {
    const head = /^(\s*)(it|test)\b[^(]*\(/.exec(line)
    if (!head || /\.(todo|skip)\b/.test(line)) continue
    const indent = (head[1] ?? '').length
    const end = lines.findIndex((l, n) => {
      if (n <= i) return false
      const closes = /^(\s*)[})]/.exec(l)
      return closes !== null && Math.abs((closes[1] ?? '').length - indent) <= 1
    })
    if (end === -1) continue
    if (asked(lines, end) < HOOK_BUDGET) bare.push(`${i + 1}: ${line.trim().slice(0, 60)}`)
  }
  return bare
}

/** What the test ending on this line asked for, in milliseconds, or nothing when it asked. */
function asked(lines: readonly string[], end: number): number {
  const beside = /\}\s*,\s*([\d_]+)\s*\)/.exec(lines[end] ?? '')
  // The call written out over several lines: its budget is the argument above the closing paren.
  const above = /^\s*\)/.test(lines[end] ?? '') ? /^\s*([\d_]+)\s*,?\s*$/.exec(lines[end - 1] ?? '') : null
  const said = beside?.[1] ?? above?.[1]
  return said === undefined ? 0 : Number(said.replaceAll('_', ''))
}
