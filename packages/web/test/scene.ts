import { TypeRegistry, apply, counterIds, decide, initialState, project, replay, seededRng, type DecideDeps, STANDARD_TYPES } from '@byd/engine'
import type { Applied, Intent, Snapshot } from '@byd/protocol'
import { twoSeatSetup } from './fixture.js'

// A small table for view tests, produced by the real engine: A holds two cards, one card
// lies face-up on the table, one face-down, three in the discard, the rest in the draw pile.
export const registry = new TypeRegistry(STANDARD_TYPES)

export function buildScene() {
  const initial = initialState('v1', twoSeatSetup(), registry)
  let state = initial
  const log: Applied[] = []
  const deps: DecideDeps = {
    rng: seededRng(1),
    ids: counterIds('r'),
    now: () => '2026-09-06T00:00:00.000Z',
    history: { stateAt: (seq) => replay(initial, registry, log.filter((l) => l.seq <= seq)), lines: () => log },
  }
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
  // The same table after the top of the draw pile has been split off onto the felt: the patch
  // that answers a card drawn off a pile and dropped (K1).
  const viewAfterDrawTop = (x: number, y: number): Snapshot => {
    run(null, { v: 'split', pile: 'draw', at: 1, x, y })
    return project(state, registry, null)
  }
  // The same table after the top of the hidden draw pile is turned face-up (K15).
  const flipDrawTop = (): Snapshot => {
    run(null, { v: 'flip', component: { top: 'draw' }, face: 'front' })
    return project(state, registry, null)
  }
  return { state, log, view, viewAfterStack, viewAfterDrawTop, flipDrawTop, faceUp, faceDown }
}
