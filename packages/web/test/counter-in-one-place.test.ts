import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CARD_STANDARD_63x88, TOKEN_COUNTER } from '@byd/engine'
import { isCounter } from '../src/components.js'

// "Is this a counter?" is asked by four surfaces in two rooms: the felt draws a chip instead of a
// card, the address says `räknare` instead of `kort` and offers neither a counter-only zone nor a
// counter to stack on, the phone's sheet keeps those same two rules, and a seat's own pills are
// the counters it owns. None of the four owns the question, so the web asks it in one place and
// reads the answer out of the engine's type registry.
//
// It has already been two. The renderer spelled the id out while the address panel kept a
// `COUNTER_TYPE` of its own, and #73 grew an `isCounter` beside it in the same week. Two ways
// that agree today is the shape this repository has produced bugs from before — `kick` knowing
// something `seat.release` did not, the layer panel disagreeing with the canvas — so the shape is
// what is forbidden here, and not the disagreement, which only turns up months later.
//
// Making a counter is a different question from recognising one: `setup/preview.ts` builds the
// designer's counters out of `TOKEN_COUNTER` and holds no opinion about what is one. It is the
// comparison that has to live in one place, and the id that must never be written down twice.
const SRC = join(import.meta.dirname, '..', 'src')
const HOME = 'components.ts'

// The id is spelled out of a pattern rather than written, so that this file does not become the
// second place it is written down.
const TYPE_ID = /token\.counter/
const COMPARED = /[!=]==\s*TOKEN_COUNTER\.id|TOKEN_COUNTER\.id\s*[!=]==/
const spelled = (pattern: RegExp) => pattern.source.replaceAll('\\', '')

function sourcesUnder(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sourcesUnder(path))
    else if (/\.tsx?$/.test(entry.name)) out.push(path)
  }
  return out
}

const asks = (source: string) => TYPE_ID.test(source) || COMPARED.test(source)
const sources = sourcesUnder(SRC).map((path) => ({ name: relative(SRC, path), source: readFileSync(path, 'utf8') }))

describe('what a counter is (C4)', () => {
  it('is answered out of the engine’s registry, so the web cannot hold an id that has gone stale', () => {
    expect([isCounter({ type: { id: TOKEN_COUNTER.id } }), isCounter({ type: { id: CARD_STANDARD_63x88.id } })]).toEqual([true, false])
  })

  it('is found at all, so this guard cannot pass by reading nothing', () => {
    expect(sources.length).toBeGreaterThan(100)
    expect(sources.map((s) => s.name)).toContain(HOME)
  })

  it('would notice a second place, whichever of the two ways it was written', () => {
    // The reading measured against text it is handed rather than against the tree: without this,
    // a scan that had stopped recognising anything and a tree in order read the same from outside.
    expect(asks(`const COUNTER_TYPE = '${spelled(TYPE_ID)}'`)).toBe(true)
    expect(asks('const mine = view.components.filter((c) => c.type.id === TOKEN_COUNTER.id)')).toBe(true)
    // And the two things that are not a second opinion about what a counter is: making one, and
    // asking the one place that knows.
    expect(asks('const token = { id: TOKEN_COUNTER.id, version: 1 }')).toBe(false)
    expect(asks("import { isCounter } from '../components.js'")).toBe(false)
  })

  it('is asked in one file, and every other surface asks that file', () => {
    const spread = sources.filter((s) => asks(s.source)).map((s) => s.name)
    expect(spread, 'a second way to ask this is the bug, not the disagreement it will cause later').toEqual([HOME])
  })
})
