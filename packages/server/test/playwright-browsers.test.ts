import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import dns from 'node:dns'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BROWSERS, browsersReady } from '../../../test-support/playwright-browsers.js'

// The repo's tests keep their own Playwright browsers (#1508).
//
// They used to share `~/Library/Caches/ms-playwright` with every other project on the Mac. On
// 2026-11-01 another project's `playwright install` removed the Chromium this repo's Playwright
// asks for, as it removes every version it does not know, and its stalled install then held the
// cache's `__dirlock` for over an hour. Every agent's gate went red in the Chromium suites and
// could not install again. So the cache is `.playwright-browsers/` in the worktree, and what is
// held here is that every way the repo starts Playwright goes there.
const root = (name: string) => new URL(`../../../${name}`, import.meta.url)
const read = (name: string) => readFileSync(root(name), 'utf8')

const PACKAGES = readdirSync(root('packages'), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)

// A package launches Chromium in its tests when it has Playwright, or the renderer that brings it.
const launchesChromium = (pkg: string): boolean => {
  const json = JSON.parse(read(`packages/${pkg}/package.json`)) as Record<string, Record<string, string> | undefined>
  const deps = { ...json['dependencies'], ...json['devDependencies'] }
  return ['playwright', '@playwright/test', '@byd/render'].some((name) => name in deps)
}

const configOf = (pkg: string): string => {
  for (const name of ['playwright.config.ts', 'vitest.config.ts', 'vite.config.ts']) {
    try {
      return read(`packages/${pkg}/${name}`)
    } catch {
      // not this one
    }
  }
  throw new Error(`packages/${pkg} has no test config`)
}

describe("the repo's own Playwright browsers (#1508)", () => {
  it('is a directory in this checkout', () => {
    expect(BROWSERS).toBe(fileURLToPath(root('.playwright-browsers')))
  })

  it('is found in the packages that launch Chromium, so the gate below cannot pass on none', () => {
    expect(PACKAGES.filter(launchesChromium).sort()).toEqual(['e2e', 'render', 'server', 'web'])
  })

  it('is where every package that launches Chromium sends Playwright, and checked before the run', () => {
    for (const pkg of PACKAGES.filter(launchesChromium)) {
      const config = configOf(pkg)
      // Imported by the config, so the variable is on the process before any worker is born.
      expect(config, `packages/${pkg} does not point Playwright at the repo's cache`).toMatch(/import\s+'..\/..\/test-support\/playwright-browsers\.js'/)
    }
    // And checked once before the suites run, so a missing browser is one message and not every
    // Chromium suite red. The vitest packages list the check; the E2E suite's own setup calls it.
    for (const pkg of ['render', 'server', 'web']) expect(configOf(pkg)).toContain("'../../test-support/playwright-browsers.ts'")
    expect(read('packages/e2e/global-setup.ts')).toMatch(/await browsersReady\(\)/)
  })

  it('is the variable this worker was born with', () => {
    expect(process.env['PLAYWRIGHT_BROWSERS_PATH']).toBe(BROWSERS)
  })

  it('is kept out of git and out of every image build context', () => {
    const lines = (text: string) => text.split('\n').map((l) => l.trim())
    expect(lines(read('.gitignore'))).toContain('/.playwright-browsers/')
    expect(lines(read('.dockerignore'))).toContain('.playwright-browsers')
  })

  it('is filled by `pnpm browsers`, which `pnpm install` runs outside CI', () => {
    const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts
    expect(scripts['browsers']).toBe('node test-support/playwright-browsers.ts')
    // An image build copies package.json without test-support, so the step must step aside there.
    expect(scripts['postinstall']).toBe('test ! -f test-support/playwright-browsers.ts || node test-support/playwright-browsers.ts --after-install')
    // CI installs into the same place, through the same script, with the system packages beside.
    expect(read('.github/actions/setup/action.yml')).toMatch(/pnpm browsers --with-deps/)
  })

  it('says a missing browser once, with the command that fixes it', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'byd-1508-'))
    try {
      const said = await browsersReady({ at: empty }).then(
        () => null,
        (error: unknown) => (error as Error).message,
      )
      expect(said).toContain('pnpm browsers')
      expect(said).toContain(join(empty, 'chromium_headless_shell-'))
      // Not Playwright's own advice, which installs into the shared cache this issue left.
      expect(said).not.toContain('npx playwright install')
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  }, 30_000)

  // This Mac's IPv6 went nowhere on 2026-11-01, and Playwright's downloader tries it first and
  // gives up at five seconds; the install looks hosts up over IPv4 when they have it.
  it("installs over IPv4 when a host has it, and only in the install's own processes", async () => {
    const own = (await dns.promises.lookup('localhost', { all: true, family: 6 }).catch(() => [])).length
    const script = `import('node:dns').then(async ({ default: dns }) => process.stdout.write(JSON.stringify((await dns.promises.lookup('localhost', { all: true, family: 6 })).length)))`
    const module = fileURLToPath(new URL('../../../test-support/playwright-browsers.ts', import.meta.url))
    const v6Addresses = (flag: string | undefined) => {
      const env = { ...process.env } as Record<string, string>
      delete env['BYD_BROWSERS_IPV4']
      if (flag) env['BYD_BROWSERS_IPV4'] = flag
      return Number(execFileSync(process.execPath, ['--import', module, '-e', script], { env, encoding: 'utf8' }))
    }
    expect(v6Addresses('1')).toBe(0)
    // Without the flag nothing is touched: localhost's ::1, where the machine has one, is still
    // there for every test.
    expect(v6Addresses(undefined)).toBe(own)
  })

  it('passes when the browser is there', async () => {
    await expect(browsersReady()).resolves.toBeUndefined()
  }, 30_000)
})
