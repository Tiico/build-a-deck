/* global document */
/* Solfjäderns geometri, porterad ordagrant ur `packages/web/src/table/hand.ts` och
 * `packages/web/src/table/drop.ts`, för prototypen till «kortet på väg in i en hand».
 *
 * Porterad och inte påhittad, eftersom hela frågan är *var* en hand tar emot: fläkten är
 * djupare än sin remsa och hänger ut förbi filtkanten (K2, reviderad #65), och en prototyp som
 * ritade en egen träffyta hade svarat på en annan fråga än den som ska avgöras.
 *
 * Kastas när implementationen är inne.
 */

// ── hand.ts, ordagrant ──────────────────────────────────────────────────────────────────────
export const HAND_CARD_MM = { w: 54, h: 75 }
export const HAND_STEP_MM = 26
export const FAN_MAX = 12
export const FAN_TILT = 7
export const BACK_TILT = 9
export const FAN_PIVOT = { x: 0.5, y: 1.4 }
export const HAND_CARD_BOX = { x: -HAND_CARD_MM.w / 2, y: -HAND_CARD_MM.h / 3, w: HAND_CARD_MM.w, h: HAND_CARD_MM.h }
export const HAND_COUNT_MM = HAND_CARD_BOX.y + HAND_CARD_BOX.h
export const HAND_COUNT_ABOVE_MM = -HAND_CARD_BOX.y
export const CARD_MM = { w: 63, h: 88 }

export function union(rs) {
  let out = null
  for (const r of rs) {
    if (!r) continue
    out = out === null ? { ...r } : {
      x: Math.min(out.x, r.x),
      y: Math.min(out.y, r.y),
      w: Math.max(out.x + out.w, r.x + r.w) - Math.min(out.x, r.x),
      h: Math.max(out.y + out.h, r.y + r.h) - Math.min(out.y, r.y),
    }
  }
  return out
}

export function edgeRotation(hand, floor) {
  const dx = hand.x + hand.w / 2 - (floor.x + floor.w / 2)
  const dy = hand.y + hand.h / 2 - (floor.y + floor.h / 2)
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? -90 : 90
  return dy > 0 ? 0 : 180
}

export const handRotation = (hand, floor, mode) => (mode === 'table' ? edgeRotation(hand, floor) : 0)

export function countSide(hand, floor, rot) {
  return (((edgeRotation(hand, floor) - rot) % 360) + 360) % 360 === 180 ? 'above' : 'below'
}

export function fanPlace(i, count, spread) {
  const k = i - (count - 1) / 2
  return { step: spread ? k * HAND_STEP_MM : 0, tilt: k * (spread ? FAN_TILT : BACK_TILT) }
}

function spun(r, about, deg) {
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
const turn = (r, deg) => spun(r, { x: 0, y: 0 }, deg)

function fanExtent(count, spread, stepped = true) {
  const boxes = []
  for (let i = 0; i < count; i++) {
    const { step, tilt } = fanPlace(i, count, spread)
    const box = { ...HAND_CARD_BOX, x: HAND_CARD_BOX.x + (stepped ? step : 0) }
    boxes.push(spun(box, { x: box.x + FAN_PIVOT.x * box.w, y: box.y + FAN_PIVOT.y * box.h }, tilt))
  }
  return union(boxes)
}

export function handAnchor(hand, floor, rot, count, spread) {
  const at = { x: hand.x + hand.w / 2, y: hand.y + hand.h / 2 }
  const reach = fanExtent(Math.min(count, FAN_MAX), spread, false)
  if (!reach) return at
  const fan = turn(reach, rot)
  switch (edgeRotation(hand, floor)) {
    case 0: return { ...at, y: at.y + Math.max(0, hand.y - (at.y + fan.y)) }
    case 180: return { ...at, y: at.y - Math.max(0, at.y + fan.y + fan.h - (hand.y + hand.h)) }
    case -90: return { ...at, x: at.x + Math.max(0, hand.x - (at.x + fan.x)) }
    default: return { ...at, x: at.x - Math.max(0, at.x + fan.x + fan.w - (hand.x + hand.w)) }
  }
}

// Fläktens utsträckning i filtens millimeter: det som tar emot ett släpp i en hand (K2, #65).
export function handExtent(hand, floor, rot, count, spread) {
  const local = fanExtent(Math.min(count, FAN_MAX), spread)
  if (!local) return null
  const fan = turn(local, rot)
  const at = handAnchor(hand, floor, rot, count, spread)
  return { ...fan, x: fan.x + at.x, y: fan.y + at.y }
}

export const inside = (r, p) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h
