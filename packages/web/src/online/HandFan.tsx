import { useRef } from 'react'
import type { VisibleComponentState } from '@byd/protocol'
import { hue } from '../table/hue.js'
import { Texture } from '../table/Texture.js'
import { useRoving } from '../editor/roving.js'
import { cardWord, handLabel } from '../table/keyboard.js'
import { useT } from '../i18n/index.js'
import { fanPlace, fanStyle } from './fan.js'
import { HandGhost, useHandDrag, type HandPlay } from './handDrag.js'

export type HandFanProps = {
  cards: readonly VisibleComponentState[]
  faces?: string | undefined
  // A card dragged out of the fan, released at a client point.
  onPlay: HandPlay
  // Enter on a card: the address panel, the same one the felt opens (#2, variant C).
  onOpen(card: VisibleComponentState): void
}

// The online player's hand in a portrait window (C2, prototype B, K17): a fan in the band under
// the felt. Hover lifts a card to read it; drag it up onto the table to play it. Every card is
// also a real control with the projection's name and one tab stop for the whole fan (#2).
//
// The band scrolls sideways when the hand is wider than it, and a card is played by dragging it
// up, so a press has to say which it is; the split lives in `useHandDrag`, and the browser is told
// the same thing in `touch-action: pan-x`.
//
// In a landscape window this is not the shape the hand takes: there the band cost the felt the one
// axis it was bound by, and the hand stands beside it as `HandColumn` instead (#77).
export function HandFan({ cards, faces, onPlay, onOpen }: HandFanProps) {
  const t = useT()
  const scroller = useRef<HTMLDivElement>(null)
  const n = cards.length
  const roving = useRoving({ ids: cards.map((c) => c.id), selected: null, orientation: 'horizontal' })
  const { drag, handlers } = useHandDrag('up', onPlay)
  const lifted = drag ? cards.find((c) => c.id === drag.id) : undefined
  return (
    <div className="byd-hand-band" data-hand-fan style={fanStyle(n)}>
      {/* A hand wider than the band scrolls sideways as a fan (#24). The room the turned cards
          need is `fan.ts`'s own answer, carried in as padding, so the scroller can never clip
          what the shape asked for. */}
      <div className="byd-fan-scroll" ref={scroller}>
        <div className="byd-fan-room">
          <div className="byd-fan" role="group" aria-label={`Min hand, ${n} kort`}>
            {cards.map((c, i) => {
              const item = roving.itemProps(c.id)
              const { tilt, dip } = fanPlace(i, n)
              return (
                <button
                  key={c.id}
                  type="button"
                  className="byd-fan-card"
                  data-hand-card={c.id}
                  data-lifted={drag?.id === c.id ? 'true' : undefined}
                  aria-label={handLabel(c, false, t)}
                  style={{ ['--hue' as string]: hue(c.cardRef ?? ''), ['--i' as string]: `${i}`, ['--fan' as string]: `${tilt}deg`, ['--dip' as string]: `${dip}` }}
                  tabIndex={item.tabIndex}
                  ref={item.ref}
                  onFocus={(e) => {
                    item.onFocus()
                    // A card the arrows reach must be a card the eye reaches: L10's rule for a
                    // strip that scrolls sideways, applied to the fan that now does.
                    e.currentTarget.scrollIntoView?.({ block: 'nearest', inline: 'center' })
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
              )
            })}
          </div>
        </div>
      </div>
      {drag && lifted && <HandGhost at={drag} card={lifted} faces={faces} />}
    </div>
  )
}
