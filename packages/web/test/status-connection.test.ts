import { describe, expect, it } from 'vitest'
import { connectionState, countdownFrom, DEFAULT_TIMING, type ConnectionFacts } from '../src/status/connection.js'

const facts = (over: Partial<ConnectionFacts> = {}): ConnectionFacts => ({
  status: 'connecting',
  hasView: false,
  trouble: null,
  waitedMs: 0,
  resumed: false,
  slowAfterMs: DEFAULT_TIMING.slowAfterMs,
  ...over,
})

// The five realtime routes all read the same client, so which of the nine states they are in is
// one calculation, not five (#7).
describe('the state a live connection is in', () => {
  it('is quiet while the table is up and nothing has happened to it', () => {
    expect(connectionState(facts({ status: 'open', hasView: true }))).toBeNull()
  })

  it('is connecting until the wait becomes worth mentioning, and then says so', () => {
    expect(connectionState(facts({ waitedMs: 100 }))).toBe('connecting')
    expect(connectionState(facts({ waitedMs: DEFAULT_TIMING.slowAfterMs + 1 }))).toBe('slow')
  })

  it('is a network error, not an endless wait, once the client has called the first attempt off', () => {
    expect(connectionState(facts({ trouble: 'timeout', waitedMs: 99_000 }))).toBe('offline')
  })

  it('is a missing room when the server has never heard of the session', () => {
    expect(connectionState(facts({ trouble: 'missing' }))).toBe('missing')
    expect(connectionState(facts({ trouble: 'missing', hasView: true, status: 'open' }))).toBe('missing')
  })

  it('is dropped only while there is something on the screen that has stopped being true', () => {
    expect(connectionState(facts({ status: 'reconnecting', hasView: true }))).toBe('dropped')
    expect(connectionState(facts({ status: 'reconnecting', hasView: false }))).toBe('connecting')
  })

  it('keeps saying dropped, not offline, when the automatic attempts run out mid-game', () => {
    expect(connectionState(facts({ status: 'reconnecting', hasView: true, trouble: 'exhausted' }))).toBe('dropped')
    expect(connectionState(facts({ status: 'reconnecting', hasView: false, trouble: 'exhausted' }))).toBe('offline')
  })

  it('says the connection is back, once, before going quiet again', () => {
    expect(connectionState(facts({ status: 'open', hasView: true, resumed: true }))).toBe('resumed')
  })

  it('says nothing at all about a connection the page itself closed', () => {
    expect(connectionState(facts({ status: 'closed', hasView: true }))).toBeNull()
  })
})

// The transport tries again by itself; the countdown is what makes that visible rather than a
// screen that blinks for reasons nobody is told.
describe('the countdown to the next automatic attempt', () => {
  // `made` counts the attempts the plan has committed to, so the one being waited for is the
  // `made`th of them — never one further on, which would read as "försök 2 av 1".
  it('rounds up so it never shows a wait of zero seconds that then keeps waiting', () => {
    expect(countdownFrom({ nextRetryAt: 1_000 + 1, made: 1, of: 4 }, 1_000)).toEqual({ seconds: 1, attempt: 1, attempts: 4 })
    expect(countdownFrom({ nextRetryAt: 1_000 + 2_400, made: 2, of: 4 }, 1_000)).toEqual({ seconds: 3, attempt: 2, attempts: 4 })
  })

  it('is nothing at all when no attempt is scheduled, so a spent plan does not pretend to try', () => {
    expect(countdownFrom({ nextRetryAt: null, made: 4, of: 4 }, 1_000)).toBeNull()
  })
})
