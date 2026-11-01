import { describe, expect, it } from 'vitest'
import type { Applied, Intent, SeatId } from '@byd/protocol'
import { STANDARD_TYPES, TILE_COIN, TypeRegistry, apply, counterIds, decide, initialState, replay, seededRng } from '@byd/engine'
import type { FaceTemplate } from '@byd/template'
import { applyEdit, type EditIntent } from '../src/edits.js'
import { changeOf, revertOf } from '../src/undo.js'
import { setupFromProject } from '../src/setup.js'
import { ProjectDoc, ProjectSetup } from '../src/projects.js'
import { openingSetup, type Setup } from '../src/recipe.js'

// Identiska markörer (#1483, #1470): trettio guldmynt med en designad fram- och baksida. Dokumentet
// bär markören som lådan bär sina ytor, en `FaceTemplate` per sida (L91), med typen, ett namn och
// setupens rad: antal, yta eller «per plats», och en punkt (K31).
const COIN = { id: TILE_COIN.id, version: TILE_COIN.version }
const face = (text: string): FaceTemplate => ({
  base: [{ kind: 'text', id: 'ord', x: 2, y: 10, w: 21, h: 5, bind: { literal: text }, font: { family: 'sans-serif', sizePt: 8 }, color: '#111' }],
  variants: {},
})
const bank = { id: 'bank', kind: 'pile' as const, name: 'Banken', visibility: 'all' as const, geometry: { x: 300, y: 0, w: 0, h: 0, rot: 0 } }
const game = (patch: Partial<Setup>, players = 2): Pick<ProjectDoc, 'rows' | 'setup'> => {
  const opening = openingSetup({ players, counters: [] })
  return { rows: [], setup: ProjectSetup.parse({ ...opening, zones: [...opening.zones, bank], ...patch }) }
}
const coins = (count: number, where: Record<string, unknown>) => ({ id: 'mynt', name: 'Mynt', type: COIN, faces: { front: face('1 guld'), back: face('Banken') }, count, ...where })
const markersOf = (setup: ReturnType<typeof setupFromProject>) => setup.components.filter((c) => c.type.id === COIN.id)

describe('setupens markörer (#1483)', () => {
  it('lägger trettio mynt i en hög i högen, alla med samma två ytor uppåt med framsidan', () => {
    const laid = markersOf(setupFromProject(game({ markers: [coins(30, { zone: 'bank' })] })))
    expect(laid).toHaveLength(30)
    for (const c of laid) expect(c).toMatchObject({ zone: 'bank', face: 'front' })
    expect(new Set(laid.map((c) => c.cardRef)).size).toBe(1)
    expect(laid.some((c) => c.x !== undefined)).toBe(false)
  })

  it('lägger trettio mynt i en yta på rad kring punkten', () => {
    const laid = markersOf(setupFromProject(game({ markers: [coins(30, { zone: 'table', at: { x: 600, y: 400 } })] })))
    expect(laid).toHaveLength(30)
    const size = TILE_COIN.physical.widthMm
    const middles = laid.map((c) => ({ x: (c.x ?? NaN) + size / 2, y: (c.y ?? NaN) + size / 2 }))
    // En rad: samma höjd, trettio olika ställen, och radens mitt på punkten (bordet lägger hela mm).
    expect(new Set(middles.map((m) => m.y)).size).toBe(1)
    expect(Math.abs((middles[0]?.y ?? NaN) - 400)).toBeLessThanOrEqual(1)
    expect(new Set(middles.map((m) => m.x)).size).toBe(30)
    const xs = middles.map((m) => m.x)
    expect(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - 600)).toBeLessThanOrEqual(1)
    for (const c of laid) expect(c.zone).toBe('table')
  })

  it('ger med «per plats» varje plats sitt antal i sin yta, vänt mot platsens kant (K31)', () => {
    const laid = markersOf(setupFromProject(game({ markers: [coins(3, { role: 'mine', at: { x: 60, y: 50 } })] }, 4)))
    const tally = laid.reduce<Record<string, number>>((n, c) => ({ ...n, [c.zone]: (n[c.zone] ?? 0) + 1 }), {})
    expect(tally).toEqual({ 'mine:A': 3, 'mine:B': 3, 'mine:C': 3, 'mine:D': 3 })
    // Ett antal per spelare i en delad yta följer sällskapet.
    expect(markersOf(setupFromProject(game({ markers: [coins(5, { zone: 'bank', perSeat: true })] }, 4)))).toHaveLength(20)
  })

  it('tar bara bricktyper, och en rad säger antingen en yta eller en yta per plats', () => {
    const base = game({}).setup
    const parse = (m: Record<string, unknown>) => () => ProjectSetup.parse({ ...base, markers: [m] })
    expect(parse(coins(1, { zone: 'bank', type: { id: 'card.standard.63x88', version: 1 } }))).toThrow()
    expect(parse(coins(1, {}))).toThrow()
    expect(parse(coins(1, { zone: 'bank', role: 'mine' }))).toThrow()
    expect(parse({ ...coins(1, { zone: 'bank' }), faces: { side: face('x') } })).toThrow()
    expect(() => ProjectSetup.parse({ ...base, markers: [coins(1, { zone: 'bank' }), coins(2, { zone: 'table' })] })).toThrow()
  })

  it('läser ett dokument utan markörer tillbaka orört', () => {
    const before = game({}).setup
    expect(before).not.toHaveProperty('markers')
    expect(ProjectSetup.parse(JSON.parse(JSON.stringify(before)))).toEqual(before)
    expect(markersOf(setupFromProject({ rows: [], setup: before }))).toEqual([])
  })
})

// Hela listan är en redigering (`setMarkers`), som trädelarnas `setPieces`: en ändring är en version
// och ett steg tillbaka (B4).
describe('markörerna redigeras som en lista (#1483)', () => {
  const doc = (): ProjectDoc => ({
    name: 'Myntspel',
    template: { faces: { front: { base: [], variants: {} }, back: { base: [], variants: {} } } },
    rows: [],
    icons: {},
    setup: game({}).setup,
  })

  it('skriver listan, tar bort den när den sista markören går, och vägrar en rad dokumentet inte kan bära', () => {
    const next = applyEdit(doc(), { v: 'setMarkers', markers: [coins(30, { zone: 'bank' })] })
    expect(next.setup.markers).toEqual([coins(30, { zone: 'bank' })])
    expect(applyEdit(next, { v: 'setMarkers', markers: [] }).setup).not.toHaveProperty('markers')
    expect(() => applyEdit(doc(), { v: 'setMarkers', markers: [coins(1, {})] } as EditIntent)).toThrow()
  })

  it('går att ångra, och en ändrad framsida är ett steg', () => {
    const before = applyEdit(doc(), { v: 'setMarkers', markers: [coins(30, { zone: 'bank' })] })
    const redrawn = applyEdit(before, { v: 'setMarkers', markers: [{ ...coins(30, { zone: 'bank' }), faces: { front: face('5 guld'), back: face('Banken') } }] })
    const back = revertOf(changeOf(before, redrawn), redrawn)
    if (!back.ok || !back.edit) throw new Error('no step back')
    expect(applyEdit(redrawn, back.edit).setup.markers).toEqual(before.setup.markers)
  })
})

// Ett bord lagt med markörer spelas upp till samma bord (D4): de är brickor som allt annat på bordet,
// och verben är de vanliga.
describe('ett bord med markörer spelas upp (#1483, D4)', () => {
  it('ger samma bord ur loggen efter att mynt blandats, tagits, vänts och vridits', () => {
    const registry = new TypeRegistry(STANDARD_TYPES)
    const initial = initialState('v1', setupFromProject(game({ markers: [coins(10, { zone: 'bank' }), { ...coins(4, { role: 'mine' }), id: 'skada', name: 'Skada' }] })), registry)
    let state = initial
    const log: Applied[] = []
    const history = { stateAt: (seq: number) => replay(initial, registry, log.filter((l) => l.seq <= seq)), lines: () => log }
    const deps = { rng: seededRng(7), ids: counterIds('r'), now: () => '2026-11-01T00:00:00.000Z', history }
    const send = (seat: SeatId | null, intent: Intent) => {
      const d = decide(state, registry, { id: `e${log.length}`, seat, intents: [intent] }, deps)
      if (!d.ok) throw new Error(`${intent.v}: ${d.reason}`)
      for (const line of d.applied) {
        state = apply(state, registry, line)
        log.push(line)
      }
    }
    send(null, { v: 'shuffle', pile: 'bank' })
    send('A', { v: 'draw', from: 'bank', to: 'mine:A', count: 3 })
    const [a, b] = state.zones['mine:A']!.order
    send('A', { v: 'flip', component: a!, face: 'back' })
    send('A', { v: 'rotate', component: b!, rot: 90 })
    send('B', { v: 'draw', from: 'bank', to: 'hand:B', count: 2 })
    expect(state.zones['bank']!.order).toHaveLength(5)
    expect(replay(initial, registry, log)).toEqual(state)
  })
})
