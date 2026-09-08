import { useState, type PointerEvent as RPointerEvent } from 'react'
import type { VisibleComponentState } from '@byd/protocol'
import { hue } from '../table/hue.js'
import { Texture } from '../table/Texture.js'
import { useRoving } from '../editor/roving.js'
import { handLabel } from '../table/keyboard.js'

export type HandFanProps = {
  cards: readonly VisibleComponentState[]
  faces?: string | undefined
  // A card dragged out of the fan, released at a client point.
  onPlay(card: VisibleComponentState, clientX: number, clientY: number): void
  // Enter on a card: the address panel, the same one the felt opens (#2, variant C).
  onOpen(card: VisibleComponentState): void
}

// The online player's hand (C2, prototype B): a fan at the seat's edge on the felt. Hover lifts
// a card to read it; drag it out onto the table to play it. Every card is also a real control
// with the projection's name and one tab stop for the whole fan (#2); the drag is untouched.
export function HandFan({ cards, faces, onPlay, onOpen }: HandFanProps) {
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null)
  const n = cards.length
  const roving = useRoving({ ids: cards.map((c) => c.id), selected: null, orientation: 'horizontal' })
  const down = (c: VisibleComponentState, e: RPointerEvent) => {
    const el = e.currentTarget as HTMLElement
    if (typeof el.setPointerCapture === 'function') el.setPointerCapture(e.pointerId)
    setDrag({ id: c.id, x: e.clientX, y: e.clientY })
  }
  const move = (e: RPointerEvent) => drag && setDrag({ ...drag, x: e.clientX, y: e.clientY })
  const up = (c: VisibleComponentState, e: RPointerEvent) => {
    if (drag) onPlay(c, e.clientX, e.clientY)
    setDrag(null)
  }
  const lifted = drag ? cards.find((c) => c.id === drag.id) : undefined
  return (
    <div className="byd-fan" data-hand-fan>
      {cards.map((c, i) => {
        const item = roving.itemProps(c.id)
        return (
          <button
            key={c.id}
            type="button"
            className="byd-fan-card"
            data-hand-card={c.id}
            data-lifted={drag?.id === c.id ? 'true' : undefined}
            aria-label={handLabel(c, false)}
            style={{ ['--hue' as string]: hue(c.cardRef ?? ''), ['--fan' as string]: `${(i - (n - 1) / 2) * 8}deg`, ['--dip' as string]: `${Math.abs(i - (n - 1) / 2) * 6}px` }}
            tabIndex={item.tabIndex}
            ref={item.ref}
            onFocus={item.onFocus}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onOpen(c)
                return
              }
              item.onKeyDown(e)
            }}
            onPointerDown={(e) => down(c, e)}
            onPointerMove={move}
            onPointerUp={(e) => up(c, e)}
            onPointerCancel={() => setDrag(null)}
          >
            <Texture faces={faces} c={c} />
            <span aria-hidden="true">{c.cardRef}</span>
          </button>
        )
      })}
      {drag && lifted && (
        <div className="byd-fan-ghost" style={{ left: drag.x, top: drag.y, ['--hue' as string]: hue(lifted.cardRef ?? '') }}>
          <Texture faces={faces} c={lifted} />
          <span>{lifted.cardRef}</span>
        </div>
      )}
    </div>
  )
}
