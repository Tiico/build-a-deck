import { useEffect, useRef, useState } from 'react'
import type { VisibleComponentState } from '@byd/protocol'
import { hue } from '../table/hue.js'
import { Texture } from '../table/Texture.js'
import { Lifted } from '../table/Lifted.js'
import { liftBox } from '../table/lift.js'
import { useSmallestPt } from '../table/smallest.js'
import { useRoving } from '../editor/roving.js'
import { cardWord, handLabel } from '../table/keyboard.js'
import { useT } from '../i18n/index.js'
import { COLUMN_STYLE } from './fan.js'
import { HandGhost, useHandDrag, type HandDragOptions, type HandPlay } from './handDrag.js'
import { DragDoor } from '../editor/DragDoor.js'

export type HandColumnProps = {
  cards: readonly VisibleComponentState[]
  faces?: string | undefined
  // A card dragged out of the column, released at a client point.
  onPlay: HandPlay
  // Nothing can be played — an undo is proposed, or the table has ended — so nothing is lifted (#484).
  locked?: boolean | undefined
  // Where a carried card is, for the page to say where it would land; and what it answered: the
  // felt's own card size while it is over the table (#484).
  onCarry?: HandDragOptions['onCarry']
  aim?: { size: { w: number } | null } | undefined
  // The address panel, the same one the felt opens (#2, #24): Enter on a card, or a second press.
  onOpen(card: VisibleComponentState): void
}

// The seat's own hand in a landscape window (K17, revised by #77): a vertical list at the side of
// the window, the cards overlapping down it the way a hand held in one hand does, the last one
// shown whole.
//
// It is the band's cards and the band's gestures stood on end, and it exists because the band and
// the felt were fighting over the same axis. `/online` is three rows (#25); at 1280 × 800 the band
// alone was 218 px of the 800, and the felt's own row had six hundred pixels of width it could not
// use because its height was what bound it. Standing the hand up spends the slack and gives the
// binding axis back: a card on the felt goes from 31 px to 46 at that window.
//
// A list and not K17's arc: the turned fan's overhang is what a column has no room for — at
// twenty-one cards it drops the step to 43 px, under the finger's own floor, and cards turned side
// by side in a column splay rather than radiate. And a list and not a pager: paging shows four of
// thirteen, which is the reasoning K17 already declined when it refused to make the hand something
// you ask to see.
//
// What gives way is still the step, and it still bottoms out at a fingertip — only here the
// browser works it out, because the room is a page row's height and not something a module could
// know: every card but the last sits in a box one step tall that may shrink, and none of them
// below `FAN_MIN_PX`. A hand that no longer fits at that scrolls in its own box, and the page
// never does (L10).
export function HandColumn({ cards, faces, onPlay, locked = false, onCarry, aim, onOpen }: HandColumnProps) {
  const t = useT()
  const n = cards.length
  const roving = useRoving({ ids: cards.map((c) => c.id), selected: null, orientation: 'vertical' })
  // A card read (K26, #510 beslut B): lifted up beside the column the way a card on the felt is
  // lifted (#509), by the mouse resting on it or the keyboard's focus (`pointed`, for as long as it
  // rests), or by a press (`read`, until Escape, a press elsewhere, or the second press). The second
  // press on the same card — or a press on the lift — opens the address panel, which the first
  // press used to open straight away (#484 fynd 10). A focus a press gave is the press's, so it
  // lifts nothing of its own.
  const [pointed, setPointed] = useState<Reading | null>(null)
  const [read, setRead] = useState<Reading | null>(null)
  const pressed = useRef<string | null>(null)
  const readingOf = (c: VisibleComponentState, el: Element): Reading => ({ id: c.id, at: el.getBoundingClientRect() })
  const putDown = () => {
    setPointed(null)
    setRead(null)
  }
  const open = (c: VisibleComponentState) => {
    putDown()
    onOpen(c)
  }
  const tap = (c: VisibleComponentState) => {
    if (read?.id === c.id) return open(c)
    const el = document.querySelector(`[data-hand-card="${CSS.escape(c.id)}"]`)
    if (el) setRead(readingOf(c, el))
  }
  const { drag, handlers, cancel } = useHandDrag('across', onPlay, { locked, onTap: tap, onCarry })
  const lifted = drag ? cards.find((c) => c.id === drag.id) : undefined
  // A drag moves the card and reads nothing: the lift would stand over where it is going.
  const dragging = drag !== null
  useEffect(() => {
    if (dragging) putDown()
  }, [dragging])
  const reading = drag ? null : pointed ?? read
  const readCard = reading ? cards.find((c) => c.id === reading.id) : undefined
  // A card whose words are smaller than the wizard's frame is lifted larger (#523).
  const readingPt = useSmallestPt(faces, readCard)
  // A card read by a press stays until it is put down: Escape, or a press anywhere that is neither
  // the column nor the lift.
  const col = useRef<HTMLDivElement>(null)
  const held = read !== null
  useEffect(() => {
    if (!held) return
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setRead(null)
    const away = (e: PointerEvent) => {
      const at = e.target as Element | null
      if (at && (col.current?.contains(at) || at.closest('[data-lift]'))) return
      setRead(null)
    }
    window.addEventListener('keydown', key)
    window.addEventListener('pointerdown', away)
    return () => {
      window.removeEventListener('keydown', key)
      window.removeEventListener('pointerdown', away)
    }
  }, [held])
  return (
    <>
      <div ref={col} className="byd-hand-col" data-hand-fan data-hand-column role="group" aria-label={`Min hand, ${n} kort`} style={COLUMN_STYLE}>
        {cards.map((c) => {
          const item = roving.itemProps(c.id)
          return (
            <div className="byd-col-slot" key={c.id}>
              <button
                type="button"
                className="byd-hand-face byd-col-card"
                data-hand-card={c.id}
                data-lifted={drag?.id === c.id ? 'true' : undefined}
                aria-label={handLabel(c, false, t)}
                style={{ ['--hue' as string]: hue(c.cardRef ?? '') }}
                tabIndex={item.tabIndex}
                ref={item.ref}
                onFocus={(e) => {
                  item.onFocus()
                  if (pressed.current !== c.id) setPointed(readingOf(c, e.currentTarget))
                  // A card the arrows reach must be a card the eye reaches: L10's rule for a strip
                  // that scrolls, applied to the column that now does.
                  e.currentTarget.scrollIntoView?.({ block: 'nearest' })
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onOpen(c)
                    return
                  }
                  item.onKeyDown(e)
                }}
                {...handlers(c)}
                onPointerDown={(e) => {
                  pressed.current = c.id
                  handlers(c).onPointerDown(e)
                }}
                onPointerEnter={(e) => {
                  if (e.pointerType === 'mouse') setPointed(readingOf(c, e.currentTarget))
                }}
                onPointerLeave={() => setPointed((p) => (p?.id === c.id ? null : p))}
                onBlur={() => {
                  pressed.current = null
                  setPointed((p) => (p?.id === c.id ? null : p))
                }}
              >
                <Texture faces={faces} c={c} />
                <span aria-hidden="true">{cardWord(c)}</span>
              </button>
            </div>
          )
        })}
      </div>
      {/* Beside the list and never in it (#510). They are drawn fixed to the window, but a child of
          the column is still a child: the last card's slot is sized by `:last-child`, and with one of
          these after it the slot shrank to a step, the column re-centred 45 px lower, and the card
          under a pointer that had not moved became its neighbour. */}
      {drag && lifted && <HandGhost at={drag} card={lifted} faces={faces} size={aim?.size} />}
      {reading && readCard && <Lifted c={readCard} box={liftBox(edges(reading.at), { w: window.innerWidth, h: window.innerHeight }, readingPt)} faces={faces} onAsk={() => open(readCard)} />}
      {drag && <DragDoor onCancel={cancel} />}
    </>
  )
}

type Reading = { id: string; at: DOMRect }
const edges = (r: DOMRect) => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom })
