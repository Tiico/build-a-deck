import type { BoxTypeDef, ComponentTypeDef } from './typedef.js'

// The box's measure out of the deck (#1412, #1406). Pure arithmetic over the type and the deck: the
// editor, the physical check and the presentations to come (#1413, #1414) all ask here, so the box
// a designer sees, the one the check holds the deck to and the one that is drawn are one box.
//
//   width  = the card's width  + 2 × the air around the card
//   height = the card's height + 2 × the air around the card
//   depth  = cards × the card's thickness + the air in the depth, rounded up to the type's step
//
// A locked measure is the value it had when it was locked (#1406, beslut 4), stored in the game's
// document. It stands while the deck grows, and the measures that are not locked go on following.

export const BOX_SIDES = ['width', 'height', 'depth'] as const
export type BoxSide = (typeof BOX_SIDES)[number]
export type BoxMeasure = Record<BoxSide, number>
export type BoxClearance = { around: number; depth: number }
// What a game may leave unsaid, which is then the type's or the deck's.
export type Unsaid<T> = { [K in keyof T]?: T[K] | undefined }
export type BoxCard = Pick<ComponentTypeDef['physical'], 'widthMm' | 'heightMm' | 'thicknessMm'>

// Floating point must not move a measure that stands on its step one step up (0,3 × 10 is
// 3,0000000000000004), nor say that a card which fits exactly does not.
const EPSILON = 1e-9
const tidy = (mm: number): number => Math.round(mm * 1e6) / 1e6
const upTo = (mm: number, step: number): number => tidy(Math.ceil((mm - EPSILON) / step) * step)

const clearanceOf = (type: BoxTypeDef, clearance: Unsaid<BoxClearance> | undefined): BoxClearance => ({
  around: clearance?.around ?? type.holds.clearanceMm.around,
  depth: clearance?.depth ?? type.holds.clearanceMm.depth,
})
const countOf = (cards: number): number => Math.max(0, Math.floor(cards) || 0)

// The box the deck asks for, with the type's air unless the game has its own.
export function boxMeasure(type: BoxTypeDef, card: BoxCard, cards: number, clearance?: Unsaid<BoxClearance>): BoxMeasure {
  const air = clearanceOf(type, clearance)
  return {
    width: tidy(card.widthMm + 2 * air.around),
    height: tidy(card.heightMm + 2 * air.around),
    depth: upTo(countOf(cards) * card.thicknessMm + air.depth, type.holds.stepMm),
  }
}

export type BoxFitInput = {
  type: BoxTypeDef
  card: BoxCard
  cards: number
  clearance?: Unsaid<BoxClearance> | undefined
  locked?: Unsaid<BoxMeasure> | undefined
}

export type BoxFit = {
  // What the box is: a locked measure as it was locked, the rest following the deck.
  size: BoxMeasure
  // What the deck asks for, locks or not.
  follows: BoxMeasure
  locked: Record<BoxSide, boolean>
  clearance: BoxClearance
  // How thick the deck is, and how much of the depth is left for it once the air is taken.
  deckMm: number
  roomMm: number
  // How many cards the box holds, and how many of the deck's do not fit.
  holds: number
  over: number
  // The locked measure that keeps the deck out, the width before the height before the depth.
  short: BoxSide | null
}

export function boxFit({ type, card, cards, clearance, locked }: BoxFitInput): BoxFit {
  const count = countOf(cards)
  const air = clearanceOf(type, clearance)
  const follows = boxMeasure(type, card, count, air)
  const size: BoxMeasure = {
    width: locked?.width ?? follows.width,
    height: locked?.height ?? follows.height,
    depth: locked?.depth ?? follows.depth,
  }
  const roomMm = tidy(Math.max(0, size.depth - air.depth))
  // A card that is wider or taller than the box leaves its air holds no card at all, however deep.
  const narrow: BoxSide | null = size.width - 2 * air.around < card.widthMm - EPSILON ? 'width' : size.height - 2 * air.around < card.heightMm - EPSILON ? 'height' : null
  const holds = narrow ? 0 : Math.floor(roomMm / card.thicknessMm + EPSILON)
  const over = Math.max(0, count - holds)
  return {
    size,
    follows,
    locked: { width: locked?.width !== undefined, height: locked?.height !== undefined, depth: locked?.depth !== undefined },
    clearance: air,
    deckMm: tidy(count * card.thicknessMm),
    roomMm,
    holds,
    over,
    short: over === 0 ? null : (narrow ?? 'depth'),
  }
}
