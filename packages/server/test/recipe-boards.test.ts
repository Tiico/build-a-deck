import { describe, expect, it } from 'vitest'
import { BOARDS } from '@byd/engine'
import { applyRecipe, openingSetup, recipeOf, type Geometry, type Setup } from '../src/recipe.js'
import { setupFromProject } from '../src/setup.js'

// Filten räknar in brädet (#1480, K18, variant A i #1473): brädet ligger mitt på filten, högarna
// flyttar ut på var sin sida om det, och spelarbrädet ligger där «Framför» låg. Filten växer bara så
// mycket brädet och spelarbräden kräver, med prototypens mått: en plats är handen 60, luft 10 och
// «Framför» 100 mm djup, med spelarbräden handen 60, luft 10 och brädet 150; brädet har 20 mm luft
// mot platserna, och en hög tar ett kort och 20 mm luft på var sida bredvid det.
const ref = (id: string) => {
  const def = BOARDS.find((b) => b.id === id)!
  return { id: def.id, version: def.version }
}
const main = (id = 'board.square457') => ({ id: 'main', type: ref(id), zone: 'table' })
const players = { id: 'spelare', type: ref('board.player'), role: 'mine' }
const laid = (players: number, boards: NonNullable<Setup['boards']>): Setup => {
  const setup = { ...openingSetup({ players, counters: [{ name: 'Liv', start: 20 }] }), boards }
  return applyRecipe(setup, recipeOf(setup))
}
const zone = (s: Setup, id: string): Geometry => s.zones.find((z) => z.id === id)!.geometry
const size = (g: Geometry) => ({ w: g.w, h: g.h })
// Brädena som de ligger på filten, i filtens egna millimeter och innan de vrids.
function boardsOn(s: Setup) {
  const table = setupFromProject({ rows: [], setup: s })
  return table.components
    .filter((c) => c.type.id.startsWith('board.'))
    .map((c) => {
      const z = zone(s, c.zone)
      const def = BOARDS.find((b) => b.id === c.type.id)!.physical
      const turned = (c.rot ?? 0) % 180 !== 0
      const [w, h] = turned ? [def.heightMm, def.widthMm] : [def.widthMm, def.heightMm]
      const cx = z.x + (c.x ?? 0) + def.widthMm / 2
      const cy = z.y + (c.y ?? 0) + def.heightMm / 2
      return { zone: c.zone, x: cx - w / 2, y: cy - h / 2, w, h }
    })
}
const inside = (a: { x: number; y: number; w: number; h: number }, b: Geometry) => a.x >= b.x - 1e-9 && a.y >= b.y - 1e-9 && a.x + a.w <= b.x + b.w + 1e-9 && a.y + a.h <= b.y + b.h + 1e-9
const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

describe('filten räknar in brädet (#1480)', () => {
  it('växer bara så mycket brädet kräver, med prototypens mått', () => {
    expect(size(zone(laid(4, [main()]), 'table'))).toEqual({ w: 1200, h: 837 })
    expect(size(zone(laid(4, [main(), players]), 'table'))).toEqual({ w: 1200, h: 937 })
    expect(size(zone(laid(4, [main('board.rect610'), players]), 'table'))).toEqual({ w: 1296, h: 937 })
    // Åttaplatsbordets filt rymmer redan brädet.
    expect(size(zone(laid(8, [main(), players]), 'table'))).toEqual({ w: 1800, h: 1400 })
    // Utan bräde är filten K18:s, på millimetern.
    expect(size(zone(laid(4, []), 'table'))).toEqual({ w: 1200, h: 800 })
  })

  it('lägger högarna på var sin sida om huvudbrädet', () => {
    const s = laid(4, [main()])
    const dx = 457 / 2 + 20 + 63 / 2
    expect(zone(s, 'draw')).toMatchObject({ x: -dx, y: 0 })
    expect(zone(s, 'discard')).toMatchObject({ x: dx, y: 0 })
  })

  it('lägger handen vid den vuxna filtens kant, och spelarbrädet där «Framför» låg', () => {
    const s = laid(4, [main(), players])
    expect(zone(s, 'hand:A')).toMatchObject({ y: 937 / 2 - 60, h: 60 })
    expect(zone(s, 'hand:B')).toMatchObject({ y: -937 / 2 })
    // «Framför» är spelarbrädets egen yta: 240 × 150 mitt för platsen, 10 mm innanför handen.
    expect(zone(s, 'mine:A')).toEqual({ x: -120, y: 937 / 2 - 220, w: 240, h: 150, rot: 0 })
    expect(zone(s, 'mine:C')).toEqual({ x: 600 - 220, y: -120, w: 150, h: 240, rot: 0 })
    for (const b of boardsOn(s).filter((b) => b.zone.startsWith('mine:'))) expect(inside(b, zone(s, b.zone))).toBe(true)
  })

  it('lägger huvudbrädet mitt på filten, fritt från högarna och platserna, vid fyra och åtta platser', () => {
    for (const n of [2, 3, 4, 5, 6, 7, 8]) {
      for (const boards of [[main()], [main(), players], [main('board.rect610'), players]]) {
        const s = laid(n, boards)
        const board = boardsOn(s).find((b) => b.zone === 'table')!
        expect(board.x + board.w / 2, `${n}`).toBeCloseTo(0)
        expect(board.y + board.h / 2, `${n}`).toBeCloseTo(0)
        expect(inside(board, zone(s, 'table')), `${n}`).toBe(true)
        for (const z of s.zones.filter((z) => z.id !== 'table')) {
          const g = z.kind === 'pile' ? { x: z.geometry.x - 63 / 2, y: z.geometry.y - 88 / 2, w: 63, h: 88 } : z.geometry
          expect(overlaps(board, g), `${n} platser: ${z.id} under brädet`).toBe(false)
        }
      }
    }
  })

  it('lämnar ett bord utan bräde som K18 lade det', () => {
    const before = openingSetup({ players: 4, counters: [{ name: 'Liv', start: 20 }] })
    expect(applyRecipe(before, recipeOf(before)).zones).toEqual(before.zones)
  })
})
