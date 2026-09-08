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
})
