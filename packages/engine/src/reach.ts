import { matches, type CardQuery, type ComponentId, type ZoneId } from '@byd/protocol'
import { zoneOf, type TableState } from './state.js'

// What a verb takes out of a pile: the top so many, or the ones that answer a question (B5).
//
// One function, read by `decide` and by `apply`, for the reason the whole engine is built that
// way — the line that is committed and the line that is replayed must reach for the same cards,
// or the log stops replaying identically (D4). It returns the ids in the pile's own order, or a
// sentence saying why there are none to take.
//
// The question is asked of the card's identity and never of the instance: `cards` on the setup
// says what a row holds in its own columns, and every copy of that row answers alike. Nothing
// here reaches a view — the ids it returns are the engine's, and `project` filters as it always
// has (B6), which is what lets a hidden pile be searched at all.
export function reach(state: TableState, pile: ZoneId, which: CardQuery | undefined, count: number): ComponentId[] | string {
  const order = zoneOf(state, pile).order
  if (which === undefined) {
    return count > order.length ? `zone ${pile} has fewer than ${count} components` : order.slice(0, count)
  }
  const cards = state.setup.cards ?? {}
  const found = order.filter((id) => matches(which, cards[state.components[id]!.cardRef] ?? {}))
  return found.length > 0 ? found : `zone ${pile} has no components answering the question`
}
