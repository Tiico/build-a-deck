import { useRef } from 'react'
import type { Snapshot, VisibleComponentState } from '@byd/protocol'
import { hue } from '../table/hue.js'
import { Texture } from '../table/Texture.js'
import { useRoving } from '../editor/roving.js'
import { handLabel } from '../table/keyboard.js'
import { HOLD_MS, begin, end, move, timeout, type Tracking } from './gesture.js'

export type HandStripProps = {
  view: Snapshot
  selected: ReadonlySet<string>
  onTap(card: VisibleComponentState): void
  onHold(card: VisibleComponentState): void
  onLift(card: VisibleComponentState): void
  // Enter on a card: the address panel, the keyboard's way to every verb (#1, variant C).
  onOpen(card: VisibleComponentState): void
  // The HTTP origin that serves /faces/:hash; without it cards show their names on colour.
  faces?: string | undefined
}

// The seat's own hand as a horizontal strip of big, readable cards (K4).
// The projection already guarantees that only this seat's hand is here to show.
//
// Every card is a real control (#1): it has the name the projection gives it, it says whether it
// is marked, and it is one tab stop with the arrows inside — the editor's roving tabindex, not a
// second one written here. Space marks and unmarks, Enter opens the address panel. The gestures
// K4 settled are untouched: tap looks, a drag upwards plays, a hold marks.
export function HandStrip({ view, selected, onTap, onHold, onLift, onOpen, faces }: HandStripProps) {
  const hand = view.components.filter((c) => c.zone === `hand:${view.seat}`)
  const roving = useRoving({ ids: hand.map((c) => c.id), selected: null, orientation: 'horizontal' })
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
      {hand.map((c) => {
        const item = roving.itemProps(c.id)
        return (
          <button
            key={c.id}
            type="button"
            className="byd-strip-card"
            data-hand-card={c.id}
            data-selected={selected.has(c.id) ? 'true' : 'false'}
            aria-label={handLabel(c, selected.has(c.id))}
            aria-pressed={selected.has(c.id)}
            style={{ ['--hue' as string]: hue(c.cardRef ?? '') }}
            tabIndex={item.tabIndex}
            ref={item.ref}
            onFocus={item.onFocus}
            onKeyDown={(e) => {
              if (e.key === ' ') {
                e.preventDefault()
                onHold(c)
                return
              }
              if (e.key === 'Enter') {
                e.preventDefault()
                onOpen(c)
                return
              }
              item.onKeyDown(e)
            }}
            onPointerDown={(e) => down(c, e.clientX, e.clientY)}
            onPointerMove={(e) => moved(e.clientX, e.clientY)}
            onPointerUp={up}
            onPointerCancel={up}
          >
            <Texture faces={faces} c={c} />
            <strong aria-hidden="true">{c.cardRef}</strong>
          </button>
        )
      })}
    </div>
  )
}
