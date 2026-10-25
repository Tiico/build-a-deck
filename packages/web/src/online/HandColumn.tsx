import type { VisibleComponentState } from '@byd/protocol'
import { HandFace } from '../player/HandFace.js'
import { COLUMN_STYLE } from './fan.js'
import type { HandDragOptions, HandPlay } from './handDrag.js'
import { useHandGestures } from './handGestures.js'

export type HandColumnProps = {
  cards: readonly VisibleComponentState[]
  faces?: string | undefined
  // A card dragged out of the column, released at a client point.
  onPlay: HandPlay
  // Nothing can be played — an undo is proposed, or the table has ended — so nothing is lifted (#484).
  locked?: boolean | undefined
  // Where a carried card is, for the page to say where it would land; and what it answered: the
  // felt's own card size while it is over the table (#484).
  onCarry?: HandDragOptions['onCarry']
  aim?: { size: { w: number } | null } | undefined
  // The cards turned over in the hand, played face down (#1133); a click, Space or F turns one (#1291).
  turned?: ReadonlySet<string> | undefined
  onTurn?: ((card: VisibleComponentState) => void) | undefined
  // The address panel, the same one the felt opens (#2, #24): Enter on a card, or a finger's second press.
  onOpen(card: VisibleComponentState): void
}

// The seat's own hand in a landscape window (K17, revised by #77): a vertical list at the side of
// the window, the cards overlapping down it the way a hand held in one hand does, the last one
// shown whole.
//
// It is the band's cards and the band's gestures stood on end, and it exists because the band and
// the felt were fighting over the same axis. `/online` is three rows (#25); at 1280 × 800 the band
// alone was 218 px of the 800, and the felt's own row had six hundred pixels of width it could not
// use because its height was what bound it. Standing the hand up spends the slack and gives the
// binding axis back: a card on the felt goes from 31 px to 46 at that window.
//
// A list and not K17's arc: the turned fan's overhang is what a column has no room for — at
// twenty-one cards it drops the step to 43 px, under the finger's own floor, and cards turned side
// by side in a column splay rather than radiate. And a list and not a pager: paging shows four of
// thirteen, which is the reasoning K17 already declined when it refused to make the hand something
// you ask to see.
//
// What gives way is still the step, and it still bottoms out at a fingertip — only here the
// browser works it out, because the room is a page row's height and not something a module could
// know: every card but the last sits in a box one step tall that may shrink, and none of them
// below `FAN_MIN_PX`. A hand that no longer fits at that scrolls in its own box, and the page
// never does (L10).
//
// What a press does is `useHandGestures`, which the row along the foot of `/play` shares (#1310).
export function HandColumn({ cards, faces, onPlay, locked = false, onCarry, aim, onOpen, turned, onTurn }: HandColumnProps) {
  const n = cards.length
  const hand = useHandGestures({ cards, faces, onPlay, locked, onCarry, aim, onOpen, turned, onTurn, shape: 'column' })
  return (
    <>
      <div ref={hand.container} className="byd-hand-col" data-hand-fan data-hand-column role="group" aria-label={`Min hand, ${n} kort`} style={COLUMN_STYLE}>
        {cards.map((c) => (
          <div className="byd-col-slot" key={c.id}>
            <button className="byd-hand-face byd-col-card" {...hand.cardProps(c)}>
              <HandFace faces={faces} c={c} turned={turned?.has(c.id) === true} />
            </button>
          </div>
        ))}
      </div>
      {hand.overlays}
    </>
  )
}
