import type { CSSProperties } from 'react'
import type { VisibleComponentState } from '@byd/protocol'
import { BackTexture, Texture } from '../table/Texture.js'
import { cardName, cardWord } from '../table/keyboard.js'
import { useT } from '../i18n/index.js'

// What a card in this seat's own hand shows: its face, or — turned over in the hand (#1133,
// beslut A) — its back, the way it will land, with the pill a card she turned down in front of her
// already wears (#483) saying which card it is. One drawing for the strip, the fan, the column and
// «Visa alla», so the four cannot disagree about what a turned card looks like.
//
// Its look is written here and not in a sheet: every byte of player.css is in the sheet the first
// frame blocks on, which has none to spare (felt-font.spec.ts).
export const TURNED_GROUND: CSSProperties = { background: 'repeating-linear-gradient(45deg, #3a4d7a 0 4px, #2f4068 4px 8px)' }

const PILL: CSSProperties = {
  position: 'absolute', zIndex: 2, left: 4, right: 4, bottom: 4, padding: '2px 4px', borderRadius: 999,
  background: '#1b1e27', color: '#cfd6e4', fontSize: 12, fontWeight: 600, fontStyle: 'normal', textAlign: 'center',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.3,
}

export function HandFace({ c, faces, turned, Word = 'span' }: { c: VisibleComponentState; faces: string | undefined; turned: boolean; Word?: 'span' | 'strong' }) {
  const t = useT()
  if (!turned) {
    return (
      <>
        <Texture faces={faces} c={c} />
        <Word aria-hidden="true">{cardWord(c)}</Word>
      </>
    )
  }
  return (
    <>
      <BackTexture faces={faces} hash={c.faces?.['back']} />
      <i data-turned-pill aria-hidden="true" style={PILL}>{t('player.hand.turned', { name: cardName(c, t) })}</i>
    </>
  )
}
