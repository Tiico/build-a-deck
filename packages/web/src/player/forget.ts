import type { SendResult } from '../client.js'

// The guest's own erasure (#1281, G6, F5): her phone asks the server with the token her seat or her
// watch was bought with, and the server erases that admission — her name, what she wrote from it
// and her survey answers (#1279). Said as a `SendResult`, so the screen says a failure the way it
// says any other refusal, beside the button that was pressed (#7).
export const FORGET_FAILED = 'the name could not be removed'

export async function forgetMe(http: string, sessionId: string, token: string): Promise<SendResult> {
  try {
    const res = await fetch(`${http}/sessions/${encodeURIComponent(sessionId)}/erase`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) })
    return res.ok ? { ok: true, seqs: [] } : { ok: false, reason: FORGET_FAILED }
  } catch {
    return { ok: false, reason: FORGET_FAILED }
  }
}

// Kept in the tab's own storage, as the survey's «sent» is: a reload under the thanks says it is
// done rather than offering it again, and nothing leaves the device.
const FORGOTTEN = 'byd.forgotten.'
export function wasForgotten(key: string): boolean {
  try {
    return sessionStorage.getItem(FORGOTTEN + key) === '1'
  } catch {
    return false
  }
}
export function markForgotten(key: string): void {
  try {
    sessionStorage.setItem(FORGOTTEN + key, '1')
  } catch {
    // A browser that keeps nothing offers it again after a reload, and asking again changes nothing.
  }
}
