import { useEffect, useState } from 'react'

// How much room a tool-rich surface has been given (L10). The editor asks it for all three of
// its shapes; the wizard asks it only whether it is on a desk. Three rooms, and the border between them is
// what the surface can honestly hold:
//
//   phone  (< 768)   the deck wall, the table and the tables. No canvas: a card is laid out in
//                    millimetres against four panels, and none of that fits a phone. The editor
//                    says so in as many words rather than quietly leaving the tools out.
//   tablet (768–1023) everything, as named stages one at a time — nothing on top of anything.
//   desk   (>= 1024) today's editor: the modes in the header, the canvas in four columns.
//
// A mouse or a trackpad is never a phone, however narrow the window (L12, tillägg 2026-09-30,
// #550). A desk zoomed to 200 % is 640 px wide and a desk at 400 % is 320, and the person at it is
// the designer L12 is written for: she keeps the stages, the canvas among them. Width decided the
// phone on its own before, and so took the template away from exactly the reader who had zoomed
// in to be able to work. The phone — a finger, no hover — keeps the honest room L10 gave it.
export type Room = 'phone' | 'tablet' | 'desk'

// The desk is where the four columns fit side by side; the canvas needs at least a tablet.
const DESK = '(min-width: 1024px)'
const CANVAS = '(min-width: 768px)'
// A pointer that can rest on something and point at a pixel: a mouse, a trackpad. The primary one,
// so a laptop with a touch screen is still a desk and a tablet with a pen is still a tablet.
const FINE = '(hover: hover) and (pointer: fine)'

function roomNow(): Room {
  // Where there is no window to ask — a headless render, a test that has not said how wide it is
  // — the editor is whole. A missing answer must never take the canvas away.
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'desk'
  if (window.matchMedia(DESK).matches) return 'desk'
  return window.matchMedia(CANVAS).matches || window.matchMedia(FINE).matches ? 'tablet' : 'phone'
}

// The room, kept in step with the window: turning a tablet, or dragging a window past 1024, moves
// the editor between its shapes without a reload. It is answered in JavaScript and not only in
// CSS because the two shapes are different documents — the stages and the desk are never both
// mounted, or there would be two of every widget and two of every element id in one page.
export function useRoom(): Room {
  const [room, setRoom] = useState(roomNow)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    // A mouse plugged into a tablet moves it too, so the pointer is watched with the width.
    const watched = [window.matchMedia(DESK), window.matchMedia(CANVAS), window.matchMedia(FINE)]
    const answer = () => setRoom(roomNow())
    for (const query of watched) query.addEventListener('change', answer)
    answer()
    return () => {
      for (const query of watched) query.removeEventListener('change', answer)
    }
  }, [])
  return room
}
