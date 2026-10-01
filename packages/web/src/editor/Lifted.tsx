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
//
// A box is a group by default; a menu (#647) says so, walks its items with the arrows (APG) and
// opens on the item the surface names — the choice the card already stands on — rather than on
// the first.
export function Lifted({
  handle,
  label,
  className,
  role = 'group',
  id,
  opensOn,
  onClose,
  children,
}: {
  handle: RefObject<HTMLElement | null>
  label: string
  className: string
  role?: 'group' | 'menu'
  id?: string | undefined
  // A selector for the control that takes the focus on opening; the first control otherwise.
  opensOn?: string | undefined
  onClose(): void
  children: ReactNode
}) {
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
    const first = box.current?.querySelector<HTMLElement>('input, select, button, [tabindex]:not([tabindex="-1"])')
    ;((opensOn && box.current?.querySelector<HTMLElement>(opensOn)) || first)?.focus()
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- on opening only: the box must not take the focus back from what is done inside it
  }, [handle])
  return (
    <div
      ref={box}
      id={id}
      className={className}
      {...placedProps(place)}
      role={role}
      aria-label={label}
      onKeyDown={(event) => {
        if (role !== 'menu' || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return
        const items = [...(box.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])]
        if (items.length === 0) return
        event.preventDefault()
        const at = items.indexOf(document.activeElement as HTMLElement)
        items[(at + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus()
      }}
    >
      {children}
    </div>
  )
}
