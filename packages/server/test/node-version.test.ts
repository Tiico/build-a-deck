import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

// Which Node the repo runs on (#138).
//
// The number was written in two files that nobody clones the repo to read — the CI workflow and
// the Dockerfile — and nowhere a tool would look. `packageManager` pins pnpm to the patch; Node
// was pinned to nothing at all, so `pnpm install` had no opinion and `pnpm test` on Node 22 gave
// fourteen red tests in `@byd/web` with this as the whole explanation:
//
//   TypeError: object.stream is not a function
//    ❯ node:internal/deps/undici/undici:14976:13
//
// Every one of them sends a jsdom `File` through `fetch`. Node 22's undici calls `object.stream()`
// on the body and jsdom's `Blob` does not answer; Node 26's does. Nothing in that sentence is
// about the product, and nothing in it says the word Node — so the reader goes looking in
// `ProjectClient` for a bug that is not there. It cost an hour before anyone thought to compare
// against CI.
//
// So the number is said where a tool will find it, and this holds the four places it is written
// to each other. It cannot be one place: YAML and a Dockerfile cannot read `package.json`, and
// `.nvmrc` is a file whose whole content is the number. What can be had is that they never drift,
// which is the second half of the issue's own acceptance.
const root = (name: string) => readFileSync(new URL(`../../../${name}`, import.meta.url), 'utf8')

// The major, out of whatever shape the file writes it in: `>=26`, `26`, `26-alpine`.
const major = (said: string): string | null => /(\d+)/.exec(said)?.[1] ?? null

// Every place the repo says which Node it is, and how each of them spells it.
function versions(): Record<string, string | null> {
  const dockerfile = [...root('Dockerfile').matchAll(/^FROM node:(\S+)/gm)].map((m) => m[1]!)
  return {
    'package.json engines.node': major(/"engines"\s*:\s*\{[^}]*?"node"\s*:\s*"([^"]+)"/s.exec(root('package.json'))?.[1] ?? ''),
    '.nvmrc': major(root('.nvmrc')),
    'ci.yml node-version': major(/^\s*node-version:\s*(\S+)/m.exec(root('.github/workflows/ci.yml'))?.[1] ?? ''),
    // Both stages of the image, folded together: two different Nodes in one build is the same
    // drift as two different files saying two things.
    'Dockerfile FROM node': dockerfile.length > 0 && new Set(dockerfile.map(major)).size === 1 ? major(dockerfile[0]!) : null,
  }
}

describe('the Node the repo runs on (#138)', () => {
  it('is the same number wherever the repo says it', () => {
    const said = versions()
    const agreed = said['ci.yml node-version']
    // Named against CI's, because CI's is the one that is actually true: it is the version the
    // gate runs, and every other file is a claim about it.
    expect(said).toEqual(Object.fromEntries(Object.keys(said).map((where) => [where, agreed])))
  })

  it('is said to the tool that could act on it, and not only to CI', () => {
    // `engines` is what makes `pnpm install` say something on a version that will not work, which
    // is the whole of what the issue asks for: a confusing error swapped for one that names the
    // thing that is wrong. `.nvmrc` is what `nvm use` and `fnm` read, so the fix is one command.
    expect(/"engines"\s*:\s*\{[^}]*?"node"\s*:\s*">=\d+"/s.test(root('package.json'))).toBe(true)
    expect(root('.nvmrc').trim()).toMatch(/^\d+$/)
  })

  it('is found at all, so this guard cannot pass by reading four empty files', () => {
    expect(Object.values(versions()).filter((v) => v !== null).length).toBe(4)
  })
})
