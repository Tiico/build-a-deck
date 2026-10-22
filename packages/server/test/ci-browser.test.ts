import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

// Where CI gets its Chromium (#1125).
//
// `playwright install --with-deps chromium` fetched its apt packages at 57 kB/s from the runner's
// mirror: up to eight minutes, for a browser that downloads in eight seconds. Playwright's own
// image has all of it already, and was tried first. It turned 31 measurements red that are green
// on the runner — `editor-notice-band`, `table-antal-rail`, `data-table-layout` — because the
// image has other fonts than the runner, and this repo's surfaces are measured against the fonts
// CI has (#95, #1078). So the runner stays, and the packages are kept between runs instead.
const root = (name: string) => readFileSync(new URL(`../../../${name}`, import.meta.url), 'utf8')
const workflow = () => root('.github/workflows/ci.yml')
const setup = () => root('.github/actions/setup/action.yml')

describe("CI's browser (#1125)", () => {
  it('runs on the runner itself, whose fonts the measurements were made against', () => {
    expect(workflow()).not.toMatch(/^\s*container:/m)
  })

  it('is installed in one place, with its system packages kept between runs', () => {
    expect(workflow()).not.toMatch(/playwright install/)
    expect(setup()).toMatch(/playwright install --with-deps chromium/)
    expect(setup()).toMatch(/uses: actions\/cache@/)
    // The runner's apt throws a package away once it is installed; kept, the cache has something to hold.
    expect(setup()).toMatch(/Keep-Downloaded-Packages "true"/)
  })
})
