// Screen ↔ table (K2). In TV mode the table is flat: a scale and an offset. In table mode the
// wood is rotateX(TILT) under a PERSPECTIVE, and a pointer has to be projected back onto the
// tilted plane for a dragged card to stay under the finger. These match table.css exactly.

export const TILT = (24 * Math.PI) / 180
export const PERSPECTIVE = 1600
// perspective-origin: 50% 30% of the frame
const ORIGIN_X = 0.5
const ORIGIN_Y = 0.3

export type Point = { x: number; y: number }
// Untransformed layout boxes: the frame's size and where the wood sits inside it.
export type TiltLayout = { frame: { w: number; h: number }; wood: { left: number; top: number; w: number; h: number } }

export function flatToTable(tableRect: { left: number; top: number }, scale: number, floor: Point): (clientX: number, clientY: number) => Point {
  return (cx, cy) => ({ x: (cx - tableRect.left) / scale + floor.x, y: (cy - tableRect.top) / scale + floor.y })
}

// Forward: a point on the wood plane (px, relative to the wood's centre, its transform origin)
// to frame pixels. What the browser does with rotateX under perspective.
export function projectTilted(layout: TiltLayout, p: Point): Point {
  const { cx, cy, pox, poy } = anchors(layout)
  const y = p.y * Math.cos(TILT)
  const z = p.y * Math.sin(TILT)
  const k = PERSPECTIVE / (PERSPECTIVE - z)
  return { x: (p.x + cx - pox) * k + pox, y: (y + cy - poy) * k + poy }
}

// Inverse: frame pixels back to the wood plane (px, relative to the wood's centre).
export function tiltedToTable(layout: TiltLayout, frameX: number, frameY: number): Point {
  const { cx, cy, pox, poy } = anchors(layout)
  const px = frameX - pox
  const py = frameY - poy
  const k = cy - poy
  const d = PERSPECTIVE
  const uy = (d * (py - k)) / (d * Math.cos(TILT) + py * Math.sin(TILT))
  const ux = (px * (d - uy * Math.sin(TILT))) / d - (cx - pox)
  return { x: ux, y: uy }
}

function anchors(layout: TiltLayout) {
  return {
    cx: layout.wood.left + layout.wood.w / 2,
    cy: layout.wood.top + layout.wood.h / 2,
    pox: layout.frame.w * ORIGIN_X,
    poy: layout.frame.h * ORIGIN_Y,
  }
}

// The table turned so a seat's edge is at the bottom (C5): a point on the rotated plane, back
// into table coordinates, turning about the floor's centre.
export type Rotation = 0 | 90 | 180 | 270
export function unrotate(p: Point, floor: { x: number; y: number; w: number; h: number }, rotate: Rotation): Point {
  if (rotate === 0) return p
  const cx = floor.x + floor.w / 2
  const cy = floor.y + floor.h / 2
  const dx = p.x - cx
  const dy = p.y - cy
  // Quarter turns only, so the arithmetic stays exact.
  switch (rotate) {
    case 90:
      return { x: cx + dy, y: cy - dx }
    case 180:
      return { x: cx - dx, y: cy - dy }
    case 270:
      return { x: cx - dy, y: cy + dx }
  }
}
