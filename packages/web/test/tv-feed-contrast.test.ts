import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contrastRatio } from '../src/player/contrast.js'

// The numbers in front of the rows under «Senast» on the TV and in the observer's column (#560
// P-14): they were #4c5468 on the chrome's #0d0f14, 2.53:1, and axe called them serious. They are
// text, 16–20 px and not bold, so the floor is 4.5:1 (WCAG 1.4.3).
const css = readFileSync(join(import.meta.dirname, '..', 'src/table/table.css'), 'utf8')
// What the stylesheet declares for a selector written as a rule of its own; a selector may have
// several such rules, and the one that says the property is the one that counts.
const declared = (selector: string, property: string): string => {
  const rules = css.matchAll(new RegExp(`(?:^|\\n)${selector.replace(/[[\]().*:]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'g'))
  for (const rule of rules) {
    const value = new RegExp(`(?:^|[;{\\s])${property}:\\s*([^;]+)`).exec(rule[1]!.replace(/\/\*[\s\S]*?\*\//g, ''))
    if (value) return value[1]!.trim()
  }
  throw new Error(`table.css says no ${property} for ${selector}`)
}

describe('the rows’ numbers under «Senast» (#560 P-14)', () => {
  it('read against the chrome they stand on', () => {
    const ground = declared('[data-tv]', 'background')
    // Kolumnens listor och inte regelbokens, som hänger i samma kolumn (#709).
    const ink = declared('[data-tv] ol:where(:not(.byd-rules-panel *)) li b', 'color')
    expect(contrastRatio(ink, ground)).toBeGreaterThanOrEqual(4.5)
  })
})
