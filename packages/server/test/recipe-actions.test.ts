import { describe, expect, it } from 'vitest'
import { applyRecipe, emptySetup, openingSetup, SWEDISH_WORDS, type RecipeWords, type Setup } from '../src/recipe.js'

// Receptets blandning (#453).
//
// K21 står kvar: verktyget skeppar inga åtgärder och känner inga. Det här är receptet som
// föreslår en, precis som det föreslår en draghög och ett namn på den — och som allt annat
// receptet lägger tas den bort av designern och kommer aldrig tillbaka.
//
// Utan den började varje nytt spel med leken i dokumentets ordning: översta kortet i draghögen
// var tabellens första rad, på varje bord, varje gång.
const english: RecipeWords = {
  floor: 'Table',
  draw: 'Draw pile',
  drawShortcut: 'Put underneath',
  drawShuffle: 'Shuffle',
  discard: 'Discard pile',
  discardShortcut: 'Discard',
  mine: 'In front of {seat}',
  mineShortcut: 'In front of me',
  counters: 'Counters {seat}',
  hand: 'Hand',
}

const drawOf = (setup: Setup) => setup.zones.find((z) => z.id === setup.deckZone)!

describe('draghögen receptet lägger ut', () => {
  it('bär en blandning som körs vid start och står kvar i ringen, genom båda ingångarna', () => {
    for (const setup of [emptySetup(), openingSetup({ players: 4, counters: [{ name: 'Poäng', start: 0 }] })]) {
      const draw = drawOf(setup)
      // `both` och inte `start`: leken blandas när spelet börjar *och* ringen behåller sin
      // Blanda för mitten av en giv. Det är hela skälet att ratten har tre lägen och inte två.
      expect(draw.actions).toEqual([{ id: 'shuffle', label: SWEDISH_WORDS.drawShuffle, steps: [{ v: 'shuffle' }], when: 'both' }])
    }
  })

  it('namnger blandningen i designerns eget språk, ur ordlistan och aldrig av textbitar (A4)', () => {
    expect(SWEDISH_WORDS.drawShuffle).toBe('Blanda')
    for (const setup of [emptySetup(english), openingSetup({ players: 2, counters: [] }, english)]) {
      expect(drawOf(setup).actions?.[0]?.label).toBe('Shuffle')
    }
  })

  it('lägger den på draghögen och ingen annanstans, för starten läser bara högar', () => {
    const setup = openingSetup({ players: 4, counters: [{ name: 'Poäng', start: 0 }] })
    expect(setup.zones.filter((z) => (z.actions ?? []).length > 0).map((z) => z.id)).toEqual([setup.deckZone])
    expect(drawOf(setup).kind).toBe('pile')
  })
})

// Receptet är wizardens första drag och inget annat (B5, reviderat). Att vrida på ratten för
// platser eller räknare är inte ett nytt bord, så den som tagit bort blandningen — eller skrivit
// om dess steg — får inte den tillbaka av att sätta sig en till vid bordet.
describe('ett bord som redan står', () => {
  it('får ingen blandning tillagd av att platserna ändras', () => {
    const saved = openingSetup({ players: 2, counters: [] })
    const without = saved.zones.map((z) => (z.id === saved.deckZone ? { ...z, actions: undefined } : z))
    const after = applyRecipe({ ...saved, zones: without }, { players: 4, counters: [] })
    expect(drawOf(after).actions).toBeUndefined()
  })

  it('behåller blandningen precis som designern skrev om den', () => {
    const saved = openingSetup({ players: 2, counters: [] })
    const mine = { id: 'shuffle', label: 'Blanda om', steps: [{ v: 'shuffle' as const }], when: 'start' as const }
    const rewritten = saved.zones.map((z) => (z.id === saved.deckZone ? { ...z, actions: [mine] } : z))
    expect(drawOf(applyRecipe({ ...saved, zones: rewritten }, { players: 6, counters: [] })).actions).toEqual([mine])
  })
})
