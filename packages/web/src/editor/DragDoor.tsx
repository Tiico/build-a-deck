import { useDoor } from '../doors.js'

// The way out of a drag that is already under way (#142).
//
// Escape is what a hand that has changed its mind reaches for in every application there is, and a
// drag is where it has most to change its mind about: what is under the hand moves while it is
// held, and letting go is what writes. Without this the editor had one answer only — Ctrl+Z
// afterwards — and that is a different thing and always was. An undone drag is a row in the
// history; a drag the hand took back is nothing that ever happened.
//
// It is `held`, which is the whole of what it has to say about itself: the hand is still down, and
// a press that arrives while it is down is about what is under it and not about a panel standing
// over the work. Where the press is heard, and what happens when a panel is standing too, belongs
// to `doors.ts` — which is the only place that order is written, so this door does not have to
// know that panel doors exist (#152).
//
// The surface that owns the drag renders this while the drag runs and not otherwise, so there is
// no drag-shaped state to ask about here: a door that is not there cannot be walked through.
export function DragDoor({ onCancel }: { onCancel(): void }) {
  useDoor('held', onCancel)
  return null
}
