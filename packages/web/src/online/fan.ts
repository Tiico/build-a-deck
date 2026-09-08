// The seat's own hand in the distance view (C2, K9, prototype B). It is not furniture on the
// felt — a hand drawn on the felt is millimetres and scales with the table (#23) — but the cards
// this seat is holding, in front of the screen, at the size they are read and dragged at. That is
// why these numbers are pixels and the felt's are not.
//
// They live here rather than in the stylesheet because a card in the fan is turned about a point
// below itself and dipped, so it is painted well outside the box the flex row lays it in: three
// cards at prototype B's size reach fourteen pixels below the row and thirty-five past its sides.
// `online.css` reserved six pixels for that, guessed, and the screen cut off the rest. So the
// shape and the room the shape needs are one answer here, as `table/hand.ts` does it for the felt.

// Prototype B's card, at the size it is read at, and the smallest a control may ever be (#6).
export const FAN_CARD_PX = 112
export const FAN_MIN_PX = 44
// The card keeps its reading size and stops shrinking to fit (#24): a hand of twenty-one is not
// made readable by making every card smaller, it is made readable by letting the hand be wider
// than the band and scroll. So the card is a share of the screen, held between the size it is
// read at and the smallest thing that is still a card rather than a chip.
export const FAN_CARD_MIN_PX = 56
export const FAN_CARD_VW = 22
// How far a card rises out of the fan when the pointer or the keyboard picks it out. The band
// reserves it, because the band is a row of the page and not a layer over it: a lift with no
// room to rise into is a lift the scroller clips.
export const FAN_RISE_PX = 28
// How far a press has to travel before it has said which of the band's two gestures it is: a
// card dragged out to be played, or the fan scrolled sideways. Short enough that a real drag is
// never held up, long enough that the wobble in a thumb coming down is not read as either.
export const FAN_AIM_PX = 12
// Air the fan keeps at the screen's edges. The focus ring the keyboard put on a hand card (#1,
// #2) reaches eight pixels out of the card's own box, and a turned card carries it out as far as
// its diagonal — so the gutter is that reach at forty-five degrees, rounded up.
export const FAN_RING_PX = 8
export const FAN_GUTTER_PX = Math.ceil(FAN_RING_PX * Math.SQRT2)
// The physical card, as `aspect-ratio: 63 / 88` in the stylesheet says it.
export const CARD_RATIO = 88 / 63
// How much of a card each of its neighbours hides — the negative margin the row is laid out with
// — and the step from one card to the next that it leaves.
export const FAN_OVERLAP = 22 / 112
export const FAN_STEP = 1 - 2 * FAN_OVERLAP
// Degrees between two cards, how far each one falls from the middle of the fan as a share of a
// card's width, and the point below the card that it turns about (`transform-origin`).
export const FAN_TILT = 8
export const FAN_DIP = 6 / 112
export const FAN_PIVOT = { x: 0.5, y: 1.3 }
// How far the whole hand may lean, from the leftmost card's turn to the rightmost (#24). Eight
// degrees apiece with nothing on top of it made twenty-one cards span 160°, a rainbow whose
// outermost card stood 80° from upright and could not be read. This is the one number that
// decides how the hand is shaped, and it is meant to be tuned: 24 packs harder, 40 reads as a
// card index. Thirty is what the prototype was approved at, and it lives here alone so that
// changing it changes the drawing and the room the drawing needs in the same breath.
export const FAN_ARC_MAX = 30

// How far apart two neighbours lean: the full tilt while the hand is small, and whatever divides
// the cap between them once it is not.
const fanTilt = (count: number): number => (count > 1 ? Math.min(FAN_TILT, FAN_ARC_MAX / (count - 1)) : 0)

// Where card `i` of `count` sits: how far it is turned, and how far it falls. Both the fan and
// the room the fan needs are worked out from this one rule, so they cannot drift apart. The dip
// follows the tilt down: a fan that leans less also sags less, or a flat hand would still hang.
export function fanPlace(i: number, count: number): { tilt: number; dip: number } {
  const k = i - (count - 1) / 2
  const tilt = fanTilt(count)
  return { tilt: k * tilt, dip: Math.abs(k) * FAN_DIP * (tilt / FAN_TILT) }
}

// The fan as it is actually painted, in card widths, relative to the boxes the cards are laid
// out in. A card is turned about a point below its own box, so where it lands past that box
// depends on its own tilt and on nothing else — not on how far apart the cards stand. That is
// why one shape answers for every step the screen may end up choosing:
// `over` is how far past its own side the outermost card paints, `edge` the width the whole hand
// would still paint if the cards lay right on top of each other (`1 + 2 * over`, and the part no
// tightening can buy back), `lift` how far above the row's top edge it reaches and `drop` how far
// below its bottom.
export type FanShape = { edge: number; over: number; lift: number; drop: number }

export function fanShape(count: number): FanShape {
  const e = painted(count)
  return { edge: e.right - e.left, over: Math.max(-e.left, e.right - 1), lift: Math.max(0, -e.top), drop: Math.max(0, e.bottom - CARD_RATIO) }
}

type Extent = { left: number; right: number; top: number; bottom: number }

// Every corner of every card where the browser will paint it, with each card's own box put at
// zero: moved down by its dip, then turned about the point below it — which is
// `rotate(...) translateY(...)`, the transform applied right to left.
function painted(count: number): Extent {
  const h = CARD_RATIO
  const out: Extent = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity }
  for (let i = 0; i < count; i++) {
    const { tilt, dip } = fanPlace(i, count)
    const about = { x: FAN_PIVOT.x, y: FAN_PIVOT.y * h }
    const a = (tilt * Math.PI) / 180
    const [cos, sin] = [Math.cos(a), Math.sin(a)]
    for (const p of [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: h },
      { x: 1, y: h },
    ]) {
      const dx = p.x - about.x
      const dy = p.y - about.y + dip
      const x = about.x + dx * cos - dy * sin
      const y = about.y + dx * sin + dy * cos
      out.left = Math.min(out.left, x)
      out.right = Math.max(out.right, x)
      out.top = Math.min(out.top, y)
      out.bottom = Math.max(out.bottom, y)
    }
  }
  return count === 0 ? { left: 0, right: 1, top: 0, bottom: h } : out
}

// The custom properties the fan is drawn from, as CSS the browser resolves against the screen it
// is on. The card is read at prototype B's size and does not shrink to make room; what gives way
// is the step, which tightens until the hand fits the band and then stops at a fingertip (#6).
// A hand that still does not fit is wider than the band and scrolls sideways as a fan (#24) —
// which is why the room the shape needs is written out here too, in the same numbers: a scroller
// that reserved less than the turned cards paint would clip exactly what the cap was for.
export function fanStyle(count: number): Record<string, string> {
  const { edge, over, lift, drop } = fanShape(count)
  const room = `(100vw - ${2 * FAN_GUTTER_PX}px)`
  const card = `clamp(${FAN_CARD_MIN_PX}px, ${FAN_CARD_VW}vw, ${FAN_CARD_PX}px)`
  const full = `${round(FAN_STEP)} * var(--fan-card)`
  return {
    '--fan-card': card,
    '--fan-step': count > 1 ? `clamp(${FAN_MIN_PX}px, (${room} - ${round(edge)} * var(--fan-card)) / ${count - 1}, ${full})` : `calc(${full})`,
    '--fan-count': String(Math.max(count, 1)),
    '--fan-over': round(over),
    '--fan-lift': round(lift),
    '--fan-drop': round(drop),
    '--fan-rise': `${FAN_RISE_PX}px`,
    '--fan-gutter': `${FAN_GUTTER_PX}px`,
    '--fan-pivot': `${FAN_PIVOT.y * 100}%`,
  }
}

const round = (n: number) => n.toFixed(4)
