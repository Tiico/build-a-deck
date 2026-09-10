import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// A source file with a NUL byte in it is not a source file with a small mistake in it: `grep` and
// `rg` decide a file is binary by looking for one, and a binary file is skipped in silence. The
// whole file — every function, every comment, every name — falls out of codebase search at once,
// and nothing says so. `grep -n onAddField TemplateCanvas.tsx` exits 1 with no output, and the
// reader concludes the symbol does not exist.
//
// It got in as a string literal, which is the only way it can: a sentinel written `'\0new'` in an
// editor that pasted the character instead of the escape. So the rule is about the bytes in the
// file rather than about any one literal, and it is checked here rather than by review, because a
// diff renders the byte as a space and review is exactly what it already survived.
//
// Tab and newline are the two control characters source is made of; the rest have no business in
// a document a person reads. Whatever a sentinel needs to be, it can be that without them. The
// check counts code points rather than matching a pattern, so this file does not have to contain
// the very characters it is here to keep out.
const PACKAGES = join(import.meta.dirname, '..', '..')
const SOURCE = /\.(ts|tsx|css|html)$/
const ALLOWED = new Set(['\t'.charCodeAt(0), '\n'.charCodeAt(0)])
const isControl = (code: number) => (code < 0x20 || code === 0x7f) && !ALLOWED.has(code)

function sourcesUnder(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sourcesUnder(path))
    else if (SOURCE.test(entry.name)) out.push(path)
  }
  return out
}

const sources = sourcesUnder(PACKAGES)
const controlsIn = (text: string): number[] => [...text].map((c) => c.charCodeAt(0)).filter(isControl)

describe('every source file in the repository', () => {
  it('is found at all, so this guard cannot pass by matching nothing', () => {
    expect(sources.length).toBeGreaterThan(200)
  })

  it('would notice a control character if there were one, wherever in the file it stood', () => {
    // The guard measured against a file it is given rather than against the tree: without this,
    // an emptied list above and a silent guard here read the same from the outside.
    expect(controlsIn('const NEW_FIELD = \u0000new')).toEqual([0])
    expect(controlsIn('a\tb\nc')).toEqual([])
  })

  it('stays a text file, so that searching the codebase finds what is in it', () => {
    const binary = sources
      .filter((path) => controlsIn(readFileSync(path, 'utf8')).length > 0)
      .map((path) => relative(PACKAGES, path))
    expect(binary, 'a control character here makes grep call the whole file binary and skip it without a word').toEqual([])
  })
})
