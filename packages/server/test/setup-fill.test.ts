import { describe, expect, it } from 'vitest'
import { setupFromProject } from '../src/setup.js'
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
