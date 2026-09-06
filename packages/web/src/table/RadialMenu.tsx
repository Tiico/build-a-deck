import type { PointerEvent as RPointerEvent } from 'react'

export type RadialItem = { label: string; run: (() => void) | null; kind?: 'no' }

// A ring of verbs around the finger (C). It opens on hold; the finger slides to a verb and
// releases. A release anywhere else, or a tap on Stäng, closes it. Mouse users may also click.
export function RadialMenu({ id, x, y, items, onClose }: { id: string; x: number; y: number; items: RadialItem[]; onClose(): void }) {
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
              data-kind={item.kind}
              disabled={item.run === null && item.kind !== 'no'}
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
