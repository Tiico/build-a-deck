import type { VisibleComponentState } from '@byd/protocol'
import { hue } from '../table/hue.js'
import { Texture } from '../table/Texture.js'
import { useRoving } from '../editor/roving.js'
import { cardWord, handLabel } from '../table/keyboard.js'
import { useT } from '../i18n/index.js'
import { COLUMN_STYLE } from './fan.js'
import { HandGhost, useHandDrag, type HandPlay } from './handDrag.js'

export type HandColumnProps = {
  cards: readonly VisibleComponentState[]
  faces?: string | undefined
  // A card dragged out of the column, released at a client point.
  onPlay: HandPlay
  // Enter on a card: the address panel, the same one the felt opens (#2, #24).
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
export function HandColumn({ cards, faces, onPlay, onOpen }: HandColumnProps) {
  const t = useT()
  const n = cards.length
  const roving = useRoving({ ids: cards.map((c) => c.id), selected: null, orientation: 'vertical' })
  const { drag, handlers } = useHandDrag('across', onPlay)
  const lifted = drag ? cards.find((c) => c.id === drag.id) : undefined
  return (
    <div className="byd-hand-col" data-hand-fan data-hand-column role="group" aria-label={`Min hand, ${n} kort`} style={COLUMN_STYLE}>
      {cards.map((c) => {
        const item = roving.itemProps(c.id)
        return (
          <div className="byd-col-slot" key={c.id}>
            <button
              type="button"
              className="byd-hand-face byd-col-card"
              data-hand-card={c.id}
              data-lifted={drag?.id === c.id ? 'true' : undefined}
              aria-label={handLabel(c, false, t)}
              style={{ ['--hue' as string]: hue(c.cardRef ?? '') }}
              tabIndex={item.tabIndex}
              ref={item.ref}
              onFocus={(e) => {
                item.onFocus()
                // A card the arrows reach must be a card the eye reaches: L10's rule for a strip
                // that scrolls, applied to the column that now does.
                e.currentTarget.scrollIntoView?.({ block: 'nearest' })
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onOpen(c)
                  return
                }
                item.onKeyDown(e)
              }}
              {...handlers(c)}
            >
              <Texture faces={faces} c={c} />
              <span aria-hidden="true">{cardWord(c)}</span>
            </button>
          </div>
        )
      })}
      {drag && lifted && <HandGhost at={drag} card={lifted} faces={faces} />}
    </div>
  )
}
