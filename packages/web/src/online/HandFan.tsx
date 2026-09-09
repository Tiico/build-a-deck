import { useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import type { VisibleComponentState } from '@byd/protocol'
import { hue } from '../table/hue.js'
import { Texture } from '../table/Texture.js'
import { useRoving } from '../editor/roving.js'
import { handLabel } from '../table/keyboard.js'
import { useT } from '../i18n/index.js'
import { fanPlace, fanStyle, FAN_AIM_PX } from './fan.js'

export type HandFanProps = {
  cards: readonly VisibleComponentState[]
  faces?: string | undefined
  // A card dragged out of the fan, released at a client point.
  onPlay(card: VisibleComponentState, clientX: number, clientY: number): void
  // Enter on a card: the address panel, the same one the felt opens (#2, variant C).
  onOpen(card: VisibleComponentState): void
}

// The online player's hand (C2, prototype B): a fan in the band under the felt. Hover lifts a
// card to read it; drag it out onto the table to play it. Every card is also a real control with
// the projection's name and one tab stop for the whole fan (#2).
//
// One surface, two gestures (#24). The band scrolls sideways when the hand is wider than it, and
// dragging a card up onto the felt is how a card is played, so a press has to mean one or the
// other and cannot mean both. The split is a direction threshold, settled once per press and
// never revisited: the first movement that is `FAN_AIM_PX` long decides, by which of the two
// axes it moved further along. Up or down is a play and takes the pointer; sideways is the fan
// scrolling and the press can no longer play at all, however it ends. A threshold rather than a
// handle because the whole point of the fan is that a card is grabbed where it lies, and a
// decision that is made once rather than re-read because a drag that changed its mind halfway is
// a card played somewhere the hand never aimed. The browser is told the same thing in
// `touch-action: pan-x`, so a touch that pans is already the scroller's before it reaches us.
export function HandFan({ cards, faces, onPlay, onOpen }: HandFanProps) {
  const t = useT()
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null)
  // Where the press started and whether it may still become a play; a press that turned out to
  // be a scroll is forgotten here and nothing downstream can revive it.
  const aim = useRef<{ id: string; x: number; y: number } | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const n = cards.length
  const roving = useRoving({ ids: cards.map((c) => c.id), selected: null, orientation: 'horizontal' })
  const stop = () => {
    aim.current = null
    setDrag(null)
  }
  const down = (c: VisibleComponentState, e: RPointerEvent) => {
    aim.current = { id: c.id, x: e.clientX, y: e.clientY }
  }
  const move = (c: VisibleComponentState, e: RPointerEvent) => {
    if (drag?.id === c.id) {
      setDrag({ ...drag, x: e.clientX, y: e.clientY })
      return
    }
    const from = aim.current
    if (!from || from.id !== c.id) return
    const [dx, dy] = [e.clientX - from.x, e.clientY - from.y]
    if (Math.max(Math.abs(dx), Math.abs(dy)) < FAN_AIM_PX) return
    // Sideways: the fan is being scrolled, and this press has stopped being a card.
    if (Math.abs(dx) >= Math.abs(dy)) {
      aim.current = null
      return
    }
    const el = e.currentTarget as HTMLElement
    if (typeof el.setPointerCapture === 'function') el.setPointerCapture(e.pointerId)
    setDrag({ id: c.id, x: e.clientX, y: e.clientY })
  }
  const up = (c: VisibleComponentState, e: RPointerEvent) => {
    // Only a press that became a drag plays. A tap plays nothing: the band lies under the felt,
    // so the point a tap releases at is not a place on the table to put a card.
    if (drag?.id === c.id) onPlay(c, e.clientX, e.clientY)
    stop()
  }
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
                  onPointerDown={(e) => down(c, e)}
                  onPointerMove={(e) => move(c, e)}
                  onPointerUp={(e) => up(c, e)}
                  onPointerCancel={() => stop()}
                >
                  <Texture faces={faces} c={c} />
                  <span aria-hidden="true">{c.cardRef}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
      {drag && lifted && (
        <div className="byd-fan-ghost" style={{ left: drag.x, top: drag.y, ['--hue' as string]: hue(lifted.cardRef ?? '') }}>
          <Texture faces={faces} c={lifted} />
          <span>{lifted.cardRef}</span>
        </div>
      )}
    </div>
  )
}
