import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contrastRatio, cssCustomProperties } from '../src/player/contrast.js'
import { seatColor } from '../src/table/seatColor.js'

// A seat colour is an identity, not a theme: the four the table prototypes agreed on (#20, K9) say
// which seat a hand, a cursor, a name tag and a dock row belong to, and they are not up for
// changing here. What is up for changing is the ink laid on them. `#3c8ce7` is the second seat and
// is also the value the editor's primary started as (#22); white on it measured 3.44:1, and so did
// white on every other seat — the palette is tuned to be read on a dark ground and to carry dark
// ink, which is what the dock's avatars already do.
const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const tokenIn = (rel: string) => {
  const tokens = cssCustomProperties(read(rel))
  return (name: string) => {
    const value = tokens.get(name)
    if (!value) throw new Error(`${rel} declares no ${name}`)
    return value
  }
}
const SEATS = [0, 1, 2, 3, 4, 5].map(seatColor)

describe('the ink a seat colour carries', () => {
  it.each(SEATS)('gives the name written on the %s seat AA contrast on the table', (seat) => {
    expect(contrastRatio(tokenIn('src/table/table.css')('--byd-seat-ink'), seat)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(SEATS)('gives the name written on the %s seat AA contrast on the join page', (seat) => {
    expect(contrastRatio(tokenIn('src/join/join.css')('--byd-seat-ink'), seat)).toBeGreaterThanOrEqual(4.5)
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
