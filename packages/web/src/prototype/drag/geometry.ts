// PROTOTYPE — screen ↔ table. In TV mode the table is flat and this is a scale; in table mode
// the wood is rotateX(24deg) under a 1600px perspective, and a pointer has to be projected back
// onto the tilted plane for a dragged card to stay under the finger.
export type Mapping = {
  // Table millimetres for a client point.
  toTable(clientX: number, clientY: number): { x: number; y: number }
}

export const TILT = (24 * Math.PI) / 180
export const PERSPECTIVE = 1600

export function mappingFor(frame: HTMLElement, wood: HTMLElement, table: HTMLElement, mode: 'table' | 'tv', scale: number, floor: { x: number; y: number }): Mapping {
  const t = table.getBoundingClientRect()
  if (mode === 'tv') {
    return { toTable: (cx, cy) => ({ x: (cx - t.left) / scale + floor.x, y: (cy - t.top) / scale + floor.y }) }
  }
  // Untransformed layout boxes: the frame is not transformed, so its rect is exact; the wood's
  // layout box is recovered from its offset within the frame.
  const f = frame.getBoundingClientRect()
  const woodW = wood.offsetWidth
  const woodH = wood.offsetHeight
  const woodLeft = wood.offsetLeft
  const woodTop = wood.offsetTop
  const cx0 = woodLeft + woodW / 2 // transform-origin of the wood, in frame coords
  const cy0 = woodTop + woodH / 2
  const pox = f.width / 2 // perspective-origin 50% 30%
  const poy = f.height * 0.3
  const d = PERSPECTIVE
  const a = TILT
  // The wood is transformed, so it is the table's offsetParent; the frame is positioned, so it
  // is the wood's.
  const tableLeftInWood = table.offsetLeft
  const tableTopInWood = table.offsetTop
  if (wood.offsetParent !== frame) console.warn('prototype: wood offsetParent is not the frame', wood.offsetParent)
  return {
    toTable: (clientX, clientY) => {
      const px = clientX - f.left - pox
      const py = clientY - f.top - poy
      const k = cy0 - poy
      const uy = (d * (py - k)) / (d * Math.cos(a) + py * Math.sin(a))
      const ux = (px * (d - uy * Math.sin(a))) / d - (cx0 - pox)
      // (ux, uy) is on the wood plane relative to its centre; back to table px, then mm.
      const inWoodX = ux + woodW / 2 - tableLeftInWood
      const inWoodY = uy + woodH / 2 - tableTopInWood
      return { x: inWoodX / scale + floor.x, y: inWoodY / scale + floor.y }
    },
  }
}
