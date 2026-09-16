import { useEffect, useRef } from 'react'

// The way out of a drag that is already under way (#142).
//
// Escape is what a hand that has changed its mind reaches for in every application there is, and a
// drag is where it has most to change its mind about: what is under the hand moves while it is
// held, and letting go is what writes. Without this the editor had one answer only — Ctrl+Z
// afterwards — and that is a different thing and always was. An undone drag is a row in the
// history; a drag the hand took back is nothing that ever happened.
//
// It listens on the document rather than on what is being dragged, for the reason `PanelDoor`
// does: the press arrives wherever the focus happens to be standing, which during a drag is
// nowhere near the edge or the box the pointer took hold of. And it is refused once it has really
// taken a drag back, so nothing further up answers the same press — a panel standing over the work
// is not what a hand in the middle of a drag was asking to close.
//
// The surface that owns the drag renders this while the drag runs and not otherwise, so there is
// no drag-shaped state to ask about here: a door that is not there cannot be walked through.
export function DragDoor({ onCancel }: { onCancel(): void }) {
  const latest = useRef(onCancel)
  latest.current = onCancel
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      latest.current()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])
  return null
}
