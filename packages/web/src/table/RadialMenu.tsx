import { useEffect, type PointerEvent as RPointerEvent, type ReactNode } from 'react'

export type RadialItem = { label: string; run: (() => void) | null }

// A ring of verbs around the finger (C). It opens on a hold or a click; the finger slides to a
// verb and releases. Everything that is not a verb closes it: the backdrop covers the screen, so
// a release or a click anywhere outside the ring is the way out, and Escape is that way for a
// hand on a keyboard. The ring holds verbs only — one that meant nothing but "never mind" took a
// place in the circle where every other place does something.
//
// `hub` is what the ring is about, written in its centre: never a control, and only for a thing
// the felt cannot say for itself — a chip's name is never drawn on the felt at any screen measured,
// and a chip lifted into a ring has lost the one thing that said whose it was, where it lay (#67).
export function RadialMenu({ id, x, y, items, hub, onClose }: { id: string; x: number; y: number; items: RadialItem[]; hub?: ReactNode; onClose(): void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const choose = (e: RPointerEvent | React.MouseEvent, item: RadialItem) => {
    e.stopPropagation()
    if (item.run) item.run()
    onClose()
  }
  const radius = 82
  return (
    <div className="byd-radial-backdrop" onPointerUp={onClose} onClick={onClose}>
      <div className="byd-radial" data-radial={id} style={{ left: x, top: y }}>
        {hub !== undefined && (
          <div className="byd-radial-hub" data-radial-hub>
            {hub}
          </div>
        )}
        {items.map((item, i) => {
          const ang = -Math.PI / 2 + (i * 2 * Math.PI) / items.length
          return (
            <button
              key={item.label}
              type="button"
              disabled={item.run === null}
              style={{ left: Math.cos(ang) * radius, top: Math.sin(ang) * radius }}
              onPointerUp={(e) => choose(e, item)}
              onClick={(e) => choose(e, item)}
            >
              {item.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
