// Deckster's mark (#1082, beställarens beslut 2026-10-21, variant B «Handen»): the landing page's
// three cards, a hand fanned in amber, green and paper. It replaced #729's two cards, so the tab
// and the landing page no longer wear two different faces.
//
// This is the only drawing of it. The tab's favicon.svg, the PNGs the home screens are given
// (`scripts/brand-icons.ts` writes them all) and `DecksterMark` on the pages are made from the
// cards below, so no copy can drift.

export const HAND = {
  amber: '#f0b64a',
  green: '#7dd3a0',
  // The card's paper. The landing page's logo had #f7f1e3 and the favicon #f4ead8; one is kept.
  paper: '#f4ead8',
  // The line between two cards, in the ground they lie on: the table's dark by default.
  edge: '#14161c',
} as const

// The landing page's room, which the home screen's icon lies on (landing.css `.byd-landing`), from
// its light corner to its darkest. The darkest is the edge the hand is drawn with on the wood.
const WOOD = ['#2f2722', '#17120f', '#0d0b0a'] as const
export const WOOD_EDGE = WOOD[2]

// A card is 22 × 30 on a 64 grid, fanned from the bottom of the hand. Leftmost first.
type Card = { fill: string; turn: number; shift: number }
const CARDS: readonly Card[] = [
  { fill: HAND.amber, turn: -18, shift: -5 },
  { fill: HAND.green, turn: -2, shift: 0 },
  { fill: HAND.paper, turn: 14, shift: 5 },
]
const W = 22
const H = 30
const RADIUS = 3.5
const EDGE_WIDTH = 2
// Where the hand is held: the cards' bottom edge, middle.
const GRIP = { x: 32, y: 47 }

export type CardAttributes = { x: number; y: number; width: number; height: number; rx: number; fill: string; transform: string }
export function cards(): CardAttributes[] {
  return CARDS.map((c) => ({ x: -W / 2, y: -H, width: W, height: H, rx: RADIUS, fill: c.fill, transform: `translate(${GRIP.x + c.shift} ${GRIP.y}) rotate(${c.turn})` }))
}
export const EDGE_STROKE_WIDTH = EDGE_WIDTH

// Every card's four corners on the 64 grid, which is what the frames below are fitted to.
function corners(): { x: number; y: number }[] {
  return CARDS.flatMap((c) => {
    const a = (c.turn * Math.PI) / 180
    return [[-W / 2, -H], [W / 2, -H], [-W / 2, 0], [W / 2, 0]].map(([x, y]) => ({
      x: GRIP.x + c.shift + (x as number) * Math.cos(a) - (y as number) * Math.sin(a),
      y: GRIP.y + (x as number) * Math.sin(a) + (y as number) * Math.cos(a),
    }))
  })
}
const round = (n: number): number => Math.round(n * 100) / 100

// The square that holds the hand and its edge with nothing to spare: the mark drawn on its own.
export function markViewBox(): string {
  const all = corners()
  const pad = EDGE_WIDTH / 2
  const left = Math.min(...all.map((p) => p.x)) - pad
  const right = Math.max(...all.map((p) => p.x)) + pad
  const top = Math.min(...all.map((p) => p.y)) - pad
  const bottom = Math.max(...all.map((p) => p.y)) + pad
  const side = Math.max(right - left, bottom - top)
  return [left - (side - (right - left)) / 2, top - (side - (bottom - top)) / 2, side, side].map(round).join(' ')
}

function rects(edge: string, width: number = EDGE_WIDTH): string {
  return cards().map((c) => `<rect x="${c.x}" y="${c.y}" width="${c.width}" height="${c.height}" rx="${c.rx}" fill="${c.fill}" stroke="${edge}" stroke-width="${width}" transform="${c.transform}"/>`).join('')
}

// The tab's icon: the hand on nothing, so the three cards have the whole 16 px. Their dark edge is
// what holds the paper card apart from a light tab strip.
export function faviconSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${markViewBox()}">${rects(HAND.edge)}</svg>\n`
}

// The home screen's icon: the hand on the landing page's wood, edge to edge, because the screen
// cuts its own shape out of it. A maskable icon shows only the circle of 80 % in the middle, so the
// hand is fitted inside that circle with a little to spare, and its edge stays the 2 the tab's has
// rather than growing with it.
export function appIconSvg(): string {
  const all = corners()
  const cx = (Math.min(...all.map((p) => p.x)) + Math.max(...all.map((p) => p.x))) / 2
  const cy = (Math.min(...all.map((p) => p.y)) + Math.max(...all.map((p) => p.y))) / 2
  const reach = Math.max(...all.map((p) => Math.hypot(p.x - cx, p.y - cy))) + EDGE_WIDTH / 2
  const scale = round((64 * 0.4 * 0.94) / reach)
  const wood = `<defs><radialGradient id="wood" cx="0.7" cy="0.1" r="1.1"><stop offset="0" stop-color="${WOOD[0]}"/><stop offset="0.55" stop-color="${WOOD[1]}"/><stop offset="1" stop-color="${WOOD[2]}"/></radialGradient></defs><rect width="64" height="64" fill="url(#wood)"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${wood}<g transform="translate(32 32) scale(${scale}) translate(${round(-cx)} ${round(-cy)})">${rects(WOOD_EDGE, round(EDGE_WIDTH / scale))}</g></svg>\n`
}
