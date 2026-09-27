import { useEffect, useRef, type PointerEvent as RPointerEvent, type ReactNode } from 'react'

// `key` is only for telling two entries apart when their words are the same — a pile of chips can
// hold two counters a designer gave the same name and the same value (#89).
export type RadialItem = { key?: string; label: string; run: (() => void) | null }

// A ring of verbs around the finger (C). It opens on a hold or a click; the finger slides to a
// verb and releases. Everything that is not a verb closes it: the backdrop covers the screen, so
// a release or a click anywhere outside the ring is the way out, and Escape is that way for a
// hand on a keyboard. The ring holds verbs only — one that meant nothing but "never mind" took a
// place in the circle where every other place does something.
//
// `hub` is what the ring is about, written in its centre: never a control, and only for a thing
// the felt cannot say for itself — a chip's name is never drawn on the felt at any screen measured,
// and a chip lifted into a ring has lost the one thing that said whose it was, where it lay (#67).
// `onPressAgain` is asked about a press on the backdrop before the backdrop closes the ring, and
// takes it when it answers yes (#482): a second press on the card that opened the ring lands here,
// and the backdrop used to take itself away on `pointerup` before the browser could make a
// `dblclick` of the two — so the double press the help promises never turned anything.
//
// A `click` closes the ring only when its press began on the backdrop (#484 fynd 3). A tap opens
// the ring on its release, and a finger's release is followed by the `click` the browser makes of
// the touch, hit-tested where the finger was — on this backdrop, which had arrived there in between.
// The ring stood for eight milliseconds. A release still closes it, whatever pressed: a press held
// until the ring opens and let go beside it is the never-mind the ring has always had.
export function RadialMenu({ id, x, y, items, hub, onClose, onPressAgain }: { id: string; x: number; y: number; items: RadialItem[]; hub?: ReactNode; onClose(): void; onPressAgain?: () => boolean }) {
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
  const pressed = useRef(false)
  const radius = 82
  return (
    <div
      className="byd-radial-backdrop"
      onPointerDown={(e) => {
        pressed.current = true
        if (e.target !== e.currentTarget || !onPressAgain?.()) return
        e.preventDefault()
        e.stopPropagation()
      }}
      onPointerUp={onClose}
      onClick={() => pressed.current && onClose()}
    >
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
              key={item.key ?? item.label}
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
