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

// The login mail (#1098, beslut C «Bordet») carries the hand on its wood band, and a mail cannot
// draw it: Gmail strips <svg>, and no mail client rotates a rect. So the hand is also a PNG the
// site serves, drawn by the script from the same drawing, at twice the 64 px the mail shows it at.
describe('the mark in the mail (#1098)', () => {
  it('is served as mark-128.png: a 128 × 128 PNG written by the script', () => {
    const png = readFileSync(join(PUBLIC, 'mark-128.png'))
    expect(png.subarray(0, 8).toString('hex'), 'mark-128.png is not a PNG: pnpm --filter @byd/web exec tsx scripts/brand-icons.ts').toBe('89504e470d0a1a0a')
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([128, 128])
  })
})
