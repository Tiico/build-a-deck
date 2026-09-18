import { describe, expect, it } from 'vitest'
import type { Snapshot, ZoneAction } from '@byd/protocol'
import { compileAction, type Asked } from '../src/table/actions.js'
import { buildScene, tableOf } from './scene.js'
import { twoSeatSetup } from './fixture.js'

// En åtgärd är en sekvens av intent-mallar (B5). Att kompilera den är klientens jobb, precis som
// att räkna ut en koordinat är det (K16): protokollet vill ha ett tal, och "ett per spelare" är
// inte ett tal förrän någon sitter vid bordet.
const act = (steps: ZoneAction['steps']): ZoneAction => ({ id: 'a', label: 'Åtgärd', steps })
const compile = (view: Snapshot, steps: ZoneAction['steps'], asked: Asked = {}) => compileAction(view, 'draw', act(steps), asked)

describe('att kompilera en åtgärd till intents', () => {
  it('räknar "ett per spelare" ur de platser som faktiskt är tagna', () => {
    const { view } = buildScene()
    const snapshot = view(null)
    // Scenen har två platser och bara Ada sitter.
    expect(snapshot.seats.filter((s) => s.name !== null)).toHaveLength(1)
    expect(compile(snapshot, [{ v: 'split', count: { of: 'seats' }, to: { at: 'zone', zone: 'discard' }, face: 'front' }])).toEqual({
      ok: true,
      intents: [{ v: 'split', pile: 'draw', at: 1, to: 'discard', face: 'front' }],
    })
  })

  it('lägger stegen i den ordning de står, som ett enda kuvert', () => {
    const { view } = buildScene()
    const intents = compile(view(null), [{ v: 'shuffle' }, { v: 'deal', each: { of: 'number', n: 2 }, to: { at: 'hands' }, face: 'keep' }])
    expect(intents).toEqual({
      ok: true,
      intents: [
        { v: 'shuffle', pile: 'draw' },
        { v: 'deal', from: 'draw', to: ['hand:A'], each: 2 },
      ],
    })
  })

  it('säger vad den saknar i stället för att gissa: ett tal ingen har skrivit', () => {
    const { view } = buildScene()
    expect(compile(view(null), [{ v: 'split', count: { of: 'ask' }, to: { at: 'beside' }, face: 'keep' }])).toEqual({ ok: false, asks: 'ask:0' })
    expect(compile(view(null), [{ v: 'split', count: { of: 'ask' }, to: { at: 'beside' }, face: 'keep' }], { 'ask:0': 3 })).toMatchObject({
      ok: true,
      intents: [expect.objectContaining({ v: 'split', pile: 'draw', at: 3 })],
    })
  })

  it('säger att ingen sitter vid bordet, inte att det inte blir några kort, när "ett per spelare" är noll', () => {
    const empty = tableOf(twoSeatSetup()).view(null)
    expect(empty.seats.every((s) => s.name === null)).toBe(true)
    expect(compile(empty, [{ v: 'split', count: { of: 'seats' }, to: { at: 'beside' }, face: 'keep' }])).toEqual({ ok: false, why: 'nowhere' })
    // En tom hög är däremot precis det den säger att den är.
    expect(compile(empty, [{ v: 'split', count: { of: 'zone', zone: 'discard' }, to: { at: 'beside' }, face: 'keep' }])).toEqual({ ok: false, why: 'none' })
  })

  it('lägger "bredvid högen" på den sida högen säger (K21)', () => {
    const { view } = buildScene()
    const snapshot = view(null)
    const draw = snapshot.zones.find((z) => z.id === 'draw')!
    const rightwards: Snapshot = { ...snapshot, zones: snapshot.zones.map((z) => (z.id === 'draw' ? { ...z, beside: 'right' as const } : z)) }
    const landsAt = (steps: ZoneAction['steps']): number => {
      const made = compile(rightwards, steps)
      if (!made.ok) throw new Error(`väntade intents, fick ${JSON.stringify(made)}`)
      const [intent] = made.intents
      if (intent === undefined || !('x' in intent) || typeof intent.x !== 'number') throw new Error('steget bar ingen punkt')
      return intent.x
    }
    expect(landsAt([{ v: 'split', count: { of: 'number', n: 2 }, to: { at: 'beside' }, face: 'front' }])).toBeGreaterThan(draw.geometry.x)
    // Och ett framletat knippe går samma väg, för det landar på samma ställe.
    expect(landsAt([{ v: 'take', which: [{ field: 'rarity', is: ['Diamant'] }], to: { at: 'beside' }, face: 'front' }])).toBeGreaterThan(draw.geometry.x)
  })

  it('bär frågan vidare orörd när steget letar fram kort', () => {
    const { view } = buildScene()
    expect(compile(view(null), [{ v: 'take', which: [{ field: 'rarity', is: ['Diamant'] }], to: { at: 'beside' }, face: 'front' }])).toMatchObject({
      ok: true,
      intents: [expect.objectContaining({ v: 'split', pile: 'draw', which: [{ field: 'rarity', is: ['Diamant'] }], face: 'front' })],
    })
  })
})

// K16: handen och tangentbordet får aldrig erbjudas olika saker om samma hög. Panelens lista
// läser samma åtgärder som arket under ringen, och kompilerar dem likadant.
describe('samma lista för tangentbordet', () => {
  it('lägger spelets egna åtgärder efter de fysiska verben, med deras egna namn', async () => {
    const { verbsFor } = await import('../src/table/keyboard.js')
    const { view } = buildScene()
    const snapshot = view(null)
    const withAction: Snapshot = {
      ...snapshot,
      zones: snapshot.zones.map((z) => (z.id === 'draw' ? { ...z, actions: [act([{ v: 'shuffle' }, { v: 'deal', each: { of: 'number', n: 2 }, to: { at: 'hands' }, face: 'keep' }])] } : z)),
    }
    const acts = verbsFor(withAction, { key: 'pile:draw', kind: 'pile', pile: 'draw', name: 'Draghög', count: 3 })
    expect(acts.map((a) => a.label)).toEqual(['Blanda', 'Dra 1', 'Dela på hälften', 'Åtgärd'])
    expect(acts.at(-1)!.intents).toEqual([
      { v: 'shuffle', pile: 'draw' },
      { v: 'deal', from: 'draw', to: ['hand:A'], each: 2 },
    ])
  })

  it('säger skälet i panelen också: en avstängd åtgärd säger varför där ringen säger det', async () => {
    const { verbsFor } = await import('../src/table/keyboard.js')
    const empty = tableOf(twoSeatSetup()).view(null)
    const withAction: Snapshot = {
      ...empty,
      zones: empty.zones.map((z) => (z.id === 'draw' ? { ...z, actions: [act([{ v: 'split', count: { of: 'seats' }, to: { at: 'beside' }, face: 'keep' }])] } : z)),
    }
    const offered = verbsFor(withAction, { key: 'pile:draw', kind: 'pile', pile: 'draw', name: 'Draghög', count: 5 }).at(-1)!
    expect(offered.intents).toBeNull()
    expect(offered.hint).toBe('ingen sitter vid bordet än')
  })
})
