import { useEffect, useRef } from 'react'
import type { VisibleComponentState } from '@byd/protocol'
import { hue } from '../table/hue.js'
import { Texture } from '../table/Texture.js'
import { useRoving } from '../editor/roving.js'
import { handLabel } from '../table/keyboard.js'
import { fanStyle } from './fan.js'

export type HandSpreadProps = {
  cards: readonly VisibleComponentState[]
  faces?: string | undefined
  // Enter, Space or a click on a card: the same address panel every other surface opens (#2).
  onOpen(card: VisibleComponentState): void
  onClose(): void
}

// The hand read all at once (#24, prototype C's Uppslaget, kept as the fan's second mode). The
// fan is the resting shape and gives up seeing the whole hand on a phone; this is where that is
// bought back, by asking. The cards are laid out flat in a grid at the size they are read at, so
// a hand of any size is legible when it is asked for, and nothing is turned, overlapped or
// scrolled sideways.
//
// It is `Question.tsx`'s manners applied to a surface, the same way K16's address panel is: it
// takes the focus so it is read where it stands, it answers Escape, and it hands the focus back
// to the control that raised it. It traps nothing — tabbing past it leaves it standing. Focus
// lands on the first card and not on Stäng, because the grid was raised to be read and the
// reader should already be standing in the hand.
//
// It covers the felt and the band and never the top bar, so Ångra, Flagga and Avsluta stay where
// they are and stay reachable; a surface that covers the only Ångra on the page has made it
// unreachable and not merely hidden. When the hand is larger than the screen the grid scrolls in
// its own box and the page never does, which is L10's rule for the data table applied here.
export function HandSpread({ cards, faces, onOpen, onClose }: HandSpreadProps) {
  const n = cards.length
  const roving = useRoving({ ids: cards.map((c) => c.id), selected: null, orientation: 'both' })
  const first = cards[0]?.id
  // Raising the grid is the whole gesture; the focus goes with it, once.
  const raised = useRef(false)
  useEffect(() => {
    if (raised.current || !first) return
    raised.current = true
    roving.focus(first)
  }, [first])
  return (
    <div
      className="byd-hand-spread"
      style={fanStyle(n)}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        // The grid is what Escape is about while it stands; whatever it was raised over stays.
        e.stopPropagation()
        onClose()
      }}
    >
      <div className="byd-hand-sheet" role="dialog" aria-label={`Hela handen, ${n} kort`}>
        <div className="byd-hand-sheet-head">
          <strong>Hela handen</strong>
          <span>{n} kort</span>
          <button type="button" onClick={onClose}>
            Stäng
          </button>
        </div>
        <div className="byd-hand-grid">
          {cards.map((c) => {
            const item = roving.itemProps(c.id)
            return (
              <button
                key={c.id}
                type="button"
                className="byd-hand-face byd-spread-card"
                data-spread-card={c.id}
                aria-label={handLabel(c, false)}
                style={{ ['--hue' as string]: hue(c.cardRef ?? '') }}
                tabIndex={item.tabIndex}
                ref={item.ref}
                onFocus={item.onFocus}
                onClick={() => onOpen(c)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onOpen(c)
                    return
                  }
                  item.onKeyDown(e)
                }}
              >
                <Texture faces={faces} c={c} />
                <span aria-hidden="true">{c.cardRef}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
