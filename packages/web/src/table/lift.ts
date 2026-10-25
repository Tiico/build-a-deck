import { CARD_MM } from './drop.js'
import { readingWidth } from '../legibility.js'

// The card a first press reads (K26, #509): lifted up beside itself, in the room the window has.
//
// Its size is a share of the window's height, because the felt is bound by its height (K9) and a
// card is taller than it is wide, so height is what runs out first. The share is the one the
// prototype was approved at, and it is the smallest that carries the wizard's 8.5 pt body text at
// the desk's 14 px (K26) on the smallest screen the table is measured at, 1024 × 768: 476 px of
// height is a card 341 px wide and a body of 16.4 px. A larger window reads larger; a fixed card,
// which «Titta» was at 252 px, reads the same 12 px on every screen and never more.
//
// It lies beside the card and not over it, so the card being read is still where the eye left
// it, and on the side with room; it stands level with the card where the window lets it. A window
// with room on neither side centres it, which covers the card, and is the least bad answer.
export { LIFT_GAP, LIFT_SHARE } from './lift-share.js'
import { LIFT_GAP, LIFT_SHARE } from './lift-share.js'

export type Edges = { left: number; right: number; top: number; bottom: number }
export type Box = { left: number; top: number; w: number; h: number }

// `smallestPt`: the card's own smallest text (#523). A card whose words are smaller than the
// wizard's frame is lifted larger, until they reach the desk's floor or the window's height.
export function liftBox(card: Edges, window: { w: number; h: number }, smallestPt?: number | null): Box {
  const share = window.h * LIFT_SHARE
  const need = (readingWidth((share * CARD_MM.w) / CARD_MM.h, smallestPt, 'desk') * CARD_MM.h) / CARD_MM.w
  const h = Math.min(need, window.h - 2 * LIFT_GAP)
  const w = (h * CARD_MM.w) / CARD_MM.h
  const onRight = window.w - card.right - LIFT_GAP >= w + LIFT_GAP
  const onLeft = card.left - LIFT_GAP >= w + LIFT_GAP
  const left = onRight ? card.right + LIFT_GAP : onLeft ? card.left - LIFT_GAP - w : (window.w - w) / 2
  const level = (card.top + card.bottom) / 2 - h / 2
  const top = Math.min(Math.max(level, LIFT_GAP), window.h - h - LIFT_GAP)
  return { left, top, w, h }
}

// The same card lifted over itself rather than beside it (#1310, prototype A): the hand along the
// foot of `/play` in a wide window has the targets over it, and a card in the middle of the row has
// no room at either side. The lift stands over the card, centred on it and kept inside the window,
// and leaves `line` pixels between itself and the card for the line that says what the hand
// answers to. It is the size `liftBox` gives, or what the room over the card holds where that is less.
export function liftOver(card: Edges, window: { w: number; h: number }, line: number, smallestPt?: number | null): Box {
  const share = window.h * LIFT_SHARE
  const need = (readingWidth((share * CARD_MM.w) / CARD_MM.h, smallestPt, 'desk') * CARD_MM.h) / CARD_MM.w
  const h = Math.max(0, Math.min(need, card.top - 3 * LIFT_GAP - line))
  const w = (h * CARD_MM.w) / CARD_MM.h
  const left = Math.min(Math.max((card.left + card.right) / 2 - w / 2, LIFT_GAP), window.w - w - LIFT_GAP)
  return { left, top: card.top - 2 * LIFT_GAP - line - h, w, h }
}
