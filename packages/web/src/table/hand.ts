import type { ZoneView } from '@byd/protocol'
import { union, type Rect, type Size } from './camera.js'

// A hand is a fan of cards lying on the felt, so it is measured in the table's own millimetres
// like everything else on it, and the renderer scales it as it scales the rest (#23). The
// numbers are the pixels prototype B was drawn in, which is what they mean at life size.

// A card in a hand is drawn a shade smaller than one on the felt: it is held, not played.
export const HAND_CARD_MM = { w: 54, h: 75 }
// How far apart two cards of a read fan sit, and how far the count hangs below the hand's centre.
export const HAND_STEP_MM = 26
export const HAND_COUNT_MM = 50
// A fan stops growing here; beyond it the count says the rest.
export const FAN_MAX = 12
// Degrees between two cards: a read fan steps sideways as well, a fan of backs only turns.
export const FAN_TILT = 7
export const BACK_TILT = 9
// The corner each card turns about, as a share of its own box: `transform-origin: 50% 140%`.
export const FAN_PIVOT = { x: 0.5, y: 1.4 }

// In table mode a hand faces the edge it sits at, like a real player would (C5). The rule lives
// here because the fan is drawn by it and measured by it, and the two must never disagree.
export function edgeRotation(hand: ZoneView, floor: ZoneView): number {
  const dx = hand.geometry.x + hand.geometry.w / 2 - (floor.geometry.x + floor.geometry.w / 2)
  const dy = hand.geometry.y + hand.geometry.h / 2 - (floor.geometry.y + floor.geometry.h / 2)
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? -90 : 90
  return dy > 0 ? 0 : 180
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

// Where card `i` of a fan of `count` sits: how far it steps sideways, in millimetres, and how far
// it turns. One rule, asked by the renderer that draws the fan and by the extent that measures it.
export function fanPlace(i: number, count: number, spread: boolean): { step: number; tilt: number } {
  const k = i - (count - 1) / 2
  return { step: spread ? k * HAND_STEP_MM : 0, tilt: k * (spread ? FAN_TILT : BACK_TILT) }
}

// Where a hand's fan lies on the felt, in table millimetres, once it has been turned toward its
// own edge. The count under it is a label in pixels, like a pile's name, and rides in the air
// the frame already leaves around the table.
export function handExtent(hand: ZoneView, rot: number): Rect | null {
  const { count, spread } = fanned(hand)
  const local = fanExtent(count, spread)
  if (!local) return null
  const turned = turn(local, rot)
  return { ...turned, x: turned.x + hand.geometry.x + hand.geometry.w / 2, y: turned.y + hand.geometry.y + hand.geometry.h / 2 }
}

// The fan itself, about the hand's own centre and before it is turned: every card where the
// browser will put it, each one turned about the corner CSS turns it about.
function fanExtent(count: number, spread: boolean): Rect | null {
  const boxes: Rect[] = []
  for (let i = 0; i < count; i++) {
    const { step, tilt } = fanPlace(i, count, spread)
    const box = { ...HAND_CARD_BOX, x: HAND_CARD_BOX.x + step }
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
