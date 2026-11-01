import type { ReactNode } from 'react'
import type { VisibleComponentState } from '@byd/protocol'
import { tileOf } from '../components.js'
import { CARD_MM } from './drop.js'

// A tile where a card's frame stands (#1485): the column's card on the TV, «Visa för alla». The
// frame keeps a card's size, which its surface is laid out round; the tile stands in the middle of
// it at its true size against a card, cut to its shape by `table.css`, so a coin shown to the room
// is a coin and not a card-sized disc. A card is handed back as it came.
export function TileInCard({ c, children }: { c: VisibleComponentState | undefined; children: ReactNode }) {
  const tile = tileOf(c)
  if (!tile) return <>{children}</>
  const x = ((CARD_MM.w - tile.w) / 2 / CARD_MM.w) * 100
  const y = ((CARD_MM.h - tile.h) / 2 / CARD_MM.h) * 100
  return (
    <span className="byd-tile-face" data-shape={tile.shape} data-face={c?.cardRef ? 'front' : 'back'} style={{ inset: `${y.toFixed(3)}% ${x.toFixed(3)}%` }}>
      {children}
    </span>
  )
}
