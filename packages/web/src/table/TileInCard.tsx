import type { ReactNode } from 'react'
import type { VisibleComponentState } from '@byd/protocol'
import { tileOf } from '../components.js'
import { CARD_MM } from './drop.js'
import { edgeLook, faceLook } from './tileLook.js'

// A tile where a card's frame stands (#1485, #1486): the column's card on the TV, «Visa för alla»,
// a cell of the phone's hand. The frame keeps a card's size, which its surface is laid out round,
// and draws nothing of its own (`HOLDS_A_TILE`, given by the frame); the tile stands in the middle
// of it at its true size against a card, cut to its shape with the board's edge under it, so a coin
// is a coin and not a card-sized disc. A card is handed back as it came.
//
// `top` stands it at the top of the frame instead (#1538): the desk's column overlaps its cards
// from below and shows only the strip at the top of each, and a tile in the middle of its frame
// showed that strip empty down to its point.
export function TileInCard({ c, top = false, children }: { c: Pick<VisibleComponentState, 'type' | 'cardRef'> | undefined; top?: boolean; children?: ReactNode }) {
  const tile = tileOf(c)
  if (!tile) return <>{children}</>
  const x = ((CARD_MM.w - tile.w) / 2 / CARD_MM.w) * 100
  const y = ((CARD_MM.h - tile.h) / 2 / CARD_MM.h) * 100
  const inset = top ? `0 ${x.toFixed(3)}% ${(2 * y).toFixed(3)}%` : `${y.toFixed(3)}% ${x.toFixed(3)}%`
  const face = c?.cardRef ? 'front' : 'back'
  return (
    <>
      <i className="byd-tile-edge" data-shape={tile.shape} aria-hidden="true" style={{ ...edgeLook(tile.shape, 0), inset, translate: '0 3px' }} />
      <span className="byd-tile-face" data-shape={tile.shape} data-face={face} style={{ ...faceLook(tile.shape, face), inset }}>
        {children}
      </span>
    </>
  )
}
