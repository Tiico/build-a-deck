// The three things a thumb does to a card in the strip (K4): tap, hold, or drag up.
// Pure state so the recogniser is testable and the component stays a thin wrapper.
//
// And the fourth thing it does, which is none of them (#483): it pans the strip. A thumb that has
// gone further than a wobble has said it is not choosing, so nothing that comes after — the hold
// timer, the lift of the finger — is read as a choice. The same goes for a gesture the browser
// took over for its own scrolling (`pointercancel`), and for a drag upward that stopped short.

export type Gesture = 'tap' | 'hold' | 'lift'
export const LIFT_PX = 40
export const HOLD_MS = 450
// How far a finger may wander before it is no longer resting on a card.
export const SCROLL_PX = 10

export type Tracking = { x: number; y: number; decided: Gesture | 'none' | null; strayed: boolean; held: boolean }

export function begin(x: number, y: number): Tracking {
  return { x, y, decided: null, strayed: false, held: false }
}

// Returns 'lift' once the pointer has travelled far enough upward; null otherwise. A pointer that
// has gone sideways past the wobble is scrolling, and is decided as nothing.
export function move(t: Tracking, x: number, y: number): Gesture | null {
  if (t.decided) return null
  const dx = Math.abs(x - t.x)
  if (t.y - y >= LIFT_PX && dx < LIFT_PX) {
    t.decided = 'lift'
    return 'lift'
  }
  if (dx >= SCROLL_PX && dx >= Math.abs(y - t.y)) {
    t.decided = 'none'
    return null
  }
  if (dx >= SCROLL_PX || Math.abs(y - t.y) >= SCROLL_PX) t.strayed = true
  return null
}

// The timer marks the card as held and decides nothing yet (#483): a thumb that rests a moment and
// then pans was scrolling all along. Always null; the hold is said by `end`.
export function timeout(t: Tracking): Gesture | null {
  if (!t.decided && !t.strayed) t.held = true
  return null
}

// Returns 'hold' for a finger that rested past the timer and 'tap' for one that did not, if nothing
// else decided before release and the finger lifted near where it landed: one that wandered and
// came up short of a lift was not pressing the card.
export function end(t: Tracking): Gesture | null {
  if (t.decided || t.strayed) return null
  t.decided = t.held ? 'hold' : 'tap'
  return t.decided
}

// The browser took the gesture over — it is scrolling the strip itself.
export function cancel(t: Tracking): void {
  if (!t.decided) t.decided = 'none'
}
