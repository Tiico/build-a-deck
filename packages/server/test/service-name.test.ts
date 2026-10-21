import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

// The service is Deckster, on deckster.se (A5, 2026-10-21).
//
// The .com is somebody else's. A link, a sender address or an example written with it sends a
// reader — or a login mail — to a stranger's site, and it reads right to everyone who glances at
// it. So the repo never says it, not even as an example.
//
// And the old working name stays out of everything a user can read: the tab, the login card,
// the mail, the credit on a bundled icon. The repo, its packages, `BYD_*` and the images keep
// theirs; those are the workshop's names, not the product's.
const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const SKIPS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.claude', '.vite', 'test-results', 'playwright-report', '.idea'])
const TEXT = /\.(md|ts|tsx|js|mjs|css|html|json|webmanifest|ya?ml|example|service|timer|sh|svg|txt)$|^(Dockerfile.*|\.env\..*)$/

function files(dir: string, seen: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIPS.has(entry.name)) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) files(path, seen)
    else if (TEXT.test(entry.name)) seen.push(path)
  }
  return seen
}

const rel = (path: string) => path.slice(ROOT.length).split(sep).join('/')

function said(paths: string[], word: RegExp): string[] {
  return paths.flatMap((path) =>
    readFileSync(path, 'utf8')
      .split('\n')
      .flatMap((line, i) => (word.test(line) ? [`${rel(path)}:${i + 1}`] : [])),
  )
}

// Built from parts, so this file does not say what it forbids.
const DOT_COM = new RegExp(['deckster', 'com'].join('\\.'), 'i')
const OLD_NAME = new RegExp(['build', 'your', 'deck'].join('-'), 'i')

// What a user reads: the apps' sources, the page shell and what the browser installs.
const USER_FACING = [join(ROOT, 'packages', 'web', 'index.html'), ...files(join(ROOT, 'packages', 'web', 'public'))]
  .concat(readdirSync(join(ROOT, 'packages'), { withFileTypes: true }).flatMap((p) => {
    if (!p.isDirectory()) return []
    try {
      return files(join(ROOT, 'packages', p.name, 'src'))
    } catch {
      return []
    }
  }))

describe('the service is Deckster on deckster.se (A5)', () => {
  it('never says the .com, which is somebody else’s', () => {
    expect(said(files(ROOT), DOT_COM)).toEqual([])
  })

  it('says Deckster wherever a user can read the name', () => {
    expect(said(USER_FACING, OLD_NAME)).toEqual([])
  })

  it('is reading the repo and the user-facing sources at all, so neither check passes on emptiness', () => {
    expect(files(ROOT).map(rel)).toContain('DESIGN-BESLUT.md')
    expect(USER_FACING.map(rel)).toEqual(expect.arrayContaining(['packages/web/index.html', 'packages/web/src/status/title.ts', 'packages/server/src/auth.ts']))
    expect(said(USER_FACING, /Deckster/).length).toBeGreaterThan(0)
  })
})
