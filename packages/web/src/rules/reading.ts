import { plainOf, type RenderedBlock } from '@byd/template'

// Where a reader is in the book (#227), in a form that means the same thing in two boxes of
// different widths.
//
// A `scrollTop` is not that form. The book is 584 px wide in the editor and 380 px wide in the
// table's drawer, so the same words stand at different heights in the two of them: «Skogens
// väsen» was measured at 2 600 in the book and at 2 387 in the drawer, and a number carried over
// would have landed 213 px wrong — a whole section away, and 156 px wrong at «Vintern kommer».
//
// So a reading is the block standing topmost in the view and how far into that block the reader
// has come, as a share of its own height. That is also the only form there is anything to say out
// loud about: a number cannot be announced, and «Samma avsnitt: Skogens väsen» can.
export type Reading = { block: string; into: number }

/**
 * Where the reader is in this scrolling area, or nothing when it is holding no book — which is
 * what an open list of answers is. Nothing is not a place, and whoever asked keeps the last
 * reading rather than taking a reader who asked a question back to the beginning.
 */
export function readingIn(area: HTMLElement): Reading | null {
  const top = area.getBoundingClientRect().top
  for (const el of area.querySelectorAll<HTMLElement>('[data-block]')) {
    const box = el.getBoundingClientRect()
    // The first block whose bottom has not yet gone past the top edge is the one being read. The
    // pixel of slack is for a block ending exactly on the edge, which is the one above.
    if (box.bottom <= top + 1) continue
    const id = el.dataset['block']
    if (id === undefined) continue
    return { block: id, into: box.height > 0 ? Math.max(0, Math.min(1, (top - box.top) / box.height)) : 0 }
  }
  return null
}

/** Puts the reader back where she was, in whatever size of box this one happens to be. */
export function readTo(area: HTMLElement, at: Reading | null): void {
  if (at === null) return
  const el = [...area.querySelectorAll<HTMLElement>('[data-block]')].find((e) => e.dataset['block'] === at.block)
  if (!el) return
  const box = el.getBoundingClientRect()
  area.scrollTop += box.top - area.getBoundingClientRect().top + at.into * box.height
}

/**
 * The section a block stands in: the last first-rank heading at or before it. A subheading
 * answers with the section it belongs to, and anything standing before the first section answers
 * with the book itself — a reader told «Samma avsnitt: ingenting» has been told nothing.
 *
 * The heading is read as letters the same way the book reads it (#272, where a heading stopped
 * being letters and became children): a reference stands for the name it has, because what comes
 * out of here is said out loud and «Samma avsnitt: [[zon:hand]]» is saying the markup.
 */
export function sectionOf(blocks: readonly RenderedBlock[], title: string, id: string): string {
  let name = title
  for (const block of blocks) {
    if (block.kind === 'heading' && block.level === 1) name = plainOf(block.children)
    if (block.id === id) break
  }
  return name
}
