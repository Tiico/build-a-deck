import { spawn, spawnSync } from 'node:child_process'
import dns from 'node:dns'
import { readdirSync, readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// The repo's tests keep their own Playwright browsers (#1508).
//
// They used to share `~/Library/Caches/ms-playwright` with every other project on the machine. On
// 2026-11-01 another project's `playwright install` removed the Chromium this repo's Playwright
// asks for — it removes every version it does not know — and its stalled install then held the
// cache's `__dirlock` for over an hour, so no gate here could install it back. The cache is now
// `.playwright-browsers/` in the worktree: gitignored, kept out of the images' build context, and
// nobody else's to empty.
//
// Importing this module points Playwright there. Every test config that launches Chromium imports
// it first thing, so the variable is on the process before any worker, stack or render worker is
// born; Playwright reads it once, when it first loads, so later is too late. The production images
// never import it: the render worker's image brings its own Chromium (Dockerfile.render).
//
// Run as a script it installs what the repo's Playwright asks for (`pnpm browsers`), and
// `pnpm install` runs it the same way outside CI. As a vitest global setup it checks the browser
// is there before any suite starts.

export const BROWSERS = fileURLToPath(new URL('../.playwright-browsers', import.meta.url))
process.env['PLAYWRIGHT_BROWSERS_PATH'] = BROWSERS

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const FIX = 'pnpm browsers'

// The install's downloads go over IPv4 when there is IPv4 (#1508).
//
// Playwright 1.63 looks each host up as IPv6 first and races the families itself, and on Node 26
// the race's five-second attempt clock fires the request's own timeout: on a network where IPv6
// goes nowhere, which this Mac's did on 2026-11-01 (`curl -6` to the CDN timed out, `curl -4` took
// 0.1 s), every download fails at five seconds with "timed out after 30000ms", five tries in a
// row. That is very likely what left the other project's install hanging on the shared cache. So
// the install runs with this module imported, and its download processes inherit it: a lookup
// for IPv6 answers nothing when the host has an IPv4 address, and answers as before when it has
// only IPv6.
const IPV4_INSTALL = 'BYD_BROWSERS_IPV4'
if (process.env[IPV4_INSTALL]) {
  const lookup = dns.promises.lookup.bind(dns.promises) as (host: string, options: object) => Promise<unknown>
  const patched = async (host: string, options: { family?: number; all?: boolean } = {}) => {
    if (options.family === 6 && options.all) {
      const v4 = (await lookup(host, { all: true, family: 4 }).catch(() => [])) as unknown[]
      if (v4.length > 0) return []
    }
    return lookup(host, options)
  }
  ;(dns.promises as { lookup: unknown }).lookup = patched
}

// The tests run headless and record video of a failure, which is the headless shell and ffmpeg;
// the full Chromium beside it is twice the download and nothing here opens a window.
const WHAT = ['--only-shell', 'chromium']

// Each Playwright the workspace's packages resolve, as the directory of its `playwright-core`.
// There is one today; if two packages ever drift apart, each needs its own browser.
function cores(): string[] {
  const found = new Set<string>()
  for (const pkg of readdirSync(join(ROOT, 'packages'))) {
    const from = createRequire(join(ROOT, 'packages', pkg, 'package.json'))
    for (const name of ['playwright', '@playwright/test']) {
      try {
        const playwright = dirname(from.resolve(`${name}/package.json`))
        found.add(realpathSync(dirname(createRequire(join(playwright, 'package.json')).resolve('playwright-core/package.json'))))
      } catch {
        // not one of this package's
      }
    }
  }
  if (found.size === 0) throw new Error('no package in the workspace resolves Playwright; has `pnpm install` run?')
  return [...found].sort()
}

const versionOf = (core: string) => (JSON.parse(readFileSync(join(core, 'package.json'), 'utf8')) as { version: string }).version

// What is said when a browser is not there: what is missing, and the one command that fixes it.
// Playwright's own message advises `npx playwright install`, which from a shell without this
// variable installs into the shared cache, and so fixes nothing.
const missing = (version: string, path: string) =>
  [
    `Playwright ${version}'s browser is not in this worktree's own cache (#1508):`,
    `  ${path}`,
    '',
    'The repo keeps its browsers in .playwright-browsers/, where no other project can remove them. Install them with:',
    '',
    `  ${FIX}`,
    '',
  ].join('\n')

/**
 * Whether every Playwright in the workspace can launch its Chromium from the cache.
 *
 * Each launch is in a process of its own, born with the variable, the way a test worker is: the
 * process asking may already have loaded Playwright with another idea of where browsers live.
 */
export async function browsersReady({ at = BROWSERS }: { at?: string } = {}): Promise<void> {
  for (const core of cores()) {
    const script = `require(${JSON.stringify(core)}).chromium.launch().then((b) => b.close()).catch((e) => { process.stderr.write(String(e && e.message)); process.exit(1) })`
    const said = await new Promise<{ code: number | null; err: string }>((resolve) => {
      const child = spawn(process.execPath, ['-e', script], { env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: at }, stdio: ['ignore', 'ignore', 'pipe'] })
      let err = ''
      child.stderr.on('data', (b: Buffer) => (err += String(b)))
      child.on('exit', (code) => resolve({ code, err }))
    })
    if (said.code === 0) continue
    const absent = /Executable doesn't exist at (.+)/.exec(said.err)
    if (absent) throw new Error(missing(versionOf(core), absent[1]?.trim() ?? at))
    throw new Error(`Chromium from ${at} did not launch:\n${said.err}`)
  }
}

export default async function setup(): Promise<void> {
  await browsersReady()
}

// `pnpm browsers [playwright install options]`, and `--after-install` from `pnpm install`.
function install(args: string[]): number {
  const afterInstall = args.includes('--after-install')
  const pass = args.filter((a) => a !== '--after-install')
  // CI installs in its setup action, with the system packages beside (`pnpm browsers --with-deps`).
  if (afterInstall && process.env['CI']) return 0
  for (const core of cores()) {
    console.log(`Playwright ${versionOf(core)}: installing its Chromium into ${BROWSERS}`)
    const run = spawnSync(process.execPath, ['--import', fileURLToPath(import.meta.url), join(core, 'cli.js'), 'install', ...WHAT, ...pass], {
      stdio: 'inherit',
      env: { ...process.env, [IPV4_INSTALL]: '1' },
    })
    if (run.status !== 0) {
      if (!afterInstall) return run.status ?? 1
      // An install without a network must still install the dependencies; the suites will say
      // the browser is missing, with this same command.
      console.warn(`\nThe browsers did not install (exit ${run.status}). Run \`${FIX}\` before the tests.\n`)
      return 0
    }
  }
  return 0
}

const runAsScript = (() => {
  try {
    return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
})()
if (runAsScript) process.exit(install(process.argv.slice(2)))
