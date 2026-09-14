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
export function heldWidths(project: string | undefined): Record<string, number> {
  if (!project) return {}
  const mine = all()[project]
  if (!mine || typeof mine !== 'object') return {}
  return Object.fromEntries(Object.entries(mine).filter(([, px]) => typeof px === 'number' && Number.isFinite(px) && px > 0))
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
