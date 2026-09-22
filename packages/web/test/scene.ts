import { TypeRegistry, apply, counterIds, decide, initialState, project, replay, seededRng, type DeckFacts, type DecideDeps, type FaceHashes, type SetupDef, STANDARD_TYPES } from '@byd/engine'
import type { Applied, Intent, Snapshot } from '@byd/protocol'
import { twoSeatSetup } from './fixture.js'

export const registry = new TypeRegistry(STANDARD_TYPES)

// The deck as the render farm left it: a pair of texture hashes per card, which is what the actor
// hands `project` once the deck has been compiled. A view test that wants to read what a card
// wears takes it from here instead of pasting a hash onto a snapshot — the hash belongs to the
// deck, and what such a test is about is the way from the deck to the screen.
//
// Every card gets a back of its own and never one shared default: a deck whose cards carry their
// own back (#14) is the case that tells a right reading from a lucky one.
export function renderedDeck(setup: SetupDef): DeckFacts {
  const faces: FaceHashes = {}
  for (const c of setup.components) faces[c.cardRef] = { front: `f-${c.cardRef}`, back: `b-${c.cardRef}` }
  return { faces }
}

// Any setup as a table the real engine runs: what a view test sends is decided, committed and
// applied the way the actor does it, and read back through `project` like every other view.
// Given a `deck`, the projection carries its texture hashes too, exactly as the actor's does.
export function tableOf(setup: SetupDef, deck?: DeckFacts) {
  const initial = initialState('v1', setup, registry)
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
  const view = (seat: string | null): Snapshot => project(state, registry, seat, deck)
  // The same table after whatever the table's own screen sent, verbatim: the intents a ring or
  // a drop hands to `onAct`, so that a view test reads the felt the engine actually produces
  // from them and not a hand-made likeness of it.
  const viewAfter = (...intents: Intent[]): Snapshot => {
    run(null, ...intents)
    return view(null)
  }
  return { state: () => state, log, run, view, viewAfter }
}

// A small table for view tests, produced by the real engine: A holds two cards, one card
// lies face-up on the table, one face-down, three in the discard, the rest in the draw pile.
export function buildScene() {
  const table = tableOf(twoSeatSetup())
  const { log, run, view, viewAfter } = table
  run(null, { v: 'seat.claim', seat: 'A', name: 'Ada' })
  run(null, { v: 'draw', from: 'draw', to: 'hand:A', count: 2 })
  run(null, { v: 'draw', from: 'draw', to: 'table', count: 2 })
  const [faceUp, faceDown] = table.state().zones['table']!.order as [string, string]
  run(null, { v: 'move', component: faceUp, to: 'table', x: 100, y: 50, rot: 10 })
  run(null, { v: 'flip', component: faceUp, face: 'front' })
  run(null, { v: 'move', component: faceDown, to: 'table', x: 300, y: 200 })
  run(null, { v: 'draw', from: 'draw', to: 'discard', count: 3 })
  for (const id of [...table.state().zones['discard']!.order]) run(null, { v: 'flip', component: id, face: 'front' })

  // The same table after the face-down card is stacked onto the face-up one (K1).
  const viewAfterStack = (): Snapshot => viewAfter({ v: 'stack', component: faceDown, onto: faceUp })
  // The same table after the top of the draw pile has been split off onto the felt: the patch
  // that answers a card drawn off a pile and dropped (K1).
  const viewAfterDrawTop = (x: number, y: number): Snapshot => viewAfter({ v: 'split', pile: 'draw', at: 1, x, y })
  // The same table after the top of the hidden draw pile is turned face-up (K15).
  const flipDrawTop = (): Snapshot => viewAfter({ v: 'flip', component: { top: 'draw' }, face: 'front' })
  return { state: table.state(), log, view, viewAfter, viewAfterStack, viewAfterDrawTop, flipDrawTop, faceUp, faceDown }
}
