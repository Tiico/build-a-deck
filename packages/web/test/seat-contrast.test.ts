import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MAX_PLAYERS } from '@byd/server/doc'
import { contrastRatio, cssCustomProperties } from '../src/player/contrast.js'
import { seatColor } from '../src/table/seatColor.js'

// A seat colour is an identity, not a theme: the four the table prototypes agreed on (#20, K9) say
// which seat a hand, a cursor, a name tag and a dock row belong to, and they are not up for
// changing here. What is up for changing is the ink laid on them. `#3c8ce7` is the second seat and
// is also the value the editor's primary started as (#22); white on it measured 3.44:1, and so did
// white on every other seat — the palette is tuned to be read on a dark ground and to carry dark
// ink, which is what the dock's avatars already do.
const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
// Without the comments. `cssCustomProperties` reads a value as everything up to the next `;` or
// `}`, and `table.css` names a token inside a prose comment — so the declaration that follows
// that comment was being swallowed whole as part of the named one's value, and `--byd-felt-chalk`
// simply did not exist as far as this file was concerned. Nothing a stylesheet says in prose is a
// declaration, so none of it is read as one here.
const withoutProse = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, ' ')
const tokenIn = (rel: string) => {
  const tokens = cssCustomProperties(withoutProse(read(rel)))
  return (name: string) => {
    const value = tokens.get(name)
    if (!value) throw new Error(`${rel} declares no ${name}`)
    return value
  }
}
// Every seat the table can actually hold, and not a number written down beside `MAX_PLAYERS`.
// The palette had six entries and wrapped, so the seventh seat took the first's red and the
// eighth the second's blue — and K9 makes the colour the seat's identity everywhere it appears.
const SEATS = Array.from({ length: MAX_PLAYERS }, (_, i) => seatColor(i))

describe('a seat colour as an identity (K9)', () => {
  it('gives every seat the table can hold a colour of its own', () => {
    expect(new Set(SEATS).size).toBe(MAX_PLAYERS)
  })
})

describe('the ink a seat colour carries', () => {
  it.each(SEATS)('gives the name written on the %s seat AA contrast on the table', (seat) => {
    expect(contrastRatio(tokenIn('src/table/table.css')('--byd-seat-ink'), seat)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(SEATS)('gives the name written on the %s seat AA contrast on the join page', (seat) => {
    expect(contrastRatio(tokenIn('src/join/join.css')('--byd-seat-ink'), seat)).toBeGreaterThanOrEqual(4.5)
  })
})

// The band that lights along a seat's own edge while a card is on its way into that hand
// (#444, K24). It is a graphic and carries 3:1 — against the grounds it is actually drawn on,
// which is the whole difficulty. The palette is tuned for a dark ground and reads on the TV's
// felt at 4.39:1 and up; the table's felt is a green gradient, and at the edge opposite a seat it
// stands around `#1f4a30`, where the purple seat falls to 2.53:1.
//
// So the band is two bands, as the keyboard's focus ring is (#1, #2): the seat's colour and a
// hairline of the felt's own chalk. What has to hold is that at least one of the two reads
// against whatever is behind it, which is what `seen` says here and in `keyboard-contrast`.
const FELT_GROUNDS: Record<string, string> = {
  // `[data-table]`'s own gradient, at its three stops, and the television's flat felt.
  'felt middle': '#2e6b46',
  'felt at 70%': '#1f4a30',
  'felt edge': '#173a26',
  'tv felt': '#151924',
}
const seen = (a: string, b: string, ground: string) => Math.max(contrastRatio(a, ground), contrastRatio(b, ground))

describe('the band that says a hand is about to receive (#444)', () => {
  it.each(Object.entries(FELT_GROUNDS))('keeps a band that reads on the %s', (_where, ground) => {
    const chalk = tokenIn('src/table/table.css')('--byd-felt-chalk')
    for (const seat of SEATS) expect(seen(seat, chalk, ground), `${seat} on ${ground}`).toBeGreaterThanOrEqual(3)
  })

  // Why the rule above holds for all eight, and would hold for a ninth: it is the hairline that
  // carries the band, on every ground the felt is drawn in. The two are not equals the way the
  // focus ring's two bands are — there both bands are the mark, and neither may vanish into the
  // other. Here the fill is the identity and the hairline is what makes the identity visible, so
  // a lime seat that all but matches the chalk (1.91:1) is a band drawn in two shades of pale on
  // a dark green, which reads. What would not read is a hairline that needed the fill's help.
  it('carries the band on the hairline, which reads on every felt the table is drawn in', () => {
    const chalk = tokenIn('src/table/table.css')('--byd-felt-chalk')
    for (const [where, ground] of Object.entries(FELT_GROUNDS)) expect(contrastRatio(chalk, ground), where).toBeGreaterThanOrEqual(3)
  })

  // Not vacuous: the colour alone does *not* carry it, which is the whole reason the hairline is
  // there. A future palette that happened to read on the green would make the pair test pass for
  // a reason it was not written for, and this says so out loud.
  it('needed the hairline: the palette alone does not read on the table’s own felt', () => {
    expect(SEATS.some((seat) => contrastRatio(seat, FELT_GROUNDS['felt at 70%']!) < 3)).toBe(true)
  })
})

// The other direction: a seat colour is itself read as text in the TV's feed, and drawn as the
// edge of a dock row and of the badge on the phone. Text is text wherever it is, and an edge is a
// graphic, so the two carry the two bars.
describe('a seat colour read against the dark it sits on', () => {
  it.each(SEATS)('lets the %s seat name a move in the feed at AA', (seat) => {
    expect(contrastRatio(seat, '#0d0f14')).toBeGreaterThanOrEqual(4.5)
  })

  it.each(SEATS)('lets the %s seat be seen as the edge of its own dock row', (seat) => {
    expect(contrastRatio(seat, '#151924')).toBeGreaterThanOrEqual(3)
  })
})
