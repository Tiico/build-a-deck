// PROTOTYPE — throwaway.
//
// The non-destructive recipe, as all three variants have to agree about it: the file is never
// rewritten, and what is stored beside the reference is the window cut out of it. The window is
// derived from the deck's rule and the file's measured motif, and then nudged; so a deck gets its
// uniformity from the rule, and a picture that fights the rule is a nudge and not an exception.
import type { Piece } from './deck.js'
import { ratio } from './deck.js'

// What the deck asks of every picture.
export type Rule = {
  // How much of the window's height the drawing itself fills. This is the number that makes six
  // files with six different amounts of air draw their motif the same size.
  fill: number
  // Where the drawing sits in the window: centred, or standing on a common ground line.
  anchor: 'mitt' | 'fot'
}
export const DEFAULT_RULE: Rule = { fill: 0.78, anchor: 'mitt' }

// One picture's departure from the rule, as fractions of the window — what a drag and a slider
// write. Zero is "the rule, exactly".
export type Nudge = { dx: number; dy: number; zoom: number }
export const NO_NUDGE: Nudge = { dx: 0, dy: 0, zoom: 1 }

// The window cut out of the file, in the file's own pixels. Aspect-locked to the frame, because a
// window of another shape would hand the frame back the problem it was opened to solve.
export type Window = { x: number; y: number; w: number; h: number }

export function windowFor(piece: Piece, rule: Rule, nudge: Nudge = NO_NUDGE): Window {
  const m = piece.motif
  // The window that gives the motif `fill` of the frame — of whichever side actually binds. A
  // tall drawing is held by the height and a wide one by the width, and taking only the height
  // would let a wide drawing run out through the sides of a landscape frame.
  const h = Math.max(m.h / rule.fill, m.w / rule.fill / ratio) / nudge.zoom
  const w = h * ratio
  const cx = m.x + m.w / 2
  // Centred, or standing on a line: a foot anchor leaves the same air under every drawing, which
  // is what makes a deck of creatures look like a deck rather than six loose pictures. The air
  // the rule leaves over is split in two; a foot anchor gives the lower half to the ground.
  const air = h * (1 - rule.fill)
  const top = rule.anchor === 'mitt' ? m.y + m.h / 2 - h / 2 : m.y + m.h + air / 2 - h
  return { x: cx - w / 2 + nudge.dx * w, y: top + nudge.dy * h, w, h }
}

// Whether the file actually holds what the window asks for. A window that reaches outside the
// file is the one real failure here: no rule can conjure pixels that were never drawn, and the
// designer has to be told rather than handed a silver edge.
export function short(piece: Piece, win: Window): boolean {
  return win.x < -0.5 || win.y < -0.5 || win.x + win.w > piece.w + 0.5 || win.y + win.h > piece.h + 0.5
}

// The window as it can actually be sampled: slid back inside the file, and shrunk — keeping the
// frame's shape — when sliding is not enough. Everything that draws or measures goes through
// this, because what a card shows is this window and not the one the rule asked for. It is what
// makes the deck's odd file look odd on the card instead of quietly passing the count.
export function clamped(piece: Piece, win: Window): Window {
  const scale = Math.min(1, piece.w / win.w, piece.h / win.h)
  const w = win.w * scale
  const h = win.h * scale
  // Shrinking is done about the window's own centre, so a picture does not jump sideways the
  // moment it stops fitting.
  const x = Math.min(Math.max(win.x + (win.w - w) / 2, 0), piece.w - w)
  const y = Math.min(Math.max(win.y + (win.h - h) / 2, 0), piece.h - h)
  return { x, y, w, h }
}

// The window as CSS on a box of any size: the file is laid inside the box scaled and offset so
// that exactly the window shows. One expression, so every surface in the prototype crops
// identically — a thumbnail that crops differently from the workspace proves nothing.
export function laidOut(piece: Piece, asked: Window, boxW: number): { width: number; left: number; top: number } {
  const win = clamped(piece, asked)
  const scale = boxW / win.w
  return { width: piece.w * scale, left: -win.x * scale, top: -win.y * scale }
}

// How large the drawing is drawn, as a share of the frame — of the side that binds, which is the
// side the rule is about. The rule says what this should be; this says what it is, and a deck is
// uniform exactly when this number is the same on every card.
export const drawnAt = (piece: Piece, asked: Window): number => {
  const win = clamped(piece, asked)
  return Math.max(piece.motif.h / win.h, piece.motif.w / win.w)
}

// The share of the file's area that is air around the drawing — what the automatic measurement
// finds, and the reason two files disagree in the first place.
export const airOf = (p: Piece): number => 1 - (p.motif.w * p.motif.h) / (p.w * p.h)
