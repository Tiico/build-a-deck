import type { Snapshot } from '@byd/protocol'
import { CARD_MM, absoluteOf, type Point } from './drop.js'

// The camera (C5): the rectangle of the table a viewport shows, in table millimetres, always at
// the viewport's aspect. Its width sets the scale; everything else follows.

export type Rect = { x: number; y: number; w: number; h: number }
export type Size = { w: number; h: number }

// The label under a pile hangs this far below the card.
const LABEL_MM = 24

// The TV's overscan (#322). A TV may hide the outer edge of the picture it is sent, so on the TV
// the automatic framing keeps this share of the viewport's shortest side clear on all four sides:
// the action-safe level. It is a safety margin and not a drawn frame. It bounds where the camera
// frames to by itself (`frameRect`, `fitFloor`); a person zooming may go into it (`zoomAround`).
export const TV_OVERSCAN = 0.03
// The margin in the viewport's own pixels. The camera is in millimetres, and the viewport is the
// only place where the two meet, so `withAspect` is where the margin is turned into millimetres.
export const overscanPx = (vp: Size): number => TV_OVERSCAN * Math.min(vp.w, vp.h)

// What is in play: the loose cards, the setup's piles and areas (the board itself, empty or
// not), and piles made during play while they last. Hands are not content — they sit at the rim
// and always exist, so framing them means framing the rim.
export function activeBounds(view: Snapshot): Rect | null {
  return union(playBoxes(view))
}

// Each thing in play as its own rectangle; `activeBounds` is the union of them, and the only
// thing that asks.
function playBoxes(view: Snapshot): Rect[] {
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
  return boxes
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

// A rectangle grown to the viewport's aspect about its own centre: the whole floor, or the floor
// together with whatever lies beyond its rim. With a `margin`, grown further so that the
// rectangle leaves that many pixels clear on every side of the viewport.
export function fitFloor(floor: Rect, vp: Size, margin = 0): Rect {
  return withAspect(floor, vp, margin)
}

// How far the camera may reach: the table, and anything in play that lies beyond its rim — where
// a split beside a pile at the edge leaves a card (K1, K15). While everything is on the felt this
// is the floor and nothing more (#20). Pass what is in play, unpadded: the padding is room to
// breathe, and cropping it at the table's edge is what keeps the camera off the void.
export function reachOf(floor: Rect, content: Rect | null): Rect {
  return content ? (union([floor, content]) ?? floor) : floor
}

// A second thing the picture has to hold, with air of its own (#413).
//
// The camera is pointed at what is in play, and the air around that is the overscan. A hand's
// count badge is neither: it hangs at the rim, outside everything the camera frames, and it is
// drawn in the frame's own pixels rather than in the table's millimetres — so it cannot simply be
// added to the target, and the air it needs is not the target's. What it is, is a line on the
// felt (`handCountAt`) plus a pill's worth of pixels past it, and that is a second condition on
// the same picture. Without it the number at the television's top seat was cut in half (#413).
export type Keep = { rect: Rect; margin: number }

// `target` grown to the viewport's aspect about its centre, never narrower than `minW` (so the
// camera never comes absurdly close), never wider than `reach` fits, and kept inside `reach` as
// fitted, so the camera never shows the void beyond what there is to see.
// A `reach` that contains the target yields a frame that contains it too: what the camera is
// pointed at is never cut in half by the frame's edge. `reachOf` is how callers get one.
// `margin` is how many pixels of the viewport are kept clear around the target on every side.
// `keep` is a second condition with air of its own, and the picture is the smallest holding both.
export function frameRect(target: Rect, vp: Size, reach: Rect, minW: number, margin = 0, keep?: Keep): Rect {
  const both = (r: Rect): Keep[] => (keep ? [{ rect: r, margin }, keep] : [{ rect: r, margin }])
  // The reach is asked the same two questions, or the widest the camera may pull back to would be
  // the felt alone — and the felt is exactly what the count's line lies outside of, so the second
  // condition would be impossible to meet and the badge clipped again.
  const whole = holding(both(reach), vp)
  let r = holding(both(target), vp)
  if (r.w < minW) r = withAspect({ x: centre(r).x - minW / 2, y: centre(r).y, w: minW, h: 0 }, vp)
  if (r.w >= whole.w) return whole
  const x = Math.min(Math.max(r.x, whole.x), whole.x + whole.w - r.w)
  const y = Math.min(Math.max(r.y, whole.y), whole.y + whole.h - r.h)
  return { x, y, w: r.w, h: r.h }
}

// The smallest picture, at the viewport's aspect, that holds every one of these rectangles with
// its own air in the viewport's pixels.
//
// One rectangle is `withAspect` and nothing more, which is what keeps every caller that asks for
// one answering exactly as it did. Two are not simply the wider of the two answers: each one's
// air is pixels, so what it comes to in millimetres depends on the scale, and the scale is what
// is being looked for. So the width each condition asks for on its own is the floor, and the
// picture grows from there until the millimetres they then take lie inside it — a handful of
// steps, since a wider picture turns the same pixels into fewer millimetres and never more.
function holding(wants: readonly Keep[], vp: Size): Rect {
  let w = 0
  for (const want of wants) w = Math.max(w, withAspect(want.rect, vp, want.margin).w)
  let content = union(wants.map((want) => want.rect)) ?? { x: 0, y: 0, w: 0, h: 0 }
  for (let i = 0; i < 12; i++) {
    const scale = vp.w / w
    content = union(wants.map((want) => pad(want.rect, want.margin / scale))) ?? content
    const need = Math.max(content.w, (content.h * vp.w) / vp.h)
    if (need <= w) break
    w = need
  }
  const c = centre(content)
  const h = (w * vp.h) / vp.w
  return { x: c.x - w / 2, y: c.y - h / 2, w, h }
}

// Vad ett tryck på `+` eller `−` är värt, sagt som den faktor kamerans bredd ändras med (#325).
// Samma steg som prototypen mättes med. Talet bor här och inte hos klungan, eftersom tangenterna
// finns innan klungan gör det: knapparna hämtas först när vyn är egen, och en tangentväg som
// väntade på dem vore en väg som inte fanns förrän man redan tagit den.
export const CAMERA_STEP = 1.25

// Hur nära kameran får komma, som kamerans egen bredd i millimeter (#392). Gränsen finns för att
// en bild av ingenting inte är en bild, men den satt på 520 mm — åtta kortbredder — och det är en
// översikt till, inte en närbild. Den som zoomar in på en hög gör det för att läsa ett kort, så
// den närmaste vyn är kortet och det som ligger bredvid det: tre kortbredder, med gapet mellan
// dem inräknat. Talet bor här och inte hos renderaren, av samma skäl som steget ovan.
export const CAMERA_MIN_MM = 210

// The camera `factor` times as wide, centred on a point: a pinch, a scroll, a double tap. Zooming
// out stops at `reach` — a zoom is a view, not content, so it never widens what the camera may see.
export function zoomAround(cam: Rect, p: Point, factor: number, vp: Size, reach: Rect, minW: number): Rect {
  const w = cam.w * factor
  const h = (w * vp.h) / vp.w
  return frameRect({ x: p.x - w / 2, y: p.y - h / 2, w, h }, vp, reach, minW)
}

// What a surface with no camera of its own is showing, said as a camera (#325). The observer's
// felt is fitted into her frame and nothing follows the play for her, so this is where her own
// view starts the moment she takes it over — from what she was already looking at, rather than
// from a rectangle she never asked for. The felt is drawn centred on the floor, so the floor's
// centre is the picture's centre; what the fit added for her hands lies outside `reach` and is
// pulled back in by the first `frameRect`, which is a step of a few per cent and not a jump.
export function shownRect(floor: Rect, vp: Size, scale: number): Rect {
  const c = centre(floor)
  return { x: c.x - vp.w / (2 * scale), y: c.y - vp.h / (2 * scale), w: vp.w / scale, h: vp.h / scale }
}

// The camera moved by a hand (#325), and kept inside `reach` as fitted: a pan never drifts out
// into the void, for the same reason a zoom out stops at the table. A camera that already holds
// the whole reach has nowhere to go, and says so by staying where it is.
export function panBy(cam: Rect, dx: number, dy: number, vp: Size, reach: Rect): Rect {
  const whole = fitFloor(reach, vp)
  if (cam.w >= whole.w) return whole
  const put = (v: number, lo: number, span: number): number => Math.min(Math.max(v, lo), lo + span)
  return { ...cam, x: put(cam.x + dx, whole.x, whole.w - cam.w), y: put(cam.y + dy, whole.y, whole.h - cam.h) }
}

// How the table is laid out under a camera: the scale, and where the floor's corner goes.
export function cameraOf(cam: Rect, vp: Size, floor: Rect): { scale: number; left: number; top: number } {
  const scale = vp.w / cam.w
  return { scale, left: -(cam.x - floor.x) * scale, top: -(cam.y - floor.y) * scale }
}

export function tween(a: Rect, b: Rect, t: number): Rect {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, w: a.w + (b.w - a.w) * t, h: a.h + (b.h - a.h) * t }
}

// `r` grown about its centre to the viewport's aspect. With a `margin`, it is first grown to the
// aspect of the picture inside the margin, and then by the margin's share on each axis, so that
// once the camera is scaled to the viewport `r` ends `margin` pixels inside it on every side.
function withAspect(r: Rect, vp: Size, margin = 0): Rect {
  const inner = { w: vp.w - 2 * margin, h: vp.h - 2 * margin }
  const c = centre(r)
  let w = r.w
  let h = r.h
  if (w / h > inner.w / inner.h) h = (w * inner.h) / inner.w
  else w = (h * inner.w) / inner.h
  w = (w * vp.w) / inner.w
  h = (h * vp.h) / inner.h
  return { x: c.x - w / 2, y: c.y - h / 2, w, h }
}
