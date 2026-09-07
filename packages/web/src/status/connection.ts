import type { ClientStatus, ClientTrouble } from '../client.js'
import type { StatusKey } from './notice.js'
import type { Countdown } from './StatusNotice.js'

// How long a wait may go unremarked, and how long the first connection may take at all. The
// first is a matter of words; the second is the deadline that #7 was missing, and it belongs to
// the client.
export type StatusTiming = { slowAfterMs: number; connectTimeoutMs: number; retryPlanMs: readonly number[] }
export const DEFAULT_TIMING: StatusTiming = { slowAfterMs: 4_000, connectTimeoutMs: 10_000, retryPlanMs: [500, 2_000, 4_000, 8_000] }

// Everything a route needs to know about its connection, and nothing about the route itself.
export type ConnectionFacts = {
  status: ClientStatus
  hasView: boolean
  trouble: ClientTrouble | null
  // How long the connection has been trying without ever having shown anything.
  waitedMs: number
  slowAfterMs: number
  // The connection has just come back, and the reader has not been told yet.
  resumed: boolean
}

// The five live routes read the same client, so which of the nine states they are in is one
// calculation rather than five. `null` is the ordinary case: the table is up and nothing needs
// saying.
export function connectionState(f: ConnectionFacts): StatusKey | null {
  // A room the server has never heard of is a 404 whatever the socket is doing.
  if (f.trouble === 'missing') return 'missing'
  if (f.status === 'closed') return null
  // The first connection was called off. With nothing on the screen that is a network error;
  // with a table already up it is the same broken line as any other drop.
  if (f.trouble !== null) return f.hasView ? 'dropped' : 'offline'
  if (f.status === 'open' && f.hasView) return f.resumed ? 'resumed' : null
  // Only a view that is already on the screen can go stale; before that there is nothing to
  // protect and the reader is simply still waiting.
  if (f.status === 'reconnecting' && f.hasView) return 'dropped'
  return f.waitedMs > f.slowAfterMs ? 'slow' : 'connecting'
}

// Whether what is behind the message can still be believed. `dropped` is the one state that
// leaves data standing that has stopped being true.
export function isStale(state: StatusKey | null): boolean {
  return state === 'dropped'
}

// `made` is how many attempts the plan has committed to. The one being counted down to is the
// last of those, so it is the `made`th of `of` and never one beyond it.
export type RetrySchedule = { nextRetryAt: number | null; made: number; of: number }

// The wait made visible, so that a connection trying again is something the reader can see
// happening instead of a screen that blinks for reasons nobody is told.
export function countdownFrom(schedule: RetrySchedule, now: number): Countdown | null {
  if (schedule.nextRetryAt === null) return null
  return { seconds: Math.max(0, Math.ceil((schedule.nextRetryAt - now) / 1000)), attempt: schedule.made, attempts: schedule.of }
}
