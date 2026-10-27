import { describe, expect, it } from 'vitest'
import type { BoxFace } from '@byd/engine'
import { FACE_NORMALS, REST, facing, lit, netPose, poseTransform, showScene, swayed, turnedBy } from '../src/box-scene.js'

// Produktbilden i «Visa upp» (#1414, L91, #1406 runda 2): lådan och leken som tolv plan i CSS 3D,
// med ljuset bakat i två lager per plan och räknat ur planets normal. Geometrin och ljuset är rena
// funktioner, så att det som ritas och det som mäts i Chromium räknas på ett ställe.

// Prototypens lek: 108 kort på 63 × 88 × 0,3 mm i en tuckbox på 65 × 90 × 34,5 mm.
const SIZE = { width: 65, height: 90, depth: 34.5 }
const CARD = { widthMm: 63, heightMm: 88 }
const PX = 4

describe('lådan står i lekens mått (#1414)', () => {
  const scene = showScene(SIZE, CARD, 32.4, PX)

  it('ger varje yta sitt mått, och planen sluter lådan runt dess mitt', () => {
    const { box } = scene
    expect(box.front.width).toBe(65 * PX)
    expect(box.front.height).toBe(90 * PX)
    expect(box.right.width).toBe(34.5 * PX)
    expect(box.lid.height).toBe(34.5 * PX)
    const cx = box.front.pose.x
    expect(box.back.pose.x).toBe(cx)
    expect(box.front.pose.z - box.back.pose.z).toBe(34.5 * PX)
    expect(box.right.pose.x - box.left.pose.x).toBe(65 * PX)
    expect(box.bottom.pose.y - box.lid.pose.y).toBe(90 * PX)
  })

  it('ställer leken bredvid lådan på samma golv, med lekens djup ur antalet kort', () => {
    const deck = scene.deck!
    expect(deck.face.width).toBe(63 * PX)
    expect(deck.right.width).toBeCloseTo(32.4 * PX)
    expect(deck.face.pose.z - deck.back.pose.z).toBeCloseTo(32.4 * PX)
    // Lekens botten står där lådans står.
    expect(deck.face.pose.y + deck.face.height / 2).toBeCloseTo(scene.box.front.pose.y + scene.box.front.height / 2)
    // Till höger om lådan, med luft emellan.
    expect(deck.left.pose.x).toBeGreaterThan(scene.box.right.pose.x)
    // Hela bilden står kring mitten.
    expect(scene.box.left.pose.x + deck.right.pose.x).toBeCloseTo(0)
  })

  it('har ingen lek när leken inte har några kort, och står då själv i mitten', () => {
    const alone = showScene(SIZE, CARD, 0, PX)
    expect(alone.deck).toBeNull()
    expect(alone.box.front.pose.x).toBe(0)
  })
})

describe('sidorna vetter dit de sitter på lådan', () => {
  it('visar framsidan, höger sida och locket i viloläget, och inte de tre andra', () => {
    const seen = (Object.keys(FACE_NORMALS) as BoxFace[]).filter((f) => facing(FACE_NORMALS[f], REST.rx, REST.ry))
    expect(seen.sort()).toEqual(['front', 'lid', 'right'])
  })

  it('visar baksidan när lådan vridits ett halvt varv', () => {
    expect(facing(FACE_NORMALS.back, 0, 180)).toBe(true)
    expect(facing(FACE_NORMALS.front, 0, 180)).toBe(false)
  })

  it('skriver transformen i samma ordning i nätet och i lådan, så att vikningen går funktion för funktion', () => {
    const scene = showScene(SIZE, CARD, 32.4, PX)
    const shape = (s: string) => s.replace(/-?[\d.]+(px|deg)?/g, '#')
    const lid = netPose({ x: 10, y: -40 }, 0.5, 'lid', true)
    expect(shape(poseTransform(lid))).toBe(shape(poseTransform(scene.box.lid.pose)))
    expect(poseTransform(lid)).toContain('rotateZ(180deg)')
    // Baksidan viks ut åt samma håll som den viktes in: 180° till 360°, inte tillbaka till noll.
    expect(netPose({ x: 0, y: 0 }, 1, 'back', false).ry).toBe(360)
  })
})

describe('ljuset är bakat ur normalen (#1406, README «Tekniken»)', () => {
  it('lyser mest på locket och minst på den sida som vänder sig bort', () => {
    const shadow = (f: BoxFace) => lit(FACE_NORMALS[f], REST.rx, REST.ry, 0).shadow
    expect(shadow('lid')).toBeLessThan(shadow('front'))
    expect(shadow('front')).toBeLessThan(shadow('right'))
    for (const f of Object.keys(FACE_NORMALS) as BoxFace[]) {
      expect(shadow(f)).toBeGreaterThanOrEqual(0)
      expect(shadow(f)).toBeLessThan(0.62)
    }
  })

  it('ändras när lådan vrids', () => {
    const before = lit(FACE_NORMALS.front, REST.rx, REST.ry, 1)
    const after = lit(FACE_NORMALS.front, REST.rx, REST.ry + 40, 1)
    expect(Math.abs(before.shadow - after.shadow)).toBeGreaterThan(0.03)
    expect(before.shift).not.toBe(after.shift)
  })

  it('ger matt laminat ingen glans', () => {
    expect(lit(FACE_NORMALS.front, 0, 0, 0).shine).toBe(0)
  })
})

describe('rörelsen', () => {
  it('vrider sig lugnt kring sin vinkel och börjar där den står', () => {
    expect(swayed(-28, 0)).toBe(-28)
    const all = Array.from({ length: 400 }, (_, i) => swayed(-28, i * 100))
    expect(Math.max(...all)).toBeLessThanOrEqual(-28 + 18 + 1e-9)
    expect(Math.min(...all)).toBeGreaterThanOrEqual(-28 - 18 - 1e-9)
    // Lugnt: aldrig mer än en grad per bildruta.
    for (let t = 0; t < 20000; t += 16) expect(Math.abs(swayed(-28, t + 16) - swayed(-28, t))).toBeLessThan(1)
  })

  it('vrids av pekaren, och tippar aldrig över', () => {
    expect(turnedBy({ rx: -12, ry: -28 }, 100, 0)).toEqual({ rx: -12, ry: 22 })
    expect(turnedBy({ rx: -12, ry: -28 }, 0, 1000).rx).toBe(-60)
    expect(turnedBy({ rx: -12, ry: -28 }, 0, -1000).rx).toBe(20)
  })
})
