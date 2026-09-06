import { describe, expect, it } from 'vitest'
import { PERSPECTIVE, TILT, tiltedToTable, projectTilted, flatToTable } from '../src/table/geometry.js'

describe('screen → table (K2)', () => {
  it('on a flat table a client point is a scale and an offset away from table millimetres', () => {
    const map = flatToTable({ left: 100, top: 50 }, 2, { x: -500, y: -300 })
    expect(map(100, 50)).toEqual({ x: -500, y: -300 })
    expect(map(300, 250)).toEqual({ x: -400, y: -200 })
  })

  it('on the tilted table the inverse projection undoes the forward one, so a dragged card stays under the finger', () => {
    // A frame 1000×700 with perspective-origin 50% 30%; the wood 800×500 centred in it, tilted.
    const layout = { frame: { w: 1000, h: 700 }, wood: { left: 100, top: 100, w: 800, h: 500 } }
    for (const p of [{ x: 0, y: 0 }, { x: 350, y: 200 }, { x: -380, y: -240 }, { x: 120, y: 245 }]) {
      const screen = projectTilted(layout, p)
      const back = tiltedToTable(layout, screen.x, screen.y)
      expect(back.x).toBeCloseTo(p.x, 6)
      expect(back.y).toBeCloseTo(p.y, 6)
    }
    expect(TILT).toBeCloseTo((24 * Math.PI) / 180)
    expect(PERSPECTIVE).toBe(1600)
  })
})
