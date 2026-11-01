import { useRef } from 'react'
import type { VisibleComponentState } from '@byd/protocol'
import { Texture } from './Texture.js'
import { hue } from './hue.js'
import { cardWord } from './keyboard.js'
import type { Box } from './lift.js'
import { tileOf } from '../components.js'
import { BOARD_BACK, outline } from './tileLook.js'

// The card lifted up to be read (K26, #509), drawn the way «Titta» draws one — the texture over
// the card's own paper, its name while the texture is on its way — in the box `liftBox` gives it.
// A press on it asks what may be done with it, and only a press that began on it: the click a
// browser makes of the tap that lifted it lands wherever the finger was, which may be here.
export function Lifted({ c, box, faces, onAsk }: { c: VisibleComponentState; box: Box; faces: string | undefined; onAsk(): void }) {
  const pressed = useRef(false)
  // A tile is held up in its shape (#1485): cut to its outline, its back the board's.
  const tile = tileOf(c)
  return (
    <div
      className="byd-lift"
      data-lift={c.id}
      data-face={c.cardRef === null ? 'back' : 'front'}
      data-shape={tile?.shape}
      style={{ left: box.left, top: box.top, width: box.w, height: box.h, ...(c.cardRef === null ? {} : { ['--hue' as string]: hue(c.cardRef) }), ...(tile ? { ...outline(tile.shape), display: 'grid', placeItems: 'center', textAlign: 'center', ...(c.cardRef === null ? { background: BOARD_BACK } : {}) } : {}) }}
      onPointerDown={() => (pressed.current = true)}
      onClick={(e) => {
        if (!pressed.current && e.detail !== 0) return
        pressed.current = false
        onAsk()
      }}
    >
      <Texture faces={faces} c={c} retry />
      <span>{cardWord(c) ?? ''}</span>
    </div>
  )
}

