import { useRef } from 'react'
import type { VisibleComponentState } from '@byd/protocol'
import { hue } from '../table/hue.js'
import { HandFace, TURNED_GROUND } from '../player/HandFace.js'
import { useRoving } from '../editor/roving.js'
import { handLabel } from '../table/keyboard.js'
import { useT } from '../i18n/index.js'
import { fanPlace, fanStyle } from './fan.js'
import { HandGhost, useHandDrag, type HandDragOptions, type HandPlay } from './handDrag.js'
import { DragDoor } from '../editor/DragDoor.js'

export type HandFanProps = {
  cards: readonly VisibleComponentState[]
  faces?: string | undefined
  // A card dragged out of the fan, released at a client point.
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
  // Enter on a card, or a finger's tap: the address panel, the same one the felt opens (#2,
  // variant C). A mouse's click turns the card instead (#1291).
  onOpen(card: VisibleComponentState): void
}

// The online player's hand in a portrait window (C2, prototype B, K17): a fan in the band under
// the felt. Hover lifts a card to read it, a click turns it over (#1291), and dragging it up onto
// the table plays it. Every card is
// also a real control with the projection's name and one tab stop for the whole fan (#2).
//
// The band scrolls sideways when the hand is wider than it, and a card is played by dragging it
// up, so a press has to say which it is; the split lives in `useHandDrag`, and the browser is told
// the same thing in `touch-action: pan-x`.
//
// In a landscape window this is not the shape the hand takes: there the band cost the felt the one
// axis it was bound by, and the hand stands beside it as `HandColumn` instead (#77).
export function HandFan({ cards, faces, onPlay, locked = false, onCarry, aim, onOpen, turned, onTurn }: HandFanProps) {
  const t = useT()
  const scroller = useRef<HTMLDivElement>(null)
  const n = cards.length
  const roving = useRoving({ ids: cards.map((c) => c.id), selected: null, orientation: 'horizontal' })
  const { drag, handlers, cancel } = useHandDrag('up', onPlay, { locked, onTap: (c, by) => (by === 'mouse' ? onTurn?.(c) : onOpen(c)), onCarry })
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
                  aria-label={handLabel(c, false, t, turned?.has(c.id) === true)}
                  data-turned={turned?.has(c.id) === true ? 'true' : undefined}
                  style={{ ['--hue' as string]: hue(c.cardRef ?? ''), ...(turned?.has(c.id) === true ? TURNED_GROUND : {}), ['--i' as string]: `${i}`, ['--fan' as string]: `${tilt}deg`, ['--dip' as string]: `${dip}` }}
                  tabIndex={item.tabIndex}
                  ref={item.ref}
                  onFocus={(e) => {
                    item.onFocus()
                    // A card the arrows reach must be a card the eye reaches: L10's rule for a
                    // strip that scrolls sideways, applied to the fan that now does.
                    e.currentTarget.scrollIntoView?.({ block: 'nearest', inline: 'center' })
                  }}
                  onKeyDown={(e) => {
                    // Enter is the keyboard's way to play, since it cannot drag (K16); Space is the
                    // click, and turns the card as the click does (#1291).
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      onOpen(c)
                      return
                    }
                    if ((e.key === ' ' || e.key === 'f' || e.key === 'F') && onTurn && !e.altKey && !e.ctrlKey && !e.metaKey) {
                      e.preventDefault()
                      onTurn(c)
                      return
                    }
                    item.onKeyDown(e)
                  }}
                  {...handlers(c)}
                >
                  <HandFace faces={faces} c={c} turned={turned?.has(c.id) === true} />
                </button>
              )
            })}
          </div>
        </div>
      </div>
      {drag && lifted && <HandGhost at={drag} card={lifted} faces={faces} size={aim?.size} turned={turned?.has(lifted.id) === true} />}
      {drag && <DragDoor onCancel={cancel} />}
    </div>
  )
}
