import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

// How long a CI job may run (#1421).
//
// A job with no `timeout-minutes` gets GitHub's default of six hours. On 2026-10-26 the `unit`
// job of #1402 sat four hours in `apt-get update`: the runner's mirror stopped answering in the
// middle of `playwright install --with-deps`, and nothing in the job had a clock. The re-run was
// green in four minutes. Meanwhile the pull request, and the agents waiting on it, waited too.
//
// So every job carries a limit, and the apt step carries its own, shorter one with a second try.
// The numbers and why they are what they are live as comments in the workflow; this only holds
// that there is one, so that a job added tomorrow cannot be added without.
const root = (name: string) => readFileSync(new URL(`../../../${name}`, import.meta.url), 'utf8')
const workflow = () => root('.github/workflows/ci.yml')
const setup = () => root('.github/actions/setup/action.yml')

// Each job under `jobs:` with the text of its own block. The workflow is plain two-space YAML, so
// a job is a line at two spaces and its keys sit at four.
function jobs(): Record<string, string> {
  const lines = workflow().split('\n')
  const start = lines.findIndex((line) => /^jobs:\s*$/.test(line))
  const found: Record<string, string[]> = {}
  let current: string | null = null
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break
    const job = /^ {2}([\w-]+):\s*$/.exec(line)
    if (job) {
      current = job[1]!
      found[current] = []
    } else if (current) found[current]!.push(line)
  }
  return Object.fromEntries(Object.entries(found).map(([name, body]) => [name, body.join('\n')]))
}

// The job's own limit: a key at four spaces, not one a step inside it happens to carry.
const limit = (body: string): number | null => {
  const said = /^ {4}timeout-minutes:\s*(\d+)\s*(#.*)?$/m.exec(body)?.[1]
  return said === undefined ? null : Number(said)
}

describe("CI's time limits (#1421)", () => {
  it('finds the jobs, so this cannot pass by reading none', () => {
    expect(Object.keys(jobs())).toEqual(expect.arrayContaining(['static', 'unit', 'web', 'e2e', 'check', 'images']))
  })

  it('gives every job a timeout-minutes well under the six hours GitHub would give it', () => {
    const limits = Object.fromEntries(Object.entries(jobs()).map(([name, body]) => [name, limit(body)]))
    const missing = Object.entries(limits).filter(([, minutes]) => minutes === null || minutes <= 0 || minutes > 60)
    expect(missing, `jobs without a sane timeout-minutes: ${JSON.stringify(Object.fromEntries(missing))}`).toEqual([])
  })

  it('gives the apt and Playwright install its own shorter clock, and one more try', () => {
    const install = setup()
    // A composite action's step cannot say timeout-minutes, so the clock is coreutils' `timeout`.
    expect(install).toMatch(/timeout [^\n]*pnpm exec playwright install --with-deps chromium/)
    expect(install).toMatch(/for attempt in 1 2\b/)
  })
})
