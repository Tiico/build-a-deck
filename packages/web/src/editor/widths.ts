// The widths a designer has set herself (#46).
//
// A width is a view of the project and not the project, exactly as the sort and the filter are
// (L4): it says how one person wants to read this deck on this screen, and two designers looking
// at the same game at different window sizes want different answers. So it is remembered in the
// browser and never written into the document — where the order of the columns does go, because
// that one everyone sees, the CSV export writes, and a step back has to be able to take back.
//
// Kept per project, because the columns are: a width for `body` in one game says nothing about a
// column called `body` in another.
const KEY = 'byd.widths'

// The narrowest a column may ever be drawn, when nothing better is known.
//
// The page declares the real answer as `--byd-tap`, and the table reads it there; this is the same
// fallback that reading has always used, kept here so the way in and the way out cannot drift
// apart. A column narrower than a fingertip is not a width anybody chose — it is a column thrown
// away by a hand that slipped, and its own edge is by then too small to catch and drag back.
export const TAP_FLOOR = 44

type Held = Record<string, Record<string, number>>

function all(): Held {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const held: unknown = JSON.parse(raw)
    return held !== null && typeof held === 'object' ? (held as Held) : {}
  } catch {
    // A browser that refuses storage, or a key someone has written a sentence into: the table
    // measures every column itself, which is what it did before anybody could set a width.
    return {}
  }
}

// What this project's columns were left at. Only the numbers: anything else in the key is
// somebody else's, or damage, and a width that is not a number is not a width.
//
// And never under the floor (#220). Setting a width has been clamped since #46, but reading one
// back was not, so a width written before that clamp existed — or by a hand on another version, or
// by anything else at all that can write to this key — came back as it was and drew the column
// invisible again on the next visit. A width under the floor is lifted to it rather than dropped:
// the column was meant to be narrow, and the designer keeps the narrowest it may be, not the
// measurement she had moved away from.
export function heldWidths(project: string | undefined, least: number = TAP_FLOOR): Record<string, number> {
  if (!project) return {}
  const mine = all()[project]
  if (!mine || typeof mine !== 'object') return {}
  const kept = Object.entries(mine).filter(([, px]) => typeof px === 'number' && Number.isFinite(px) && px > 0)
  return Object.fromEntries(kept.map(([field, px]) => [field, Math.max(least, px as number)]))
}

export function rememberWidths(project: string | undefined, widths: Record<string, number>): void {
  if (!project) return
  try {
    // A project with nothing set is a project with no key, not a key holding an empty record:
    // what is remembered is what somebody chose, and she has chosen nothing.
    const { [project]: gone, ...rest } = all()
    void gone
    const held = Object.keys(widths).length === 0 ? rest : { ...rest, [project]: widths }
    localStorage.setItem(KEY, JSON.stringify(held))
  } catch {
    // The table still draws at the width she pulled it to; it just forgets by the next visit.
  }
}
