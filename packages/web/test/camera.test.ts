import { describe, expect, it } from 'vitest'
import { activeBounds, cameraOf, fitFloor, frameRect, zoomAround } from '../src/table/camera.js'
import { buildScene } from './scene.js'

// The camera (C5): a rectangle of the table, in millimetres, at the viewport's aspect.
const floor = { x: -500, y: -300, w: 1000, h: 600 }
const wide = { w: 1000, h: 500 }

describe('what is in play', () => {
  it('is the loose cards and the board: piles and areas, empty or not — never the hands, which sit at the rim', () => {
    const { view } = buildScene()
    const snapshot = view(null)
    const b = activeBounds(snapshot)!
    const emptied = { ...snapshot, zones: snapshot.zones.map((z) => (z.id === 'discard' ? { ...z, mode: 'count' as const, count: 0 } : z)) }
    expect(activeBounds(emptied)).toEqual(b)
    // The scene: cards at (100, 50) and (300, 200) in the floor, which starts at (-500, -300);
    // the draw pile at (-200, 0) and the discard at (200, 0), each a card centred on its point
    // plus its label below. Hands at y = 320 and y = -420 do not count.
    expect(b.x).toBeCloseTo(-400)
    expect(b.y).toBeCloseTo(-250)
    expect(b.x + b.w).toBeCloseTo(200 + 63 / 2)
    expect(b.y + b.h).toBeCloseTo(88 / 2 + 24)
  })
})

describe('framing', () => {
  it('grows the target to the viewport aspect around its centre', () => {
    expect(frameRect({ x: 0, y: 0, w: 200, h: 200 }, wide, floor, 0)).toEqual({ x: -100, y: 0, w: 400, h: 200 })
    expect(frameRect({ x: 0, y: 0, w: 400, h: 100 }, wide, floor, 0)).toEqual({ x: 0, y: -50, w: 400, h: 200 })
  })

  it('never goes closer than the minimum width, and never wider than the whole floor', () => {
    expect(frameRect({ x: 0, y: 0, w: 100, h: 50 }, wide, floor, 400)).toEqual({ x: -150, y: -75, w: 400, h: 200 })
    expect(frameRect({ x: -900, y: -900, w: 3000, h: 3000 }, wide, floor, 0)).toEqual(fitFloor(floor, wide))
    expect(fitFloor(floor, wide)).toEqual({ x: -600, y: -300, w: 1200, h: 600 })
  })

  it('stays inside the floor as fitted, so the camera never shows the void', () => {
    expect(frameRect({ x: 400, y: 200, w: 200, h: 100 }, wide, floor, 0)).toEqual({ x: 400, y: 200, w: 200, h: 100 })
    expect(frameRect({ x: 480, y: 280, w: 200, h: 100 }, wide, floor, 0)).toEqual({ x: 400, y: 200, w: 200, h: 100 })
  })

  it('zooms around a point by a factor, and the scale follows from the width', () => {
    const whole = fitFloor(floor, wide)
    const z = zoomAround(whole, { x: 100, y: 50 }, 0.5, wide, floor, 200)
    expect(z).toEqual({ x: -200, y: -100, w: 600, h: 300 })
    expect(cameraOf(z, wide, floor)).toEqual({ scale: 1000 / 600, left: -(z.x - floor.x) * (1000 / 600), top: -(z.y - floor.y) * (1000 / 600) })
    // Zooming out past the floor lands on the whole floor.
    expect(zoomAround(z, { x: 100, y: 50 }, 4, wide, floor, 200)).toEqual(whole)
  })
})
