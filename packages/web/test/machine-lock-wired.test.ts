import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// The other half of the budget guards (`jsdom-suite-budget`, `browser-suite-budget`, and the
// server's `render-budget`): those say how long a test may take, and this says that the machine
// it is measured against has been asked for. A package that launches Chromium without taking the
// machine first is a package that will one day be measured against a box running three other
// suites, which is exactly the run that could not be merged on 2026-09-15.
//
// Written down here rather than remembered, because the cost of forgetting is not a failing test
// — it is a failing test in a branch that touched nothing near it.
const ROOT = join(import.meta.dirname, '..', '..', '..')
const LOCK = 'test-support/one-suite-at-a-time.ts'

const launchesChromium = (dir: string): boolean => {
  const found: string[] = []
  const walk = (at: string) => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      const path = join(at, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (/\.tsx?$/.test(entry.name)) found.push(readFileSync(path, 'utf8'))
    }
  }
  walk(dir)
  // The guards themselves talk about launching without doing it, so the word alone is not the
  // question: what counts is a call.
  return found.some((source) => /chromium\.launch\(\)|Renderer\.launch\(\)|renderAll\(\)/.test(source))
}

// A Playwright package launches a browser for every test it runs and never writes the call: the
// runner does it. Left to the search above it would pass this guard by saying nothing, which is
// the one way a guard can be worse than no guard — `@byd/e2e` builds an app, starts a database, a
// server and a browser, and is precisely the package that must not be measured against a machine
// carrying three other suites.
const runsPlaywright = (name: string): boolean => existsSync(join(ROOT, 'packages', name, 'playwright.config.ts'))

const packages = readdirSync(join(ROOT, 'packages'), { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .filter((name) => existsSync(join(ROOT, 'packages', name, 'test')) && (launchesChromium(join(ROOT, 'packages', name, 'test')) || runsPlaywright(name)))

/** The setup files a config points at, so a lock taken one file deeper still counts. */
const setupFilesOf = (name: string, source: string): string[] =>
  [...source.matchAll(/globalSetup:\s*\[?\s*'([^']+)'/g)]
    .map((m) => join(ROOT, 'packages', name, m[1] ?? ''))
    .filter((file) => existsSync(file))

describe('every package whose tests launch a browser', () => {
  it('is found at all, so this guard cannot pass by matching nothing', () => {
    expect(packages).toEqual(expect.arrayContaining(['web', 'server', 'render', 'e2e']))
  })

  it.each(packages)('has %s take the machine before the run', (name) => {
    const config = ['vite.config.ts', 'vitest.config.ts', 'playwright.config.ts'].map((f) => join(ROOT, 'packages', name, f)).find(existsSync)
    expect(config, `${name} launches a browser but has no config to wire the lock into`).toBeTypeOf('string')
    const source = readFileSync(config!, 'utf8')
    expect(source.includes('globalSetup'), `${name}: its config needs a globalSetup — see ${LOCK} for what happens without it`).toBe(true)
    // Vitest names the lock in the config itself; Playwright takes one global setup file, so the
    // lock is taken inside it. Either is the machine asked for, and neither is a way around the
    // other: what is checked is that the words are in the file that actually runs first.
    const wired = source.includes(LOCK) || setupFilesOf(name, source).some((file) => readFileSync(file, 'utf8').includes(LOCK))
    expect(wired, `${name}: its run needs to call takeTheMachine() from ${LOCK} — see that file for what happens without it`).toBe(true)
  })
})
