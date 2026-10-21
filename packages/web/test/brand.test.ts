import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HAND, faviconSvg } from '../src/brand/mark.js'

// Deckster's one mark (#1082, beställarens beslut 2026-10-21, variant B «Handen»): the landing
// page's three cards, a hand in amber, green and paper. The tab, the home screen, the landing page
// and the login card draw the same hand, from one drawing in `src/brand/mark.ts`.
const PUBLIC = join(import.meta.dirname, '..', 'public')
const fills = (svg: string): string[] => [...svg.matchAll(/<rect\b[^>]*\bfill="([^"]+)"/g)].map((m) => m[1] as string)

describe('the mark (#1082)', () => {
  it('is a hand of three cards: amber, green and paper, in that order from the left', () => {
    expect(fills(faviconSvg())).toEqual([HAND.amber, HAND.green, HAND.paper])
  })

  it('is what the tab is given: favicon.svg is the drawing, not a copy of it', () => {
    // A hand-edited favicon.svg is a second mark. The file is written by the script, never by hand.
    expect(readFileSync(join(PUBLIC, 'favicon.svg'), 'utf8'), 'favicon.svg is not the mark: pnpm --filter @byd/web exec tsx scripts/brand-icons.ts').toBe(faviconSvg())
  })
})
