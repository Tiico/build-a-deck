import { describe, expect, it } from 'vitest'
import { TOKEN_COUNTER } from '@byd/engine'
import { setupFromProject } from '../src/setup.js'
import { ProjectSetup, type ProjectDoc } from '../src/projects.js'
import { CHIP_MM, DIE_MM, counterSpots, openingSetup, type Counter, type Die, type Setup } from '../src/recipe.js'
import { layMaterial, placeLine } from '../src/material.js'

// Materialets plats (#1292, beställarens beslut A): en tärning eller en räknare ligger i en yta och
// på en punkt designern drog den till, `at`, i ytans egna millimeter och mitt på biten. En punkt i
// en platsyta sägs från plats A:s stol och vänds mot varje plats kant, så att alla platser har sin
// bit på samma ställe sett från sin egen stol.
const four = (patch: Partial<Setup>): Pick<ProjectDoc, 'rows' | 'setup'> => ({ rows: [], setup: ProjectSetup.parse({ ...openingSetup({ players: 4, counters: [{ name: 'Guld', start: 3 }] }), ...patch }) })
const dice = (setup: ReturnType<typeof setupFromProject>) => setup.components.filter((c) => c.type.id.startsWith('die.'))
const chips = (setup: ReturnType<typeof setupFromProject>) => setup.components.filter((c) => c.type.id === TOKEN_COUNTER.id)
const middle = (c: { x?: number | undefined; y?: number | undefined }, size: number) => ({ x: (c.x ?? NaN) + size / 2, y: (c.y ?? NaN) + size / 2 })

describe('en tärning på en punkt (#1292)', () => {
  it('ligger med sin mitt på punkten i en delad yta', () => {
    const [die] = dice(setupFromProject(four({ dice: [{ faces: 6, count: 1, zone: 'table', at: { x: 300, y: 200 } }] })))
    expect(die?.zone).toBe('table')
    expect(middle(die!, DIE_MM)).toEqual({ x: 300, y: 200 })
  })

  it('lägger en rads tärningar bredvid varandra, med raden mitt på punkten', () => {
    const laid = dice(setupFromProject(four({ dice: [{ faces: 6, count: 3, zone: 'table', at: { x: 300, y: 200 } }] }))).map((d) => middle(d, DIE_MM))
    expect(new Set(laid.map((p) => p.y))).toEqual(new Set([200]))
    expect(new Set(laid.map((p) => p.x)).size).toBe(3)
    expect((Math.min(...laid.map((p) => p.x)) + Math.max(...laid.map((p) => p.x))) / 2).toBe(300)
  })

  it('vänder en platsytas punkt mot varje plats kant', () => {
    // Framför A är 365 × 100 vid S-kanten, B vid N, C (100 × 365) vid E och D vid W.
    const laid = dice(setupFromProject(four({ dice: [{ faces: 6, count: 1, role: 'mine', at: { x: 40, y: 60 } }] })))
    const at = Object.fromEntries(laid.map((d) => [d.zone, middle(d, DIE_MM)]))
    expect(at).toEqual({
      'mine:A': { x: 40, y: 60 },
      'mine:B': { x: 365 - 40, y: 100 - 60 },
      'mine:C': { x: 60, y: 365 - 40 },
      'mine:D': { x: 100 - 60, y: 40 },
    })
  })

  it('håller en tärning inne i ytan när punkten ligger vid kanten', () => {
    const [die] = dice(setupFromProject(four({ dice: [{ faces: 6, count: 1, role: 'mine', at: { x: 0, y: 100 } }] })))
    expect(die).toMatchObject({ zone: 'mine:A', x: 0, y: 100 - DIE_MM })
  })

  it('lägger som förut när raden inte har någon punkt', () => {
    const without = dice(setupFromProject(four({ dice: [{ faces: 6, count: 2, zone: 'table' }] })))
    expect(without.map((d) => d.x)).not.toContain(undefined)
    expect(new Set(without.map((d) => d.x)).size).toBe(2)
  })

  it('tar bara en punkt med ändliga tal', () => {
    const base = openingSetup({ players: 2, counters: [] })
    expect(() => ProjectSetup.parse({ ...base, dice: [{ faces: 6, count: 1, zone: 'table', at: { x: 'a', y: 0 } }] })).toThrow()
    expect(() => ProjectSetup.parse({ ...base, dice: [{ faces: 6, count: 1, zone: 'table', at: { x: Infinity, y: 0 } }] })).toThrow()
  })
})

describe('en räknare på en punkt (#1292)', () => {
  it('ligger i räknarytan som förut när den inte har fått någon plats', () => {
    const laid = chips(setupFromProject(four({})))
    const spot = counterSpots({ x: 0, y: 0, w: 125, h: 100, rot: 0 }, 1)[0]
    expect(laid.find((c) => c.zone === 'counters:A')).toMatchObject(spot!)
  })

  it('ligger på punkten i räknarytan när den bara har fått en punkt', () => {
    const laid = chips(setupFromProject(four({ counters: [{ name: 'Guld', start: 3, at: { x: 30, y: 30 } }] })))
    expect(middle(laid.find((c) => c.zone === 'counters:A')!, CHIP_MM)).toEqual({ x: 30, y: 30 })
  })

  it('ligger i en annan platsyta, vänd mot varje plats kant, och behåller sitt startvärde', () => {
    const laid = chips(setupFromProject(four({ counters: [{ name: 'Guld', start: 3, role: 'mine', at: { x: 300, y: 50 } }] })))
    const at = Object.fromEntries(laid.map((c) => [c.zone, middle(c, CHIP_MM)]))
    expect(at).toEqual({
      'mine:A': { x: 300, y: 50 },
      'mine:B': { x: 365 - 300, y: 100 - 50 },
      'mine:C': { x: 50, y: 365 - 300 },
      'mine:D': { x: 100 - 50, y: 300 },
    })
    expect(laid.every((c) => c.counter === 3 && c.cardRef === 'Guld')).toBe(true)
  })

  it('lägger ingen räknare för en plats som saknar ytan', () => {
    const doc = four({ counters: [{ name: 'Guld', start: 3, role: 'saknas', at: { x: 10, y: 10 } }] })
    expect(chips(setupFromProject(doc))).toEqual([])
  })
})

// Att dra en bit i editorns filt (#1292, beslut A): ytan den släpps i blir dess yta, och punkten
// sägs från plats A:s stol om ytan hör till en familj, så att alla platsers bitar följer med.
describe('en dragen bit hamnar där den släpps (#1292)', () => {
  const doc = four({ dice: [{ faces: 6, count: 2, zone: 'table' }] })
  const middleOn = (zoneId: string, x: number, y: number) => {
    const g = doc.setup.zones.find((z) => z.id === zoneId)!.geometry
    return { x: g.x + x, y: g.y + y }
  }

  it('lägger en tärning i en platsytas familj när den släpps i någon plats yta', () => {
    expect(placeLine(doc.setup, { kind: 'die', index: 0 }, middleOn('mine:A', 40, 60))).toEqual({ faces: 6, count: 2, role: 'mine', at: { x: 40, y: 60 } })
    // Samma punkt sedd från C:s stol, i C:s yta vid E-kanten.
    expect(placeLine(doc.setup, { kind: 'die', index: 0 }, middleOn('mine:C', 60, 365 - 40))).toEqual({ faces: 6, count: 2, role: 'mine', at: { x: 40, y: 60 } })
  })

  it('lägger en tärning i den delade ytan med punkten i ytans millimeter', () => {
    expect(placeLine(doc.setup, { kind: 'die', index: 0 }, middleOn('table', 600, 380))).toEqual({ faces: 6, count: 2, zone: 'table', at: { x: 600, y: 380 } })
  })

  it('låter en rad per plats räkna per spelare när den flyttas till den delade ytan', () => {
    const seated = four({ dice: [{ faces: 6, count: 1, role: 'mine' }] })
    expect(placeLine(seated.setup, { kind: 'die', index: 0 }, middleOn('table', 600, 380))).toEqual({ faces: 6, count: 1, zone: 'table', perSeat: true, at: { x: 600, y: 380 } })
  })

  it('flyttar en räknare till en annan platsyta, och tar rollen av den igen i räknarytan', () => {
    const moved = placeLine(doc.setup, { kind: 'counter', index: 0 }, middleOn('mine:A', 300, 50))
    expect(moved).toEqual({ name: 'Guld', start: 3, role: 'mine', at: { x: 300, y: 50 } })
    const back = placeLine({ ...doc.setup, counters: [moved as Counter] }, { kind: 'counter', index: 0 }, middleOn('counters:A', 30, 30))
    expect(back).toEqual({ name: 'Guld', start: 3, at: { x: 30, y: 30 } })
  })

  it('lämnar en räknare där den låg när den släpps i den delade ytan', () => {
    expect(placeLine(doc.setup, { kind: 'counter', index: 0 }, middleOn('table', 600, 380))).toBeNull()
  })

  it('ger tillbaka biten på samma punkt som bordet sedan lägger den', () => {
    const line = placeLine(doc.setup, { kind: 'die', index: 0 }, middleOn('mine:B', 100, 30)) as Die
    const pieces = layMaterial({ ...doc.setup, dice: [{ ...line, count: 1 }] }).filter((p) => p.zone === 'mine:B')
    expect(pieces.map((p) => ({ x: p.x + p.size / 2, y: p.y + p.size / 2 }))).toEqual([{ x: 100, y: 30 }])
  })
})
