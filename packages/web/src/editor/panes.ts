// What the designer has folded away on the canvas (#129).
//
// A folded column is a view of this desk and not of the game, exactly as a column width is (L4,
// `widths.ts`): it says how one person wants to read the template on this screen this afternoon,
// and the designer beside her on a 1440 px monitor wants the other answer. So it is remembered in
// the browser and never written into the document — where it would travel to everybody, take a
// version of its own and have to be undoable.
//
// Not kept per project, for the same reason: what fits on this screen fits on it whichever deck is
// open, and a designer who folds the properties away once has said something about her desk.
const KEY = 'byd.folded'

// Whether the properties column is folded away. Unfolded is what the editor did before anybody
// could fold anything, so it is what a browser that refuses storage — and a key somebody has
// written a sentence into — falls back to.
export function foldedProps(): boolean {
  try {
    return localStorage.getItem(KEY) === 'props'
  } catch {
    return false
  }
}

export function rememberFoldedProps(folded: boolean): void {
  try {
    if (folded) localStorage.setItem(KEY, 'props')
    // Nothing folded is no key at all rather than a key saying nothing: what is remembered is what
    // somebody chose, and she has chosen to have her properties back.
    else localStorage.removeItem(KEY)
  } catch {
    // The column still folds where she asked it to; it just forgets by the next visit.
  }
}
