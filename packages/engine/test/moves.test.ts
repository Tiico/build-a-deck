import { describe, expect, it } from 'vitest'
import { movesOf } from '../src/index.js'
import { Harness } from './fixture.js'

// «Drag n av N» (#1010): how far into a game a flag was raised, and how long the game was. A move
// is a line of play still in effect on the table — sitting down, saying something about the game,
// a version changed under it and the ending are not moves, and a move taken back is no longer one.
describe('the moves of a game', () => {
  it('counts the play on the table, not who sat down, what was flagged or the ending', () => {
    const h = new Harness()
    h.do(null, { v: 'seat.claim', seat: 'A', name: 'Ada' })
    h.do('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 2 })
    h.do('A', { v: 'flag', note: 'för stark' })
    h.do(null, { v: 'shuffle', pile: 'draw' })
    h.do(null, { v: 'session.end' })
    expect(movesOf(h.log).map((l) => l.intent.v)).toEqual(['draw', 'shuffle'])
  })

  it('leaves out a move that was taken back, and the taking back itself', () => {
    const h = new Harness()
    h.do('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    h.do('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    h.do('A', { v: 'undo.self' })
    h.do('A', { v: 'shuffle', pile: 'draw' })
    expect(movesOf(h.log).map((l) => l.seq)).toEqual([1, 4])
  })
})
