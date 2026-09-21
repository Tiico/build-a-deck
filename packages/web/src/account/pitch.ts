// Whether this browser has seen the login's sales line (L36, #304).
//
// «Skapa ditt kortspel, speltesta det på skärmen, beställ hem det» says what the product is, not
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
