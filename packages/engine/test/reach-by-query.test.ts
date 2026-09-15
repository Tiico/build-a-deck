import { describe, expect, it } from 'vitest'
import { Harness, CARD, registry, twoSeatSetup } from './fixture.js'
import { project, type SetupDef } from '../src/index.js'

// Att leta fram vissa kort ur en hög. Frågan måste resas av motorn och aldrig av klienten: en
// dold högs kort har inga id:n på tråden (B6), så den som frågar kan bara säga frågan. Svaret är
// därför en parameter på de verb som redan flyttar kort, inte ett nytt verb.
const deck = (): SetupDef => {
  const base = twoSeatSetup()
  return {
    ...base,
    // Vad korten heter i sina egna kolumner, en gång per kortrad och inte en gång per kopia:
    // identiteten är `cardRef`, och frågan ställs till identiteten.
    cards: {
      dragon: { rarity: 'Diamant', typ: 'Varelse' },
      knight: { rarity: 'Guld', typ: 'Varelse' },
      wizard: { rarity: 'Diamant', typ: 'Varelse' },
      rogue: { rarity: 'Brons', typ: 'Fälla' },
    },
    components: ['dragon', 'knight', 'wizard', 'rogue'].map((cardRef) => ({ type: CARD, cardRef, zone: 'draw', face: 'back' as const })),
  }
}

describe('att leta fram kort med en fråga (B5, B6)', () => {
  it('drar varje kort som svarar på frågan ur den dolda högen, uppvänt, och lämnar de andra kvar', () => {
    const h = new Harness(1, deck())
    h.do(null, { v: 'draw', from: 'draw', to: 'table', count: 1, which: [{ field: 'rarity', is: ['Diamant'] }], face: 'front' })

    const view = project(h.state, registry, null)
    expect(view.components.filter((c) => c.zone === 'table').map((c) => c.cardRef).sort()).toEqual(['dragon', 'wizard'])
    expect(h.zone('draw')).toHaveLength(2)
  })

  it('en fråga ingen rad svarar på flyttar ingenting, och säger det i stället för att tiga', () => {
    const h = new Harness(1, deck())
    expect(() => h.do(null, { v: 'draw', from: 'draw', to: 'table', count: 1, which: [{ field: 'rarity', is: ['Smaragd'] }] })).toThrow(/no components/)
    expect(h.zone('draw')).toHaveLength(4)
  })

  it('lägger de framletade korten som en egen hög bredvid när delningen är det som frågar', () => {
    const h = new Harness(1, deck())
    const line = h.do(null, { v: 'split', pile: 'draw', at: 1, x: 40, y: 0, which: [{ field: 'typ', is: ['Varelse'] }] })
    const [pile] = h.piles()
    expect(pile).toBe(`z${line.seq}`)
    expect(h.zone(pile!).map((id) => h.state.components[id]!.cardRef)).toEqual(['dragon', 'knight', 'wizard'])
  })
})

// Åtgärderna är designerns och inga hemligheter: de står i regelboken och på bordet. De följer
// därför med zonvyn, till varje plats och till skärmen som sitter ingenstans.
describe('en zons egna åtgärder i projektionen', () => {
  it('når varje vy oförändrade, också för en hög ingen får se in i', () => {
    const base = deck()
    const actions = [{ id: 'a1', label: 'Vänd upp ett per spelare', steps: [{ v: 'split' as const, count: { of: 'seats' as const }, to: { at: 'beside' as const }, face: 'front' }] }]
    const h = new Harness(1, { ...base, zones: base.zones.map((z) => (z.id === 'draw' ? { ...z, actions } : z)) })
    for (const seat of ['A', 'B', null]) {
      const view = project(h.state, registry, seat)
      expect(view.zones.find((z) => z.id === 'draw')).toMatchObject({ mode: 'count', actions })
    }
  })
})

// Leken följer projektet mitt i en session (C7). Kolumnindexet måste följa med, annars reses en
// fråga mot den lek som inte spelas längre — och det syns inte, det svarar bara fel.
describe('en fråga efter ett versionsbyte (C7)', () => {
  it('reses mot den nya lekens kolumner och inte mot den gamlas', () => {
    const h = new Harness(1, deck())
    // I v1 är Riddare guld. I v2 har designern gjort om den till en diamant.
    h.do(null, {
      v: 'version.change',
      to: 'v2',
      components: ['dragon', 'knight', 'wizard', 'rogue'].map((cardRef) => ({ type: CARD, cardRef, zone: 'draw', face: 'back' as const })),
      cards: { dragon: { rarity: 'Diamant' }, knight: { rarity: 'Diamant' }, wizard: { rarity: 'Guld' }, rogue: { rarity: 'Brons' } },
    })
    h.do(null, { v: 'draw', from: 'draw', to: 'table', count: 1, which: [{ field: 'rarity', is: ['Diamant'] }], face: 'front' })

    const view = project(h.state, registry, null)
    expect(view.components.filter((c) => c.zone === 'table').map((c) => c.cardRef).sort()).toEqual(['dragon', 'knight'])
  })
})
