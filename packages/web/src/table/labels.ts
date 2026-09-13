import type { ZoneView } from '@byd/protocol'

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
export type Rim = 'N' | 'E' | 'S' | 'W' | 'none'
// Which way a name with width is allowed to grow: `fwd` is the left corner it has always grown
// from, `back` is the other end of its own box.
export type Grow = 'fwd' | 'back'

// A zone stands at a rim when its own box comes this near the felt's edge. What stands at a rim
// is a seat's furniture: a hand lies on the rim itself, and the area in front of a seat and its
// counters sit 70 mm in.
export const RIM_MM = 200

function edgeOf(zone: ZoneView, floor: ZoneView): Rim {
  const b = zone.geometry
  const f = floor.geometry
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
function growFor(zone: ZoneView, rim: Rim, hand: ZoneView): Grow {
  const beside = rim === 'E' || rim === 'W'
  const middle = (g: ZoneView['geometry']) => (beside ? g.y + g.h / 2 : g.x + g.w / 2)
  const past = middle(zone.geometry) > middle(hand.geometry)
  return (beside ? !past : past) ? 'back' : 'fwd'
}

// The rule for one zone. A zone nobody owns keeps today's placement even when it stands at a rim,
// and that is the rule rather than an exception to it: the two halves are one sentence, and a
// zone with no seat has no seat's middle to grow toward. Sending such a name away from the rim
// without also saying which way it grows is the half-rule that was measured and rejected — it
// moves a collision instead of clearing it, and on the shared market it moves the name off the
// rim and onto the draw pile.
export function nameAt(zone: ZoneView, floor: ZoneView, hand: ZoneView | undefined): { rim: Rim; grow: Grow } {
  if (!hand) return { rim: 'none', grow: 'fwd' }
  const rim = edgeOf(zone, floor)
  return rim === 'none' ? { rim, grow: 'fwd' } : { rim, grow: growFor(zone, rim, hand) }
}
