// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useLiveStatus } from '../src/status/useLiveStatus.js'
import type { TableConnection } from '../src/table/useTableClient.js'
import type { Snapshot } from '@byd/protocol'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// An open line with an envelope nobody has answered (#482 fynd 4). The table said nothing for as
// long as the socket stayed open, however long the network had been gone under it.
const conn = (unansweredSince: number | null): TableConnection => ({
  client: null,
  view: { seq: 1 } as unknown as Snapshot,
  status: 'open',
  activity: [],
  observers: [],
  room: null,
  hostKey: null,
  refused: null,
  trouble: null,
  schedule: { nextRetryAt: null, made: 0, of: 0 },
  unansweredSince,
  retry: () => undefined,
})

describe('a table whose envelope has not been answered (#482)', () => {
  it('says «långsam» once the envelope has waited past the allowance, and nothing before', () => {
    expect(renderHook(() => useLiveStatus(conn(null), 'table')).result.current.state).toBeNull()
    expect(renderHook(() => useLiveStatus(conn(Date.now() - 500), 'table')).result.current.state).toBeNull()
    expect(renderHook(() => useLiveStatus(conn(Date.now() - 5_000), 'table')).result.current.state).toBe('slow')
  })
})
