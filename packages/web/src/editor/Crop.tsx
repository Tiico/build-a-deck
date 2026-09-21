import { useId, useRef, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type Ref } from 'react'
import type { AssetCrop } from '@byd/protocol'
import type { Key } from '../i18n/index.js'
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
//
// Four corners resize it, each with the opposite corner still (#297, L33). The one corner this
// had before stood at `right: -6px; bottom: -6px` inside a box that clipped its overflow, so
// with the window on the whole picture half of it was not on the screen. The corners are the
// window's siblings and not its children — a control inside a control is no control — and they
// stand in the air the sheet lays around the picture, which is why that air exists.

// How far one press moves or resizes the window, how much further Shift takes it, and how small
// it may be cut. A window of nothing is no picture, and one of a few pixels is a picture nobody
// meant.
const STEP = 0.02
const SHIFT = 5
const LEAST = 0.1
// Shares kept at four decimals, so that a hundred presses do not leave a window described as
// 31.999999999999996 % of a picture — and so the name read out is a number a person recognises.
const tidy = (v: number): number => Math.round(v * 1e4) / 1e4

export type Corner = 'nw' | 'ne' | 'sw' | 'se'
const CORNERS: readonly Corner[] = ['nw', 'ne', 'sw', 'se']
const CORNER_NAME: Record<Corner, Key> = { nw: 'media.crop.corner.nw', ne: 'media.crop.corner.ne', sw: 'media.crop.corner.sw', se: 'media.crop.corner.se' }

export type CropProps = {
  // Where the picture is served from, and how tall it is against its width, so the window is laid
  // over the picture as it really is and not over a box of some other shape.
  url: string
  ratio: number
  crop: AssetCrop
  // `settled` is the difference between a window on its way somewhere and a window that has
  // arrived: a drag is hundreds of positions and one edit, and a key press is one of each.
  onChange(crop: AssetCrop, settled: boolean): void
  // The window itself, for the surface that has to be able to put a hand on it — a picture that
  // has just been uploaded is opened here, and opening it has to be true for a keyboard as well
  // as for an eye (#222, beslut 5).
  handle?: Ref<HTMLDivElement> | undefined
  // What stands under the picture and over the key row: the status and the way back to the
  // whole picture (L33), which the library owns because it knows what the document holds.
  status?: ReactNode
}

export function Crop({ url, ratio, crop, onChange, handle, status }: CropProps) {
  const t = useT()
  const said = useId()
  const held = useRef<{ corner: Corner | null; x: number; y: number; from: AssetCrop; box: DOMRect } | null>(null)
  const picture = useRef<HTMLDivElement | null>(null)

  const keys = (event: ReactKeyboardEvent, corner: Corner | null) => {
    const next = moved(crop, event.key, event.shiftKey, corner)
    if (!next) return
    event.preventDefault()
    onChange(next, true)
  }

  const grab = (event: ReactPointerEvent, corner: Corner | null) => {
    const box = picture.current?.getBoundingClientRect()
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
    onChange(grip.corner ? sized(grip.from, grip.corner, by) : slid(grip.from, by), false)
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
  const at = { left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` }
  return (
    <div className="byd-crop">
      {/* The sheet is the air, and the picture stands inside it: the corners overhang the window
          by half their width, and this is the room they overhang into. */}
      <div className="byd-crop-sheet">
        <div className="byd-crop-picture" ref={picture} style={{ aspectRatio: `${ratio}`, ['--byd-crop-ratio' as string]: `${ratio}` }}>
          <img src={url} alt="" />
          {/* What is cut is dimmed. The dimming is a box of its own, clipped to the picture, so
              that the window and the corners can be clipped by nothing. */}
          <div className="byd-crop-shade" aria-hidden="true">
            <i style={at} />
          </div>
          <div
            className="byd-crop-window"
            ref={handle}
            // A control of its own, named by where it stands, exactly as an element on the card is
            // (#144): a tab stop, a name that changes as it moves, and the arrows that move it.
            role="button"
            tabIndex={0}
            aria-label={name}
            aria-describedby={said}
            style={at}
            onKeyDown={(event) => keys(event, null)}
            onPointerDown={(event) => grab(event, null)}
            onPointerMove={drag}
            onPointerUp={drop}
            onPointerCancel={drop}
          />
          {CORNERS.map((corner) => (
            <i
              key={corner}
              className="byd-crop-corner"
              data-corner={corner}
              role="button"
              tabIndex={0}
              aria-label={t(CORNER_NAME[corner])}
              aria-describedby={said}
              style={{
                left: `${(corner === 'nw' || corner === 'sw' ? crop.x : crop.x + crop.w) * 100}%`,
                top: `${(corner === 'nw' || corner === 'ne' ? crop.y : crop.y + crop.h) * 100}%`,
              }}
              onKeyDown={(event) => keys(event, corner)}
              onPointerDown={(event) => grab(event, corner)}
              onPointerMove={drag}
              onPointerUp={drop}
              onPointerCancel={drop}
            />
          ))}
        </div>
      </div>
      {status}
      <p id={said} className="byd-crop-keys">
        {t('media.crop.keys')}
      </p>
    </div>
  )
}

// Where a key press leaves the window: the arrows move it, or move the corner that holds the
// focus, and Shift takes a longer step (L33). Neither may take it outside the picture — a window
// that reached past an edge would be a window nothing can cut, and the document refuses one
// anyway — so both go through the same clamp the pointer does.
function moved(crop: AssetCrop, key: string, shift: boolean, corner: Corner | null): AssetCrop | null {
  const step = STEP * (shift ? SHIFT : 1)
  const by = key === 'ArrowLeft' ? { x: -step, y: 0 } : key === 'ArrowRight' ? { x: step, y: 0 } : key === 'ArrowUp' ? { x: 0, y: -step } : key === 'ArrowDown' ? { x: 0, y: step } : null
  if (!by) return null
  return corner ? sized(crop, corner, by) : slid(crop, by)
}

// The same two moves under a pointer, in shares of the picture the drag was measured against.
const slid = (from: AssetCrop, by: { x: number; y: number }): AssetCrop => ({
  ...from,
  x: tidy(Math.min(Math.max(0, from.x + by.x), 1 - from.w)),
  y: tidy(Math.min(Math.max(0, from.y + by.y), 1 - from.h)),
})
// A corner taken somewhere, with the opposite one where it was: the left edge moves for the
// western corners and the right edge for the eastern, and the same north and south. An edge
// stops at the picture's own, and at the least width the window may have.
function sized(from: AssetCrop, corner: Corner, by: { x: number; y: number }): AssetCrop {
  const west = corner === 'nw' || corner === 'sw'
  const north = corner === 'nw' || corner === 'ne'
  const right = from.x + from.w
  const bottom = from.y + from.h
  const x = west ? Math.min(Math.max(0, from.x + by.x), right - LEAST) : from.x
  const w = west ? right - x : Math.min(Math.max(LEAST, from.w + by.x), 1 - from.x)
  const y = north ? Math.min(Math.max(0, from.y + by.y), bottom - LEAST) : from.y
  const h = north ? bottom - y : Math.min(Math.max(LEAST, from.h + by.y), 1 - from.y)
  return { x: tidy(x), y: tidy(y), w: tidy(w), h: tidy(h) }
}
