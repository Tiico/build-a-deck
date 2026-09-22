import { CARD_STANDARD_63x88 } from '@byd/engine'
import type { ProjectDoc } from './projects.js'

// Imported by the editor as well as the server, so this module stays free of anything Node.
// The setup as the editor holds it (B5, K2), and the recipe behind it.
//
// Reviderat: the recipe is the wizard's first move and nothing more. `openingSetup` lays the table
// a new game starts with; after that the table is the designer's, and the only knob left is the one
// thing the recipe still owns — who sits at the table, and what each seat keeps count of. A zone
// the designer has taken away never comes back, and the seats knob puts nothing back either.
export type Setup = ProjectDoc['setup']
export type Zone = Setup['zones'][number]
export type Geometry = Zone['geometry']
export type Counter = { name: string; start: number }
export type Recipe = { players: number; counters: Counter[] }

export const SEAT_IDS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const
export const MAX_PLAYERS = SEAT_IDS.length
export const rect = (x: number, y: number, w: number, h: number): Geometry => ({ x, y, w, h, rot: 0 })
export const point = (x: number, y: number): Geometry => ({ x, y, w: 0, h: 0, rot: 0 })

// What the zones the recipe lays out are called. The market is not among them any more: it was a
// knob that put a named rectangle on the table, and with the knobs gone it is an area the designer
// adds and names, like every other zone they make (B5, reviderat).
// What they are called. They are the designer's document from the moment they
// are made, so they are written in the language the designer is building the game in (A4); the
// tool supplies the words, and Swedish is what it falls back to. `{seat}` is the seat's letter.
export type RecipeWords = {
  floor: string
  draw: string
  drawShortcut: string
  discard: string
  discardShortcut: string
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

// The table a new game starts with, whichever door it came in by (L6, L42): the seats around a
// felt as large as that many people need (K18), each with a hand that returns to the draw pile, an
// area in front of it and its counters, and the discard pile beside the deck. From the first save
// it is the designer's: what they take away here stays away, and what they add is theirs.
export function openingSetup(recipe: Recipe, words: RecipeWords = SWEDISH_WORDS): Setup {
  const setup = emptySetup(words)
  const seats = seatsFor(recipe.players)
  const felt = floorGeometry(seats.length)
  const counters = recipe.counters.length
  const zones: Zone[] = [
    { id: setup.floor, kind: 'area', name: words.floor, visibility: 'all', geometry: felt },
    { id: setup.deckZone, kind: 'pile', name: words.draw, visibility: 'none', geometry: point(-140, 0), shortcut: { label: words.drawShortcut, at: 'bottom' } },
    { id: 'discard', kind: 'pile', name: words.discard, visibility: 'all', geometry: point(140, 0), shortcut: { label: words.discardShortcut, at: 'top' } },
    ...seats.map((seat, i) => inFrontZone(seat, i, seats.length, counters, words)),
    ...(counters > 0 ? seats.map((seat, i) => countersZone(seat, i, seats.length, counters, words)) : []),
    ...seats.map((seat, i) => handZone(seat, i, seats.length, setup.deckZone, words)),
  ]
  return { ...setup, seats, zones, counters: recipe.counters }
}

const seatsFor = (players: number): string[] => SEAT_IDS.slice(0, Math.max(1, Math.min(MAX_PLAYERS, Math.floor(players))))
const handZone = (seat: string, i: number, count: number, deck: string, words: RecipeWords): Zone => ({ id: `hand:${seat}`, kind: 'hand', name: words.hand, visibility: 'owner', owner: seat, returnTo: deck, geometry: handGeometry(i, count) })

// The two zones a seat can have besides its hand, and the one place that knows what they are: the
// area in front of the player, which only they see into, and the strip its counters lie on, which
// everyone reads (C4, B6). `{seat}` in the name is the seat's letter, so one name covers the table.
export type SeatRole = 'mine' | 'counters'
export type Shortcut = { label: string; at: 'top' | 'bottom' }
export function seatZone(role: SeatRole, seat: string, i: number, count: number, counters: number, name: string, shortcut?: Shortcut): Zone {
  return role === 'mine'
    ? { id: `mine:${seat}`, kind: 'area', name: forSeat(name, seat), visibility: 'owner', owner: seat, geometry: inFront(i, count, counters), ...(shortcut ? { shortcut } : {}) }
    : { id: `counters:${seat}`, kind: 'area', name: forSeat(name, seat), visibility: 'all', owner: seat, geometry: countersAt(i, count, counters) }
}

// The same zone for every seat that has not got one — what the designer asked for when they gave
// the seats an area in front again (B5, reviderat). A seat that already has one keeps it, name and
// place and all, because this adds and never overwrites.
export function seatZones(setup: Setup, role: SeatRole, name: string, shortcut?: Shortcut): Zone[] {
  const counters = (setup.counters ?? []).length
  return setup.seats.flatMap((seat, i) => (setup.zones.some((z) => z.id === `${role}:${seat}`) ? [] : [seatZone(role, seat, i, setup.seats.length, counters, name, shortcut)]))
}

const inFrontZone = (seat: string, i: number, count: number, counters: number, words: RecipeWords): Zone => seatZone('mine', seat, i, count, counters, words.mine, { label: words.mineShortcut, at: 'top' })
const countersZone = (seat: string, i: number, count: number, counters: number, words: RecipeWords): Zone => seatZone('counters', seat, i, count, counters, words.counters)

// The knob as it stands in a setup.
export function recipeOf(setup: Setup): Recipe {
  return { players: setup.seats.length, counters: setup.counters ?? [] }
}

// Turns the knob (B5, reviderat). Who sits at the table, and what each seat keeps count of —
// and nothing else: every zone that stands on the table stands there because the designer left it
// there, so this function adds nothing back that they took away.
//
// A seat that arrives is laid out like the seats already sitting: a hand, which every seat has
// (C3), and the per-seat zones *all* of them still have. A seat that leaves takes its zones with
// it — the recipe's and the designer's own alike, because a zone that belongs to a seat that no
// longer sits at the table belongs to nobody.
export function applyRecipe(setup: Setup, recipe: Recipe, words: RecipeWords = SWEDISH_WORDS): Setup {
  const seats = seatsFor(recipe.players)
  const counters = recipe.counters.length
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
  // between them (#89). A zone a designer made roomier than the chips ask for is theirs and is left
  // alone, exactly as the felt is.
  const alongRim = (g: Geometry): number => Math.max(g.w, g.h)
  const reshaped = counters > 0 && seats.some((seat, i) => {
    const now = setup.zones.find((z) => z.id === `counters:${seat}`)?.geometry
    return !now || alongRim(now) < alongRim(countersAt(i, seats.length, counters))
  })
  // What every seat that already sits at the table has, and a seat that arrives therefore gets.
  const shared = (prefix: string) => setup.seats.length > 0 && setup.seats.every((s) => setup.zones.some((z) => z.id === `${prefix}:${s}`))
  const wantsInFront = shared('mine')
  const wantsCounters = shared('counters') && counters > 0
  const staying = new Set(seats)

  const kept = setup.zones
    .filter((z) => z.owner === undefined || staying.has(z.owner))
    .map((z) => {
      if (z.id === setup.floor) return relayout ? { ...z, geometry: felt } : z
      const i = z.owner === undefined ? -1 : seats.indexOf(z.owner)
      if (i < 0) return z
      if (relayout && z.kind === 'hand') return { ...z, geometry: handGeometry(i, seats.length) }
      if ((relayout || reshaped) && z.id === `mine:${z.owner}`) return { ...z, geometry: inFront(i, seats.length, counters) }
      if ((relayout || reshaped) && z.id === `counters:${z.owner}`) return { ...z, geometry: countersAt(i, seats.length, counters) }
      return z
    })
  const there = new Set(kept.map((z) => z.id))
  const arriving: Zone[] = []
  seats.forEach((seat, i) => {
    if (!there.has(`hand:${seat}`)) arriving.push(handZone(seat, i, seats.length, setup.deckZone, words))
    if (wantsInFront && !there.has(`mine:${seat}`)) arriving.push(inFrontZone(seat, i, seats.length, counters, words))
    if (wantsCounters && !there.has(`counters:${seat}`)) arriving.push(countersZone(seat, i, seats.length, counters, words))
  })
  return { ...setup, seats, zones: [...kept, ...arriving], counters: recipe.counters }
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

// Var en ny delad yta föds (#440, K2, B5).
//
// Hur stor den är och var den helst ligger är oförändrat sedan panelen fick sin knapp: 300 × 120
// millimeter strax nedanför filtens mitt. Vad som är nytt är att platsen är ett svar och inte en
// konstant — en zon som läggs rakt ovanpå en annan är ingen placering formgivaren har gjort, och
// hon måste dra undan den innan hon ser vad hon gjort. Med två delade ytor var det garanterat:
// den andra föddes på millimetern där den första låg.
//
// Regeln är därför: önskeplatsen om den är ledig, annars den lediga ruta som ligger närmast den.
// «Ledig» är filtens egen fråga och inget formval — rutan ska rymmas hel på filten och inte dela
// en millimeter med någon zon som redan står där. K2 låter formgivaren lägga zoner över varandra
// när hon vill; det här är bara vad verktyget gör innan hon har sagt något alls.
export const NEW_AREA = { w: 300, h: 120 }
const NEW_AREA_WISH = { x: -150, y: 100 }

// En högs ruta på filten är kortets kontur kring dess punkt: i dokumentet är en hög en punkt utan
// area, på skärmen är den en kortrygg, och det är kortryggen en ny yta inte får födas ovanpå.
const CARD = { w: CARD_STANDARD_63x88.physical.widthMm, h: CARD_STANDARD_63x88.physical.heightMm }
const boxOf = (zone: Zone): Geometry => (zone.kind === 'pile' ? rect(zone.geometry.x - CARD.w / 2, zone.geometry.y - CARD.h / 2, CARD.w, CARD.h) : zone.geometry)
const shares = (a: Geometry, b: Geometry): boolean => Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) && Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y)

/**
 * Den ledigaste rutan av den storleken på filten, närmast önskeplatsen — eller `null` när filten
 * inte har någon sådan ruta alls.
 *
 * Sökningen är uttömmande och inte en gissning. Ta vilken ledig placering som helst och skjut den
 * mot önskeplatsen, först i x och sedan i y: varje skjutning minskar avståndet, och den stannar
 * antingen på önskekoordinaten eller mot en kant — filtens egen eller en grannes. Kandidaterna
 * nedan är precis de koordinaterna, så den bästa lediga rutan finns bland dem om någon finns.
 */
export function freeSpot(setup: Setup, want: { w: number; h: number }, wish: { x: number; y: number }): Geometry | null {
  const floor = setup.zones.find((z) => z.id === setup.floor)?.geometry
  // Ett bord utan filt är inget bord; då finns ingen golvyta att söka i och önskeplatsen är allt
  // som finns att säga.
  if (!floor) return rect(wish.x, wish.y, want.w, want.h)
  // Hela millimetrar, som allt annat bordet får veta. Varje kant rundas **bort** från den zon den
  // kommer ur — en kant att lägga sig efter uppåt, en att lägga sig före nedåt — så avrundningen
  // aldrig kan äta av mellanrummet den räknade fram. En hög är det enda som ger halva millimetrar
  // alls: dess kortrygg är 63 × 88 kring en punkt.
  const along = (lo: number, hi: number, at: number, after: number[], before: number[]): number[] => {
    const [first, last] = [Math.ceil(lo), Math.floor(hi)]
    const edges = [Math.min(Math.max(at, first), last), first, last, ...after.map((v) => Math.ceil(v)), ...before.map((v) => Math.floor(v))]
    return [...new Set(edges)].filter((v) => v >= first && v <= last).sort((a, b) => a - b)
  }
  const taken = setup.zones.filter((z) => z.id !== setup.floor).map(boxOf)
  const xs = along(floor.x, floor.x + floor.w - want.w, wish.x, taken.map((t) => t.x + t.w), taken.map((t) => t.x - want.w))
  const ys = along(floor.y, floor.y + floor.h - want.h, wish.y, taken.map((t) => t.y + t.h), taken.map((t) => t.y - want.h))
  if (xs.length === 0 || ys.length === 0) return null
  let best: Geometry | null = null
  let nearest = Infinity
  for (const y of ys)
    for (const x of xs) {
      const spot = rect(x, y, want.w, want.h)
      if (taken.some((t) => shares(t, spot))) continue
      // Avståndet mäts från önskeplatsen och inte från filtens mitt: önskeplatsen är den ruta
      // fliken alltid har lagt, och en ny yta ska flytta så lite som krävs för att bli sin egen.
      // Vid lika avstånd vinner den som står först i y och sedan i x, så att två tryck i rad
      // lägger samma bord två gånger.
      const far = (x - wish.x) ** 2 + (y - wish.y) ** 2
      if (far >= nearest) continue
      nearest = far
      best = spot
    }
  return best
}

/** Rutan en ny delad yta föds i, eller `null` när filten inte har någon ledig. */
export const newAreaSpot = (setup: Setup): Geometry | null => freeSpot(setup, NEW_AREA, NEW_AREA_WISH)

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
