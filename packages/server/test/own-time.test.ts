import { execFile } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { createRequire } from 'node:module'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// The guard that holds a test to its budget in the worker's own time (#848), watched from outside.
//
// A test cannot watch itself fail, so the cases are a vitest run of their own: `own-time/` is a
// package in miniature, with the guard installed by its setup file the way every package here
// installs it, a budget of 0.6 s and a ceiling of 3 s. Each case is run in both environments the
// suites here use — Node, and jsdom for the web's — and this reads what the run reported.
const FIXTURE = join(import.meta.dirname, 'own-time')
const VITEST = createRequire(import.meta.url).resolve('vitest/vitest.mjs')
const ENVIRONMENTS = ['node', 'jsdom'] as const

type Outcome = { status: string; failureMessages: string[] }
type Report = { testResults: { name: string; assertionResults: (Outcome & { title: string })[] }[] }

let outcomes: Map<string, Outcome>
let dir: string
beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'byd-own-time-'))
  const out = join(dir, 'report.json')
  // The run being started from is itself a vitest worker; what it says about itself is not the
  // nested run's to inherit.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('VITEST') && key !== 'TEST' && key !== 'NODE_ENV'))
  // Some of the cases are meant to fail, so a non-zero exit is the expected one.
  await promisify(execFile)(process.execPath, [VITEST, 'run', '--config', join(FIXTURE, 'vitest.config.ts'), '--reporter=json', `--outputFile=${out}`], { cwd: FIXTURE, env }).catch(() => undefined)
  const report = JSON.parse(readFileSync(out, 'utf8')) as Report
  outcomes = new Map(report.testResults.flatMap((file) => file.assertionResults.map((t) => [`${basename(file.name).split('.')[0]}: ${t.title}`, t])))
}, 60_000)
afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

const outcome = (environment: string, title: string): Outcome => {
  const found = outcomes.get(`${environment}: ${title}`)
  if (!found) throw new Error(`the fixture run reported no «${title}» under ${environment}; it reported ${[...outcomes.keys()].join(', ')}`)
  return found
}

describe.each(ENVIRONMENTS)('a test held to its budget in own time, under %s', (environment) => {
  it('passes when the machine held its worker past the budget, since that time was never its own', () => {
    expect(outcome(environment, 'held by the machine past its budget')).toMatchObject({ status: 'passed' })
  })

  it('fails a test that waits for what never comes once its own time is spent, not at the ceiling', () => {
    const { status, failureMessages } = outcome(environment, 'waits for something that never comes')
    expect(status).toBe('failed')
    // The guard's sentence, and not the ceiling's: it is the first line of what was reported.
    expect(failureMessages.join('\n')).toMatch(/^Error: Test spent \d+\.\d s of its own time, past its budget of 0\.6 s\. Wall clock \d+\.\d s, of which the worker was held \d+\.\d s/)
  })

  it('fails a test that spent more of its own time than its budget, even one that never yielded', () => {
    const { status, failureMessages } = outcome(environment, 'spends its own time past its budget without letting a timer run')
    expect(status).toBe('failed')
    // The case burns a whole second of the process's CPU, but process.cpuUsage counts every
    // thread, so on a machine with cores to spare that second fits in 0.9 s of wall clock — and
    // own time is wall clock less holds. What is proven is that the guard saw own time past the
    // budget, so that is what is read, not a figure the case happened to round to on one machine.
    const spent = /Test spent (\d+\.\d) s of its own time, past its budget of 0\.6 s/.exec(failureMessages.join('\n'))
    expect(spent, failureMessages.join('\n')).not.toBeNull()
    expect(Number(spent?.[1])).toBeGreaterThan(0.6)
  })

  it('says at the ceiling that it was the machine and not the test, with both clocks', () => {
    const { status, failureMessages } = outcome(environment, 'held by the machine past the ceiling')
    expect(status).toBe('failed')
    expect(failureMessages.join('\n')).toMatch(/Test timed out in 3000ms\..* Own time 0\.\d s of a 0\.6 s budget; wall clock [3-9]\.\d s, of which the worker was held [3-9]\.\d s and not run: the machine held the worker; the test itself did not hang/s)
  })

  it('leaves a test that names its own timeout to vitest’s wall clock, as it asked', () => {
    const { status, failureMessages } = outcome(environment, 'names a wall-clock timeout of its own')
    expect(status).toBe('failed')
    // vitest's own failure, with nothing of the guard's added to it.
    expect(failureMessages.join('\n')).not.toMatch(/own time/i)
  })
})
