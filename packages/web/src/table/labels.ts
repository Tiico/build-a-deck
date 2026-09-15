import type { ZoneView } from '@byd/protocol'
import type { Rotation } from './geometry.js'

// Where a zone's name goes (K9, K19). One rule, said once:
//
//   a zone's name lies outside the zone's content, on the side away from the nearest rim of the
//   felt, and as near the middle of the seat that owns it as its own box allows — and above its
//   own top edge, from the left corner, when the zone stands at no rim, and likewise when nobody
//   owns it, which is the rule the felt has always followed.
//
// The stylesheet draws it; this says which of the four cases a zone is in, because the answer is
// in the table's millimetres and not in anything the DOM says. Piles are not part of it: the
// renderer already puts a pile's name under the pile, clear of everything.
//
// "The nearest rim" is the nearest rim *of the picture*. A felt can be turned a quarter so that
// the reader's own edge is the one at the bottom (C5), and every label is then turned back about
// its own anchor so it stays level while the cards follow the table. A rule read in the felt's
// own millimetres would therefore place a name along an axis the reader does not see: the felt's
// east rim on a table turned 90° is the bottom of the screen, and a name that stood *beside* its
// zone — one line high, taking no room along the rim — becomes a name lying *along* the rim and
// a hundred pixels of it. Two of them then land on each other. So the geometry is turned into
// the reader's frame first, and the rule is read there.
export type Rim = 'N' | 'E' | 'S' | 'W' | 'none'
// Which way a name with width is allowed to grow: `fwd` is the left corner it has always grown
// from, `back` is the other end of its own box.
export type Grow = 'fwd' | 'back'
// The corner of the zone's own box the name hangs from, in per cent of that box. It is what
// survives the turn: a label is turned back about this point, so this point — and not the edge
// the label happens to be pinned to — is what the stylesheet can place and rely on.
export type Anchor = { x: 0 | 100; y: 0 | 100 }
export type NamePlace = { rim: Rim; grow: Grow; anchor: Anchor }

// A zone stands at a rim when its own box comes this near the felt's edge. What stands at a rim
// is a seat's furniture: a hand lies on the rim itself, and the area in front of a seat and its
// counters sit 70 mm in.
export const RIM_MM = 200

type Box = { x: number; y: number; w: number; h: number }

// The same box as the reader sees it, on a felt turned a quarter (C5). Turning about the origin
// is enough: every question below is asked of one box against another.
function turn(g: Box, rotate: Rotation): Box {
  switch (rotate) {
    case 90:
      return { x: -(g.y + g.h), y: g.x, w: g.h, h: g.w }
    case 180:
      return { x: -(g.x + g.w), y: -(g.y + g.h), w: g.w, h: g.h }
    case 270:
      return { x: g.y, y: -(g.x + g.w), w: g.h, h: g.w }
    default:
      return g
  }
}

function edgeOf(b: Box, f: Box): Rim {
  const gaps: [Rim, number][] = [
    ['N', b.y - f.y],
    ['S', f.y + f.h - (b.y + b.h)],
    ['W', b.x - f.x],
    ['E', f.x + f.w - (b.x + b.w)],
  ]
  const [rim, gap] = gaps.reduce((a, b2) => (b2[1] < a[1] ? b2 : a))
  return gap <= RIM_MM ? rim : 'none'
}

// Toward the middle of its own seat. A place setting is 500 mm and a name is around 270 of it, so
// a name that grows toward its own seat's middle can never leave that seat's place; one that
// always grows rightwards from the left corner leaves it half the time, which is how `Räknare A`
// ends up lying across `Framför E` at eight seats.
//
// The sentence is read twice. At the north and south rims the name lies *along* the rim and has
// width, so which end it is anchored at decides how much of the neighbour's place it covers.
// At the east and west rims it stands *beside* its zone and is a line high rather than a line
// wide; nothing grows along the rim there, so what matters is only which end it stands at — and
// the safe end is the one nearest its own seat's middle, because the far end is the felt's
// corner, where the next rim's seat keeps its own names. Hence the comparison turns around.
function growFor(zone: Box, rim: Rim, hand: Box): Grow {
  const beside = rim === 'E' || rim === 'W'
  const middle = (g: Box) => (beside ? g.y + g.h / 2 : g.x + g.w / 2)
  const past = middle(zone) > middle(hand)
  return (beside ? !past : past) ? 'back' : 'fwd'
}

// Which corner of the zone the name hangs from, said in the reader's frame first and then in the
// felt's. The reader's answer is the whole of the rule: the corner is the end of the zone the
// name is anchored at, on the side away from the rim. The felt's answer is the same corner under
// another name, because a quarter turn only renames a box's corners.
function cornerFor(rim: Rim, grow: Grow, rotate: Rotation): Anchor {
  const beside = rim === 'E' || rim === 'W'
  const along: 0 | 100 = grow === 'fwd' ? 0 : 100
  const sx: 0 | 100 = beside ? (rim === 'E' ? 0 : 100) : along
  const sy: 0 | 100 = beside ? along : rim === 'N' ? 100 : 0
  const flip = (v: 0 | 100): 0 | 100 => (v === 0 ? 100 : 0)
  switch (rotate) {
    case 90:
      return { x: sy, y: flip(sx) }
    case 180:
      return { x: flip(sx), y: flip(sy) }
    case 270:
      return { x: flip(sy), y: sx }
    default:
      return { x: sx, y: sy }
  }
}

// The rule for one zone. A zone nobody owns keeps today's placement even when it stands at a rim,
// and that is the rule rather than an exception to it: the two halves are one sentence, and a
// zone with no seat has no seat's middle to grow toward. Sending such a name away from the rim
// without also saying which way it grows is the half-rule that was measured and rejected — it
// moves a collision instead of clearing it, and on the shared market it moves the name off the
// rim and onto the draw pile.
export function nameAt(zone: ZoneView, floor: ZoneView, hand: ZoneView | undefined, rotate: Rotation = 0): NamePlace {
  const place = (rim: Rim, grow: Grow): NamePlace => ({ rim, grow, anchor: cornerFor(rim, grow, rotate) })
  if (!hand) return place('none', 'fwd')
  const rim = edgeOf(turn(zone.geometry, rotate), turn(floor.geometry, rotate))
  return rim === 'none' ? place(rim, 'fwd') : place(rim, growFor(turn(zone.geometry, rotate), rim, turn(hand.geometry, rotate)))
}

// How near a zone above has to be before its name is in this one's way at all. Beyond it the two
// names are drawn a whole zone apart at every scale the felt is ever given, and a rule that
// reached that far would hold a name up against a neighbour it was never going to meet — which is
// how the first draft of this sent `Marknad` onto `Räknare A` on a felt turned half a turn, where
// the two are 310 mm apart. The recipe's own crowding is the 30 mm a seat's area leaves over a
// shared zone (K18); this is four times that and still nowhere near the next thing on the felt.
const CROWD_MM = 120

// The felt between a zone at no rim and the zone above it, when the one above aims its own name
// down into that felt — in the felt's own millimetres, or null when there is nobody near enough
// above to be in the way.
//
// This is the one question the rule above cannot answer on its own, and the one the stylesheet
// cannot answer at all, because it is about two names that belong to two different zones (#43).
//
// A zone at no rim puts its name above its own top edge, and a zone at the north rim puts its
// name below its own bottom edge, since above it is the hand. Where the two stand over one
// another — the market a seat's own area hangs over — both names are aimed into the same strip of
// felt. Each is placed a fixed number of screen pixels off its own edge while the strip between
// them is millimetres and grows with the scale, so the two travel towards each other as the felt
// is drawn larger and pass through each other at about two pixels per millimetre. A four-seat
// felt on a 4K screen draws at 2.7, and a double tap zooms the camera 2.6× from wherever it
// stands (C5), so it is not a corner: it is the middle of the range.
//
// What comes back is the strip's width. The one who stands off no rim is held above the other's
// name by it — the stylesheet does the holding, since only it knows how tall a name is.
export function gapAbove(zone: ZoneView, zones: readonly ZoneView[], handOf: (owner: string | undefined) => ZoneView | undefined, floor: ZoneView, rotate: Rotation = 0): number | null {
  const me = turn(zone.geometry, rotate)
  let nearest: number | null = null
  for (const other of zones) {
    if (other.id === zone.id || other.id === floor.id) continue
    const hand = handOf(other.owner)
    if (!hand) continue
    const box = turn(other.geometry, rotate)
    // Only a name aimed down into the strip crowds this one; a name that stands beside its own
    // zone, or above it, is not in the way.
    if (edgeOf(box, turn(floor.geometry, rotate)) !== 'N') continue
    // Above it, and over the same stretch of felt: two names side by side never meet.
    if (box.y + box.h > me.y || box.x + box.w <= me.x || me.x + me.w <= box.x) continue
    const gap = me.y - (box.y + box.h)
    if (gap > CROWD_MM) continue
    if (nearest === null || gap < nearest) nearest = gap
  }
  return nearest
}
