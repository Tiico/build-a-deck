import { useEffect, type PointerEvent as RPointerEvent } from 'react'

export type RadialItem = { label: string; run: (() => void) | null }

// A ring of verbs around the finger (C). It opens on a hold or a click; the finger slides to a
// verb and releases. Everything that is not a verb closes it: the backdrop covers the screen, so
// a release or a click anywhere outside the ring is the way out, and Escape is that way for a
// hand on a keyboard. The ring holds verbs only — one that meant nothing but "never mind" took a
// place in the circle where every other place does something.
export function RadialMenu({ id, x, y, items, onClose }: { id: string; x: number; y: number; items: RadialItem[]; onClose(): void }) {
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
