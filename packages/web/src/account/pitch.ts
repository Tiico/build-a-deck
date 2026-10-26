// Whether this browser has seen the login's sales line (L36, #304).
//
// «Skapa ditt kortspel och speltesta det på skärmen — tryck kommer» says what the product is, not
// how the tool works, and it stands the first time only. The state is a view and not a fact about
// anyone (L4): it lives in the browser, per screen, never in an account — the page may not know
// who is looking before she has logged in.
//
// A storage that cannot be read shows the line. A private window, a cleared browser or a blocked
// storage should give whoever may never have been here the context, not take it away: the error
// that way costs a sentence, the error the other way costs an explanation to the one who needed it.
const KEY = 'byd.login.pitch-seen'

export function pitchSeen(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

// Set the first time the line has been rendered: seen means it stood on the screen once.
export function markPitchSeen(): void {
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    // A storage that refuses to remember shows the line again next time, which is the safe side.
  }
}

// Whether this browser has been told the first visit's line on the login card (#691, #1358): that
// the link in the mail both logs in and makes the account. It is not the sales line. The landing
// page counts as the sales line having been seen, since it says what the product is, but it never
// says how an account is made; so a newcomer who goes in by the landing page is told it all the same.
// Kept and read the way the sales line is, and wrong on the same safe side.
const FIRST = 'byd.login.first-seen'

export function firstVisitSeen(): boolean {
  try {
    return localStorage.getItem(FIRST) === '1'
  } catch {
    return false
  }
}

export function markFirstVisitSeen(): void {
  try {
    localStorage.setItem(FIRST, '1')
  } catch {
    // As for the sales line: a storage that refuses tells the line again next time.
  }
}
