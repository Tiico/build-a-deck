import { useState, type PointerEvent as RPointerEvent } from 'react'
import type { VisibleComponentState } from '@byd/protocol'
import { hue } from '../table/hue.js'
import { Texture, textureUrl } from '../table/Texture.js'

export type HandFanProps = {
  cards: readonly VisibleComponentState[]
  faces?: string | undefined
  // A card dragged out of the fan, released at a client point.
  onPlay(card: VisibleComponentState, clientX: number, clientY: number): void
}

// The online player's hand (C2, prototype B): a fan at the seat's edge on the felt. Hover lifts
// a card to read it; drag it out onto the table to play it.
export function HandFan({ cards, faces, onPlay }: HandFanProps) {
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null)
  const n = cards.length
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
      {cards.map((c, i) => (
        <div
          key={c.id}
          className="byd-fan-card"
          data-hand-card={c.id}
          data-lifted={drag?.id === c.id ? 'true' : undefined}
          style={{ ['--hue' as string]: hue(c.cardRef ?? ''), ['--fan' as string]: `${(i - (n - 1) / 2) * 8}deg`, ['--dip' as string]: `${Math.abs(i - (n - 1) / 2) * 6}px` }}
          onPointerDown={(e) => down(c, e)}
          onPointerMove={move}
          onPointerUp={(e) => up(c, e)}
          onPointerCancel={() => setDrag(null)}
        >
          {textureUrl(faces, c) && <Texture src={textureUrl(faces, c) ?? ''} label={c.cardRef ?? undefined} />}
          <span>{c.cardRef}</span>
        </div>
      ))}
      {drag && lifted && (
        <div className="byd-fan-ghost" style={{ left: drag.x, top: drag.y, ['--hue' as string]: hue(lifted.cardRef ?? '') }}>
          {textureUrl(faces, lifted) && <Texture src={textureUrl(faces, lifted) ?? ''} label={lifted.cardRef ?? undefined} />}
          <span>{lifted.cardRef}</span>
        </div>
      )}
    </div>
  )
}
