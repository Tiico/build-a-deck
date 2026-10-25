import type { FeltRoom } from './TableRenderer.js'
import type { Size } from './fit.js'
import { overscanPx } from './camera.js'

// The room's television is a stage beside the felt (#1290, beställarens beslut A 2026-10-25): the
// card the latest line was about, at a size the sofa reads, where the column used to hold a card
// of 190 px and three sentences of log.
//
// The stage is paid for in the felt's width, and the felt is bound by its height only while it has
// width to spare. A four-seat table has it — its card goes from 78 to 57 px for a stage of 760 —
// but an eight-seat table stood at K9's 45 px already beside the old column, so a fixed width would
// have taken the floor away from exactly the tables with the most on them. The stage is therefore
// as wide as the felt can give and keep a card at 45 px, up to 760, and never narrower than the
// 360 px the column it replaced had: what the felt had before stays what it has at the least.
export const STAGE_MIN_PX = 360
export const STAGE_MAX_PX = 760
// K9's card at rest, the same 45 px `/online` asks `onFit` about (#1131).
const CARD_FLOOR_PX = 45
const STEP_PX = 8

// A card on the felt in a frame of this size, as the TV's camera draws it: `onFit` answers for the
// whole frame, and the camera frames within the overscan it leaves on every side (C5, #322). At
// eight seats the difference was the pixel between K9's 45 and 44.
export function feltCardAt(felt: FeltRoom, frame: Size): number {
  const air = overscanPx(frame)
  return felt.cardPxAt({ w: frame.w - 2 * air, h: frame.h - 2 * air })
}

// `beside` is the stage the felt's frame was measured next to, so the answer is the same whichever
// stage was standing when the felt was last fitted, and setting it cannot move it again.
export function stageWidth(felt: FeltRoom, beside: number): number {
  const across = felt.frame.w + beside
  const fits = (stage: number) => feltCardAt(felt, { w: across - stage, h: felt.frame.h }) >= CARD_FLOOR_PX
  for (let stage = STAGE_MAX_PX; stage > STAGE_MIN_PX; stage -= STEP_PX) if (fits(stage)) return stage
  return STAGE_MIN_PX
}
