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

// Where card `i` of `count` sits: how far it is turned, and how far it falls. Both the fan and
// the room the fan needs are worked out from this one rule, so they cannot drift apart.
export function fanPlace(i: number, count: number): { tilt: number; dip: number } {
  const k = i - (count - 1) / 2
  return { tilt: k * FAN_TILT, dip: Math.abs(k) * FAN_DIP }
}

// The fan as it is actually painted, in card widths, relative to the box the flex row occupies.
// `span` is how wide it paints at the full step, `edge` how wide it would still paint if the
// cards lay right on top of each other — the part no tightening can buy back — and `drop` how far
// below the row's own bottom edge the lowest corner falls.
export type FanShape = { span: number; edge: number; drop: number }

export function fanShape(count: number): FanShape {
  const wide = painted(count, FAN_STEP)
  return { span: wide.right - wide.left, edge: width(painted(count, 0)), drop: wide.bottom - CARD_RATIO }
}

type Extent = { left: number; right: number; bottom: number }
const width = (e: Extent) => e.right - e.left

// Every corner of every card where the browser will paint it: laid out along the row, moved down
// by its dip, then turned about the point below it — which is `rotate(...) translateY(...)`, the
// transform applied right to left.
function painted(count: number, step: number): Extent {
  const h = CARD_RATIO
  const out: Extent = { left: Infinity, right: -Infinity, bottom: -Infinity }
  for (let i = 0; i < count; i++) {
    const { tilt, dip } = fanPlace(i, count)
    const left = i * step
    const about = { x: left + FAN_PIVOT.x, y: FAN_PIVOT.y * h }
    const a = (tilt * Math.PI) / 180
    const [cos, sin] = [Math.cos(a), Math.sin(a)]
    for (const p of [
      { x: left, y: 0 },
      { x: left + 1, y: 0 },
      { x: left, y: h },
      { x: left + 1, y: h },
    ]) {
      const dx = p.x - about.x
      const dy = p.y - about.y + dip
      const x = about.x + dx * cos - dy * sin
      const y = about.y + dx * sin + dy * cos
      out.left = Math.min(out.left, x)
      out.right = Math.max(out.right, x)
      out.bottom = Math.max(out.bottom, y)
    }
  }
  return count === 0 ? { left: 0, right: 0, bottom: h } : out
}

// The custom properties the fan is drawn from, as CSS the browser resolves against the screen it
// is on: the card as large as prototype B read it and no larger, shrinking to fit the width it
// has, and never under a fingertip — at which point the step tightens instead, because a hand
// with more cards than room holds them closer together rather than becoming untouchable.
export function fanStyle(count: number): Record<string, string> {
  const { span, edge, drop } = fanShape(count)
  const room = `(100vw - ${2 * FAN_GUTTER_PX}px)`
  const card = `clamp(${FAN_MIN_PX}px, ${room} / ${round(span)}, ${FAN_CARD_PX}px)`
  const full = `${round(FAN_STEP)} * var(--fan-card)`
  return {
    '--fan-card': card,
    '--fan-step': count > 1 ? `clamp(0px, (${room} - ${round(edge)} * var(--fan-card)) / ${count - 1}, ${full})` : `calc(${full})`,
    '--fan-drop': round(drop),
    '--fan-gutter': `${FAN_GUTTER_PX}px`,
    '--fan-pivot': `${FAN_PIVOT.y * 100}%`,
  }
}

const round = (n: number) => n.toFixed(4)
