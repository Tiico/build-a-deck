import type { ZoneView } from '@byd/protocol'
import { union, type Rect, type Size } from './camera.js'
import type { Point } from './drop.js'

// The two ways a table is looked at (C5): a table everyone stands around, or a TV everyone faces.
export type TableMode = 'table' | 'tv'

// A hand is a fan of cards lying on the felt, so it is measured in the table's own millimetres
// like everything else on it, and the renderer scales it as it scales the rest (#23). The
// numbers are the pixels prototype B was drawn in, which is what they mean at life size.

// A card in a hand is drawn a shade smaller than one on the felt: it is held, not played.
export const HAND_CARD_MM = { w: 54, h: 75 }
// How far apart two cards of a read fan sit.
export const HAND_STEP_MM = 26
// A fan stops growing here; beyond it the count says the rest.
export const FAN_MAX = 12
// Degrees between two cards: a read fan steps sideways as well, a fan of backs only turns.
export const FAN_TILT = 7
export const BACK_TILT = 9
// The corner each card turns about, as a share of its own box: `transform-origin: 50% 140%`.
export const FAN_PIVOT = { x: 0.5, y: 1.4 }

// In table mode a hand faces the edge it sits at, like a real player would (C5). The rule lives
// here because the fan is drawn by it and measured by it, and the two must never disagree.
// This asks about a zone, not about a seat: a seat with two hands has two of them to turn, and
// the seat's own `edge` (#39) — which is what the seat picker draws from, and all a lobby is
// told — answers the other question, where the person sits.
export function edgeRotation(hand: ZoneView, floor: ZoneView): number {
  const dx = hand.geometry.x + hand.geometry.w / 2 - (floor.geometry.x + floor.geometry.w / 2)
  const dy = hand.geometry.y + hand.geometry.h / 2 - (floor.geometry.y + floor.geometry.h / 2)
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? -90 : 90
  return dy > 0 ? 0 : 180
}

// How thick the band along a seat's own edge of the felt is drawn, in table millimetres (#444).
// A band and not a list: it has to be read across a room on a television whose felt is height
// bound (K9), and it has to leave the fan's own cards the room they already have.
export const SEAT_BAND_MM = 16

// The band that lights while a card is on its way into this hand (#444). It lies on the rim side
// of the hand's own strip, along the whole of it — the seat's own 500 mm of the edge (K18).
//
// The strip and not the floor's edge, for the same reason `edgeRotation` asks about the zone and
// not about the seat: where a hand lies is the zone's to say, and a band measured off the floor
// would jump to the rim the day a recipe puts a hand anywhere else. Where a hand does hug the rim,
// which is every table the wizard lays out, the two are the same millimetres.
//
// It is never deeper than the strip it belongs to. A hand is 60 mm deep (K18) and the band is 16,
// so this only ever binds on a strip somebody has drawn shallower than the band — and a band that
// reached past its own strip would be a mark on the neighbour's felt.
export function handBand(hand: ZoneView, floor: ZoneView): Rect {
  const g = hand.geometry
  const across = Math.min(SEAT_BAND_MM, g.h)
  const along = Math.min(SEAT_BAND_MM, g.w)
  switch (edgeRotation(hand, floor)) {
    case 0:
      return { x: g.x, y: g.y + g.h - across, w: g.w, h: across }
    case 180:
      return { x: g.x, y: g.y, w: g.w, h: across }
    case -90:
      return { x: g.x + g.w - along, y: g.y, w: along, h: g.h }
    default:
      return { x: g.x, y: g.y, w: along, h: g.h }
  }
}

// How far a hand's fan is turned: toward its own edge in table mode, not at all on a TV, where
// every fan faces the viewer (C5). The fan is drawn by this, measured by it (`handExtent`) and
// hit-tested by it (`dropAt`), so it is asked once, here.
export function handRotation(hand: ZoneView, floor: ZoneView, mode: TableMode): number {
  return mode === 'table' ? edgeRotation(hand, floor) : 0
}

// How many cards a hand actually fans, and whether they step sideways as well as turn: a hand
// this view may read shows the cards themselves, one it may not shows that many backs.
export function fanned(hand: ZoneView): { count: number; spread: boolean } {
  const held = hand.mode === 'order' ? hand.order.length : hand.count
  return { count: Math.min(held, FAN_MAX), spread: hand.mode === 'order' }
}

// The box one card of a fan is drawn in, about the hand's own centre: the same millimetres the
// renderer writes into the element's style, so what is measured is what is drawn.
export const HAND_CARD_BOX: Rect = { x: -HAND_CARD_MM.w / 2, y: -HAND_CARD_MM.h / 3, w: HAND_CARD_MM.w, h: HAND_CARD_MM.h }
// The count is a label in pixels, like a pile's name, and hangs off the fan on the rim's side
// where the frame leaves air (#23): past the cards' far edge, or past their near edge when the
// rim lies above the fan as drawn (`countSide`).
export const HAND_COUNT_MM = HAND_CARD_BOX.y + HAND_CARD_BOX.h
export const HAND_COUNT_ABOVE_MM = -HAND_CARD_BOX.y

// Which side of the fan its count hangs off. Below it, as prototype B drew it, unless the rim is
// above the fan as it is drawn — the TV's north seat, whose fan faces the viewer (C5) while its
// rim is at the top. Hung below there, the count lay in the zone in front of the seat (#84);
// hung toward the rim it is in the air past it, where every other seat's already is.
export function countSide(hand: ZoneView, floor: ZoneView, rot: number): 'below' | 'above' {
  return (((edgeRotation(hand, floor) - rot) % 360) + 360) % 360 === 180 ? 'above' : 'below'
}

// Where card `i` of a fan of `count` sits: how far it steps sideways, in millimetres, and how far
// it turns. One rule, asked by the renderer that draws the fan and by the extent that measures it.
export function fanPlace(i: number, count: number, spread: boolean): { step: number; tilt: number } {
  const k = i - (count - 1) / 2
  return { step: spread ? k * HAND_STEP_MM : 0, tilt: k * (spread ? FAN_TILT : BACK_TILT) }
}

// The point a hand's fan is drawn about. A hand's zone is a strip along the rim shallower than a
// card is tall — 60 mm to 75 (K18) — so a fan drawn about the strip's centre reaches out of it,
// and the area in front of the seat begins ten millimetres past the strip: on the TV, where no
// fan is turned toward its rim, seat B's cards lay in "Framför B" (#84). C5 lets the camera cut
// a hand; nothing lets a hand cut its neighbour. So the fan is pushed toward the rim, exactly as
// far as it needs to lie inside the strip's inner edge and not a millimetre further: a fan that
// already fits is drawn where it always was, and what then hangs past the rim is the table's to
// hold (`feltWithHands`), as a turned hand's already does. Which way the rim lies is the zone's
// own question and not the drawing's — every fan on the TV faces the viewer and still sits at
// its own edge.
//
// How far a fan reaches across its strip is what its cards' turning gives it: a read fan's steps
// run along the strip, so they are left out of the measure. The one fan whose steps run across
// its strip — a side seat's read fan on the observer's TV, spread toward the viewer beside a
// strip that runs up the rim (C8) — is drawn where it always was: how such a fan should lie is
// its own question, and pushing it out by its whole spread would hang it a third of a metre past
// the rim and shrink the whole table to hold it.
export function handAnchor(hand: ZoneView, floor: ZoneView, rot: number): Point {
  const g = hand.geometry
  const at = { x: g.x + g.w / 2, y: g.y + g.h / 2 }
  const { count, spread } = fanned(hand)
  const reach = fanExtent(count, spread, false)
  if (!reach) return at
  const fan = turn(reach, rot)
  switch (edgeRotation(hand, floor)) {
    case 0:
      return { ...at, y: at.y + Math.max(0, g.y - (at.y + fan.y)) }
    case 180:
      return { ...at, y: at.y - Math.max(0, at.y + fan.y + fan.h - (g.y + g.h)) }
    case -90:
      return { ...at, x: at.x + Math.max(0, g.x - (at.x + fan.x)) }
    default:
      return { ...at, x: at.x - Math.max(0, at.x + fan.x + fan.w - (g.x + g.w)) }
  }
}

// The point a hand is drawn about, and measured about. A hand folded to its count (#77) has no
// fan to be pushed toward the rim by, so it stands in the middle of its own zone; every other
// hand stands where its fan is anchored. Asked once here, so that what is drawn and what a fit
// keeps inside its picture can never be two different points.
export function handAt(hand: ZoneView, floor: ZoneView, rot: number, folded = false): Point {
  const g = hand.geometry
  return folded ? { x: g.x + g.w / 2, y: g.y + g.h / 2 } : handAnchor(hand, floor, rot)
}

// The line a hand's count badge hangs from, in table millimetres (#413).
//
// The badge is a label in pixels, like a pile's name, so no measure in millimetres can own its
// height — but the place it hangs from is the fan's own, and that is a millimetre of the felt like
// any other. A fit that keeps this point inside the picture, with a pill's air past it
// (`TV_AIR_PX`), keeps the whole badge inside; a fit that never asks lets the number be cut in
// half at the top of a television, which is what the TV did at 1920 × 1080 (#413).
//
// It answers for a hand holding nothing too, because such a hand draws its nought like every
// other hand draws its number. It hangs off the zone's own middle there, well inside the felt,
// and a fit that asked only about hands with cards in them would be a fit that changes shape when
// somebody plays their last card.
export function handCountAt(hand: ZoneView, floor: ZoneView, rot: number, folded = false): Point {
  const at = handAt(hand, floor, rot, folded)
  const mm = countSide(hand, floor, rot) === 'above' ? -HAND_COUNT_ABOVE_MM : HAND_COUNT_MM
  // The badge rides inside `.byd-hand`, which is what the rotation is written on, so its offset
  // turns with the hand exactly as the fan does.
  const hung = turn({ x: 0, y: mm, w: 0, h: 0 }, rot)
  return { x: at.x + hung.x, y: at.y + hung.y }
}

// Where a hand's fan lies on the felt, in table millimetres, once it has been turned toward its
// own edge and anchored in its zone. The count under it is a label in pixels, like a pile's
// name, and rides in the air the frame already leaves around the table.
export function handExtent(hand: ZoneView, floor: ZoneView, rot: number): Rect | null {
  const { count, spread } = fanned(hand)
  const local = fanExtent(count, spread)
  if (!local) return null
  const fan = turn(local, rot)
  const at = handAnchor(hand, floor, rot)
  return { ...fan, x: fan.x + at.x, y: fan.y + at.y }
}

// The fan itself, about the hand's own centre and before it is turned: every card where the
// browser will put it, each one turned about the corner CSS turns it about. Without its steps,
// it is how far the cards' turning alone reaches, which is a fan's reach across its strip.
function fanExtent(count: number, spread: boolean, stepped = true): Rect | null {
  const boxes: Rect[] = []
  for (let i = 0; i < count; i++) {
    const { step, tilt } = fanPlace(i, count, spread)
    const box = { ...HAND_CARD_BOX, x: HAND_CARD_BOX.x + (stepped ? step : 0) }
    boxes.push(spun(box, { x: box.x + FAN_PIVOT.x * box.w, y: box.y + FAN_PIVOT.y * box.h }, tilt))
  }
  return union(boxes)
}

// A rectangle turned `deg` about a point, as the box that holds the turned corners.
function spun(r: Rect, about: { x: number; y: number }, deg: number): Rect {
  const a = (deg * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  const corners = [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x, y: r.y + r.h },
    { x: r.x + r.w, y: r.y + r.h },
  ].map((p) => {
    const dx = p.x - about.x
    const dy = p.y - about.y
    return { x: about.x + dx * cos - dy * sin, y: about.y + dx * sin + dy * cos, w: 0, h: 0 }
  })
  return union(corners) ?? r
}

const turn = (r: Rect, deg: number): Rect => spun(r, { x: 0, y: 0 }, deg)

// The felt with its hands on: the floor grown, evenly on every side, until every fan lies inside
// it. This is what the fit must pass into the frame, or a table fitted edge to edge clips its own
// hands (#23). Evenly, because the frame centres the floor: growing one side alone would leave
// the table hanging off centre in its own frame.
export function feltWithHands(floor: Rect, hands: readonly (Rect | null)[]): Size {
  let out = { w: 0, h: 0 }
  for (const r of hands) {
    if (!r) continue
    out = {
      w: Math.max(out.w, floor.x - r.x, r.x + r.w - (floor.x + floor.w)),
      h: Math.max(out.h, floor.y - r.y, r.y + r.h - (floor.y + floor.h)),
    }
  }
  return { w: floor.w + 2 * Math.max(0, out.w), h: floor.h + 2 * Math.max(0, out.h) }
}
