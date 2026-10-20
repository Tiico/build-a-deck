import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// No failure in the editor is shown in the words it was thrown in (#812, A4).
//
// What a server, a document verb or the network throws is the developer's: English, often with a
// status number in it. One panel after another showed it as it came — `err.message` straight into
// the state an alert is drawn from — and each was mended on its own (#697, #705) while the rest
// went on doing it. So the rule is checked here rather than remembered: the editor never reads an
// error's message at all. A surface says a sentence of its own for what was tried, and a reason
// already put in the reader's words reaches it through `saidOr`, which lives beside the catalogue
// and is the one place an error's text is read.
const EDITOR = join(import.meta.dirname, '..', 'src', 'editor')
const SOURCE = /\.(ts|tsx)$/

function sourcesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? sourcesUnder(path) : SOURCE.test(entry.name) ? [path] : []
  })
}

// An error's message, however the error is called: `err.message`, `e.message`, `why.message`,
// `result.reason.message`. Written as a pattern so this file does not say it in its own words.
const READS_A_MESSAGE = /\.message\b/

const sources = sourcesUnder(EDITOR)
const offenders = (text: string): string[] =>
  text
    .split('\n')
    .map((line, i) => ({ line: line.trim(), at: i + 1 }))
    .filter(({ line }) => !line.startsWith('//') && READS_A_MESSAGE.test(line))
    .map(({ line, at }) => `${at}: ${line}`)

describe('the editor says its failures in the reader’s language (#812)', () => {
  it('is found at all, so this guard cannot pass by matching nothing', () => {
    expect(sources.length).toBeGreaterThan(50)
  })

  it('would notice an error’s message read into what the panel shows', () => {
    expect(offenders('      setError(err instanceof Error ? err.message : String(err))')).toHaveLength(1)
    expect(offenders('    // what err.message said is the developer’s')).toEqual([])
  })

  it('never reads an error’s message, so no thrown English reaches the screen', () => {
    const found = sources.flatMap((path) => offenders(readFileSync(path, 'utf8')).map((line) => `${relative(EDITOR, path)}:${line}`))
    expect(found, 'say the failure with a sentence of its own, or `saidOr(err, t(…))` when the thrower put it in words').toEqual([])
  })
})
