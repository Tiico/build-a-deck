import { useRef } from 'react'
import type { Snapshot, VisibleComponentState } from '@byd/protocol'
import { hue } from '../table/hue.js'
import { HOLD_MS, begin, end, move, timeout, type Tracking } from './gesture.js'

export type HandStripProps = {
  view: Snapshot
  selected: ReadonlySet<string>
  onTap(card: VisibleComponentState): void
  onHold(card: VisibleComponentState): void
  onLift(card: VisibleComponentState): void
}

// The seat's own hand as a horizontal strip of big, readable cards (K4).
// The projection already guarantees that only this seat's hand is here to show.
export function HandStrip({ view, selected, onTap, onHold, onLift }: HandStripProps) {
  const hand = view.components.filter((c) => c.zone === `hand:${view.seat}`)
  const tracking = useRef<{ card: VisibleComponentState; t: Tracking; timer: ReturnType<typeof setTimeout> } | null>(null)

  const fire = (g: 'tap' | 'hold' | 'lift' | null, card: VisibleComponentState) => {
    if (g === 'tap') onTap(card)
    if (g === 'hold') onHold(card)
    if (g === 'lift') onLift(card)
  }
  const down = (card: VisibleComponentState, x: number, y: number) => {
    const t = begin(x, y)
    const timer = setTimeout(() => fire(timeout(t), card), HOLD_MS)
    tracking.current = { card, t, timer }
  }
  const moved = (x: number, y: number) => {
    const cur = tracking.current
    if (!cur) return
    const g = move(cur.t, x, y)
    if (g) {
      clearTimeout(cur.timer)
      fire(g, cur.card)
    }
  }
  const up = () => {
    const cur = tracking.current
    if (!cur) return
    clearTimeout(cur.timer)
    fire(end(cur.t), cur.card)
    tracking.current = null
  }

  return (
    <div className="byd-strip" data-hand>
      {hand.map((c) => (
        <div
          key={c.id}
          className="byd-strip-card"
          data-hand-card={c.id}
          data-selected={selected.has(c.id) ? 'true' : 'false'}
          style={{ ['--hue' as string]: hue(c.cardRef ?? '') }}
          onPointerDown={(e) => down(c, e.clientX, e.clientY)}
          onPointerMove={(e) => moved(e.clientX, e.clientY)}
          onPointerUp={up}
          onPointerCancel={up}
        >
          <strong>{c.cardRef}</strong>
        </div>
      ))}
    </div>
  )
}
