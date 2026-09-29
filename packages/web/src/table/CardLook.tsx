import type { VisibleComponentState } from '@byd/protocol'
import { Texture } from './Texture.js'
import { hue } from './hue.js'
import { useT } from '../i18n/index.js'
import { cardWord } from './keyboard.js'

// "Titta" (K8): one card large, on this screen and nobody else's. The pointer gets here by
// holding a card down; the keyboard gets here from the address panel, and needs a way out that
// is a control rather than a tap anywhere — so the way out is a button that takes the focus and
// answers Escape, as every other overlay in the product does.
//
// The veil covers the whole screen, so the look is modal and says so, and Tab stays on its one
// control (#559 P-5, P-19): Tab used to walk out of it to the page behind the veil, where Escape
// no longer reached it. Where focus goes when it closes is the caller's — the card it was asked about.
export function CardLook({ card, faces, onClose }: { card: VisibleComponentState; faces?: string | undefined; onClose(): void }) {
  const t = useT()
  const face = card.cardRef === null ? 'back' : 'front'
  return (
    <div
      className="byd-inspect byd-kbd-look"
      role="dialog"
      aria-modal="true"
      aria-label={cardWord(card) ?? t('kbd.hidden')}
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Tab') return e.preventDefault()
        if (e.key !== 'Escape') return
        e.stopPropagation()
        onClose()
      }}
    >
      <div data-inspect={card.id} data-face={face} style={card.cardRef === null ? undefined : { ['--hue' as string]: hue(card.cardRef) }}>
        <Texture faces={faces} c={card} retry />
        <span>{cardWord(card) ?? ''}</span>
      </div>
      <button type="button" autoFocus onClick={onClose}>
        {t('kbd.panel.close')}
      </button>
    </div>
  )
}
