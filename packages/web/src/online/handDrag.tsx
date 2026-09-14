import { useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import type { VisibleComponentState } from '@byd/protocol'
import { hue } from '../table/hue.js'
import { Texture } from '../table/Texture.js'
import { FAN_AIM_PX } from './fan.js'

export type Held = { id: string; x: number; y: number }
export type HandPlay = (card: VisibleComponentState, clientX: number, clientY: number) => void

// One surface, two gestures (#24, #77). The seat's own hand both scrolls and plays: it is longer
// than the room it is given, and a card is played by dragging it out onto the felt. A press has
// therefore to mean one or the other and cannot mean both.
//
// The split is a direction threshold, settled once per press and never revisited: the first
// movement that is `FAN_AIM_PX` long decides, by which of the two axes it went further along.
// Toward the felt is a play and takes the pointer; along the hand is the hand scrolling, and the
// press can no longer play at all, however it ends. A threshold rather than a handle because the
// whole point of the shape is that a card is grabbed where it lies, and a decision made once
// rather than re-read because a drag that changed its mind halfway is a card played somewhere the
// hand never aimed. The browser is told the same thing in `touch-action`, so a touch that pans is
// already the scroller's before it reaches us.
//
// Which axis plays is the one thing the two shapes disagree about, and it is the shape's own
// question: the band lies under the felt and a card comes *up* out of it, the column stands beside
// the felt and a card comes *across* out of it. K17's axis split is traded, not broken.
//
// A tap plays nothing, in either shape. The hand is never over the table, so the point a tap
// releases at is not a place on the table to put a card (section I).
export function useHandDrag(plays: 'up' | 'across', onPlay: HandPlay) {
  const [drag, setDrag] = useState<Held | null>(null)
  // Where the press started and whether it may still become a play; a press that turned out to be
  // a scroll is forgotten here and nothing downstream can revive it.
  const aim = useRef<Held | null>(null)
  const stop = () => {
    aim.current = null
    setDrag(null)
  }
  const handlers = (c: VisibleComponentState) => ({
    onPointerDown: (e: RPointerEvent) => {
      aim.current = { id: c.id, x: e.clientX, y: e.clientY }
    },
    onPointerMove: (e: RPointerEvent) => {
      if (drag?.id === c.id) {
        setDrag({ id: c.id, x: e.clientX, y: e.clientY })
        return
      }
      const from = aim.current
      if (!from || from.id !== c.id) return
      const [dx, dy] = [Math.abs(e.clientX - from.x), Math.abs(e.clientY - from.y)]
      if (Math.max(dx, dy) < FAN_AIM_PX) return
      // Along the hand: it is being scrolled, and this press has stopped being a card.
      if (plays === 'up' ? dx >= dy : dy >= dx) {
        aim.current = null
        return
      }
      const el = e.currentTarget as HTMLElement
      if (typeof el.setPointerCapture === 'function') el.setPointerCapture(e.pointerId)
      setDrag({ id: c.id, x: e.clientX, y: e.clientY })
    },
    onPointerUp: (e: RPointerEvent) => {
      if (drag?.id === c.id) onPlay(c, e.clientX, e.clientY)
      stop()
    },
    onPointerCancel: () => stop(),
  })
  return { drag, handlers }
}

// The card while it is carried: drawn at the pointer, over everything, and out of the hand's own
// scroller so that neither shape can clip what is being played.
export function HandGhost({ at, card, faces }: { at: Held; card: VisibleComponentState; faces?: string | undefined }) {
  return (
    <div className="byd-fan-ghost" style={{ left: at.x, top: at.y, ['--hue' as string]: hue(card.cardRef ?? '') }}>
      <Texture faces={faces} c={card} />
      <span>{card.cardRef}</span>
    </div>
  )
}
