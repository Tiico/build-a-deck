// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useLiveStatus } from '../src/status/useLiveStatus.js'
import { continueShellClock } from '../src/status/waitClock.js'
import { useProjectClient } from '../src/editor/useProjectClient.js'
import type { TableConnection } from '../src/table/useTableClient.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// The app's first wait goes on from the shell's (#749). The shell in `index.html` says «laddar
// länge» four seconds after the navigation started; an app that started its own clock when it
// mounted said «ansluter» on its first frame and «laddar länge» again four seconds later.
const waiting: TableConnection = {
  client: null,
  view: null,
  status: 'connecting',
  activity: [],
  observers: [],
  room: null,
  hostKey: null,
  refused: null,
  trouble: null,
  schedule: { nextRetryAt: null, made: 0, of: 0 },
  unansweredSince: null,
  retry: () => undefined,
}

afterEach(() => {
  continueShellClock(null)
  vi.restoreAllMocks()
})

describe('a live route that takes over from the shell (#749)', () => {
  it('is slow at once when the page was asked for more than four seconds ago', () => {
    continueShellClock(Date.now() - 5_000)
    expect(renderHook(() => useLiveStatus(waiting, 'phone')).result.current.state).toBe('slow')
  })

  it('is still only connecting when the page was asked for a moment ago', () => {
    continueShellClock(Date.now() - 500)
    expect(renderHook(() => useLiveStatus(waiting, 'phone')).result.current.state).toBe('connecting')
  })

  it('counts from its own mount where there was no shell, as in a preview or a test', () => {
    expect(renderHook(() => useLiveStatus(waiting, 'phone')).result.current.state).toBe('connecting')
  })

  it('starts the wait again when a person asks for another attempt', () => {
    continueShellClock(Date.now() - 5_000)
    const { result, rerender } = renderHook((conn: TableConnection) => useLiveStatus(conn, 'phone'), { initialProps: waiting })
    expect(result.current.state).toBe('slow')
    rerender({ ...waiting, status: 'closed', trouble: 'timeout' })
    rerender(waiting)
    expect(result.current.state).toBe('connecting')
  })
})

describe('the editor opening a project after the shell (#749)', () => {
  it('says the wait is long at once when the page was asked for more than four seconds ago', async () => {
    // A server that takes the call and never answers.
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => undefined))
    continueShellClock(Date.now() - 5_000)
    const { result } = renderHook(() => useProjectClient('http://nowhere.test', 'p1'))
    await waitFor(() => expect(result.current.slow).toBe(true), { timeout: 1_000 })
  })

  it('waits its own four seconds where there was no shell', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => undefined))
    const { result } = renderHook(() => useProjectClient('http://nowhere.test', 'p1'))
    await new Promise((r) => setTimeout(r, 200))
    expect(result.current.slow).toBe(false)
  })
})
