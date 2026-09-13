import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { JSDOM_TEST_BUDGET } from './budget.js'

// What the budget is, and why it is that number, is written where the number lives, in `budget.ts`.
// This is what makes it reach every suite the number is for, including the next one written.
//
// The class is the suites that stand the real app up: React rendered into a document, or a server
// run in this very process, and usually both at once. Those tests do seconds of work each, and
// vitest's five-second default leaves them a third of that work as margin — which is no margin at
// all on a machine that is doing anything else. A suite that forgets the budget does not say so
// when it is written; it says so months later, as `Test timed out in 5000ms.` in somebody else's
// pull request, on a different suite each time it is run (#92).
//
// A suite that launches Chromium is not this class. It is the other one, and
// `browser-suite-budget.test.ts` gives it sixty seconds for the same reason in a different size.
const DIR = import.meta.dirname
const SELF = 'jsdom-suite-budget.test.ts'

// Written as a pattern rather than as the plain words, so that the guard next door does not read
// this file as a suite that launches a browser and ask it for hooks it has no use for. Anywhere
// below that needs the words themselves spells them out of the pattern for the same reason.
const LAUNCHES_A_BROWSER = /chromium\.launch/
const spelled = (pattern: RegExp) => pattern.source.replaceAll('\\', '')
const STANDS_THE_APP_UP = (source: string) => source.includes('@testing-library/react') || source.includes('startServer')
const DECLARES = 'vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })'

const read = (name: string) => readFileSync(join(DIR, name), 'utf8')
const inTheClass = (source: string) => !LAUNCHES_A_BROWSER.test(source) && STANDS_THE_APP_UP(source)

const suites = readdirSync(DIR)
  .filter((name) => name !== SELF && /\.test\.tsx?$/.test(name))
  .map((name) => ({ name, source: read(name) }))
  .filter((file) => inTheClass(file.source))

describe('every suite that stands the app up under jsdom', () => {
  it('is found at all, so this guard cannot pass by matching nothing', () => {
    expect(suites.length).toBeGreaterThan(50)
    // Counted above and named here. A count drifts quietly — "more than fifty" goes on passing
    // while the three suites this was written for are renamed out from under it — so the three
    // that actually fell under load are asked for by name, and a rename has to come past this.
    expect(suites.map((s) => s.name)).toEqual(expect.arrayContaining(['editor-fields.test.tsx', 'editor-icon-way.test.tsx', 'template-groups.test.tsx']))
  })

  it('would notice a suite that had no budget, and would leave the fast ones alone', () => {
    // The guard measured against sources it is handed rather than against the tree. Without this,
    // a reading that had stopped recognising anything and a tree that was wholly in order say the
    // same thing from the outside, which is the failure a guard made of `readdirSync` dies of.
    const aPage = "import { render } from '@testing-library/react'"
    const aServer = "import { startServer } from './fixture.js'"
    expect([aPage, aServer].map(inTheClass)).toEqual([true, true])
    expect(inTheClass("import { contrastOf } from '../src/contrast.js'")).toBe(false)
    expect(inTheClass(`const browser = await ${spelled(LAUNCHES_A_BROWSER)}()`)).toBe(false)
    // And the sentence the suites are read for: a suite that has not said it is not taken to have.
    expect(aPage).not.toContain(DECLARES)
    expect(`${aPage}\n\n${DECLARES}\n`).toContain(DECLARES)
  })

  it.each(suites.map((s) => s.name))('gives %s the measured budget rather than vitest’s default', (name) => {
    const source = suites.find((s) => s.name === name)!.source
    expect(source, `${name} stands the app up, so it needs \`${DECLARES}\` at the top; vitest's 5 s default cuts this class of test off mid-work under load`).toContain(DECLARES)
  })

  it('keeps the budget between the measurement below it and the hang above it', () => {
    // The floor: the heaviest body ever measured in this class is 5898 ms, on a machine carrying a
    // load average over 300, and at 5830 ms the old five seconds failed the run. A budget is no
    // use if the worst hour the suite has ever had can reach it, so it is three times the worst.
    expect(JSDOM_TEST_BUDGET, 'a budget the heaviest measured test can reach is not a budget').toBeGreaterThanOrEqual(3 * 5_898)
    // The ceiling: this is where the line against a hang is drawn. A test that never finishes
    // fails here, and it must not take longer to say so than opening a whole browser is given.
    expect(JSDOM_TEST_BUDGET, 'a jsdom test may not take longer to give up than a Chromium suite is given to open a browser').toBeLessThan(60_000)
  })
})
