import type { VisibleComponentState } from '@byd/protocol'
import { Texture } from './Texture.js'
import { hue } from './hue.js'

// "Titta" (K8): one card large, on this screen and nobody else's. The pointer gets here by
// holding a card down; the keyboard gets here from the address panel, and needs a way out that
// is a control rather than a tap anywhere — so the way out is a button that takes the focus and
// answers Escape, as every other overlay in the product does.
export function CardLook({ card, faces, onClose }: { card: VisibleComponentState; faces?: string | undefined; onClose(): void }) {
  const face = card.cardRef === null ? 'back' : 'front'
  return (
    <div
      className="byd-inspect byd-kbd-look"
      role="dialog"
      aria-modal="false"
      aria-label={card.cardRef ?? 'Dolt kort'}
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.stopPropagation()
        onClose()
      }}
    >
      <div data-inspect={card.id} data-face={face} style={card.cardRef === null ? undefined : { ['--hue' as string]: hue(card.cardRef) }}>
        <Texture faces={faces} c={card} />
        <span>{card.cardRef ?? ''}</span>
      </div>
      <button type="button" autoFocus onClick={onClose}>
        Stäng
      </button>
    </div>
  )
}
