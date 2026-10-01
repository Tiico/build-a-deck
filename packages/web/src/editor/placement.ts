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
//
// `lift` is the third, and it says where the box is drawn rather than where it goes (#611, L55). A
// box that stands inside something that scrolls is cut by that thing's edge, whatever room the
// window has: the column door hung from the head of a table inside its own scroll box, and in a
// window 640 px tall its foot — the form's two buttons — was cut off and «+ Nytt kort» stood where
// they should have been. An opened box lies over everything else, so a lifted box is put in the
// page's top layer, where no box clips it and nothing is drawn over it, and is held there against
// the element it hangs from.
export type Room = { gap?: number; least?: number; lift?: boolean }
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

// Where a lifted box stands in the window: against the edges of what it hangs from that the
// placement chose, with the other two left to the box. Pure, like the reading, so the arithmetic is
// asked without a browser.
export type Lifted = { top: string; right: string; bottom: string; left: string }
export function liftedAt(anchor: Anchor, place: Placement, view: Viewport): Lifted {
  const px = (n: number) => `${n}px`
  return {
    top: place.y === 'down' ? px(anchor.y + anchor.h) : 'auto',
    bottom: place.y === 'up' ? px(view.h - anchor.y) : 'auto',
    left: place.x === 'start' ? px(anchor.x) : 'auto',
    right: place.x === 'end' ? px(view.w - (anchor.x + anchor.w)) : 'auto',
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
//
// A lifted box hangs from its parent element and not from its `offsetParent`: once it is in the top
// layer it is fixed to the window and has no `offsetParent` at all, and the parent is the element
// the sheet placed it against in every box that lifts. It leaves the top layer by leaving the page
// — every lifted box is drawn only while it is open — and never by `hidePopover`, which would
// hand the focus back to whatever held it when the box opened.
export function usePlacement(open: boolean, box: RefObject<HTMLElement | null>, room: Room = {}): (Placement & { at?: Lifted }) | null {
  const [place, setPlace] = useState<(Placement & { at?: Lifted }) | null>(null)
  const measure = useCallback(() => {
    const b = box.current
    const from = (room.lift ? b?.parentElement : (b?.offsetParent ?? b?.parentElement)) as HTMLElement | null | undefined
    if (!b || !from) return
    const r = from.getBoundingClientRect()
    const anchor = { x: r.left, y: r.top, w: r.width, h: r.height }
    const view = { w: window.innerWidth, h: window.innerHeight }
    // `scrollHeight` and not the drawn height: the drawn one is whatever the last placement left
    // it at, and measuring that would let the box ratchet itself smaller on every scroll.
    const at = placeBox(anchor, { w: b.offsetWidth, h: b.scrollHeight }, view, room)
    // Coordinates only for a box that really is in the top layer: one that stayed where it stands
    // — jsdom has no top layer — is still placed by its own sheet against its own parent.
    setPlace(room.lift && b.matches(':popover-open') ? { ...at, at: liftedAt(anchor, at, view) } : at)
    // The three values and not the record: the room a box keeps is a constant of that box, and a
    // fresh `{}` on every render would take a new reading for values that never move.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the room is a constant of the box, read by its values
  }, [box, room.gap, room.least, room.lift])
  useLayoutEffect(() => {
    if (!open) {
      setPlace(null)
      return
    }
    // Into the top layer before the first reading, so the box is measured as the size it is drawn
    // at there. jsdom has no top layer, and a box there simply stays where it stands.
    const b = box.current
    if (room.lift && b && typeof b.showPopover === 'function' && !b.matches(':popover-open')) {
      b.setAttribute('popover', 'manual')
      b.showPopover()
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
  }, [open, measure, box, room.lift])
  return place
}

// What a placed box carries, as the props a component spreads onto it: two attributes the
// stylesheet reads, and the height the room allows. Said once here so that six surfaces cannot
// spell it six ways.
// A lifted box also carries where it stands, fixed to the window, with the margin the top layer's
// own sheet centres a popover by taken back.
export function placedProps(place: (Placement & { at?: Lifted }) | null): { 'data-place-y'?: string; 'data-place-x'?: string; style?: CSSProperties } {
  if (!place) return {}
  const room = { ['--byd-place-room' as string]: `${place.room}px` }
  const style: CSSProperties = place.at ? { ...room, position: 'fixed', margin: 0, ...place.at } : room
  return { 'data-place-y': place.y, 'data-place-x': place.x, style }
}
