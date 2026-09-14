import type { VisibleComponentState } from '@byd/protocol'
import { Texture } from '../table/Texture.js'
import { hue } from '../table/hue.js'

// A card held up large after a tap on the strip (K4). It is put down on the next touch, not on
// click: a tap is a pointerup and then a click, and the click lands on what the pointerup just
// opened (UX-30).
//
// This is the phone's one big, quiet surface, so it is where a lost face offers its way back
// (#10): the card in the strip is a control and cannot hold one (UX-37, #82). A press on that
// way back is not the touch that puts the card down; the texture keeps it to itself.
export function HeldCard({ card, faces, onClose }: { card: VisibleComponentState; faces?: string | undefined; onClose(): void }) {
  return (
    <div className="byd-inspect" onPointerDown={onClose}>
      <div data-inspect={card.id} data-face="front" style={{ ['--hue' as string]: hue(card.cardRef ?? '') }}>
        <Texture faces={faces} c={card} retry />
        <span>{card.cardRef}</span>
      </div>
    </div>
  )
}
