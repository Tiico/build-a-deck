import type { ProjectDoc } from './projects.js'

// Imported by the editor as well as the server, so this module stays free of anything Node.
// The setup as the editor holds it (B5, K2), and the recipe behind it: what the wizard once laid
// out, as knobs the editor turns afterwards. The recipe owns a namespace of zones — the floor,
// the draw pile, the discard pile, the market, and every seat's hand, area in front and counters
// zone. Everything else on the table is the designer's own and the recipe never touches it.
export type Setup = ProjectDoc['setup']
export type Zone = Setup['zones'][number]
export type Geometry = Zone['geometry']
export type Counter = { name: string; start: number }
export type Recipe = { players: number; mine: boolean; discard: boolean; market: boolean; counters: Counter[] }

export const SEAT_IDS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const
export const MAX_PLAYERS = SEAT_IDS.length
export const rect = (x: number, y: number, w: number, h: number): Geometry => ({ x, y, w, h, rot: 0 })
export const point = (x: number, y: number): Geometry => ({ x, y, w: 0, h: 0, rot: 0 })

// What the recipe's own zones are called. They are the designer's document from the moment they
// are made, so they are written in the language the designer is building the game in (A4); the
// tool supplies the words, and Swedish is what it falls back to. `{seat}` is the seat's letter.
export type RecipeWords = {
  floor: string
  draw: string
  drawShortcut: string
  discard: string
  discardShortcut: string
  market: string
  marketShortcut: string
  mine: string
  mineShortcut: string
  counters: string
  hand: string
}
export const SWEDISH_WORDS: RecipeWords = {
  floor: 'Spelyta',
  draw: 'Draghög',
  drawShortcut: 'Lägg underst',
  discard: 'Kasthög',
  discardShortcut: 'Kasta',
  market: 'Marknad',
  marketShortcut: 'Till marknaden',
  mine: 'Framför {seat}',
  mineShortcut: 'Framför mig',
  counters: 'Räknare {seat}',
  hand: 'Hand',
}
const forSeat = (word: string, seat: string): string => word.replace('{seat}', seat)

// A table with nothing but a floor and a draw pile: what every setup grows from.
export function emptySetup(words: RecipeWords = SWEDISH_WORDS): Setup {
  return {
    seats: [],
    floor: 'table',
    deckZone: 'draw',
    zones: [
      { id: 'table', kind: 'area', name: words.floor, visibility: 'all', geometry: rect(-600, -400, 1200, 800) },
      { id: 'draw', kind: 'pile', name: words.draw, visibility: 'none', geometry: point(-140, 0), shortcut: { label: words.drawShortcut, at: 'bottom' } },
    ],
  }
}

// The knobs as they stand in a setup.
export function recipeOf(setup: Setup): Recipe {
  return {
    players: setup.seats.length,
    mine: setup.seats.length > 0 && setup.seats.every((s) => setup.zones.some((z) => z.id === `mine:${s}`)),
    discard: setup.zones.some((z) => z.id === 'discard'),
    market: setup.zones.some((z) => z.id === 'market'),
    counters: setup.counters ?? [],
  }
}

// Turns the knobs: recipe zones are added, removed or, when the number of players changes, laid
// out again around the table; a recipe zone that stays keeps its name, shortcut and, unless the
// seats moved, its place. Free zones are carried over untouched.
export function applyRecipe(setup: Setup, recipe: Recipe, words: RecipeWords = SWEDISH_WORDS): Setup {
  const seats = SEAT_IDS.slice(0, Math.max(1, Math.min(MAX_PLAYERS, Math.floor(recipe.players))))
  const relayout = seats.length !== setup.seats.length
  const wanted: Zone[] = [
    { id: setup.floor, kind: 'area', name: words.floor, visibility: 'all', geometry: rect(-600, -400, 1200, 800) },
    { id: setup.deckZone, kind: 'pile', name: words.draw, visibility: 'none', geometry: point(-140, 0), shortcut: { label: words.drawShortcut, at: 'bottom' } },
  ]
  if (recipe.discard) wanted.push({ id: 'discard', kind: 'pile', name: words.discard, visibility: 'all', geometry: point(140, 0), shortcut: { label: words.discardShortcut, at: 'top' } })
  if (recipe.market) wanted.push({ id: 'market', kind: 'area', name: words.market, visibility: 'all', geometry: rect(-260, -200, 520, 120), shortcut: { label: words.marketShortcut, at: 'top' } })
  if (recipe.mine) seats.forEach((seat, i) => wanted.push({ id: `mine:${seat}`, kind: 'area', name: forSeat(words.mine, seat), visibility: 'owner', owner: seat, geometry: inFront(i, seats.length), shortcut: { label: words.mineShortcut, at: 'top' } }))
  if (recipe.counters.length > 0) seats.forEach((seat, i) => wanted.push({ id: `counters:${seat}`, kind: 'area', name: forSeat(words.counters, seat), visibility: 'all', owner: seat, geometry: countersAt(i, seats.length) }))
  seats.forEach((seat, i) => wanted.push({ id: `hand:${seat}`, kind: 'hand', name: words.hand, visibility: 'owner', owner: seat, returnTo: setup.deckZone, geometry: handGeometry(i, seats.length) }))

  const wantedIds = new Set(wanted.map((z) => z.id))
  const seatZone = (id: string) => /^(hand|mine|counters):/.test(id)
  // What stays: every zone that is not a recipe zone, and every recipe zone still wanted.
  const kept = setup.zones.filter((z) => !isRecipeZone(z.id, setup) || wantedIds.has(z.id)).map((z) => {
    const fresh = wanted.find((w) => w.id === z.id)
    return fresh && relayout && seatZone(z.id) ? { ...z, geometry: fresh.geometry } : z
  })
  const keptIds = new Set(kept.map((z) => z.id))
  const zones = [...kept, ...wanted.filter((z) => !keptIds.has(z.id))]
  return { ...setup, seats, zones, counters: recipe.counters }
}

export function isRecipeZone(id: string, setup: Pick<Setup, 'floor' | 'deckZone'>): boolean {
  return id === setup.floor || id === setup.deckZone || id === 'discard' || id === 'market' || /^(hand|mine|counters):/.test(id)
}

// Seats go S, N, E, W, then the corners, so two players face each other.
export function edgeOf(i: number, count: number): 'N' | 'E' | 'S' | 'W' {
  const edges = count <= 2 ? ['S', 'N'] : count === 3 ? ['S', 'N', 'E'] : ['S', 'N', 'E', 'W', 'S', 'N', 'E', 'W']
  return (edges[i] ?? 'S') as 'N' | 'E' | 'S' | 'W'
}
export function handGeometry(i: number, count: number): Geometry {
  const shift = i >= 4 ? 300 : 0
  switch (edgeOf(i, count)) {
    case 'N':
      return rect(-250 + shift, -400, 500, 60)
    case 'E':
      return rect(540, -250 + shift, 60, 500)
    case 'W':
      return rect(-600, -250 + shift, 60, 500)
    default:
      return rect(-250 + shift, 340, 500, 60)
  }
}
// The area in front of a seat lies just inside its hand; its counters sit beside that area.
export function inFront(i: number, count: number): Geometry {
  const hand = handGeometry(i, count)
  switch (edgeOf(i, count)) {
    case 'N':
      return rect(hand.x, hand.y + hand.h + 10, 380, 100)
    case 'E':
      return rect(hand.x - 110, hand.y, 100, 380)
    case 'W':
      return rect(hand.x + hand.w + 10, hand.y, 100, 380)
    default:
      return rect(hand.x, hand.y - 110, 380, 100)
  }
}
export function countersAt(i: number, count: number): Geometry {
  const hand = handGeometry(i, count)
  switch (edgeOf(i, count)) {
    case 'N':
      return rect(hand.x + 390, hand.y + hand.h + 10, 110, 100)
    case 'E':
      return rect(hand.x - 110, hand.y + 390, 100, 110)
    case 'W':
      return rect(hand.x + hand.w + 10, hand.y + 390, 100, 110)
    default:
      return rect(hand.x + 390, hand.y - 110, 110, 100)
  }
}
