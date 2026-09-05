import type { Applied } from '@byd/protocol'
import { apply } from './apply.js'
import type { TableState } from './state.js'
import type { TypeRegistry } from './typedef.js'

// The log is the truth. Folding it over the initial state must reproduce the live state
// exactly — and, per seat, the exact sequence of projections. Tests assert both.
export function replay(initial: TableState, registry: TypeRegistry, log: readonly Applied[]): TableState {
  let state = initial
  for (const line of log) state = apply(state, registry, line)
  return state
}
