import type { Snapshot } from '@byd/protocol'
import { CARD_MM, absoluteOf, type Point } from './drop.js'

// The camera (C5): the rectangle of the table a viewport shows, in table millimetres, always at
// the viewport's aspect. Its width sets the scale; everything else follows.

export type Rect = { x: number; y: number; w: number; h: number }
export type Size = { w: number; h: number }

// The label under a pile hangs this far below the card.
const LABEL_MM = 24

// What is in play: the loose cards, the setup's piles and areas (the board itself, empty or
// not), and piles made during play while they last. Hands are not content — they sit at the rim
// and always exist, so framing them means framing the rim.
export function activeBounds(view: Snapshot): Rect | null {
  const zones = new Map(view.zones.map((z) => [z.id, z]))
  const boxes: Rect[] = []
  for (const c of view.components) {
    if (zones.get(c.zone)?.kind !== 'area') continue
    const p = absoluteOf(view, c)
    boxes.push({ x: p.x, y: p.y, w: CARD_MM.w, h: CARD_MM.h })
  }
  for (const z of view.zones) {
    if (z.id === view.floor) continue
    if (z.kind === 'pile') boxes.push({ x: z.geometry.x - CARD_MM.w / 2, y: z.geometry.y - CARD_MM.h / 2, w: CARD_MM.w, h: CARD_MM.h + LABEL_MM })
    if (z.kind === 'area') boxes.push(z.geometry)
  }
  return union(boxes)
}

export function union(boxes: readonly Rect[]): Rect | null {
  const first = boxes[0]
  if (!first) return null
  let x0 = first.x
  let y0 = first.y
  let x1 = first.x + first.w
  let y1 = first.y + first.h
  for (const b of boxes) {
    x0 = Math.min(x0, b.x)
    y0 = Math.min(y0, b.y)
    x1 = Math.max(x1, b.x + b.w)
    y1 = Math.max(y1, b.y + b.h)
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

export const pad = (r: Rect, mm: number): Rect => ({ x: r.x - mm, y: r.y - mm, w: r.w + 2 * mm, h: r.h + 2 * mm })
export const centre = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })
export const same = (a: Rect | null, b: Rect | null): boolean => a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h)

// The whole floor, at the viewport's aspect, centred on it.
export function fitFloor(floor: Rect, vp: Size): Rect {
  return withAspect(floor, vp)
}

// `target` grown to the viewport's aspect about its centre, never narrower than `minW` (so the
// camera never comes absurdly close), never wider than the floor fits, and kept inside the
// floor as fitted, so the camera never shows the void beyond the table.
export function frameRect(target: Rect, vp: Size, floor: Rect, minW: number): Rect {
  const whole = fitFloor(floor, vp)
  let r = withAspect(target, vp)
  if (r.w < minW) r = withAspect({ x: centre(r).x - minW / 2, y: centre(r).y, w: minW, h: 0 }, vp)
  if (r.w >= whole.w) return whole
  const x = Math.min(Math.max(r.x, whole.x), whole.x + whole.w - r.w)
  const y = Math.min(Math.max(r.y, whole.y), whole.y + whole.h - r.h)
  return { x, y, w: r.w, h: r.h }
}

// The camera `factor` times as wide, centred on a point: a pinch, a scroll, a double tap.
export function zoomAround(cam: Rect, p: Point, factor: number, vp: Size, floor: Rect, minW: number): Rect {
  const w = cam.w * factor
  const h = (w * vp.h) / vp.w
  return frameRect({ x: p.x - w / 2, y: p.y - h / 2, w, h }, vp, floor, minW)
}

// How the table is laid out under a camera: the scale, and where the floor's corner goes.
export function cameraOf(cam: Rect, vp: Size, floor: Rect): { scale: number; left: number; top: number } {
  const scale = vp.w / cam.w
  return { scale, left: -(cam.x - floor.x) * scale, top: -(cam.y - floor.y) * scale }
}

export function tween(a: Rect, b: Rect, t: number): Rect {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, w: a.w + (b.w - a.w) * t, h: a.h + (b.h - a.h) * t }
}

function withAspect(r: Rect, vp: Size): Rect {
  const aspect = vp.w / vp.h
  const c = centre(r)
  let w = r.w
  let h = r.h
  if (w / h > aspect) h = w / aspect
  else w = h * aspect
  return { x: c.x - w / 2, y: c.y - h / 2, w, h }
}
