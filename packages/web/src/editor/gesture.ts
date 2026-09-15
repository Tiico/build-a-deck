import { useRef } from 'react'

// One thing the designer did, reported many times over (L14, #35): a pull of the pointer is a
// patch per frame, a word typed into a field is one per keystroke, and a slider pushed is one per
// step of it. Every edit made during the same doing carries the same token, and edits that share
// a token share a step back.
//
// The token is made where the doing begins — a pointer taking hold, a field or a knob taking the
// focus — so a second grab of the same zone, or coming back to a field already left, is the next
// step and not a continuation of the last one.
export type Gesture = {
  // What is going on now, for every edit that belongs to it.
  token(): string
  // A new one begins, and its token: what a surface calls at `pointerdown`.
  begin(): string
  // What a control that writes many times wears. Coming to it is where its doing begins, which is
  // the whole difference between a word typed into one field and the word typed into the next.
  visit: { onFocus(): void }
}

// Every surface that hands out tokens takes a number of its own first, so two of them counting
// separately can never say the same word: the panel that was showing one zone and the panel now
// showing the next are two panels, and the first field of each must not be the same doing. The
// counter is the tab's, which is where the stack lives too. `useId` cannot do this — it is the
// same string for whatever stands in that place in the tree, which is exactly the case in hand.
let surfaces = 0
export function useGesture(kind: string): Gesture {
  const mine = useRef(0)
  if (mine.current === 0) mine.current = surfaces += 1
  const doings = useRef(0)
  const begin = () => `${kind}-${mine.current}-${(doings.current += 1)}`
  return { token: () => `${kind}-${mine.current}-${doings.current}`, begin, visit: { onFocus: () => void begin() } }
}
