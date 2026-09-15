import type { Motif } from './motif.js'

// The deck's measure, and the window it cuts out of a file (E1).
//
// `motifOf` takes the air off a picture, but it says nothing about how large the drawing should
// be drawn or where in the frame it should stand — and it can do nothing at all for a file that
// arrived cropped to its own drawing. That is what the measure is: two numbers, written once for
// an image element and obeyed by every card that inherits it.
//
// Nothing here rewrites a file. A picture is content-addressed and may sit in ten other people's
// decks, so a crop that wrote new bytes would crop their cards too. What is stored is the recipe;
// the window is worked out from it every time, here, by the one function both the compiler and
// the editor call.

export type Frame = {
  // The share of the frame the drawing itself fills. This is the number that makes six files
  // carrying six different amounts of air draw their motifs the same size.
  fill: number
  // Where the drawing sits in the window: in the middle of it, or standing on a line the whole
  // deck shares. A deck of creatures looks like a deck when their feet agree.
  anchor: 'centre' | 'foot'
}

// One card's departure from the measure, as shares of the window — so the same nudge means the
// same thing however far in the picture is zoomed. Zero, and a zoom of one, is "the measure".
export type Nudge = { zoom?: number; dx?: number; dy?: number }

// The window, in the file's own pixels, and whether the file could hold it. `short` is not a
// detail: a file with no air to give is handed a window larger than itself, and unless that is
// said out loud the deck's count will call it uniform while the card shows something else.
export type Window = { x: number; y: number; w: number; h: number; short: boolean }

// What is drawn, in the file's pixels, from what was measured off it.
const drawing = (m: Motif) => ({
  x: m.trim.left,
  y: m.trim.top,
  w: m.w - m.trim.left - m.trim.right,
  h: m.h - m.trim.top - m.trim.bottom,
})

export function frameWindow(motif: Motif, frame: Frame, ratio: number, nudge: Nudge = {}): Window {
  const art = drawing(motif)
  const zoom = nudge.zoom ?? 1
  // The window is held by the side that binds. Taking the height alone would let a wide drawing
  // in a landscape frame ask for a window narrower than the drawing and lose its own edges.
  const asked = Math.max(art.h / frame.fill, art.w / frame.fill / ratio) / zoom
  // A file cannot be sampled outside itself, so a window it cannot hold is shrunk to what is
  // there — keeping the frame's shape, because a window of another shape hands the frame back
  // the very problem it was opened to solve.
  const room = Math.min(1, motif.w / (asked * ratio), motif.h / asked)
  const h = asked * room
  const w = h * ratio
  const air = h * (1 - frame.fill * zoom * room)
  const centre = art.x + art.w / 2
  const top = frame.anchor === 'centre' ? art.y + art.h / 2 - h / 2 : art.y + art.h + air / 2 - h
  // Sliding a window back inside the file is not the same failure as shrinking it: the measure
  // is still met, the picture just sits against its own edge.
  const x = Math.min(Math.max(centre - w / 2 + (nudge.dx ?? 0) * w, 0), motif.w - w)
  const y = Math.min(Math.max(top + (nudge.dy ?? 0) * h, 0), motif.h - h)
  return { x, y, w, h, short: room < 1 }
}

// How large the drawing is actually drawn, as a share of the frame — measured on the window that
// will be cut, not on the one the measure asked for. A deck is uniform exactly when this number
// is the same on every card, and it is this number that tells on a file that had to be shrunk.
export function drawnAt(motif: Motif, win: Window): number {
  const art = drawing(motif)
  return Math.max(art.h / win.h, art.w / win.w)
}
