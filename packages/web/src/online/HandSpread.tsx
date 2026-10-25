import { useEffect, useRef } from 'react'
import { useDoor } from '../doors.js'
import type { VisibleComponentState } from '@byd/protocol'
import { hue } from '../table/hue.js'
import { HandFace, TURNED_GROUND } from '../player/HandFace.js'
import { useRoving } from '../editor/roving.js'
import { handLabel } from '../table/keyboard.js'
import { useT } from '../i18n/index.js'
import { spreadStyle } from './fan.js'

export type HandSpreadProps = {
  cards: readonly VisibleComponentState[]
  faces?: string | undefined
  // Enter or a finger's tap on a card: the same address panel every other surface opens (#2).
  onOpen(card: VisibleComponentState): void
  // A mouse's click, Space or F: the card turned over, as in the hand it was raised from (#1291).
  onTurn?: ((card: VisibleComponentState) => void) | undefined
  onClose(): void
  // How many cards a row holds, when the grid is an overview rather than a reading (the phone, #767).
  columns?: number | undefined
  // The cards turned over in the hand, shown as their backs (#1133).
  turned?: ReadonlySet<string> | undefined
}

// The hand read all at once (#24, prototype C's Uppslaget, kept as the fan's second mode). The
// fan is the resting shape and gives up seeing the whole hand on a phone; this is where that is
// bought back, by asking. The cards are laid out flat in a grid at the size they are read at, so
// a hand of any size is legible when it is asked for, and nothing is turned, overlapped or
// scrolled sideways.
//
// It is `Question.tsx`'s manners applied to a surface, the same way K16's address panel is: it
// takes the focus so it is read where it stands, it answers Escape, and it hands the focus back
// to the control that raised it. Escape is a door (`doors.ts`, #152) and so heard wherever the
// focus has gone, and a press on the dark around the sheet is the other way out (#484 fynd 6).
// It traps nothing — tabbing past it leaves it standing. Focus
// lands on the first card and not on Stäng, because the grid was raised to be read and the
// reader should already be standing in the hand.
//
// It covers the felt and the band and never the top bar, so Ångra, Flagga and Avsluta stay where
// they are and stay reachable; a surface that covers the only Ångra on the page has made it
// unreachable and not merely hidden. When the hand is larger than the screen the grid scrolls in
// its own box and the page never does, which is L10's rule for the data table applied here.
export function HandSpread({ cards, faces, onOpen, onTurn, onClose, columns, turned }: HandSpreadProps) {
  const t = useT()
  const n = cards.length
  const roving = useRoving({ ids: cards.map((c) => c.id), selected: null, orientation: 'both' })
  const first = cards[0]?.id
  // What pressed the card, read at the click: a mouse turns it, anything else opens it.
  const pressedBy = useRef('')
  // Raising the grid is the whole gesture; the focus goes with it, once.
  const raised = useRef(false)
  useEffect(() => {
    if (raised.current || !first) return
    raised.current = true
    roving.focus(first)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the focus goes with the grid once, when its first card is known
  }, [first])
  // The grid is what Escape is about while it stands; whatever it was raised over stays.
  useDoor('standing', onClose)
  return (
    <div
      className="byd-hand-spread"
      // On the phone the whole hand is an overview, four across, rather than cards at reading size
      // (#767, beslut A): the width is the sheet's, less its padding and three gaps.
      style={columns ? { ...spreadStyle(n), '--fan-card': `calc((100vw - 40px - ${columns - 1} * 10px) / ${columns})` } : spreadStyle(n)}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="byd-hand-sheet" role="dialog" aria-label={t(n === 1 ? 'online.spread.label.one' : 'online.spread.label.other', { n })}>
        <div className="byd-hand-sheet-head">
          <strong>{t('online.spread.title')}</strong>
          <span>{t(n === 1 ? 'online.spread.count.one' : 'online.spread.count.other', { n })}</span>
          <button type="button" onClick={onClose}>
            {t('online.spread.close')}
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
                aria-label={handLabel(c, false, t, turned?.has(c.id) === true)}
                data-turned={turned?.has(c.id) === true ? 'true' : undefined}
                style={{ ['--hue' as string]: hue(c.cardRef ?? ''), ...(turned?.has(c.id) === true ? TURNED_GROUND : {}) }}
                tabIndex={item.tabIndex}
                ref={item.ref}
                onFocus={item.onFocus}
                onPointerDown={(e) => (pressedBy.current = e.pointerType)}
                onClick={() => (pressedBy.current === 'mouse' && onTurn ? onTurn(c) : onOpen(c))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    onOpen(c)
                    return
                  }
                  if ((e.key === ' ' || e.key === 'f' || e.key === 'F') && onTurn && !e.altKey && !e.ctrlKey && !e.metaKey) {
                    e.preventDefault()
                    onTurn(c)
                    return
                  }
                  item.onKeyDown(e)
                }}
              >
                <HandFace faces={faces} c={c} turned={turned?.has(c.id) === true} />
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
