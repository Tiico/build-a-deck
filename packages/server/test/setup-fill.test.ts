import { describe, expect, it } from 'vitest'
import { setupFromProject } from '../src/setup.js'
import { openingSetup } from '../src/recipe.js'
import type { ProjectDoc } from '../src/projects.js'

// Frågestyrt startinnehåll. Vilka kort som börjar var är designerns fråga över sin egen tabell
// och inte verktygets åsikt: en zon bär en fråga, och raderna som svarar på den läggs där i
// stället för i leken. En zon utan fråga tar inga kort, och det som ingen fråga tar hamnar i
// leken som förut.
const doc = (zones: ProjectDoc['setup']['zones']): Pick<ProjectDoc, 'rows' | 'setup'> => ({
  rows: [
    { id: 'drake', fields: { antal: 1, rarity: 'Diamant', typ: 'Varelse' } },
    { id: 'riddare', fields: { antal: 1, rarity: 'Guld', typ: 'Varelse' } },
    { id: 'fälla', fields: { antal: 2, rarity: 'Diamant', typ: 'Fälla' } },
  ],
  setup: { zones, seats: [], floor: 'table', deckZone: 'draw' },
})

const rect = { x: 0, y: 0, w: 63, h: 88, rot: 0 }
const base: ProjectDoc['setup']['zones'] = [
  { id: 'draw', kind: 'pile', name: 'Draghög', visibility: 'none', geometry: rect },
  { id: 'table', kind: 'area', name: 'Spelyta', visibility: 'all', geometry: rect },
]

const where = (setup: ReturnType<typeof setupFromProject>, cardRef: string): string[] =>
  setup.components.filter((c) => c.cardRef === cardRef).map((c) => c.zone)

describe('en zons fråga om vilka kort som börjar där', () => {
  it('lägger varje rad som svarar på frågan i zonen, med ett kort per antal, och resten i leken', () => {
    const setup = setupFromProject(
      doc([
        ...base,
        { id: 'market', kind: 'pile', name: 'Marknaden', visibility: 'all', geometry: rect, fill: [{ field: 'rarity', is: ['Diamant'] }] },
      ]),
    )
    expect(where(setup, 'drake')).toEqual(['market'])
    expect(where(setup, 'fälla')).toEqual(['market', 'market'])
    expect(where(setup, 'riddare')).toEqual(['draw'])
  })
})

// Vilken sida av en hög som är "bredvid den" (K21) är designerns val i editorn, och bordet som
// spelas måste få det med sig: annars läser filten vänster medan meningen i editorn säger höger.
describe('vilken sida av högen som är bredvid den', () => {
  it('följer med till bordet som spelas, och en hög utan val bär inget', () => {
    const setup = setupFromProject(
      doc([{ id: 'draw', kind: 'pile', name: 'Draghög', visibility: 'none', geometry: rect, beside: 'right' }, base[1]!]),
    )
    expect(setup.zones.find((z) => z.id === 'draw')!.beside).toBe('right')
    expect(setup.zones.find((z) => z.id === 'table')!).not.toHaveProperty('beside')
  })
})

// Frågan ställs vid bordet också, och då måste motorn veta vad korten heter i sina egna
// kolumner. Den vetskapen byggs här, en gång per kortrad, av samma funktion som lägger ut leken.
describe('vad bordet får veta om kortens kolumner', () => {
  it('bär med sig varje rads fält, så att en fråga går att resa mitt i ett spel', () => {
    const setup = setupFromProject(doc(base))
    expect(setup.cards).toEqual({
      drake: { antal: '1', rarity: 'Diamant', typ: 'Varelse' },
      riddare: { antal: '1', rarity: 'Guld', typ: 'Varelse' },
      fälla: { antal: '2', rarity: 'Diamant', typ: 'Fälla' },
    })
  })
})

// Högens bottenkort (K23, #331): uppställningen bär valet till motorn, som lägger kortet sist i
// högen på den sida designern valde — vart i leken raden än står.
describe('högens bottenkort', () => {
  it('följer med zonen, och bordet börjar med kortet sist i högen på sin sida', async () => {
    const { initialState, STANDARD_TYPES, TypeRegistry } = await import('@byd/engine')
    const setup = setupFromProject(doc([{ ...base[0]!, bottom: { cardRef: 'drake', face: 'front' } }, base[1]!]))
    expect(setup.zones.find((z) => z.id === 'draw')?.bottom).toEqual({ cardRef: 'drake', face: 'front' })
    expect(setup.zones.find((z) => z.id === 'table')).not.toHaveProperty('bottom')
    const state = initialState('v1', setup, new TypeRegistry(STANDARD_TYPES))
    const order = state.zones['draw']!.order.map((id) => state.components[id]!)
    expect(order.map((c) => c.cardRef)).toEqual(['riddare', 'fälla', 'fälla', 'drake'])
    expect(order.at(-1)?.face).toBe('front')
  })
})

// Receptets blandning, hela vägen fram (#453). Åtgärden står i dokumentet; det här är att den
// också *kommer fram* — ett fält ingen bär vidare är ett fält ingen läser.
describe('draghögens blandning på väg till bordet', () => {
  it('följer med uppställningen ut ur receptet, och bara högar bär den', () => {
    const setup = setupFromProject({ rows: [], setup: openingSetup({ players: 2, counters: [] }) })
    expect(setup.zones.find((z) => z.id === 'draw')?.actions).toEqual([{ id: 'shuffle', label: 'Blanda', steps: [{ v: 'shuffle' }], when: 'both' }])
    expect(setup.zones.filter((z) => z.actions !== undefined).map((z) => z.id)).toEqual(['draw'])
  })

  it('bär ingen åtgärd alls från en zon som inte har någon, i stället för en tom lista', () => {
    const setup = setupFromProject(doc(base))
    expect(setup.zones.find((z) => z.id === 'draw')).not.toHaveProperty('actions')
  })
})
