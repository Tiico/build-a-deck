// How close together the wall packs the deck (#128).
//
// A density is a view of the deck and not the deck, the same way a column width is (#46, L4): it
// says how far this person is sitting from this screen right now. But unlike a width it says
// nothing about the project at all — a wall of forty cards at 130 px is 130 px whichever game is
// open — so it is remembered for the browser and not per project, and switching project keeps the
// size the eyes were already reading at.
const KEY = 'byd.wall.density'

// The widths the wall steps between, in CSS pixels. The ladder is coarse on purpose: a slider
// invites fiddling with a number nobody can name, and every step here is a different way of
// looking — a whole deck at a glance at one end, a readable card at the other.
export const DENSITY = [90, 110, 130, 150, 180, 220] as const
// Where the wall opens when nobody has said otherwise: a card big enough to read a title on.
export const DENSITY_DEFAULT = 3

export function heldDensity(): number {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === null) return DENSITY_DEFAULT
    const step = Number(raw)
    // A key someone has written a sentence into is not a density.
    return Number.isInteger(step) && step >= 0 && step < DENSITY.length ? step : DENSITY_DEFAULT
  } catch {
    // A browser that refuses storage still gets a wall; it just opens at the default every time.
    return DENSITY_DEFAULT
  }
}

export function rememberDensity(step: number): void {
  try {
    localStorage.setItem(KEY, String(step))
  } catch {
    // The wall still draws at the size she asked for; it only forgets by the next visit.
  }
}
