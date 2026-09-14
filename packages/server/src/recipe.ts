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
  // The same lift, one scale down: a seat whose counters zone is shorter than the chips in it need
  // is laid out again, and the area in front of it with it, because the two divide one 500 mm
  // between them (#89). That is every setup saved while a seat's chips lay 32 mm apart in a zone of
  // 110, and every setup that is now being given a second counter. A zone a designer made roomier
  // than the chips ask for is theirs and is left alone, exactly as the felt is.
  const alongRim = (g: Geometry): number => Math.max(g.w, g.h)
  const reshaped = recipe.counters.length > 0 && seats.some((seat, i) => {
    const now = setup.zones.find((z) => z.id === `counters:${seat}`)?.geometry
    return !now || alongRim(now) < alongRim(countersAt(i, seats.length, recipe.counters.length))
  })
  const wanted: Zone[] = [
    { id: setup.floor, kind: 'area', name: words.floor, visibility: 'all', geometry: felt },
    { id: setup.deckZone, kind: 'pile', name: words.draw, visibility: 'none', geometry: point(-140, 0), shortcut: { label: words.drawShortcut, at: 'bottom' } },
  ]
  if (recipe.discard) wanted.push({ id: 'discard', kind: 'pile', name: words.discard, visibility: 'all', geometry: point(140, 0), shortcut: { label: words.discardShortcut, at: 'top' } })
  if (recipe.market) wanted.push({ id: 'market', kind: 'area', name: words.market, visibility: 'all', geometry: rect(-260, -200, 520, 120), shortcut: { label: words.marketShortcut, at: 'top' } })
  if (recipe.mine) seats.forEach((seat, i) => wanted.push({ id: `mine:${seat}`, kind: 'area', name: forSeat(words.mine, seat), visibility: 'owner', owner: seat, geometry: inFront(i, seats.length, recipe.counters.length), shortcut: { label: words.mineShortcut, at: 'top' } }))
  if (recipe.counters.length > 0) seats.forEach((seat, i) => wanted.push({ id: `counters:${seat}`, kind: 'area', name: forSeat(words.counters, seat), visibility: 'all', owner: seat, geometry: countersAt(i, seats.length, recipe.counters.length) }))
  seats.forEach((seat, i) => wanted.push({ id: `hand:${seat}`, kind: 'hand', name: words.hand, visibility: 'owner', owner: seat, returnTo: setup.deckZone, geometry: handGeometry(i, seats.length) }))

  const wantedIds = new Set(wanted.map((z) => z.id))
  // What a relayout moves: the seats and the felt they sit at. The shared piles and the market
  // stay where the designer left them.
  const laidOutWithTheSeats = (id: string) => /^(hand|mine|counters):/.test(id) || id === setup.floor
  // What a changed number of counters moves: the two zones that share a seat's 500 mm, and nothing
  // else. The hands, the felt and the shared piles stay where they are.
  const laidOutWithTheCounters = (id: string) => /^(mine|counters):/.test(id)
  // What stays: every zone that is not a recipe zone, and every recipe zone still wanted.
  const kept = setup.zones.filter((z) => !isRecipeZone(z.id, setup) || wantedIds.has(z.id)).map((z) => {
    const fresh = wanted.find((w) => w.id === z.id)
    const again = (relayout && laidOutWithTheSeats(z.id)) || (reshaped && laidOutWithTheCounters(z.id))
    return fresh && again ? { ...z, geometry: fresh.geometry } : z
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
// The chip a counter is drawn as, in the felt's own millimetres. The renderer re-exports this as
// `TOKEN_MM` rather than keeping a second 24 beside it: where a chip lies and how wide a chip is
// are the same question asked from two rooms (C4).
export const CHIP_MM = 24
// The room between the area in front of a seat and the chips beside it.
const SEAT_GAP = 10
// How far apart two of a seat's chips lie along its own rim (#89).
//
// It is not a taste. A finger's target is 44 × 44 px measured on the *projected* box (#67), and at
// the tightest table the product supports — seven or eight seats at 1280 × 800 in table mode,
// where the felt draws at 0.443 px per millimetre and the far rim leans away besides — that square
// covers 107.4 mm of felt, measured on the renderer's own `.byd-token-hit` by
// `counter-zone.test.tsx`. TV mode at the same width wants 103.6 mm, and every wider screen wants
// less. So two chips a hundred millimetres apart still share pixels, and the pitch is the next
// round number that clears the widest reading on both sides: at 125 mm, a chip centred in its own
// slot keeps its target some nine millimetres clear of the slot's edges, which is what keeps the
// target inside the seat's own rectangle instead of in the area in front of the player.
export const COUNTER_PITCH_MM = 125
// How many slots along the rim a seat's counters take. One or two lie side by side and are read at
// a glance; a third stacks them, and a pile is one slot however tall it grows (#89). A seat with no
// counters keeps the room for one anyway, so that turning counters off does not reshape the felt.
export const COUNTER_SLOTS = 2
export const counterSlots = (counters: number): number => (counters > 0 && counters <= COUNTER_SLOTS ? counters : 1)
// How long a seat's counters zone is along its rim, for that many counters.
export const countersLength = (counters: number): number => COUNTER_PITCH_MM * counterSlots(counters)

// The area in front of a seat lies just inside its hand; its counters sit beside that area, and
// the two together are the seat's 500 mm. What a second counter costs is paid here and nowhere
// else: the counters zone grows along the rim and `Framför` gives up exactly as much, so no
// millimetre outside the seat moves and K18's envelope is untouched (#89).
export function inFront(i: number, count: number, counters: number): Geometry {
  const hand = handGeometry(i, count)
  const long = SEAT_ALONG - SEAT_GAP - countersLength(counters)
  switch (edgeOf(i, count)) {
    case 'N':
      return rect(hand.x, hand.y + hand.h + SEAT_GAP, long, 100)
    case 'E':
      return rect(hand.x - 110, hand.y, 100, long)
    case 'W':
      return rect(hand.x + hand.w + SEAT_GAP, hand.y, 100, long)
    default:
      return rect(hand.x, hand.y - 110, long, 100)
  }
}
export function countersAt(i: number, count: number, counters: number): Geometry {
  const hand = handGeometry(i, count)
  const long = countersLength(counters)
  const from = SEAT_ALONG - long
  switch (edgeOf(i, count)) {
    case 'N':
      return rect(hand.x + from, hand.y + hand.h + SEAT_GAP, long, 100)
    case 'E':
      return rect(hand.x - 110, hand.y + from, 100, long)
    case 'W':
      return rect(hand.x + hand.w + SEAT_GAP, hand.y + from, 100, long)
    default:
      return rect(hand.x + from, hand.y - 110, long, 100)
  }
}

// Where a seat's chips lie inside their own zone, in the zone's own millimetres (C4, #89).
//
// Each chip stands in the middle of its slot and in the middle of the zone's depth, and that
// centring is the whole of the fix the issue asked for: the zone is drawn to a 24 mm chip while
// the target over it is four times as wide, so a chip laid 8 mm from a corner — which is where the
// recipe laid every chip until now — put its target 20 mm inside the area in front of the player
// at every seat count, without a single pair of targets overlapping to say so.
//
// The slots run along the rim, and the rim is the zone's long side: a seat on the east or west rim
// has the same rectangle turned a quarter, and reading the axis off the rectangle is what makes
// one rule true at all four rims. Past the second counter the chips share a slot and are a pile —
// a matter of where they lie and of what the client draws, and not a verb the log has to learn.
export function counterSpots(zone: Geometry, counters: number): { x: number; y: number }[] {
  const slots = counterSlots(counters)
  const alongX = zone.w >= zone.h
  const [long, across] = alongX ? [zone.w, zone.h] : [zone.h, zone.w]
  return Array.from({ length: Math.max(0, counters) }, (_, i) => {
    const along = ((Math.min(i, slots - 1) + 0.5) * long) / slots - CHIP_MM / 2
    const deep = across / 2 - CHIP_MM / 2
    // Whole millimetres in the log, as everything the table is told is.
    const at = alongX ? { x: along, y: deep } : { x: deep, y: along }
    return { x: Math.round(at.x), y: Math.round(at.y) }
  })
}
