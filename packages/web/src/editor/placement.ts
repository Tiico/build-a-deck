import { useCallback, useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react'

// Where an opened box goes (#229).
//
// Every box the editor opens under a button was hard-set in the stylesheet: `top: calc(100% + 6px);
// left: 0`, always down and always left-aligned. A slot near the foot of the page therefore opened
// a 40vh box below itself, and the page started to scroll to make room for it — which moved the
// very thing the designer was looking at.
//
// The direction is not the stylesheet's to know. It belongs to the room there is at the moment the
// box opens, and that changes with the window, with the scroll and with how far down the button
// happens to stand. So it is read here, once, by every surface that opens one.
//
// The reading itself is pure — a rectangle, a wish and a window in, a placement out — which is what
// lets a test ask the question without a browser, and what keeps the rule in one place instead of
// in six components' worth of `getBoundingClientRect` arithmetic. The hook at the foot of the file
// does nothing but hold a box against it.

// The anchor in the window's own coordinates — a `DOMRect` read off the button, narrowed to the
// four numbers this needs.
export type Anchor = { x: number; y: number; w: number; h: number }
export type Wants = { w: number; h: number }
export type Viewport = { w: number; h: number }
// `start` and `end` rather than left and right: which edge the box hangs from is a question about
// the writing direction, and the stylesheet answers it with `inset-inline`.
// `room` is how much height the chosen side has — not how tall the box should be. What a box does
// with the room is the box's own business: the column door takes all of it, because it is a list
// that scrolls and a form that must stay on the screen under it, while a slot keeps its own cap and
// only ever uses the room as a ceiling. So the number is handed to the stylesheet as a custom
// property and each sheet says `max-height: var(--byd-place-room)` or `min(40vh, var(…))`.
export type Placement = { y: 'up' | 'down'; x: 'start' | 'end'; room: number }

// The room between the box and the window's edge, so an opened box never sits flush against it,
// and the least a box is worth opening at — under it the reader is shown a scrollbar and nothing
// else, and the roomier side is the honest answer even when neither side is roomy.
//
// Both are defaults and both can be said again by a box that has its own: the column door keeps a
// floor of 240 because a door shorter than that has stopped being a door, and 24 px of air because
// its shadow and its padding stand outside the height being measured. Those are that box's
// decisions; this reading carries them rather than overruling them.
export type Room = { gap?: number; least?: number }
const GAP = 6
const LEAST = 96

export function placeBox(anchor: Anchor, wants: Wants, view: Viewport, room: Room = {}): Placement {
  const gap = room.gap ?? GAP
  const least = room.least ?? LEAST
  const below = view.h - (anchor.y + anchor.h) - gap
  const above = anchor.y - gap
  // Every box wants at least the least worth opening, whatever it says it wants. A box asked
  // before it has been laid out reports no height at all, and a wish of nought fits anywhere —
  // which would put it below a button standing on the window's own foot, in no room whatever.
  const wish = { w: wants.w, h: Math.max(wants.h, least) }
  // Down while the room below can hold it; otherwise up if *that* room can. When neither can, the
  // box goes wherever there is more of it and shrinks to fit — a box that must scroll should at
  // least scroll in the taller half.
  const y = below >= wish.h || (below >= above && below >= least) ? 'down' : above >= wish.h || above > below ? 'up' : 'down'
  const got = y === 'down' ? below : above
  return {
    y,
    // The box hangs from the anchor's near edge while it fits, and from its far edge when it would
    // otherwise run off the window.
    x: anchor.x + wants.w <= view.w - gap ? 'start' : 'end',
    // Never under the least this box is worth opening at, even when the window is shorter than
    // that: a door held open at less than a door is no better than one hanging off the screen, and
    // the list inside it scrolls, as it always did.
    room: Math.max(least, got),
  }
}

// A box held against the reading above for as long as it is open.
//
// It is handed the box and nothing else. What the box opens *from* is the element it is positioned
// against — its `offsetParent`, which is the very box the stylesheet's `top: 100%` already measures
// against — so the anchor never has to be threaded through a component to get here. That is also
// what makes the flip exact: wherever the sheet says `top: 100%`, up is `bottom: 100%` of the same
// rectangle. (jsdom lays nothing out and so has no `offsetParent`; the parent element is the same
// element there, which is what lets the wiring be tested without a browser.)
//
// Measured in a layout effect, because no frame may be painted at a placement that is not the one
// the room asks for: a box that opens downward and jumps upward on the next frame is the scroll
// this was meant to stop, arriving a frame late.
export function usePlacement(open: boolean, box: RefObject<HTMLElement | null>, room: Room = {}): Placement | null {
  const [place, setPlace] = useState<Placement | null>(null)
  const measure = useCallback(() => {
    const b = box.current
    const from = (b?.offsetParent ?? b?.parentElement) as HTMLElement | null | undefined
    if (!b || !from) return
    const r = from.getBoundingClientRect()
    // `scrollHeight` and not the drawn height: the drawn one is whatever the last placement left
    // it at, and measuring that would let the box ratchet itself smaller on every scroll.
    setPlace(placeBox({ x: r.left, y: r.top, w: r.width, h: r.height }, { w: b.offsetWidth, h: b.scrollHeight }, { w: window.innerWidth, h: window.innerHeight }, room))
    // The two numbers and not the record: the room a box keeps is a constant of that box, and a
    // fresh `{}` on every render would take a new reading for a pair of values that never move.
  }, [box, room.gap, room.least])
  useLayoutEffect(() => {
    if (!open) {
      setPlace(null)
      return
    }
    measure()
    // The room changes when the window does and when anything under the box scrolls, so the
    // reading is taken again on both — on capture, because the scroll that moves the anchor is
    // very often some box inside the page rather than the page itself.
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [open, measure])
  return place
}

// What a placed box carries, as the props a component spreads onto it: two attributes the
// stylesheet reads, and the height the room allows. Said once here so that six surfaces cannot
// spell it six ways.
export function placedProps(place: Placement | null): { 'data-place-y'?: string; 'data-place-x'?: string; style?: CSSProperties } {
  if (!place) return {}
  return { 'data-place-y': place.y, 'data-place-x': place.x, style: { ['--byd-place-room' as string]: `${place.room}px` } }
}
