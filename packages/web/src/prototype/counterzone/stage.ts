// PROTOTYPE — throwaway (#89). The table a recipe makes, with the two numbers #89 is about —
// the counters zone's millimetres and the pitch between two chips — turned by the variant.
//
// The product's own numbers live in `packages/server/src/recipe.ts` (`countersAt` gives the zone
// 110 x 100 mm, `inFront` gives the area in front 380 x 100, and a seat takes 500 mm along its
// rim with neighbours a 600 mm place setting apart, K18) and in `packages/server/src/setup.ts`
// (`x: 8 + (i % 3) * 32, y: 8 + floor(i / 3) * 32` — the 32 mm pitch). Variant N repeats them
// exactly, so the baseline measured here is the product's and not the prototype's.
//
// The three other variants each turn a different one of those numbers, and the felt is re-laid
// through the same rule K18 states, so what a bigger seat costs the felt is paid in the picture
// and not waved at.
import { CARD_STANDARD_63x88, STANDARD_TYPES, TOKEN_COUNTER, TypeRegistry, initialState, project, type SetupDef } from '@byd/engine'
import type { Snapshot } from '@byd/protocol'
import { applyRecipe, edgeOf, emptySetup, rect, SWEDISH_WORDS, type Counter, type Geometry, type Recipe, type Setup } from '@byd/server/doc'

const registry = new TypeRegistry(STANDARD_TYPES)
const DECK = 20

export type VariantKey = 'N' | 'A' | 'B' | 'C'

export const seatNameOf = (seat: string): string => `Spelare ${seat.charCodeAt(0) - 64}`

// The wizard hands out one counter by default ("en poängräknare som standard", C4). Two and three
// are what a designer adds, and they are the cases #89 exists for.
export const COUNTER_NAMES = ['Poäng', 'Liv', 'Guld']
export const COUNTER_STARTS = [12, 20, 3]

// ── The millimetres the recipe writes today (recipe.ts, setup.ts). ────────────────────────────
export const CHIP_MM = 24 // TOKEN_MM in `table/drop.ts`
export const INSET_MM = 8 // where the first chip sits inside its zone
export const PITCH_TODAY = 32
export const ZONE_TODAY = 110 // along the rim; the depth is 100 at every variant
export const MINE_TODAY = 380
export const ZONE_DEEP = 100
export const SEAT_GAP = 10 // between the area in front and the counters zone
export const SEAT_ALONG = 500 // K18: a seat takes 500 mm along its rim
export const PLACE_SETTING = 600 // K18: two neighbours sit a place setting apart
export const PLACE_AIR = PLACE_SETTING - SEAT_ALONG // the air a place setting leaves round a seat
export const HAND_MM = 500
const BASE_FELT = { w: 1200, h: 800 }

// How far apart two chips' centres have to be in MILLIMETRES for their targets to be 44 px apart
// on the screen. There is no such number in the abstract: millimetres do not know how many pixels
// they will become. What there is, is the tightest table the product supports — eight seats with
// three counters on a 1280 x 800 screen in table mode — and the scale that lands on.
//
// Measured there: the felt draws 0.4264 px per millimetre, and the perspective magnifies a chip
// at the near rim by about 4 %, so a finger's 44 px is 99 mm of felt. B's felt is K18's own, so
// 100 mm clears it.
//
// A's is not, and that is A's whole problem: A's zone makes the seat longer, K18 makes the place
// setting follow the seat and the felt follow the place setting, and a bigger felt is drawn at a
// smaller scale — which asks for more millimetres again. Solving p >= 44 px on the felt A itself
// produces gives p >= 143 mm; 150 is the first round number above it.
export const PITCH_A = 150
export const PITCH_B = 125

// ── K18's rule, with the two numbers a variant may turn. ──────────────────────────────────────
// The prototype re-derives `feltFor`, `alongEdge` and `handGeometry` rather than calling them,
// because A changes the place setting and the seat's own length, which is exactly what the
// recipe's copies hold constant. `edgeOf` is the product's own and is imported.
const seatsAt = (edge: 'N' | 'E' | 'S' | 'W', count: number): number =>
  Array.from({ length: count }, (_, k) => edgeOf(k, count)).filter((e) => e === edge).length

export type Plan = {
  key: VariantKey
  // How many counters the seat has. The zone is sized for the chips it actually holds.
  n: number
  // The counters zone along the rim, and the area in front of the seat beside it.
  countersLen: number
  mineLen: number
  // What the seat takes along its rim, and how far apart two neighbours then sit.
  seatAlong: number
  place: number
  // Between two chips' centres inside the zone.
  pitch: number
  // How deep the counters zone is, inward from the rim. A zone that is to hold its targets and
  // not merely its chips has to be as deep as one target, and only A pays that.
  deep: number
  // C: the chips lie on each other and the felt draws one thing to touch.
  stacked: boolean
}

// How long the zone has to be to hold n targets at this pitch. A zone sized for the CHIPS is not
// a zone sized for the TARGETS: the chip is 24 mm and its target about 100, so the first chip's
// target reaches four times its own width past the zone's edge. The pitch is chosen so that the
// target is one pitch wide, so a row of n of them is n pitches long and the first centre stands
// half a pitch in.
const rowLen = (n: number, pitch: number): number => n * pitch
const firstCentre = (pitch: number): number => pitch / 2

// `pitchA` and `pitchB` are the variants' own numbers, overridable from the address (`?pitch=`)
// so a reader can dial the pitch and watch what it costs rather than take the constant on trust.
// Dialling A is the point of A: every millimetre added to A's pitch is added to the felt too.
export function planOf(key: VariantKey, counters: number, pitchA = PITCH_A, pitchB = PITCH_B): Plan {
  const n = Math.max(1, counters)
  if (key === 'A') {
    // The zone grows to hold the chips the seat actually has, at the wide pitch. The seat grows
    // with it, and — this is K18's own rule, not an extra — the place setting grows with the
    // seat, so the felt does too.
    const pitch = pitchA
    const countersLen = Math.max(ZONE_TODAY, rowLen(n, pitch))
    const seatAlong = MINE_TODAY + SEAT_GAP + countersLen
    return { key, n, countersLen, mineLen: MINE_TODAY, seatAlong, place: seatAlong + PLACE_AIR, pitch, deep: Math.max(ZONE_DEEP, pitch), stacked: false }
  }
  if (key === 'B') {
    // The same wide pitch, but the seat's 500 mm is not renegotiated: the millimetres come out of
    // the area in front. The felt, the place setting and every neighbour stay exactly where K18
    // put them; the depth is untouched as well, so the zone grows on one axis only.
    const pitch = pitchB
    const countersLen = Math.max(ZONE_TODAY, rowLen(n, pitch))
    return { key, n, countersLen, mineLen: SEAT_ALONG - SEAT_GAP - countersLen, seatAlong: SEAT_ALONG, place: PLACE_SETTING, pitch, deep: ZONE_DEEP, stacked: false }
  }
  // N and C both keep every millimetre the recipe writes today. C moves the chips onto each
  // other instead of apart, and the felt draws one thing a finger can land on.
  return { key, n, countersLen: ZONE_TODAY, mineLen: MINE_TODAY, seatAlong: SEAT_ALONG, place: PLACE_SETTING, pitch: key === 'C' ? STACK_MM : PITCH_TODAY, deep: ZONE_DEEP, stacked: key === 'C' }
}

// How far a chip in a pile is offset from the one under it, so a stack reads as a stack and not
// as one chip (the felt already draws a pile of cards this way).
export const STACK_MM = 5

export function feltOf(plan: Plan, count: number): { w: number; h: number } {
  const grown = plan.seatAlong - SEAT_ALONG
  const busiest = (a: 'N' | 'E' | 'S' | 'W', b: 'N' | 'E' | 'S' | 'W') => Math.max(1, seatsAt(a, count), seatsAt(b, count))
  return { w: BASE_FELT.w + grown + (busiest('S', 'N') - 1) * plan.place, h: BASE_FELT.h + grown + (busiest('E', 'W') - 1) * plan.place }
}

function alongEdge(i: number, count: number, place: number): number {
  const edge = edgeOf(i, count)
  const before = Array.from({ length: i }, (_, k) => edgeOf(k, count)).filter((e) => e === edge).length
  return (before - (seatsAt(edge, count) - 1) / 2) * place
}

function handAt(plan: Plan, i: number, count: number): Geometry {
  const { w, h } = feltOf(plan, count)
  const [x, y] = [w / 2, h / 2]
  const along = alongEdge(i, count, plan.place) - HAND_MM / 2
  switch (edgeOf(i, count)) {
    case 'N':
      return rect(along, -y, HAND_MM, 60)
    case 'E':
      return rect(x - 60, along, 60, HAND_MM)
    case 'W':
      return rect(-x, along, 60, HAND_MM)
    default:
      return rect(along, y - 60, HAND_MM, 60)
  }
}

// The seat's two zones, laid out the way `inFront` and `countersAt` lay them: the area in front
// starts where the hand starts, the counters zone follows it a gap later, and both are 100 mm
// deep just inside the hand.
function seatZones(plan: Plan, i: number, count: number): { mine: Geometry; counters: Geometry } {
  const hand = handAt(plan, i, count)
  const start = plan.mineLen + SEAT_GAP
  switch (edgeOf(i, count)) {
    case 'N': {
      const y = hand.y + hand.h + SEAT_GAP
      return { mine: rect(hand.x, y, plan.mineLen, ZONE_DEEP), counters: rect(hand.x + start, y, plan.countersLen, plan.deep) }
    }
    case 'E': {
      const x = hand.x - ZONE_DEEP - SEAT_GAP
      return { mine: rect(x, hand.y, ZONE_DEEP, plan.mineLen), counters: rect(hand.x - plan.deep - SEAT_GAP, hand.y + start, plan.deep, plan.countersLen) }
    }
    case 'W': {
      const x = hand.x + hand.w + SEAT_GAP
      return { mine: rect(x, hand.y, ZONE_DEEP, plan.mineLen), counters: rect(x, hand.y + start, plan.deep, plan.countersLen) }
    }
    default: {
      const y = hand.y - ZONE_DEEP - SEAT_GAP
      return { mine: rect(hand.x, y, plan.mineLen, ZONE_DEEP), counters: rect(hand.x + start, hand.y - plan.deep - SEAT_GAP, plan.countersLen, plan.deep) }
    }
  }
}

// Where the chips lie inside their zone, in the zone's own millimetres.
//
// N repeats the product literally: `x: 8 + (i % 3) * 32, y: 8 + floor(i / 3) * 32`, which runs
// the chips along the X axis whatever edge the seat sits at — so on the east and west rims
// today's chips already run INWARD across a 100 mm deep zone rather than along the rim.
// A and B run them along the rim, because that is the axis their zone grew on.
export function chipsIn(plan: Plan, i: number, count: number): { x: number; y: number }[] {
  const n = plan.n
  const edge = edgeOf(i, count)
  const alongY = edge === 'E' || edge === 'W'
  const across = (plan.deep - CHIP_MM) / 2
  return Array.from({ length: n }, (_, k) => {
    if (plan.key === 'N') return { x: INSET_MM + (k % 3) * PITCH_TODAY, y: INSET_MM + Math.floor(k / 3) * PITCH_TODAY }
    if (plan.stacked) {
      // The pile sits in the middle of the zone it has, which is the one thing C can do about a
      // target that is four times as wide as the chip under it.
      const span = (n - 1) * STACK_MM + CHIP_MM
      return { x: (alongY ? plan.deep : plan.countersLen) / 2 - span / 2 + k * STACK_MM, y: (alongY ? plan.countersLen : plan.deep) / 2 - span / 2 + k * STACK_MM }
    }
    // The centre stands half a pitch in, so the target of the first chip lies inside the zone.
    const a = firstCentre(plan.pitch) + k * plan.pitch - CHIP_MM / 2
    return alongY ? { x: across, y: a } : { x: a, y: across }
  })
}

export function layout(plan: Plan, players: number): Setup {
  const counters: Counter[] = COUNTER_NAMES.slice(0, plan.n).map((name, i) => ({ name, start: COUNTER_STARTS[i] ?? 0 }))
  const recipe: Recipe = { players, mine: true, discard: true, market: false, counters }
  const base = applyRecipe(emptySetup(), recipe, SWEDISH_WORDS)
  const felt = feltOf(plan, base.seats.length)
  const zones = base.zones.map((z) => {
    if (z.id === base.floor) return { ...z, geometry: rect(-felt.w / 2, -felt.h / 2, felt.w, felt.h) }
    const seat = /^(hand|mine|counters):(.)$/.exec(z.id)
    if (!seat) return z
    const i = base.seats.indexOf(seat[2] as string)
    if (i < 0) return z
    if (seat[1] === 'hand') return { ...z, geometry: handAt(plan, i, base.seats.length) }
    const laid = seatZones(plan, i, base.seats.length)
    return { ...z, geometry: seat[1] === 'mine' ? laid.mine : laid.counters }
  })
  return { ...base, zones }
}

export function stageOf(setup: Setup, plan: Plan): Snapshot | null {
  const card = { id: CARD_STANDARD_63x88.id, version: 1 }
  const token = { id: TOKEN_COUNTER.id, version: 1 }
  const names = COUNTER_NAMES.slice(0, plan.n)
  const def: SetupDef = {
    seats: setup.seats,
    floor: setup.floor,
    zones: setup.zones.map((z) => ({
      id: z.id,
      kind: z.kind,
      name: z.name,
      visibility: z.id.startsWith('mine:') ? ('all' as const) : z.visibility,
      geometry: z.geometry,
      ...(z.owner ? { owner: z.owner } : {}),
      ...(z.returnTo ? { returnTo: z.returnTo } : {}),
      ...(z.shortcut ? { shortcut: z.shortcut } : {}),
    })),
    components: [
      ...Array.from({ length: DECK }, (_, i) => ({ type: card, cardRef: `Kort ${i + 1}`, zone: setup.deckZone, face: 'back' as const })),
      // Something lying in front of each seat, because B pays for its pitch out of exactly that
      // area and the price has to be visible and not merely stated.
      ...setup.seats.flatMap((seat) => {
        const z = setup.zones.find((w) => w.id === `mine:${seat}`)
        if (!z) return []
        const tall = z.geometry.h > z.geometry.w
        return [0, 1].map((i) => ({ type: card, cardRef: `Spelat ${seat}${i}`, zone: `mine:${seat}`, face: 'front' as const, x: tall ? 18 : 10 + i * 70, y: tall ? 10 + i * 100 : 6 }))
      }),
      ...setup.seats.flatMap((seat) => Array.from({ length: 4 }, (_, i) => ({ type: card, cardRef: `Hand ${seat}${i}`, zone: `hand:${seat}`, face: 'back' as const }))),
      ...setup.seats.flatMap((seat, i) => {
        if (!setup.zones.some((z) => z.id === `counters:${seat}`)) return []
        const places = chipsIn(plan, i, setup.seats.length)
        return names.map((name, k) => ({ type: token, cardRef: name, zone: `counters:${seat}`, face: 'front' as const, counter: COUNTER_STARTS[k] ?? 0, x: places[k]?.x ?? 0, y: places[k]?.y ?? 0 }))
      }),
    ],
  }
  try {
    const snap = project(initialState('proto', def, registry), registry, null)
    return { ...snap, seats: snap.seats.map((s) => ({ ...s, name: seatNameOf(s.id) })) }
  } catch {
    return null
  }
}
