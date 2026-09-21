import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// What an L-number points at (#375).
//
// An L-number is a decision's identity: it is how the decision is referred to in the code, in the
// tests, in the issues and in the other decisions. Two entries under the same number means «L14»
// no longer names anything in particular, and a reader who follows a reference lands on the wrong
// decision about half the time.
//
// It is a repeated mistake and not a one-off: whoever implements writes the entry, so a number
// reserved in a plan is taken by a parallel branch before the entry is written, and every entry
// lands on the same anchor at the end of the file. #366 and #219 both wrote «L40» within the same
// hour. That one was caught because somebody happened to look during a rebase; the L14 collision
// sat on `main` for a week. So the check is a test rather than a habit.
const root = (name: string) => readFileSync(new URL(`../../../${name}`, import.meta.url), 'utf8')
const ROOT = new URL('../../../', import.meta.url).pathname

type Entry = { number: number; title: string; line: number }

// The entries, as the document writes them: `### L14. Ett grepp är ett steg tillbaka (2026-09-14)`.
function entries(): Entry[] {
  return root('DESIGN-BESLUT.md')
    .split('\n')
    .flatMap((text, i) => {
      const m = /^### L(\d+)\.\s*(.*)$/.exec(text)
      return m ? [{ number: Number(m[1]), title: m[2]!.trim(), line: i + 1 }] : []
    })
}

// Everywhere the repo says an L-number. Markdown, TypeScript and CSS — the places a reference is
// written and maintained. The frozen prototypes under `docs/ux-audits` are left out on purpose:
// they carry references too, but an SVG path writes each line-to with the same letter and a
// number after it, which no honest reference regex can tell apart from a decision.
const READS = /\.(md|ts|tsx|css)$/
const SKIPS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.claude', '.vite', 'test-results', 'playwright-report'])

function sources(dir = ROOT, seen: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIPS.has(entry.name)) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) sources(path, seen)
    else if (READS.test(entry.name)) seen.push(path)
  }
  return seen
}

type Reference = { number: number; where: string }

function references(): Reference[] {
  const found: Reference[] = []
  for (const path of sources()) {
    const text = readFileSync(path, 'utf8')
    text.split('\n').forEach((line, i) => {
      for (const m of line.matchAll(/\bL(\d{1,3})\b/g)) {
        found.push({ number: Number(m[1]), where: `${path.slice(ROOT.length)}:${i + 1}` })
      }
    })
  }
  return found
}

describe('the L-numbers in DESIGN-BESLUT.md (#375)', () => {
  it('names each decision once, so a reference points at one entry', () => {
    const byNumber = new Map<number, Entry[]>()
    for (const entry of entries()) byNumber.set(entry.number, [...(byNumber.get(entry.number) ?? []), entry])
    // Said as which number collides and which entries wear it, because «two entries share a
    // number» alone leaves the reader scrolling four thousand lines to find out which.
    const collisions = [...byNumber.values()]
      .filter((group) => group.length > 1)
      .map((group) => `L${group[0]!.number} is worn by ${group.map((e) => `«${e.title}» (line ${e.line})`).join(' and ')}`)
    expect(collisions).toEqual([])
  })

  it('has an entry for every L-number the repo refers to', () => {
    const known = new Set(entries().map((e) => e.number))
    const dangling = references()
      .filter((r) => !known.has(r.number))
      .map((r) => `L${r.number} at ${r.where} is not an entry in DESIGN-BESLUT.md`)
    expect([...new Set(dangling)]).toEqual([])
  })

  it('is reading the document and the repo at all, so neither check can pass on emptiness', () => {
    // Both lists above are green on a file that was renamed away or a walk that found nothing.
    expect(entries().length).toBeGreaterThan(30)
    expect(references().length).toBeGreaterThan(30)
  })
})
