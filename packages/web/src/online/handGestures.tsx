import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import type { VisibleComponentState } from '@byd/protocol'
import { hue } from '../table/hue.js'
import { TURNED_GROUND } from '../player/HandFace.js'
import { Lifted } from '../table/Lifted.js'
import { LIFT_GAP, liftBox, liftOver, type Box } from '../table/lift.js'
import { useSmallestPt } from '../table/smallest.js'
import { useRoving } from '../editor/roving.js'
import { handLabel } from '../table/keyboard.js'
import { useT, type Key } from '../i18n/index.js'
import { HandGhost, useHandDrag, type HandDragOptions, type HandPlay } from './handDrag.js'
import { DragDoor } from '../editor/DragDoor.js'

export type HandGestureOptions = {
  cards: readonly VisibleComponentState[]
  faces?: string | undefined
  // A card dragged out of the hand, released at a client point.
  onPlay: HandPlay
  // Nothing can be played — an undo is proposed, or the table has ended — so nothing is lifted (#484).
  locked?: boolean | undefined
  onCarry?: HandDragOptions['onCarry']
  aim?: { size: { w: number } | null } | undefined
  // The cards turned over in the hand, played face down (#1133); a click, Space or F turns one (#1291).
  turned?: ReadonlySet<string> | undefined
  onTurn?: ((card: VisibleComponentState) => void) | undefined
  // The address panel (#2, #24): Enter on a card, or a finger's second press.
  onOpen(card: VisibleComponentState): void
  // Which way the hand runs, and so which way a card comes out of it to be played and which way
  // the arrows walk it: a column stands beside the felt and a card comes *across* out of it; a row
  // lies under the targets and a card comes *up* (#77, #1310).
  shape: 'column' | 'row'
  // What the lift says to a mouse, for a card upright and for one turned over. The column plays to
  // the table; the row on `/play` plays to the targets over it.
  says?: { mouse: Key; turned: Key } | undefined
}

// The hand's gestures, one answer for every shape of the seat's own hand at a desk (#1291, #1310):
// the column on `/online` and the row along the foot of `/play` in a wide window. A third copy of
// the same rules — rest reads, click turns, drag plays, Enter opens, a finger reads and then asks —
// would have been a third place for them to drift apart in.
//
// A card read (K26, #510 beslut B) is lifted up the way a card on the felt is lifted (#509), by the
// mouse resting on it or the keyboard's focus (`pointed`, for as long as it rests), or by a finger's
// press (`read`, until Escape, a press elsewhere, or the second press). A finger's second press on
// the same card — or a press on the lift — opens the address panel (#484 fynd 10). A mouse's click
// holds nothing and sends nothing: the mouse has already read the card by resting on it, and the
// click turns it over (#1291, beställarens beslut A). A focus a press gave is the press's, so it
// lifts nothing of its own.
export function useHandGestures({ cards, faces, onPlay, locked = false, onCarry, aim, turned, onTurn, onOpen, shape, says }: HandGestureOptions) {
  const t = useT()
  const roving = useRoving({ ids: cards.map((c) => c.id), selected: null, orientation: shape === 'column' ? 'vertical' : 'horizontal' })
  const [pointed, setPointed] = useState<Reading | null>(null)
  const [read, setRead] = useState<Reading | null>(null)
  const pressed = useRef<string | null>(null)
  const readingOf = (c: VisibleComponentState, el: Element, by: Reading['by'] = 'finger'): Reading => ({ id: c.id, at: el.getBoundingClientRect(), by })
  const putDown = () => {
    setPointed(null)
    setRead(null)
  }
  const open = (c: VisibleComponentState) => {
    putDown()
    onOpen(c)
  }
  const tap = (c: VisibleComponentState, by: string) => {
    if (by === 'mouse') return onTurn?.(c)
    if (read?.id === c.id) return open(c)
    const el = document.querySelector(`[data-hand-card="${CSS.escape(c.id)}"]`)
    if (el) setRead(readingOf(c, el))
  }
  const { drag, handlers, cancel } = useHandDrag(shape === 'column' ? 'across' : 'up', onPlay, { locked, onTap: tap, onCarry })
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
  // the hand nor the lift.
  const container = useRef<HTMLDivElement>(null)
  const held = read !== null
  useEffect(() => {
    if (!held) return
    const key = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && setRead(null)
    const away = (e: PointerEvent) => {
      const target = e.target as Element | null
      if (target && (container.current?.contains(target) || target.closest('[data-lift]'))) return
      setRead(null)
    }
    window.addEventListener('keydown', key)
    window.addEventListener('pointerdown', away)
    return () => {
      window.removeEventListener('keydown', key)
      window.removeEventListener('pointerdown', away)
    }
  }, [held])

  const cardProps = (c: VisibleComponentState) => {
    const item = roving.itemProps(c.id)
    const down = turned?.has(c.id) === true
    const gesture = handlers(c)
    return {
      type: 'button' as const,
      'data-hand-card': c.id,
      'data-lifted': drag?.id === c.id ? 'true' : undefined,
      'data-turned': down ? 'true' : undefined,
      'aria-label': handLabel(c, false, t, down),
      style: { ['--hue' as string]: hue(c.cardRef ?? ''), ...(down ? TURNED_GROUND : {}) } as CSSProperties,
      tabIndex: item.tabIndex,
      ref: item.ref,
      onFocus: (e: { currentTarget: HTMLElement }) => {
        item.onFocus()
        // Only a focus the keyboard can see lifts the card: the one a program gives after a mouse
        // played the card beside it (#1310) is not the reader's, and would cover the targets.
        if (pressed.current !== c.id && keyboardSees(e.currentTarget)) setPointed(readingOf(c, e.currentTarget, 'key'))
        // A card the arrows reach must be a card the eye reaches: L10's rule for a strip that
        // scrolls, applied to the hand that now does.
        e.currentTarget.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
      },
      onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
        // Enter is the keyboard's way to play, since it cannot drag (K16); Space is the click, and
        // turns the card as the click does (#1291).
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
      },
      ...gesture,
      onPointerDown: (e: RPointerEvent) => {
        pressed.current = c.id
        gesture.onPointerDown(e)
      },
      onPointerEnter: (e: RPointerEvent<HTMLElement>) => {
        if (e.pointerType === 'mouse') setPointed(readingOf(c, e.currentTarget, 'mouse'))
      },
      onPointerLeave: () => setPointed((p) => (p?.id === c.id ? null : p)),
      onBlur: () => {
        pressed.current = null
        setPointed((p) => (p?.id === c.id ? null : p))
      },
    }
  }

  // Beside the hand and never in it (#510). They are drawn fixed to the window, but a child of
  // the column is still a child: the last card's slot is sized by `:last-child`, and with one of
  // these after it the slot shrank to a step and the card under a pointer that had not moved
  // became its neighbour.
  const overlays: ReactNode = (
    <>
      {drag && lifted && <HandGhost at={drag} card={lifted} faces={faces} size={aim?.size} turned={turned?.has(lifted.id) === true} />}
      {reading && readCard && <Read reading={reading} card={readCard} faces={faces} pt={readingPt} turned={turned?.has(readCard.id) === true} over={shape === 'row'} says={says} onAsk={() => open(readCard)} />}
      {drag && <DragDoor onCancel={cancel} />}
    </>
  )
  return { container, cardProps, overlays }
}

// Whether a focus is one the keyboard put there: `:focus-visible` once the element has it, which a
// browser answers from how the reader last moved, and yes where there is no answer to be had.
function keyboardSees(el: HTMLElement): boolean {
  if (document.activeElement !== el) return true
  try {
    return el.matches(':focus-visible')
  } catch {
    return true
  }
}

// A mouse or a keyboard reads a card with nothing on it to say what it answers to, so the lift
// says it on a line of its own, under the card or over it where the window ends (#1291, prototype A).
// A finger is not told: its press is the one that reads, and the second one is the one it asks with.
type Reading = { id: string; at: DOMRect; by: 'mouse' | 'key' | 'finger' }
export const SAYS_PX = 34
function Read({ reading, card, faces, pt, turned, over, says: words, onAsk }: { reading: Reading; card: VisibleComponentState; faces: string | undefined; pt: number | null | undefined; turned: boolean; over: boolean; says: HandGestureOptions['says']; onAsk(): void }) {
  const t = useT()
  const room = { w: window.innerWidth, h: window.innerHeight }
  // The column lifts the card beside itself; the row lifts it over itself, with the line between
  // the lift and the card it is of (#1310, prototype A).
  const box: Box = over ? liftOver(edges(reading.at), room, SAYS_PX, pt) : liftBox(edges(reading.at), room, pt)
  const below = box.top + box.h + LIFT_GAP + SAYS_PX <= window.innerHeight
  const mouse = words ?? { mouse: 'online.hand.says.mouse', turned: 'online.hand.says.mouse.turned' }
  const says = reading.by === 'mouse' ? t(turned ? mouse.turned : mouse.mouse) : reading.by === 'key' ? t('online.hand.says.key') : null
  return (
    <>
      <Lifted c={card} box={box} faces={faces} onAsk={onAsk} />
      {says && (
        <p
          className="byd-hand-back"
          data-lift-says=""
          style={{ position: 'fixed', zIndex: 36, left: box.left + box.w / 2, top: below ? box.top + box.h + LIFT_GAP : box.top - LIFT_GAP - SAYS_PX }}
        >
          {says}
        </p>
      )}
    </>
  )
}
const edges = (r: DOMRect) => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom })
