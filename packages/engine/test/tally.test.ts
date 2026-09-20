import { describe, expect, it } from 'vitest'
import { Harness } from './fixture.js'
import { zoneTally } from '../src/index.js'

// What the rulebook is allowed to say about a zone while the game runs (#226). The book shows a
// living number beside a tagged zone, and the number has to be decided by the same projection as
// everything else at the table — never by whatever the client happens to hold.
describe('the living number a zone gives the book (#226)', () => {
  it('counts an open pile and says the book can see what lies there', () => {
    const h = new Harness()
    expect(zoneTally(h.view(null), 'discard')).toEqual({ count: 0, known: true })
  })

  // The count of a hidden pile is on the wire for everybody and always has been (K15: «a count
  // and nothing else»). What the book withholds is the claim to know what the count is made of.
  it('counts a hidden pile and says the count is all the book knows', () => {
    const h = new Harness()
    expect(zoneTally(h.view(null), 'draw')).toEqual({ count: 10, known: false })
  })

  it('reads another seat’s hand as a count, and the owner’s own hand as a reading', () => {
    const h = new Harness()
    h.do('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 3 })
    expect(zoneTally(h.view('A'), 'hand:A')).toEqual({ count: 3, known: true })
    expect(zoneTally(h.view('B'), 'hand:A')).toEqual({ count: 3, known: false })
    expect(zoneTally(h.view(null), 'hand:A')).toEqual({ count: 3, known: false })
  })

  // A book written against another version of the game names zones this table has not got. It
  // says the name it always said, rather than inventing a nought beside it.
  it('has no number for a zone this table has not got, and none without a table at all', () => {
    const h = new Harness()
    expect(zoneTally(h.view(null), 'vinterforradet')).toBeNull()
    expect(zoneTally(null, 'draw')).toBeNull()
  })
})
