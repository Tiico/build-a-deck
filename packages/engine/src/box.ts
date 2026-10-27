import type { BoxFace, BoxTypeDef, ComponentTypeDef } from './typedef.js'

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

// ── En yta och nätet (#1413) ─────────────────────────────────────────────────────────────────────

export type FaceSize = { widthMm: number; heightMm: number }

// The measure of one face: the front and the back are the box's width by its height, the sides its
// depth by its height, and the lid and the bottom its width by its depth. A face's template is laid
// out in exactly this rectangle, and the net puts exactly this rectangle on the sheet.
export function boxFaceSize(face: BoxFace, size: BoxMeasure): FaceSize {
  switch (face) {
    case 'front':
    case 'back':
      return { widthMm: size.width, heightMm: size.height }
    case 'left':
    case 'right':
      return { widthMm: size.depth, heightMm: size.height }
    case 'lid':
    case 'bottom':
      return { widthMm: size.width, heightMm: size.depth }
  }
}

// What the one renderer draws a face of the box as (E2): a straight board of the face's measure,
// with the box's bleed, safe area and print profile. `compile` takes a component type, and this is
// the face put in those terms. It is made where it is drawn and never registered: a table never
// lays a face of a box, and nothing looks it up by its id.
export function boxFaceType(type: BoxTypeDef, face: BoxFace, size: BoxMeasure): ComponentTypeDef {
  const { widthMm, heightMm } = boxFaceSize(face, size)
  return {
    id: `${type.id}.${face}`,
    version: type.version,
    physical: { shape: 'rect', widthMm, heightMm, thicknessMm: type.physical.thicknessMm, material: type.physical.material },
    faces: ['front'],
    contentFace: 'front',
    behaviours: { stackable: false, shufflable: false, flippable: false, rollable: false, counter: false },
    editorSchema: [],
    print: { ...type.print },
    manufacturableBy: [...type.manufacturableBy],
  }
}

// The tuckbox unfolded on the sheet, in millimetres from its top left corner (#1413, #1406 variant
// A). Read left to right: the glue flap, the left side, the front, the right side and the back. The
// lid hangs on the back with its tuck flap above it, drawn upside down as it stands on the sheet,
// and the bottom hangs under the front with its own. The sides carry dust flaps at both ends.
//
// A panel is where a face's template is drawn; the flaps and the lines are the net's own, since they
// are folded in and never printed.
export type NetPanel = { face: BoxFace; x: number; y: number; width: number; height: number; turned: boolean }
export type NetFlap =
  | { kind: 'glue' | 'dust'; points: [number, number][] }
  // A tuck flap is a rectangle with its free corners rounded, opening away from its face.
  | { kind: 'tuck'; x: number; y: number; width: number; height: number; opens: 'up' | 'down' }
// A fold, from one end to the other.
export type NetFold = [number, number, number, number]
export type BoxNet = { width: number; height: number; panels: NetPanel[]; flaps: NetFlap[]; folds: NetFold[] }

// How far the glue flap and the dust flaps are drawn in at their free end, so they fold past the
// panel beside them.
const GLUE_INSET_MM = 5
const DUST_INSET_MM = 3

export function tuckNet(type: BoxTypeDef, size: BoxMeasure): BoxNet {
  const { glueMm, tuckMm, dust } = type.physical.flaps
  const { width: W, height: H, depth: D } = size
  const xL = glueMm
  const xF = tidy(xL + D)
  const xR = tidy(xF + W)
  const xB = tidy(xR + D)
  const yLid = tuckMm
  const yK = tidy(yLid + D)
  const yBot = tidy(yK + H)
  const yTuck = tidy(yBot + D)
  const dd = tidy(dust * D)
  const at = (face: BoxFace, x: number, y: number, turned = false): NetPanel => {
    const { widthMm, heightMm } = boxFaceSize(face, size)
    return { face, x, y, width: widthMm, height: heightMm, turned }
  }
  const dustFlap = (x: number, y: number, toward: 1 | -1): NetFlap => ({
    kind: 'dust',
    points: [
      [x, y],
      [tidy(x + DUST_INSET_MM), tidy(y + toward * dd)],
      [tidy(x + D - DUST_INSET_MM), tidy(y + toward * dd)],
      [tidy(x + D), y],
    ],
  })
  return {
    width: tidy(glueMm + 2 * D + 2 * W),
    height: tidy(2 * tuckMm + 2 * D + H),
    panels: [at('left', xL, yK), at('front', xF, yK), at('right', xR, yK), at('back', xB, yK), at('lid', xB, yLid, true), at('bottom', xF, yBot)],
    flaps: [
      {
        kind: 'glue',
        points: [
          [0, tidy(yK + GLUE_INSET_MM)],
          [xL, yK],
          [xL, yBot],
          [0, tidy(yBot - GLUE_INSET_MM)],
        ],
      },
      dustFlap(xL, yK, -1),
      dustFlap(xR, yK, -1),
      dustFlap(xL, yBot, 1),
      dustFlap(xR, yBot, 1),
      { kind: 'tuck', x: xB, y: 0, width: W, height: tuckMm, opens: 'up' },
      { kind: 'tuck', x: xF, y: yTuck, width: W, height: tuckMm, opens: 'down' },
    ],
    folds: [
      [xL, yK, xL, yBot],
      [xF, yK, xF, yBot],
      [xR, yK, xR, yBot],
      [xB, yK, xB, yBot],
      [xB, yLid, tidy(xB + W), yLid],
      [xB, yK, tidy(xB + W), yK],
      [xF, yBot, tidy(xF + W), yBot],
      [xF, yTuck, tidy(xF + W), yTuck],
      [xL, yK, xF, yK],
      [xR, yK, xB, yK],
      [xL, yBot, xF, yBot],
      [xR, yBot, xB, yBot],
    ],
  }
}
