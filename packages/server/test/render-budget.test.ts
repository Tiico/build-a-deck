import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// A test that launches a browser has to say how long it may take.
//
// Vitest's default is five seconds. Rendering a card or a booklet launches Chromium, loads a
// page, waits for its fonts and prints it — seconds of work on an idle machine and more than five
// on one that is running the rest of the suite beside it. Every such test in this package already
// declares sixty or ninety; the one that did not said so months later, as
// `Test timed out in 5000ms.` in a pull request that had not touched the server at all, and only
// when the whole suite ran at once.
//
// So it is written down here rather than remembered. This is the same guard the web package keeps
// over its own two classes of suite (`jsdom-suite-budget`, `browser-suite-budget`, #92), in the
// size this package needs: not a number for the file, but a number on each test that starts a
// renderer, since a file usually holds one of those and a dozen that answer in milliseconds.
const DIR = import.meta.dirname
const SELF = 'render-budget.test.ts'

// What starting a renderer looks like from a test: the fixture's own way, and the renderer taken
// straight. Written as patterns so this file does not read as one of them itself.
const LAUNCHES = [/run\.renderAll\(\)/, /Renderer\.launch\(\)/]
// What a declared budget looks like at the end of an `it` block: `}, 60_000)`.
const DECLARES = /\n {2}\}, \d[\d_]*\)/

const read = (name: string) => readFileSync(join(DIR, name), 'utf8')
const files = readdirSync(DIR).filter((name) => name.endsWith('.test.ts') && name !== SELF)

// Every test of this package, as the source between one `it(` and the next.
const blocks = (source: string): string[] => source.split(/\n {2}it\(/).slice(1)
const starts = (block: string) => LAUNCHES.some((pattern) => pattern.test(block))
const named = (block: string) => (/^\s*['"`](.*?)['"`]/.exec(block)?.[1] ?? block.slice(0, 40)).trim()

describe('a test that launches a browser (#92)', () => {
  it('says how long it may take, in every suite of this package', () => {
    const forgot = files.flatMap((name) =>
      blocks(read(name))
        .filter((block) => starts(block) && !DECLARES.test(block))
        .map((block) => `${name}: ${named(block)}`),
    )
    expect(forgot).toEqual([])
  })

  it('is a guard that can fail: a budget taken away is seen', () => {
    // The condition itself, since a guard that cannot fail says nothing about the suite it guards.
    const block = `'renders the deck', async () => {\n    await run.renderAll()\n  })\n`
    expect(starts(block)).toBe(true)
    expect(DECLARES.test(block)).toBe(false)
    expect(DECLARES.test(block.replace('\n  })', '\n  }, 60_000)'))).toBe(true)
  })
})
