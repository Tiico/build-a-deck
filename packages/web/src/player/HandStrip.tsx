import { useEffect, useRef, useState } from 'react'
import type { Snapshot, VisibleComponentState } from '@byd/protocol'
import { hue } from '../table/hue.js'
import { Texture } from '../table/Texture.js'
import { useRoving } from '../editor/roving.js'
import { cardWord, handLabel } from '../table/keyboard.js'
import { useT } from '../i18n/index.js'
import { HOLD_MS, begin, cancel, end, move, timeout, type Tracking } from './gesture.js'
import { keepInView } from './strip.js'

export type HandStripProps = {
  view: Snapshot
  selected: ReadonlySet<string>
  onTap(card: VisibleComponentState): void
  onHold(card: VisibleComponentState): void
  onLift(card: VisibleComponentState): void
  // Enter on a card: the address panel, the keyboard's way to every verb (#1, variant C).
  onOpen(card: VisibleComponentState): void
  // The HTTP origin that serves /faces/:hash; without it cards show their names on colour.
  faces?: string | undefined
  // A card carried to another place along the strip (K4; #483, beslut A efter prototyp 33), by a
  // thumb that rested until the card lifted and then went sideways, or by Alt and an arrow.
  // `position` is where it should stand in the strip as it is drawn, first card first.
  onReorder?: ((card: VisibleComponentState, position: number) => void) | undefined
}

// The seat's own hand as a horizontal strip of big, readable cards (K4).
// The projection already guarantees that only this seat's hand is here to show.
//
// Every card is a real control (#1): it has the name the projection gives it, it says whether it
// is marked, and it is one tab stop with the arrows inside — the editor's roving tabindex, not a
// second one written here. Space marks and unmarks, Enter opens the address panel. The gestures
// K4 retains drag to play and hold to mark; the chosen phone A uses tap to select.
export function HandStrip({ view, selected, onTap, onHold, onLift, onOpen, faces, onReorder }: HandStripProps) {
  const t = useT()
  // The hand read from the bottom up (#415, decision B of 2026-09-22). A drawn card lands on
  // top of the zone, which is index 0 of the projection's order, so reading the order
  // backwards is what makes the hand grow towards the reading direction: the card that just
  // arrived is last, and the cards already held keep the places the eye left them in.
  const hand = view.components.filter((c) => c.zone === `hand:${view.seat}`).reverse()
  const roving = useRoving({ ids: hand.map((c) => c.id), selected: null, orientation: 'horizontal' })
  const tracking = useRef<{ card: VisibleComponentState; t: Tracking; timer: ReturnType<typeof setTimeout> } | null>(null)

  // The marked card is the one the buttons under the strip act on, so it is the one that has to
  // be in view (#415). Which card that is, and how many cards are held, are the two things that
  // can put it out of sight: a draw does both at once.
  const strip = useRef<HTMLDivElement>(null)
  // The marked card nearest the growing end: with one card chosen that is the chosen card, and
  // with several held it is the newest of them.
  const markedId = hand.reduce<string | null>((last, c) => (selected.has(c.id) ? c.id : last), null)
  useEffect(() => {
    const el = strip.current
    if (!el || markedId === null) return
    const card = el.querySelector<HTMLElement>(`[data-hand-card="${CSS.escape(markedId)}"]`)
    if (card) keepInView(el, card)
  }, [markedId, hand.length])

  // The card a resting thumb has lifted, and the one being carried along the strip: where it
  // started, where it would land now, and how far the thumb has gone (K4, #483).
  const [lifting, setLifting] = useState<string | null>(null)
  const [carrying, setCarrying] = useState<{ id: string; from: number; to: number; dx: number } | null>(null)
  const fire = (g: 'tap' | 'hold' | 'lift' | 'sort' | null, card: VisibleComponentState) => {
    if (g === 'tap') onTap(card)
    if (g === 'hold') onHold(card)
    if (g === 'lift') onLift(card)
  }
  const down = (card: VisibleComponentState, x: number, y: number) => {
    const t = begin(x, y)
    // The timer decides nothing (#483); it lifts the card, so the thumb can see it is holding one.
    const timer = setTimeout(() => {
      timeout(t)
      if (t.held) setLifting(card.id)
    }, HOLD_MS)
    tracking.current = { card, t, timer }
  }
  // Where along the strip a thumb at `x` would put the carried card: after every other card whose
  // middle it has passed.
  const landingAt = (x: number, from: number): number => {
    const others = [...(strip.current?.querySelectorAll<HTMLElement>('[data-hand-card]') ?? [])].filter((_, i) => i !== from)
    return others.filter((el) => {
      const box = el.getBoundingClientRect()
      return x > box.left + box.width / 2
    }).length
  }
  const moved = (x: number, y: number) => {
    const cur = tracking.current
    if (!cur) return
    const g = move(cur.t, x, y)
    // Decided either way — a lift, a pan that is nothing, a carry (#483) — the hold timer has
    // nothing left to decide.
    if (cur.t.decided) clearTimeout(cur.timer)
    if (g === 'sort' || cur.t.decided === 'sort') {
      const from = hand.findIndex((c) => c.id === cur.card.id)
      setCarrying({ id: cur.card.id, from, to: landingAt(x, from), dx: x - cur.t.x })
      // A carried card near the strip's edge brings the rest of the hand to it.
      const box = strip.current?.getBoundingClientRect()
      if (strip.current && box) {
        if (x < box.left + 40) strip.current.scrollLeft -= 12
        else if (x > box.right - 40) strip.current.scrollLeft += 12
      }
      return
    }
    if (g) fire(g, cur.card)
  }
  const up = () => {
    const cur = tracking.current
    if (!cur) return
    clearTimeout(cur.timer)
    setLifting(null)
    if (cur.t.decided === 'sort') {
      if (carrying && carrying.to !== carrying.from) onReorder?.(cur.card, carrying.to)
      setCarrying(null)
      tracking.current = null
      return
    }
    fire(end(cur.t), cur.card)
    tracking.current = null
  }
  // Once a card has lifted, the thumb is holding it and not the strip: the browser is kept from
  // turning the next move into a pan of its own, which is what would take the card out of the
  // thumb (`pointercancel`). Before that, a move is the browser's to pan with, as it always was.
  useEffect(() => {
    const el = strip.current
    if (!el) return
    const hold = (e: TouchEvent) => {
      if (tracking.current?.t.held && e.cancelable) e.preventDefault()
    }
    el.addEventListener('touchmove', hold, { passive: false })
    return () => el.removeEventListener('touchmove', hold)
  }, [])

  return (
    <div className="byd-strip" data-hand ref={strip}>
      {hand.map((c) => {
        const item = roving.itemProps(c.id)
        return (
          <button
            key={c.id}
            type="button"
            className="byd-strip-card"
            data-hand-card={c.id}
            data-selected={selected.has(c.id) ? 'true' : 'false'}
            {...(lifting === c.id ? { 'data-lifting': 'true' } : {})}
            {...(carrying?.id === c.id ? { 'data-carried': 'true' } : {})}
            aria-label={handLabel(c, selected.has(c.id), t)}
            aria-pressed={selected.has(c.id)}
            style={{ ['--hue' as string]: hue(c.cardRef ?? ''), ...(carrying?.id === c.id ? { translate: `${carrying.dx}px 0` } : {}) }}
            tabIndex={item.tabIndex}
            ref={item.ref}
            onFocus={item.onFocus}
            onKeyDown={(e) => {
              // Alt and an arrow carry the card one place along the strip (K4, #483), as Alt and an
              // arrow move a layer or a column everywhere else in this tool.
              if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                e.preventDefault()
                const at = hand.findIndex((x) => x.id === c.id)
                const to = at + (e.key === 'ArrowRight' ? 1 : -1)
                if (to >= 0 && to < hand.length) onReorder?.(c, to)
                return
              }
              if (e.key === ' ') {
                e.preventDefault()
                onHold(c)
                return
              }
              if (e.key === 'Enter') {
                e.preventDefault()
                onOpen(c)
                return
              }
              item.onKeyDown(e)
            }}
            onClick={e => { if (e.detail === 0) onTap(c) }}
            onPointerDown={(e) => down(c, e.clientX, e.clientY)}
            onPointerMove={(e) => moved(e.clientX, e.clientY)}
            onPointerUp={up}
            // The browser took the gesture over for its own scrolling: that is a pan, never a tap.
            onPointerCancel={() => {
              const cur = tracking.current
              if (!cur) return
              clearTimeout(cur.timer)
              cancel(cur.t)
              setLifting(null)
              setCarrying(null)
              tracking.current = null
            }}
          >
            <Texture faces={faces} c={c} />
            <strong aria-hidden="true">{cardWord(c)}</strong>
          </button>
        )
      })}
      {/* A hand with nothing in it (UX-16): where the cards would be, the strip says what fills
          it, in the same form as the line under what lies in front of the seat. */}
      {hand.length === 0 && <p className="byd-strip-empty">{t('player.hand.empty')}</p>}
    </div>
  )
}
