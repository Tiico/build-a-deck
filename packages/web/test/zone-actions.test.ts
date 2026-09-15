import { describe, expect, it } from 'vitest'
import type { Snapshot, ZoneAction } from '@byd/protocol'
import { compileAction, type Asked } from '../src/table/actions.js'
import { buildScene } from './scene.js'

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
    expect(acts.map((a) => a.label)).toEqual(['Blanda', 'Dela på hälften', 'Åtgärd'])
    expect(acts.at(-1)!.intents).toEqual([
      { v: 'shuffle', pile: 'draw' },
      { v: 'deal', from: 'draw', to: ['hand:A'], each: 2 },
    ])
  })
})
