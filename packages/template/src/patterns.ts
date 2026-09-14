// The tile a pattern repeats (L17). One square of ink, described once, handed to an SVG
// `<pattern>` by the compiler. Framework-free like `shapes`, and for the same reason: the
// editor's gallery draws the same tiles the card does, and one of them cannot drift.
import { coord } from './shapes.js'
import type { Pattern } from './model.js'

// How much of a tile the ink takes when the pattern does not say. Each kind means something
// different by it — a stripe's share of the tile, a line's thickness, a dot's diameter — so
// each carries its own sensible middle rather than one number pretending to fit all five.
const WEIGHT: Record<Pattern['kind'], number> = { stripes: 0.5, grid: 0.12, dots: 0.4, diamonds: 0.8, chevron: 0.16 }

// The markup inside one tile. `colour` must already be escaped: it comes from the template and
// goes straight into an attribute.
export function tileMarkup(kind: Pattern['kind'], size: number, colour: string, weight?: number): string {
  const s = size
  const t = weight ?? WEIGHT[kind]
  const c = coord
  switch (kind) {
    case 'stripes':
      return `<rect width="${c(s * t)}" height="${c(s)}" fill="${colour}"/>`
    // Drawn on the tile's own edges, so each neighbour contributes the other half of the line
    // and the grid meets itself across the seam instead of doubling at it.
    case 'grid':
      return `<path d="M 0 0 H ${c(s)} M 0 0 V ${c(s)}" fill="none" stroke="${colour}" stroke-width="${c(s * t)}"/>`
    case 'dots':
      return `<circle cx="${c(s / 2)}" cy="${c(s / 2)}" r="${c((s * t) / 2)}" fill="${colour}"/>`
    case 'diamonds': {
      const r = (s * t) / 2
      const m = s / 2
      return `<path d="M ${c(m)} ${c(m - r)} L ${c(m + r)} ${c(m)} L ${c(m)} ${c(m + r)} L ${c(m - r)} ${c(m)} Z" fill="${colour}"/>`
    }
    // Two rows to a tile, the upper one's feet meeting the lower one's apex, so the zigzag runs
    // unbroken down the card rather than in bands with paper between them.
    case 'chevron':
      return `<path d="M 0 ${c(s / 2)} L ${c(s / 2)} 0 L ${c(s)} ${c(s / 2)} M 0 ${c(s)} L ${c(s / 2)} ${c(s / 2)} L ${c(s)} ${c(s)}" fill="none" stroke="${colour}" stroke-width="${c(s * t)}"/>`
  }
}
