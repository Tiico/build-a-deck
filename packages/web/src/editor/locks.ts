// Which columns stand still when the table scrolls sideways (#1408, beställarens val A).
//
// A lock is a view of the project and not the project, exactly as a width is (L4, #46): it says
// how one person wants to read this deck on this screen. So it is remembered in the browser,
// beside the widths, and never written into the document — where the order of the columns does
// go, because that one everyone sees and the CSV export writes.
//
// Kept per project, because the columns are.
const KEY = 'byd.locks'

type Held = Record<string, string[]>

function all(): Held {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const held: unknown = JSON.parse(raw)
    return held !== null && typeof held === 'object' ? (held as Held) : {}
  } catch {
    // A browser that refuses storage, or a key someone has written a sentence into: the table
    // starts as a new deck does.
    return {}
  }
}

// What this project's designer locked, or null where she has said nothing yet — and null is not
// an empty list: a designer who unlocked everything has said something, and is not handed the
// title again on her next visit.
export function heldLocks(project: string | undefined): string[] | null {
  if (!project) return null
  const mine = all()[project]
  if (!Array.isArray(mine)) return null
  return mine.filter((field): field is string => typeof field === 'string')
}

export function rememberLocks(project: string | undefined, locked: readonly string[]): void {
  if (!project) return
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...all(), [project]: [...locked] }))
  } catch {
    // The table still draws what she locked; it just forgets by the next visit.
  }
}

// What stands still before anyone has chosen: the title, which is what a designer orients herself
// by when writing far out in a row — not the card's key and not its count, which the rail used to
// hold (#145, #695). A deck without a `title` column has nothing standing still until she locks
// something: the tool has no better guess than hers, and a wrong guess is a column to unlock.
export function defaultLocks(fields: readonly string[]): string[] {
  return fields.includes('title') ? ['title'] : []
}
