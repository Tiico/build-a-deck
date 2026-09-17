// Whether the wall stands in bands at all, and whether its table of contents is folded (#179).
//
// Both are views of the deck and not the deck, the way the density is (#128, L4): they say how
// this person is reading this screen right now and nothing whatever about the project, so they are
// remembered for the browser and not per game. They are also remembered apart from the density and
// apart from each other. A hidden coupling — a denser wall quietly regrouping itself — is hard to
// notice and harder to undo, which is exactly why the three are three keys and not one.
//
// What is *not* remembered here is which column the wall groups by. A column is the designer's own
// word for her own deck: `typ` in this game is nothing in the next one, and a browser-wide memory
// of it would regroup a different deck by a column that merely shares a name. The wall therefore
// opens on the column the template already groups by (L3), and a column chosen over it stands for
// as long as the wall is open.
const GROUPED = 'byd.wall.grouped'
const JUMP = 'byd.wall.jump'

// Both open by default: bands are what the deck is for, and the table of contents is what the
// reader should meet rather than something to go looking for.
function held(key: string): boolean {
  try {
    const raw = localStorage.getItem(key)
    // A key someone has written a sentence into is not an answer to a yes-or-no question.
    return raw === null ? true : raw === '1'
  } catch {
    // A browser that refuses storage still gets a wall; it just opens as it was designed to.
    return true
  }
}

function remember(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? '1' : '0')
  } catch {
    // The wall still stands the way she asked for; it only forgets by the next visit.
  }
}

export const heldGrouped = (): boolean => held(GROUPED)
export const rememberGrouped = (on: boolean): void => remember(GROUPED, on)
export const heldJumpOpen = (): boolean => held(JUMP)
export const rememberJumpOpen = (on: boolean): void => remember(JUMP, on)
