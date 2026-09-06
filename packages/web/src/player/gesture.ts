// The three things a thumb does to a card in the strip (K4): tap, hold, or drag up.
// Pure state so the recogniser is testable and the component stays a thin wrapper.

export type Gesture = 'tap' | 'hold' | 'lift'
export const LIFT_PX = 40
export const HOLD_MS = 450

export type Tracking = { x: number; y: number; decided: Gesture | null }

export function begin(x: number, y: number): Tracking {
  return { x, y, decided: null }
}

// Returns 'lift' once the pointer has travelled far enough upward; null otherwise.
export function move(t: Tracking, x: number, y: number): Gesture | null {
  if (t.decided) return null
  if (t.y - y >= LIFT_PX && Math.abs(x - t.x) < LIFT_PX) {
    t.decided = 'lift'
    return 'lift'
  }
  return null
}

// Returns 'hold' when the timer fires before anything else decided.
export function timeout(t: Tracking): Gesture | null {
  if (t.decided) return null
  t.decided = 'hold'
  return 'hold'
}

// Returns 'tap' if nothing else decided before release.
export function end(t: Tracking): Gesture | null {
  if (t.decided) return null
  t.decided = 'tap'
  return 'tap'
}
