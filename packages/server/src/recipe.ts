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
      { id: 'table', kind: 'area', name: words.floor, visibility: 'all', geometry: floorGeometry(0) },
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
// out again around the table — the felt among them, since how large it is follows how many sit at
// it (K18); a recipe zone that stays keeps its name, shortcut and, unless the seats moved, its
// place. Free zones are carried over untouched.
export function applyRecipe(setup: Setup, recipe: Recipe, words: RecipeWords = SWEDISH_WORDS): Setup {
  const seats = SEAT_IDS.slice(0, Math.max(1, Math.min(MAX_PLAYERS, Math.floor(recipe.players))))
  // Laying the seats out again also lays out the felt they sit at, because the felt's size is part
  // of the same answer (K18). Besides a changed seat count, a felt too small for the seats it
  // already has is reason enough: that is every setup saved while five to eight seats were laid out
  // on a 1200 x 800 mm table, and what stands there is not a design anyone chose but two players'
  // hands on the same millimetres. A setup that fits its seats is never touched, so no table that
  // ever worked moves.
  const felt = floorGeometry(seats.length)
  const floorNow = setup.zones.find((z) => z.id === setup.floor)?.geometry
  const relayout = seats.length !== setup.seats.length || !floorNow || floorNow.w < felt.w || floorNow.h < felt.h
  const wanted: Zone[] = [
    { id: setup.floor, kind: 'area', name: words.floor, visibility: 'all', geometry: felt },
    { id: setup.deckZone, kind: 'pile', name: words.draw, visibility: 'none', geometry: point(-140, 0), shortcut: { label: words.drawShortcut, at: 'bottom' } },
  ]
  if (recipe.discard) wanted.push({ id: 'discard', kind: 'pile', name: words.discard, visibility: 'all', geometry: point(140, 0), shortcut: { label: words.discardShortcut, at: 'top' } })
  if (recipe.market) wanted.push({ id: 'market', kind: 'area', name: words.market, visibility: 'all', geometry: rect(-260, -200, 520, 120), shortcut: { label: words.marketShortcut, at: 'top' } })
  if (recipe.mine) seats.forEach((seat, i) => wanted.push({ id: `mine:${seat}`, kind: 'area', name: forSeat(words.mine, seat), visibility: 'owner', owner: seat, geometry: inFront(i, seats.length), shortcut: { label: words.mineShortcut, at: 'top' } }))
  if (recipe.counters.length > 0) seats.forEach((seat, i) => wanted.push({ id: `counters:${seat}`, kind: 'area', name: forSeat(words.counters, seat), visibility: 'all', owner: seat, geometry: countersAt(i, seats.length) }))
  seats.forEach((seat, i) => wanted.push({ id: `hand:${seat}`, kind: 'hand', name: words.hand, visibility: 'owner', owner: seat, returnTo: setup.deckZone, geometry: handGeometry(i, seats.length) }))

  const wantedIds = new Set(wanted.map((z) => z.id))
  // What a relayout moves: the seats and the felt they sit at. The shared piles and the market
  // stay where the designer left them.
  const laidOutWithTheSeats = (id: string) => /^(hand|mine|counters):/.test(id) || id === setup.floor
  // What stays: every zone that is not a recipe zone, and every recipe zone still wanted.
  const kept = setup.zones.filter((z) => !isRecipeZone(z.id, setup) || wantedIds.has(z.id)).map((z) => {
    const fresh = wanted.find((w) => w.id === z.id)
    return fresh && relayout && laidOutWithTheSeats(z.id) ? { ...z, geometry: fresh.geometry } : z
  })
  const keptIds = new Set(kept.map((z) => z.id))
  const zones = [...kept, ...wanted.filter((z) => !keptIds.has(z.id))]
  return { ...setup, seats, zones, counters: recipe.counters }
}

export function isRecipeZone(id: string, setup: Pick<Setup, 'floor' | 'deckZone'>): boolean {
  return id === setup.floor || id === setup.deckZone || id === 'discard' || id === 'market' || /^(hand|mine|counters):/.test(id)
}

// Seats go S, N, E, W, then round again, so two players face each other. This lays the hands
// out; where a seat then *is* is read back off that geometry when the table is projected (#39),
// so a setup the editor has moved since still says where its seats sit.
export function edgeOf(i: number, count: number): 'N' | 'E' | 'S' | 'W' {
  const edges = count <= 2 ? ['S', 'N'] : count === 3 ? ['S', 'N', 'E'] : ['S', 'N', 'E', 'W', 'S', 'N', 'E', 'W']
  return (edges[i] ?? 'S') as 'N' | 'E' | 'S' | 'W'
}

// A seat takes up 500 mm along its edge — the hand is 500 wide, and the area in front plus the
// counters beside it come to the same 500 — and 170 mm inwards from the rim. Two neighbours sit a
// place setting apart, which is the 600 mm a real table lays its covers at (K18).
const SEAT_ALONG = 500
const PLACE_SETTING = 600
const FELT = { w: 1200, h: 800 }

const seatsAt = (edge: 'N' | 'E' | 'S' | 'W', count: number): number =>
  Array.from({ length: count }, (_, k) => edgeOf(k, count)).filter((e) => e === edge).length

// How big the felt has to be for that many people to sit at it (K18): every extra seat on a pair
// of opposite edges lengthens the axis those edges run along by one place setting. At four seats
// and fewer no edge carries two, so the felt is the 1200 x 800 mm it has always been, to the
// millimetre — the rim margins are what a place setting preserves.
export function feltFor(count: number): { w: number; h: number } {
  const busiest = (a: 'N' | 'E' | 'S' | 'W', b: 'N' | 'E' | 'S' | 'W') => Math.max(1, seatsAt(a, count), seatsAt(b, count))
  return { w: FELT.w + (busiest('S', 'N') - 1) * PLACE_SETTING, h: FELT.h + (busiest('E', 'W') - 1) * PLACE_SETTING }
}
export const floorGeometry = (count: number): Geometry => {
  const { w, h } = feltFor(count)
  return rect(-w / 2, -h / 2, w, h)
}

// Where along its own edge a seat sits: alone it sits in the middle, as it always has, and a pair
// straddles the middle a place setting apart.
function alongEdge(i: number, count: number): number {
  const edge = edgeOf(i, count)
  const before = Array.from({ length: i }, (_, k) => edgeOf(k, count)).filter((e) => e === edge).length
  return (before - (seatsAt(edge, count) - 1) / 2) * PLACE_SETTING
}

export function handGeometry(i: number, count: number): Geometry {
  const { w, h } = feltFor(count)
  const [x, y] = [w / 2, h / 2]
  const along = alongEdge(i, count) - SEAT_ALONG / 2
  switch (edgeOf(i, count)) {
    case 'N':
      return rect(along, -y, SEAT_ALONG, 60)
    case 'E':
      return rect(x - 60, along, 60, SEAT_ALONG)
    case 'W':
      return rect(-x, along, 60, SEAT_ALONG)
    default:
      return rect(along, y - 60, SEAT_ALONG, 60)
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
