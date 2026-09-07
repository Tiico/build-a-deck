import { describe, expect, it } from 'vitest'
import { playIntents } from '../src/player/play.js'
import { buildScene } from './scene.js'

// Playing from the hand (K11): into a public zone the card turns face-up as a hand would; into a
// hidden pile it stays down. One envelope for several cards. The same rule for the phone's sheet
// and for a card dragged out of the hand onto the table (C2).
describe('playIntents', () => {
  it('moves and flips into a public zone, only moves into a hidden one, and keeps a position when given', () => {
    const { view } = buildScene()
    const v = view('A')
    const hand = v.components.filter((c) => c.zone === 'hand:A')
    const a = hand[0]!
    const b = hand[1]!
    expect(playIntents(v, [a], 'discard')).toEqual([
      { v: 'move', component: a.id, to: 'discard' },
      { v: 'flip', component: a.id, face: 'front' },
    ])
    expect(playIntents(v, [a], 'draw')).toEqual([{ v: 'move', component: a.id, to: 'draw' }])
    // Underneath a hidden pile of three: index 3, still face down.
    expect(playIntents(v, [a], 'draw', undefined, 'bottom')).toEqual([{ v: 'move', component: a.id, to: 'draw', index: 3 }])
    expect(playIntents(v, [a, b], 'discard', undefined, 'bottom')).toEqual([
      { v: 'move', component: a.id, to: 'discard', index: 3 },
      { v: 'flip', component: a.id, face: 'front' },
      { v: 'move', component: b.id, to: 'discard', index: 4 },
      { v: 'flip', component: b.id, face: 'front' },
    ])
    expect(playIntents(v, [a, b], 'table', { x: 10, y: 20 })).toEqual([
      { v: 'move', component: a.id, to: 'table', x: 10, y: 20 },
      { v: 'flip', component: a.id, face: 'front' },
      { v: 'move', component: b.id, to: 'table', x: 10, y: 20 },
      { v: 'flip', component: b.id, face: 'front' },
    ])
  })
})
