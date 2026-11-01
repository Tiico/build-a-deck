import type { CSSProperties } from 'react'
import type { TileShape } from '../components.js'

// How a tile looks (#1485, #1486, variant A of #1474), written here and not in a sheet: every byte of
// `table.css` and `player.css` is in the sheet the first frame blocks on, whose alarm was already
// ringing (felt-font.spec.ts), and a tile is drawn only in a game that has one. The same pattern
// `HandFace` keeps for a turned card.
//
// The outline cuts the printed side and the cardboard's edges under it alike — a hexagon with a
// point up, a square with the type's 2 mm corner, or a disc — since an outline cuts off every
// shadow a box casts. The edge is the board's brown (C1), a step darker for every tile under it in
// a pile, and the unprinted back is the same board.
export const BOARD_BACK = '#4a3424'
const EDGES = ['#6b4f35', '#574029', '#4a3523']

export function outline(shape: TileShape): CSSProperties {
  if (shape === 'hex') return { clipPath: 'polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)' }
  return { borderRadius: shape === 'circle' ? '50%' : '4.4%' }
}

// What a box that holds a tile draws of its own: nothing. Inline, so it outranks whatever the box
// draws for a card, however that rule is written.
export const HOLDS_A_TILE: CSSProperties = { background: 'none', border: 0, borderImage: 'none', boxShadow: 'none', padding: 0, overflow: 'visible' }

// A marked tile in the phone's hand (#1486): a bar under it, in the mark's colour, since an outline
// cuts off the ring a marked card wears.
export const TILE_MARK: CSSProperties = { position: 'absolute', left: '22%', right: '22%', bottom: 0, height: 4, borderRadius: 2, background: 'var(--byd-warn)' }

// The printed side, over the edge.
export function faceLook(shape: TileShape, face: 'front' | 'back'): CSSProperties {
  return {
    position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', boxSizing: 'border-box',
    display: 'grid', placeItems: 'center', padding: '8% 12%', textAlign: 'center', overflowWrap: 'anywhere',
    background: face === 'back' ? BOARD_BACK : 'hsl(var(--hue, 0) 40% 86%)',
    ...outline(shape),
  }
}

// One edge of the board, `layer` tiles down a pile, the top one the lightest.
export function edgeLook(shape: TileShape, layer: number): CSSProperties {
  return { position: 'absolute', inset: 0, pointerEvents: 'none', background: EDGES[layer === 0 ? 0 : 1 + (layer % 2)], ...outline(shape) }
}
