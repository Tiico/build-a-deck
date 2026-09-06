import { CARD_STANDARD_63x88, TypeRegistry, apply, counterIds, decide, initialState, project, seededRng } from '@byd/engine'
import type { Applied, Intent, Snapshot } from '@byd/protocol'
import { twoSeatSetup } from './fixture.js'

// A small table for view tests, produced by the real engine: A holds two cards, one card
// lies face-up on the table, one face-down, three in the discard, the rest in the draw pile.
export const registry = new TypeRegistry([CARD_STANDARD_63x88])

export function buildScene() {
  let state = initialState('v1', twoSeatSetup(), registry)
  const deps = { rng: seededRng(1), ids: counterIds('r'), now: () => '2026-09-06T00:00:00.000Z' }
  const log: Applied[] = []
  let n = 0
  const run = (seat: string | null, ...intents: Intent[]) => {
    const d = decide(state, registry, { id: `e${n++}`, seat, intents }, deps)
    if (!d.ok) throw new Error(d.reason)
    for (const line of d.applied) {
      state = apply(state, registry, line)
      log.push(line)
    }
  }
  run(null, { v: 'seat.claim', seat: 'A', name: 'Ada' })
  run(null, { v: 'draw', from: 'draw', to: 'hand:A', count: 2 })
  run(null, { v: 'draw', from: 'draw', to: 'table', count: 2 })
  const [faceUp, faceDown] = state.zones['table']!.order as [string, string]
  run(null, { v: 'move', component: faceUp, to: 'table', x: 100, y: 50, rot: 10 })
  run(null, { v: 'flip', component: faceUp, face: 'front' })
  run(null, { v: 'move', component: faceDown, to: 'table', x: 300, y: 200 })
  run(null, { v: 'draw', from: 'draw', to: 'discard', count: 3 })
  for (const id of [...state.zones['discard']!.order]) run(null, { v: 'flip', component: id, face: 'front' })

  const view = (seat: string | null): Snapshot => project(state, registry, seat)
  // The same table after the face-down card is stacked onto the face-up one (K1).
  const viewAfterStack = (): Snapshot => {
    run(null, { v: 'stack', component: faceDown, onto: faceUp })
    return project(state, registry, null)
  }
  return { state, log, view, viewAfterStack, faceUp, faceDown }
}
