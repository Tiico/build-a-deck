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

const packages = readdirSync(join(ROOT, 'packages'), { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .filter((name) => existsSync(join(ROOT, 'packages', name, 'test')) && launchesChromium(join(ROOT, 'packages', name, 'test')))

describe('every package whose tests launch a browser', () => {
  it('is found at all, so this guard cannot pass by matching nothing', () => {
    expect(packages).toEqual(expect.arrayContaining(['web', 'server', 'render']))
  })

  it.each(packages)('has %s take the machine before the run', (name) => {
    const config = ['vite.config.ts', 'vitest.config.ts'].map((f) => join(ROOT, 'packages', name, f)).find(existsSync)
    expect(config, `${name} launches a browser but has no vite or vitest config to wire the lock into`).toBeTypeOf('string')
    const source = readFileSync(config!, 'utf8')
    expect(source.includes('globalSetup') && source.includes(LOCK), `${name}: its config needs globalSetup: ['../../${LOCK}'] — see that file for what happens without it`).toBe(true)
  })
})
