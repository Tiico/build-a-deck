import type { Outcome } from '@byd/protocol'
import type { Table } from './state.js'

// The log stores a restored table verbatim, typed loosely by the protocol because the shape is
// the engine's. This is the one place that trusts it back into a Table, after a shape check.
export function restoredTable(outcome: Outcome): Table {
  if (outcome.kind !== 'restore') throw new Error('restore outcome has wrong kind')
  const { zones, components } = outcome.table
  if (!isRecord(zones) || !isRecord(components)) throw new Error('restore outcome lacks zones or components')
  return { zones, components } as Table
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
