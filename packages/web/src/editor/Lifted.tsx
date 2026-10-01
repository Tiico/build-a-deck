import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { useDoor } from '../doors.js'
import { placedProps, usePlacement } from './placement.js'

// A box that opens under a button and stands over the work until it is closed (#617, #618).
//
// It is there only while it stands: a door that is not there cannot be walked through, and
// `doors.ts` keeps the order between open doors by who is rendered. It lifts into the top layer
// like every opened box (L55, #611, #628), so nothing that scrolls can cut it and nothing is drawn
// over it, and it is held against the element it hangs from. It closes the way every panel over the
// work closes (#133): Escape hands the focus back to the handle it came from, a press in the work
// leaves the focus where the pointer put it. On opening, the first control inside takes the focus,
// so the keyboard that opened the box is already in it.
export function Lifted({ handle, label, className, onClose, children }: { handle: RefObject<HTMLElement | null>; label: string; className: string; onClose(): void; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const latest = useRef({ onClose })
  latest.current = { onClose }
  // Lifted into the top layer by the placement itself (#628): every positioned box is.
  const place = usePlacement(true, box)
  useDoor('standing', () => {
    latest.current.onClose()
    handle.current?.focus()
  })
  useEffect(() => {
    box.current?.querySelector<HTMLElement>('input, select, button, [tabindex]:not([tabindex="-1"])')?.focus()
    const onPointerDown = (event: Event) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (handle.current?.contains(target) || box.current?.contains(target)) return
      // A dialog opened from inside the box — the picture library from «Välj bild» — stands over
      // the box, not beside it: a press in it is still the box's business, and the control that
      // opened the dialog has to be there to take the focus back when it closes (#8).
      if (target.closest('[role="dialog"]')) return
      latest.current.onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [handle])
  return (
    <div ref={box} className={className} {...placedProps(place)} role="group" aria-label={label}>
      {children}
    </div>
  )
}
