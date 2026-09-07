// PROTOTYPE — camera maths (C5): what to frame, and how a frame becomes a scale and an offset.
// Everything in table millimetres; a camera is the rectangle of the table the viewport shows.
import type { Activity, Snapshot } from '@byd/protocol'
import { CARD_MM, absoluteOf, type Point } from '../../table/drop.js'

export type Rect = { x: number; y: number; w: number; h: number }
export type Size = { w: number; h: number }

export const union = (boxes: Rect[]): Rect | null => {
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
export const contains = (r: Rect, p: Point): boolean => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h
export const same = (a: Rect | null, b: Rect | null): boolean => !!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h
export const cardBox = (p: Point): Rect => ({ x: p.x, y: p.y, w: CARD_MM.w, h: CARD_MM.h })
export const pileBox = (p: Point): Rect => ({ x: p.x - CARD_MM.w / 2, y: p.y - CARD_MM.h / 2, w: CARD_MM.w, h: CARD_MM.h + 24 })

// Everything in play: loose cards, piles with cards, areas with anything in them. Hands are
// not content: they sit at the rim and always exist, and framing them means framing the rim.
export function activeBounds(view: Snapshot): Rect | null {
  const zones = new Map(view.zones.map((z) => [z.id, z]))
  const boxes: Rect[] = []
  for (const c of view.components) {
    const z = zones.get(c.zone)
    if (z?.kind === 'area') boxes.push(cardBox(absoluteOf(view, c)))
  }
  for (const z of view.zones) {
    if (z.id === view.floor) continue
    const count = z.mode === 'count' ? z.count : z.order.length
    if (z.kind === 'pile' && count > 0) boxes.push(pileBox(z.geometry))
    if (z.kind === 'area' && view.components.some((c) => c.zone === z.id)) boxes.push(z.geometry)
  }
  return union(boxes)
}

// The whole floor, at the viewport's aspect, centred.
export function fitFloor(floor: Rect, vp: Size): Rect {
  return withAspect(floor, vp)
}

// `target` grown to the viewport's aspect, never narrower than `minW`, never wider than the
// floor fits, and kept inside the floor's fitted frame so the camera never shows the void.
export function frameRect(target: Rect, vp: Size, floor: Rect, minW: number): Rect {
  const whole = fitFloor(floor, vp)
  let r = withAspect(target, vp)
  if (r.w < minW) r = withAspect({ x: centre(r).x - minW / 2, y: centre(r).y, w: minW, h: 1 }, vp)
  if (r.w >= whole.w) return whole
  const x = Math.min(Math.max(r.x, whole.x), whole.x + whole.w - r.w)
  const y = Math.min(Math.max(r.y, whole.y), whole.y + whole.h - r.h)
  return { x, y, w: r.w, h: r.h }
}

// A frame `w` wide around a point.
export function around(p: Point, w: number, vp: Size, floor: Rect): Rect {
  const h = (w * vp.h) / vp.w
  return frameRect({ x: p.x - w / 2, y: p.y - h / 2, w, h }, vp, floor, 0)
}

export const scaleOf = (cam: Rect, vp: Size): number => vp.w / cam.w

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

// Where on the table a log line happened, as far as this view can tell.
export function whereHappened(line: Activity, view: Snapshot): Point | null {
  const zones = new Map(view.zones.map((z) => [z.id, z]))
  const zoneCentre = (id: string): Point | null => {
    const z = zones.get(id)
    return z ? (z.kind === 'pile' ? { x: z.geometry.x, y: z.geometry.y } : centre(z.geometry)) : null
  }
  const at = (id: string): Point | null => {
    const c = view.components.find((x) => x.id === id)
    if (!c) return null
    const p = absoluteOf(view, c)
    return { x: p.x + CARD_MM.w / 2, y: p.y + CARD_MM.h / 2 }
  }
  const it = line.intent
  switch (it.v) {
    case 'move':
      return at(it.component) ?? zoneCentre(it.to)
    case 'rotate':
    case 'flip':
      return typeof it.component === 'string' ? at(it.component) : zoneCentre(it.component.top)
    case 'stack':
      return at(it.onto)
    case 'split':
      return it.to ? zoneCentre(it.to) : it.x !== undefined && it.y !== undefined ? { x: it.x, y: it.y } : zoneCentre(it.pile)
    case 'shuffle':
      return zoneCentre(it.pile)
    case 'draw':
      return zoneCentre(it.to)
    case 'deal':
      return zoneCentre(it.from)
    case 'movePile':
      return { x: it.x, y: it.y }
    case 'peek':
    case 'reveal':
      return at(it.components[0] ?? '')
    default:
      return null
  }
}
