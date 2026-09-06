import { describe, expect, it } from 'vitest'
import { PERSPECTIVE, TILT, tiltedToTable, projectTilted, flatToTable, unrotate } from '../src/table/geometry.js'

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

describe('a rotated table (C5): the seat at the bottom', () => {
  it('unrotate turns a point on the rotated table back into table coordinates', () => {
    const floor = { x: -500, y: -300, w: 1000, h: 600 }
    expect(unrotate({ x: 100, y: 50 }, floor, 0)).toEqual({ x: 100, y: 50 })
    expect(unrotate({ x: 100, y: 50 }, floor, 180)).toEqual({ x: -100, y: -50 })
    const q = unrotate({ x: 100, y: 50 }, floor, 90)
    expect(q.x).toBeCloseTo(50)
    expect(q.y).toBeCloseTo(-100)
    const r = unrotate(unrotate({ x: 123, y: -45 }, floor, 270), floor, 90)
    expect(r.x).toBeCloseTo(123)
    expect(r.y).toBeCloseTo(-45)
  })
})
