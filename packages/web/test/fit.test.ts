import { describe, expect, it } from 'vitest'
import { feltScale, fitScale, LEAST_AIR_PX, WOOD_RIM_PX } from '../src/table/fit.js'
import { projectTilted } from '../src/table/geometry.js'

describe('fitScale', () => {
  it('scales the table down to fit the container, never up past 1:1, keeping aspect', () => {
    expect(fitScale({ w: 1200, h: 800 }, { w: 600, h: 600 })).toBe(0.5)
    expect(fitScale({ w: 1200, h: 800 }, { w: 2400, h: 400 })).toBe(0.5)
    expect(fitScale({ w: 1200, h: 800 }, { w: 3000, h: 3000 })).toBe(1)
  })

  it('leaves room for the frame around the felt', () => {
    expect(fitScale({ w: 1200, h: 800 }, { w: 1200, h: 800 }, 60)).toBe(0.85)
  })
})

// Where the felt's four corners actually land on the screen, which is the shape the fit has to
// pass into the frame: the wood is `rotateX` under a perspective, so the near edge is pushed out
// and down and the far one drawn in.
function drawnBox(table: { w: number; h: number }, frame: { w: number; h: number }, scale: number) {
  const wood = { w: table.w * scale + 2 * WOOD_RIM_PX, h: table.h * scale + 2 * WOOD_RIM_PX }
  const layout = { frame, wood: { left: (frame.w - wood.w) / 2, top: (frame.h - wood.h) / 2, w: wood.w, h: wood.h } }
  const corners = [
    { x: -wood.w / 2, y: -wood.h / 2 },
    { x: wood.w / 2, y: -wood.h / 2 },
    { x: -wood.w / 2, y: wood.h / 2 },
    { x: wood.w / 2, y: wood.h / 2 },
  ].map((p) => projectTilted(layout, p))
  const xs = corners.map((p) => p.x)
  const ys = corners.map((p) => p.y)
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) }
}
const air = (table: { w: number; h: number }, frame: { w: number; h: number }, scale: number) => {
  const b = drawnBox(table, frame, scale)
  return Math.min(b.left, b.top, frame.w - b.right, frame.h - b.bottom)
}

describe('feltScale — the felt in table mode (K9, reviderat 2026-09-12)', () => {
  const TABLE = { w: 1320, h: 860 }
  const FRAMES = [
    { what: '1280×800', frame: { w: 1280, h: 800 } },
    { what: '1920×1080', frame: { w: 1920, h: 1080 } },
    { what: 'a portrait tablet, 820×1180', frame: { w: 820, h: 1180 } },
    { what: 'a thumbnail, 640×384', frame: { w: 640, h: 384 } },
  ] as const

  it.each(FRAMES.map((f) => f.what))('fills %s to the least air and no further', (what) => {
    const frame = FRAMES.find((f) => f.what === what)!.frame
    const scale = feltScale(TABLE, frame)
    // It fits, with the air every felt leaves.
    expect({ what, air: air(TABLE, frame, scale) >= LEAST_AIR_PX - 0.5 }).toEqual({ what, air: true })
    // And nothing is left over: two percent larger and a corner is outside that air.
    expect({ what, room: air(TABLE, frame, scale * 1.02) >= LEAST_AIR_PX }).toEqual({ what, room: false })
  })

  it('never draws the table larger than life, however much screen there is', () => {
    expect(feltScale(TABLE, { w: 6000, h: 6000 })).toBe(1)
  })

  it('gives the table more of the screen than the share it was measured against before', () => {
    // The old rule took two fifths of the frame's area *before* the tilt was taken out, so what
    // was drawn came to a bit over a third. The frame is the same; the felt is not.
    const frame = { w: 1280, h: 800 }
    const scale = feltScale(TABLE, frame)
    const b = drawnBox(TABLE, frame, scale)
    const covered = ((b.right - b.left) * (b.bottom - b.top)) / (frame.w * frame.h)
    expect({ covered: covered > 0.5 }).toEqual({ covered: true })
  })
})
