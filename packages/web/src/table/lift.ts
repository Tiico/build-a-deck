import { CARD_MM } from './drop.js'

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
export const LIFT_SHARE = 0.62
// The air between the card and its lift, and between the lift and the window's edge.
export const LIFT_GAP = 16

export type Edges = { left: number; right: number; top: number; bottom: number }
export type Box = { left: number; top: number; w: number; h: number }

export function liftBox(card: Edges, window: { w: number; h: number }): Box {
  const h = Math.min(window.h * LIFT_SHARE, window.h - 2 * LIFT_GAP)
  const w = (h * CARD_MM.w) / CARD_MM.h
  const onRight = window.w - card.right - LIFT_GAP >= w + LIFT_GAP
  const onLeft = card.left - LIFT_GAP >= w + LIFT_GAP
  const left = onRight ? card.right + LIFT_GAP : onLeft ? card.left - LIFT_GAP - w : (window.w - w) / 2
  const level = (card.top + card.bottom) / 2 - h / 2
  const top = Math.min(Math.max(level, LIFT_GAP), window.h - h - LIFT_GAP)
  return { left, top, w, h }
}
