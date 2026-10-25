// The terms the account has not accepted (#1272, F4 beslut 5), from the browser's side. The server
// closes every way that writes to such an account with a contract of its own — `403 { error:
// 'terms', current }` — and a page that knows it opens the step as a dialog rather than saying a
// write failed. A page that does not know it still reads a sentence that says what to do.
import type { T } from '../i18n/index.js'
import { Said } from '../i18n/said.js'

// `current` is the version to accept; the message is the sentence for a page that says no more.
export class TermsDue extends Said {
  override name = 'TermsDue'
  constructor(
    readonly current: string,
    t: T,
  ) {
    super(t('terms.refused'))
  }
}

// The version a refusal asks for, or null when the answer is anything else: another status, or a
// 403 that is a role's and not the terms'. Read off a copy, so a caller can still read the body.
export async function termsDueIn(res: Response): Promise<string | null> {
  if (res.status !== 403) return null
  const body = (await res.clone().json().catch(() => null)) as { error?: unknown; current?: unknown } | null
  return body?.error === 'terms' && typeof body.current === 'string' ? body.current : null
}

// Throws `TermsDue` when the answer is the terms' refusal, and otherwise lets the caller read it.
export async function refusedForTerms(res: Response, t: T): Promise<void> {
  const current = await termsDueIn(res)
  if (current !== null) throw new TermsDue(current, t)
}

// «Inte nu» holds for the visit (#1272, variant B): the band and the step wait until the next time
// the browser opens Deckster, and a version that changes asks again. Kept per tab session, so a
// fresh visit asks again; a storage that refuses simply asks every time.
const LATER = 'byd.terms.later'
export function laterFor(version: string): boolean {
  try {
    return sessionStorage.getItem(LATER) === version
  } catch {
    return false
  }
}
export function putOff(version: string | null): void {
  try {
    if (version === null) sessionStorage.removeItem(LATER)
    else sessionStorage.setItem(LATER, version)
  } catch {
    // Nothing to keep it in: the band asks again, which is the safe side.
  }
}
