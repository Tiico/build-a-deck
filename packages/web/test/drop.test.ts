import { describe, expect, it } from 'vitest'
import type { Snapshot } from '@byd/protocol'
import { CARD_MM, dropIntents, type Drag } from '../src/table/drop.js'
import { buildScene } from './scene.js'

// The scene: floor `table` at (-500,-300); faceUp at (100,50) and faceDown at (300,200) in it;
// public `discard` (3) at (200,0), hidden `draw` (3) at (-200,0); hand:A at (-300,320) 600×100.
const abs = (view: Snapshot, id: string) => {
  const c = view.components.find((x) => x.id === id)!
  const z = view.zones.find((x) => x.id === c.zone)!
  return { x: z.geometry.x + c.x, y: z.geometry.y + c.y }
}
const cardDrag = (view: Snapshot, id: string, to: { x: number; y: number }): Drag => {
  const o = abs(view, id)
  const grab = { x: o.x + 10, y: o.y + 10 }
  return { target: { kind: 'card', id }, ids: [id], grab, at: { x: to.x + 10, y: to.y + 10 }, origin: { [id]: o } }
}

describe('what a drop means (K1, K2)', () => {
  it('a card onto another loose card stacks; onto a pile joins it; inside a zone moves there; elsewhere lands on the floor', () => {
    const { view, faceUp, faceDown } = buildScene()
    const v = view(null)
    expect(dropIntents(v, cardDrag(v, faceUp, abs(v, faceDown)))).toEqual([{ v: 'stack', component: faceUp, onto: faceDown }])
    expect(dropIntents(v, cardDrag(v, faceUp, { x: 200 - CARD_MM.w / 2, y: -CARD_MM.h / 2 }))).toEqual([{ v: 'move', component: faceUp, to: 'discard' }])
    expect(dropIntents(v, cardDrag(v, faceUp, { x: -250, y: 330 }))).toEqual([{ v: 'move', component: faceUp, to: 'hand:A', x: 50, y: 10 }])
    expect(dropIntents(v, cardDrag(v, faceUp, { x: -450, y: -250 }))).toEqual([{ v: 'move', component: faceUp, to: 'table', x: 50, y: 50 }])
  })

  it('several cards dragged together each move by the same offset, in one envelope', () => {
    const { view, faceUp, faceDown } = buildScene()
    const v = view(null)
    const d: Drag = { target: { kind: 'card', id: faceUp }, ids: [faceUp, faceDown], grab: { x: 0, y: 0 }, at: { x: 20, y: -30 }, origin: { [faceUp]: abs(v, faceUp), [faceDown]: abs(v, faceDown) } }
    expect(dropIntents(v, d)).toEqual([
      { v: 'move', component: faceUp, to: 'table', x: 120, y: 20 },
      { v: 'move', component: faceDown, to: 'table', x: 320, y: 170 },
    ])
  })

  it('the top of a public pile onto a loose card is drawn then stacked; from a hidden pile the card lands beside it', () => {
    const { view, faceUp } = buildScene()
    const v = view(null)
    const discard = v.zones.find((z) => z.id === 'discard')!
    const top = discard.mode === 'order' ? discard.order[0] : ''
    const onto = abs(v, faceUp)
    const at = { x: onto.x + 20, y: onto.y + 20 }
    expect(dropIntents(v, { target: { kind: 'pileTop', pile: 'discard' }, ids: [], grab: { x: 200, y: 0 }, at, origin: {} })).toEqual([
      { v: 'draw', from: 'discard', to: 'table', count: 1 },
      { v: 'stack', component: top, onto: faceUp },
    ])
    expect(dropIntents(v, { target: { kind: 'pileTop', pile: 'draw' }, ids: [], grab: { x: -200, y: 0 }, at, origin: {} })).toEqual([
      { v: 'split', pile: 'draw', at: 1, x: at.x, y: at.y },
    ])
  })

  it('the top of a pile into a hand or onto another pile is a split to that zone', () => {
    const { view } = buildScene()
    const v = view(null)
    expect(dropIntents(v, { target: { kind: 'pileTop', pile: 'draw' }, ids: [], grab: { x: -200, y: 0 }, at: { x: 0, y: 370 }, origin: {} })).toEqual([{ v: 'split', pile: 'draw', at: 1, to: 'hand:A' }])
    expect(dropIntents(v, { target: { kind: 'pileTop', pile: 'draw' }, ids: [], grab: { x: -200, y: 0 }, at: { x: 200, y: 0 }, origin: {} })).toEqual([{ v: 'split', pile: 'draw', at: 1, to: 'discard' }])
  })

  it('a whole pile moves as one unit to where it is dropped, into the area under it', () => {
    const { view } = buildScene()
    const v = view(null)
    expect(dropIntents(v, { target: { kind: 'pile', pile: 'discard' }, ids: [], grab: { x: 200, y: 30 }, at: { x: 300, y: 130 }, origin: {} })).toEqual([{ v: 'movePile', pile: 'discard', to: 'table', x: 300, y: 100 }])
  })
})
