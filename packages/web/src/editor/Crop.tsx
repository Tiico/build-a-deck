import { useId, useRef, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { AssetCrop } from '@byd/protocol'
import { useT } from '../i18n/index.js'

// The window a picture is looked at through, cut where the picture lives (#222, L22, beslut 2).
//
// Nothing here rewrites the file. A picture is content-addressed and its bytes may sit in ten
// other people's decks, so what is written is the window; the file is untouched and the crop is
// worked out from it every time, by the one function the compiler calls.
//
// The window is dragged, because that is the gesture the approved prototype tested and the one a
// designer reaches for. It is also a control with a name and a tab stop, and the arrows do what
// the drag does — a crop that could only be cut with a pointer would be a crop half the tool's
// users cannot cut at all (E5). Its name says where the window stands, so the same key press that
// moves it is what reads the new position out.

// How far one press moves or resizes the window, and how small it may be cut. A window of nothing
// is no picture, and one of a few pixels is a picture nobody meant.
const STEP = 0.02
const LEAST = 0.1
// Shares kept at four decimals, so that a hundred presses do not leave a window described as
// 31.999999999999996 % of a picture — and so the name read out is a number a person recognises.
const tidy = (v: number): number => Math.round(v * 1e4) / 1e4

export type CropProps = {
  // Where the picture is served from, and how tall it is against its width, so the window is laid
  // over the picture as it really is and not over a box of some other shape.
  url: string
  ratio: number
  crop: AssetCrop
  // `settled` is the difference between a window on its way somewhere and a window that has
  // arrived: a drag is hundreds of positions and one edit, and a key press is one of each.
  onChange(crop: AssetCrop, settled: boolean): void
}

export function Crop({ url, ratio, crop, onChange }: CropProps) {
  const t = useT()
  const said = useId()
  const held = useRef<{ corner: boolean; x: number; y: number; from: AssetCrop; box: DOMRect } | null>(null)
  const sheet = useRef<HTMLDivElement | null>(null)

  const keys = (event: ReactKeyboardEvent) => {
    const next = moved(crop, event.key, event.shiftKey)
    if (!next) return
    event.preventDefault()
    onChange(next, true)
  }

  const grab = (event: ReactPointerEvent, corner: boolean) => {
    const box = sheet.current?.getBoundingClientRect()
    if (!box || box.width <= 0 || box.height <= 0) return
    event.preventDefault()
    event.stopPropagation()
    held.current = { corner, x: event.clientX, y: event.clientY, from: crop, box }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const drag = (event: ReactPointerEvent) => {
    const grip = held.current
    if (!grip) return
    const by = { x: (event.clientX - grip.x) / grip.box.width, y: (event.clientY - grip.y) / grip.box.height }
    onChange(grip.corner ? sized(grip.from, by) : slid(grip.from, by), false)
  }
  const drop = () => {
    if (!held.current) return
    held.current = null
    onChange(crop, true)
  }

  const percent = (v: number) => Math.round(v * 100)
  const name = t('media.crop.window', {
    x: percent(crop.x),
    x2: percent(crop.x + crop.w),
    y: percent(crop.y),
    y2: percent(crop.y + crop.h),
  })
  return (
    <div className="byd-crop">
      <div className="byd-crop-sheet" ref={sheet} style={{ aspectRatio: `${ratio}` }}>
        <img src={url} alt="" />
        <div
          className="byd-crop-window"
          // A control of its own, named by where it stands, exactly as an element on the card is
          // (#144): a tab stop, a name that changes as it moves, and the arrows that move it.
          role="button"
          tabIndex={0}
          aria-label={name}
          aria-describedby={said}
          style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` }}
          onKeyDown={keys}
          onPointerDown={(event) => grab(event, false)}
          onPointerMove={drag}
          onPointerUp={drop}
          onPointerCancel={drop}
        >
          <i className="byd-crop-corner" onPointerDown={(event) => grab(event, true)} onPointerMove={drag} onPointerUp={drop} onPointerCancel={drop} />
        </div>
      </div>
      <p id={said} className="byd-crop-keys">
        {t('media.crop.keys')}
      </p>
    </div>
  )
}

// Where a key press leaves the window. The arrows move it and shift resizes it, and neither may
// take it outside the picture: a window that reached past an edge would be a window nothing can
// cut, and the document refuses one anyway.
function moved(crop: AssetCrop, key: string, resizing: boolean): AssetCrop | null {
  const put = (next: Partial<AssetCrop>): AssetCrop => {
    const out = { ...crop, ...next }
    return { x: tidy(out.x), y: tidy(out.y), w: tidy(out.w), h: tidy(out.h) }
  }
  if (resizing) {
    if (key === 'ArrowLeft') return put({ w: Math.max(LEAST, crop.w - STEP) })
    if (key === 'ArrowRight') return put({ w: Math.min(1 - crop.x, crop.w + STEP) })
    if (key === 'ArrowUp') return put({ h: Math.max(LEAST, crop.h - STEP) })
    if (key === 'ArrowDown') return put({ h: Math.min(1 - crop.y, crop.h + STEP) })
    return null
  }
  if (key === 'ArrowLeft') return put({ x: Math.max(0, crop.x - STEP) })
  if (key === 'ArrowRight') return put({ x: Math.min(1 - crop.w, crop.x + STEP) })
  if (key === 'ArrowUp') return put({ y: Math.max(0, crop.y - STEP) })
  if (key === 'ArrowDown') return put({ y: Math.min(1 - crop.h, crop.y + STEP) })
  return null
}

// The same two moves under a pointer, in shares of the picture the drag was measured against.
const slid = (from: AssetCrop, by: { x: number; y: number }): AssetCrop => ({
  ...from,
  x: tidy(Math.min(Math.max(0, from.x + by.x), 1 - from.w)),
  y: tidy(Math.min(Math.max(0, from.y + by.y), 1 - from.h)),
})
const sized = (from: AssetCrop, by: { x: number; y: number }): AssetCrop => ({
  ...from,
  w: tidy(Math.min(Math.max(LEAST, from.w + by.x), 1 - from.x)),
  h: tidy(Math.min(Math.max(LEAST, from.h + by.y), 1 - from.y)),
})
