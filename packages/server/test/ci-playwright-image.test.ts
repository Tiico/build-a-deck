import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

// CI runs in Playwright's own image (#1125).
//
// `playwright install --with-deps chromium` fetched its 26 MB of apt packages at 57 kB/s from the
// runner's mirror, which made it the slowest step in CI after the suites themselves: up to eight
// minutes, for a browser that downloads in eight seconds. The image has the packages and the
// browser already. What it does not have is a way to know which Playwright the lockfile resolved:
// the image is named by version, and an image one release behind ships a Chromium that the
// installed `playwright` will not launch. So the tag is held to the installed version here.
const root = (name: string) => readFileSync(new URL(`../../../${name}`, import.meta.url), 'utf8')

// The Playwright the repo actually runs, as installed for the packages that launch it.
const installed = (from: string): string => {
  const require = createRequire(new URL(`../../../packages/${from}/package.json`, import.meta.url))
  return (require('playwright/package.json') as { version: string }).version
}

const images = (): string[] =>
  [...root('.github/workflows/ci.yml').matchAll(/mcr\.microsoft\.com\/playwright:v([\d.]+)-\w+/g)].map((m) => m[1]!)

describe("CI's Playwright image (#1125)", () => {
  it('is named, so this guard cannot pass by reading a workflow that has none', () => {
    expect(images().length).toBeGreaterThan(0)
  })

  it('is the Playwright the lockfile installed, wherever the workflow names it', () => {
    const versions = new Set(['render', 'web', 'e2e'].map(installed))
    expect(versions.size).toBe(1)
    expect(new Set(images())).toEqual(versions)
  })

  it('is the only way CI gets a browser: nothing installs one beside it', () => {
    expect(root('.github/workflows/ci.yml')).not.toMatch(/playwright install/)
  })
})
