import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PG_TEST_BUDGET } from '../../../test-support/pg-budget.js'
import { TEST_CEILING } from '../../../test-support/own-time.js'
import { ownTimeBudget } from '../../../test-support/own-time-guard.js'

// What the budget is, and why it is that number, is written where the number lives, in
// `test-support/pg-budget.ts`. This is what makes it reach every suite the number is for,
// including the next one written.
//
// The class is the suites that stand a schema up in a real Postgres: they read the connection
// string out of the environment, migrate a schema of their own, work against it and drop it
// again. Their own arithmetic is nothing; what they spend is waiting for another process to be
// given a core, and in CI that process is a service container sharing a couple of cores with the
// job it serves, right after the web suite has driven a Chromium through them. Vitest's
// five-second default was written against no work in particular and is the wrong number for this
// work: it already cut `history` off mid-save in a pull request that could not reach it (#139).
// And fifteen seconds of wall clock was the wrong kind of number for it too: at a load of 128 the
// deep history took 1.3 s of its own and fell on its fifteen (#848). So the budget is the worker's
// own time, given to every test in the package by its setup file, with vitest's own timeout
// raised to a ceiling above it (`test-support/own-time.ts`).
//
// The budget used to be a sentence at the top of each suite. Now it is the package's, so a member
// of the class has to live in a package that holds its tests to it, and must not put a wall clock
// back with `vi.setConfig` — which is what every member is read for.
//
// It walks every package rather than this one, because the class has a member in `@byd/render`
// too and a guard written twice is a guard that rots in one of its copies. `report-on-disk-wired`
// in the web package watches the whole workspace the same way and for the same reason.
const ROOT = join(import.meta.dirname, '..', '..', '..')
const SELF = 'server/test/pg-suite-budget.test.ts'

// Written as patterns rather than as the plain words, so that a guard reading this file does not
// take it for a member of the class it watches. Anything below that needs the words themselves
// spells them out of the pattern.
const READS_THE_CONNECTION_STRING = /process\.env\['DATABASE_URL'\]/
const STANDS_A_SCHEMA_UP = /\.migrate\(\)|\.dropSchema\(\)/
const spelled = (pattern: RegExp) => pattern.source.replaceAll('\\', '')
// A wall clock of its own, set for the whole file, in place of the package's budget.
const SETS_A_WALL_CLOCK = /vi\.setConfig\(\{[^}]*testTimeout/
// What a package says to hold its tests to the budget: its setup file installs the guard with it,
// and its config gives vitest the ceiling.
const HOLDS = 'holdTestsToOwnTime(PG_TEST_BUDGET)'
const CEILING = 'testTimeout: TEST_CEILING'
const holds = (pkg: string): boolean => {
  const read = (file: string) => (existsSync(join(ROOT, 'packages', pkg, file)) ? readFileSync(join(ROOT, 'packages', pkg, file), 'utf8') : '')
  const config = read('vitest.config.ts')
  return read('test/setup.ts').includes(HOLDS) && config.includes(CEILING) && /setupFiles:\s*\[[^\]]*'\.\/test\/setup\.ts'/.test(config)
}

// Naming `DATABASE_URL` is not on its own enough to be in the class: `deploy` asserts that the
// stack hands the container that variable and never opens a connection in its life. The class is
// the suites that do the work, so both halves are asked for.
const inTheClass = (source: string) =>
  READS_THE_CONNECTION_STRING.test(source) && STANDS_A_SCHEMA_UP.test(source)

const testDirs = readdirSync(join(ROOT, 'packages'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => existsSync(join(ROOT, 'packages', name, 'test')))

const suites = testDirs
  .flatMap((pkg) =>
    readdirSync(join(ROOT, 'packages', pkg, 'test'))
      .filter((file) => /\.test\.tsx?$/.test(file))
      .map((file) => ({ name: `${pkg}/test/${file}`, source: readFileSync(join(ROOT, 'packages', pkg, 'test', file), 'utf8') })))
  .filter((file) => file.name !== SELF && inTheClass(file.source))

describe('every suite that stands a schema up in a real Postgres', () => {
  it('is found at all, so this guard cannot pass by matching nothing', () => {
    expect(suites.length).toBeGreaterThanOrEqual(5)
    // Counted above and named here. A count drifts quietly — "at least five" goes on passing
    // while the five suites this was written for are renamed out from under it — so every member
    // of the class as it stands today is asked for by name, and a rename has to come past this.
    expect(suites.map((s) => s.name)).toEqual(expect.arrayContaining([
      'server/test/history.test.ts',
      'server/test/store-postgres.test.ts',
      'server/test/assets-postgres.test.ts',
      'server/test/store-guests.test.ts',
      'render/test/store-postgres.test.ts',
    ]))
  })

  it('would notice a suite that had no budget, and would leave the others alone', () => {
    // The guard measured against sources it is handed rather than against the tree. Without this,
    // a reading that had stopped recognising anything and a tree that was wholly in order say the
    // same thing from the outside, which is the failure a guard made of `readdirSync` dies of.
    const aSchemaOfItsOwn = `const url = ${spelled(READS_THE_CONNECTION_STRING)}\nawait store.migrate()\nawait store.dropSchema()`
    expect(inTheClass(aSchemaOfItsOwn)).toBe(true)
    // The stack's own configuration names the variable and opens nothing; `deploy` is that test.
    expect(inTheClass("expect(Object.keys(env)).toEqual(expect.arrayContaining(['DATABASE_URL']))")).toBe(false)
    // And a store held in memory is the same suite's other half, which answers in microseconds.
    expect(inTheClass("const store = new MemoryLogStore()\nawait store.migrate()")).toBe(false)
    // Then the sentence the suites are read for, which puts the wall clock back.
    expect(SETS_A_WALL_CLOCK.test(aSchemaOfItsOwn)).toBe(false)
    expect(SETS_A_WALL_CLOCK.test(`${spelled(/vi\.setConfig\(\{ testTimeout: PG_TEST_BUDGET \}\)/)}\n\n${aSchemaOfItsOwn}`)).toBe(true)
  })

  it('runs every test here on the ceiling, held to the budget in its own time', ({ task }) => {
    expect(task.timeout, 'vitest.config.ts gives vitest the ceiling, and the budget is the guard’s').toBe(TEST_CEILING)
    expect(ownTimeBudget(), 'test/setup.ts holds every test to the budget in the worker’s own time').toBe(PG_TEST_BUDGET)
  })

  it.each(suites.map((s) => s.name))('holds %s to the budget in own time rather than a wall clock', (name) => {
    const source = suites.find((s) => s.name === name)!.source
    const pkg = name.split('/')[0]!
    // Asked as a yes or a no rather than as `toContain`, so that a suite in the wrong shape is told
    // so in a line instead of having its whole source printed back at it.
    expect(holds(pkg), `${name} works against a real Postgres, so @byd/${pkg} has to hold its tests to the budget: \`${HOLDS}\` in test/setup.ts, and \`${CEILING}\` with that setup file in vitest.config.ts — see test-support/own-time.ts`).toBe(true)
    expect(SETS_A_WALL_CLOCK.test(source), `${name} sets vitest's testTimeout itself, which replaces the package's own-time budget with a wall clock that a held worker runs out of (#848); leave it out`).toBe(false)
  })

  it('keeps the budget between the measurement below it and the hang above it', () => {
    // The floor: the class has exactly one loaded observation, and it is a lower bound — the body
    // that failed in CI took at least the five seconds it was cut off at. Three times the worst
    // known figure is the same rule the jsdom class keeps over its own.
    expect(PG_TEST_BUDGET, 'a budget the run that already failed could reach is not a budget').toBeGreaterThanOrEqual(3 * 5_000)
    // The ceiling: this is where the line against a hang is drawn. A test in this class does
    // milliseconds of work and then waits, so it may not ask for longer than a jsdom test that
    // renders a whole app is given, let alone longer than opening a browser.
    expect(PG_TEST_BUDGET, 'a test that waits on a query may not take longer to give up than one that renders an app').toBeLessThan(20_000)
    // And the ceiling over it is a ceiling: far enough above that a working test never meets it.
    expect(TEST_CEILING, 'vitest’s timeout is the backstop for a hang the guard cannot see, not a second budget').toBeGreaterThanOrEqual(5 * PG_TEST_BUDGET)
  })
})
