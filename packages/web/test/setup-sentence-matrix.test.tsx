// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { ActionStep, ActionTarget, ZoneAction, ZoneBeside } from '@byd/protocol'
import type { Zone } from '@byd/server/doc'
import { ZoneActions } from '../src/editor/ZoneActions.js'
import { Language, translate, type Lang } from '../src/i18n/index.js'
import { sv, type Key } from '../src/i18n/sv.js'
import { en } from '../src/i18n/en.js'
import { projectDoc } from './project-doc.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// Meningen designern verkligen läser, för varje steg gånger varje platsform (#285).
//
// Två nycklar bar var sin preposition och möttes: «Flytta hela högen till» plus «i Draghög» gav
// «Flytta hela högen till i Draghög», och engelskans «Move the whole pile to in Draghög». Varje
// del för sig var riktig, och därför sa inget test ifrån — sviten läste rutornas rader och
// stegens delar, aldrig sammansättningen. Det är den här matrisen som saknades.
//
// Den läser den färdiga meningen ur panelen och inte katalogen, av samma skäl: det som ska
// stämma är det som står på skärmen när ett steg och en plats satts ihop.

// Platsformerna, allihop. «Bredvid» är fyra och inte en, för sidan är högens egen (K21) och varje
// sida är en egen sträng i katalogen.
type Place = { key: string; to: ActionTarget; beside: ZoneBeside }
const PLACES: readonly Place[] = [
  { key: 'bredvid vänster', to: { at: 'beside' }, beside: 'left' },
  { key: 'bredvid höger', to: { at: 'beside' }, beside: 'right' },
  { key: 'bredvid ovanför', to: { at: 'beside' }, beside: 'above' },
  { key: 'bredvid under', to: { at: 'beside' }, beside: 'below' },
  { key: 'varje hand', to: { at: 'hands' }, beside: 'left' },
  { key: 'min hand', to: { at: 'mine' }, beside: 'left' },
  { key: 'en zon', to: { at: 'zone', zone: 'discard' }, beside: 'left' },
]

// Stegen som har en plats i sig. `shuffle` och `flipTop` har ingen och står utanför matrisen.
const STEPS = {
  split: (to: ActionTarget): ActionStep => ({ v: 'split', count: { of: 'number', n: 1 }, to, face: 'front' }),
  deal: (to: ActionTarget): ActionStep => ({ v: 'deal', each: { of: 'number', n: 1 }, to, face: 'front' }),
  take: (to: ActionTarget): ActionStep => ({ v: 'take', which: [], to, face: 'front' }),
  movePile: (to: ActionTarget): ActionStep => ({ v: 'movePile', to }),
}
type Verb = keyof typeof STEPS

// Panelen med ett enda steg i sig, läst som den mening den är.
function sentence(lang: Lang, verb: Verb, place: Place): string {
  const doc = projectDoc()
  const draw = doc.setup.zones.find((z) => z.id === 'draw')!
  const action: ZoneAction = { id: 'a1', label: 'Åtgärd', steps: [STEPS[verb](place.to)] }
  const zone: Zone = { ...draw, beside: place.beside, actions: [action] }
  const view = render(
    <Language lang={lang}>
      <ZoneActions doc={doc} zone={zone} onPatch={() => undefined} onClose={() => undefined} />
    </Language>,
  )
  const text = (view.container.querySelector('ol li .byd-sentence') as HTMLElement).textContent ?? ''
  view.unmount()
  return text
}

const each = (verb: Verb, lang: Lang, expected: Record<string, string>) =>
  it.each(PLACES.map((p) => [p.key, p] as const))(`${verb} × %s`, (_key, place) => {
    expect(sentence(lang, verb, place)).toBe(expected[place.key])
  })

// «Flytta hela högen till i Draghög» — fyndet självt. Prepositionen hör till en av nycklarna och
// inte till båda, och valet är att platsformen bär hela frasen: steget säger bara vilken form det
// vill ha, `{at}` eller `{to}`, och katalogen svarar med en färdig fras.
describe('Flytta hela högen', () => {
  describe('på svenska', () => {
    each('movePile', 'sv', {
      'bredvid vänster': 'Flytta hela högen till vänster om högen',
      'bredvid höger': 'Flytta hela högen till höger om högen',
      'bredvid ovanför': 'Flytta hela högen ovanför högen',
      'bredvid under': 'Flytta hela högen under högen',
      'varje hand': 'Flytta hela högen till varje hand',
      'min hand': 'Flytta hela högen till min hand',
      'en zon': 'Flytta hela högen till Kasthög',
    })
  })

  describe('på engelska', () => {
    each('movePile', 'en', {
      'bredvid vänster': "Move the whole pile to the pile's left",
      'bredvid höger': "Move the whole pile to the pile's right",
      'bredvid ovanför': 'Move the whole pile above the pile',
      'bredvid under': 'Move the whole pile below the pile',
      'varje hand': 'Move the whole pile to every hand',
      'min hand': 'Move the whole pile to my hand',
      'en zon': 'Move the whole pile to Kasthög',
    })
  })
})

// Samma fel en gång till, i ett steg issuet inte räknade upp: «Dela ut 1 till» plus «i varje
// hand». Det är vad som gör det till en fråga om strukturen och inte till en felstavning — två
// steg hade hunnit skriva sin egen preposition innan någon läste den färdiga meningen.
describe('Dela ut', () => {
  describe('på svenska', () => {
    each('deal', 'sv', {
      'bredvid vänster': 'Dela ut 1 till vänster om högen, uppvända',
      'bredvid höger': 'Dela ut 1 till höger om högen, uppvända',
      'bredvid ovanför': 'Dela ut 1 ovanför högen, uppvända',
      'bredvid under': 'Dela ut 1 under högen, uppvända',
      'varje hand': 'Dela ut 1 till varje hand, uppvända',
      'min hand': 'Dela ut 1 till min hand, uppvända',
      'en zon': 'Dela ut 1 till Kasthög, uppvända',
    })
  })

  describe('på engelska', () => {
    each('deal', 'en', {
      'bredvid vänster': "Deal 1 to the pile's left, face up",
      'bredvid höger': "Deal 1 to the pile's right, face up",
      'bredvid ovanför': 'Deal 1 above the pile, face up',
      'bredvid under': 'Deal 1 below the pile, face up',
      'varje hand': 'Deal 1 to every hand, face up',
      'min hand': 'Deal 1 to my hand, face up',
      'en zon': 'Deal 1 to Kasthög, face up',
    })
  })
})

// De två stegen som redan var riktiga. De står här för att matrisen ska vara en matris: det som
// lät buggen stå var att bara somliga sammansättningar någonsin lästes, och «somliga» valdes av
// den som skrev testet. Här väljs de av vokabuläret.
describe('Ta av högen', () => {
  describe('på svenska', () => {
    each('split', 'sv', {
      'bredvid vänster': 'Ta 1 från högen och lägg dem uppvända till vänster om högen',
      'bredvid höger': 'Ta 1 från högen och lägg dem uppvända till höger om högen',
      'bredvid ovanför': 'Ta 1 från högen och lägg dem uppvända ovanför högen',
      'bredvid under': 'Ta 1 från högen och lägg dem uppvända under högen',
      'varje hand': 'Ta 1 från högen och lägg dem uppvända i varje hand',
      'min hand': 'Ta 1 från högen och lägg dem uppvända i min hand',
      'en zon': 'Ta 1 från högen och lägg dem uppvända i Kasthög',
    })
  })

  describe('på engelska', () => {
    each('split', 'en', {
      'bredvid vänster': "Take 1 off the pile and lay them face up to the pile's left",
      'bredvid höger': "Take 1 off the pile and lay them face up to the pile's right",
      'bredvid ovanför': 'Take 1 off the pile and lay them face up above the pile',
      'bredvid under': 'Take 1 off the pile and lay them face up below the pile',
      'varje hand': 'Take 1 off the pile and lay them face up in every hand',
      'min hand': 'Take 1 off the pile and lay them face up in my hand',
      'en zon': 'Take 1 off the pile and lay them face up in Kasthög',
    })
  })
})

describe('Leta fram', () => {
  describe('på svenska', () => {
    each('take', 'sv', {
      'bredvid vänster': 'Leta fram varje kort där vilket kort som helst och lägg dem uppvända till vänster om högen',
      'bredvid höger': 'Leta fram varje kort där vilket kort som helst och lägg dem uppvända till höger om högen',
      'bredvid ovanför': 'Leta fram varje kort där vilket kort som helst och lägg dem uppvända ovanför högen',
      'bredvid under': 'Leta fram varje kort där vilket kort som helst och lägg dem uppvända under högen',
      'varje hand': 'Leta fram varje kort där vilket kort som helst och lägg dem uppvända i varje hand',
      'min hand': 'Leta fram varje kort där vilket kort som helst och lägg dem uppvända i min hand',
      'en zon': 'Leta fram varje kort där vilket kort som helst och lägg dem uppvända i Kasthög',
    })
  })

  describe('på engelska', () => {
    each('take', 'en', {
      'bredvid vänster': "Search out every card where any card at all and lay them face up to the pile's left",
      'bredvid höger': "Search out every card where any card at all and lay them face up to the pile's right",
      'bredvid ovanför': 'Search out every card where any card at all and lay them face up above the pile',
      'bredvid under': 'Search out every card where any card at all and lay them face up below the pile',
      'varje hand': 'Search out every card where any card at all and lay them face up in every hand',
      'min hand': 'Search out every card where any card at all and lay them face up in my hand',
      'en zon': 'Search out every card where any card at all and lay them face up in Kasthög',
    })
  })
})

// ── Regeln, och att matrisen är en matris ─────────────────────────────────────────────────────

// Prepositionerna som verkligen står i de här meningarna, plus de närmaste grannar ett nytt steg
// eller en ny platsform skulle nå efter. Listan är inte språkets alla — den är vad en vakt behöver
// för att säga ifrån om två av dem hamnar bredvid varandra.
const PREPOSITIONS: Record<Lang, readonly string[]> = {
  sv: ['till', 'i', 'på', 'från', 'om', 'under', 'över', 'ovanför', 'nedanför', 'vid', 'av', 'med', 'åt', 'hos', 'ur', 'mot', 'bland', 'genom'],
  en: ['to', 'in', 'on', 'at', 'of', 'off', 'from', 'by', 'above', 'below', 'under', 'over', 'into', 'onto', 'with', 'beside', 'near'],
}

// De par av prepositioner som står omedelbart efter varandra i en mening, som «till i» eller
// «to in». Ett tomt svar är en mening som går att läsa högt.
const doubled = (lang: Lang, text: string): string[] => {
  const words = text.toLocaleLowerCase(lang).split(/[^\p{L}\p{N}'’]+/u).filter((w) => w !== '')
  const isPreposition = (w: string) => PREPOSITIONS[lang].includes(w)
  return words.flatMap((word, i) => (i > 0 && isPreposition(words[i - 1]!) && isPreposition(word) ? [`${words[i - 1]} ${word}`] : []))
}

describe('ingen mening sätter två prepositioner efter varandra', () => {
  const combinations = (['sv', 'en'] as const).flatMap((lang) =>
    (Object.keys(STEPS) as Verb[]).flatMap((verb) => PLACES.map((place) => [lang, verb, place.key, place] as const)),
  )

  it.each(combinations)('%s: %s × %s', (lang, verb, _key, place) => {
    const text = sentence(lang, verb, place)
    expect(doubled(lang, text), text).toEqual([])
  })

  // Kontrollen, och hela skälet att de femtiosex tomma listorna ovan betyder något: regeln fångar
  // verkligen felet i den form produkten visade det, på båda språken.
  it('skulle ha sagt ifrån om meningarna som stod i produkten', () => {
    expect(doubled('sv', 'Flytta hela högen till i Draghög')).toEqual(['till i'])
    expect(doubled('sv', 'Flytta hela högen till till vänster om högen')).toEqual(['till till'])
    expect(doubled('sv', 'Dela ut 1 till i varje hand, uppvända')).toEqual(['till i'])
    expect(doubled('en', 'Move the whole pile to in Draghög')).toEqual(['to in'])
    expect(doubled('en', 'Deal 1 to in every hand, face up')).toEqual(['to in'])
  })
})

// Att matrisen täcker hela vokabuläret och inte ett urval någon råkade skriva ner. Det var urvalet
// som lät buggen stå: varje del lästes, aldrig varje sammansättning.
describe('matrisen täcker katalogen', () => {
  const keysUnder = (prefix: string) => Object.keys(sv).filter((k) => k.startsWith(prefix)).sort()

  it('läser varje steg i vokabuläret — de två utan plats står utanför, och säger själva varför', () => {
    const placeless = ['setup.step.shuffle', 'setup.step.flipTop']
    expect(keysUnder('setup.step.')).toEqual([...Object.keys(STEPS).map((v) => `setup.step.${v}`), ...placeless].sort())
    // Och de två står utanför för att de inte har något hål att sätta en plats i, inte för att
    // någon glömde dem.
    for (const key of placeless) for (const lang of ['sv', 'en'] as const) expect(translate(lang, key as Key)).not.toMatch(/\{(at|to)\}/)
  })

  it('läser varje platsform, i båda formerna, på båda språken', () => {
    // Sju former gånger `at` och `to`: det är hela platsvokabuläret, och matrisen går igenom det
    // två gånger — `at` genom Ta av högen och Leta fram, `to` genom Dela ut och Flytta hela högen.
    expect(keysUnder('setup.place.')).toHaveLength(PLACES.length * 2)
    expect(Object.keys(en).filter((k) => k.startsWith('setup.place.')).sort()).toEqual(keysUnder('setup.place.'))
  })

  it('lämnar inget steg som bär sin egen preposition till ett hål som redan har en', () => {
    // Hålet heter numera `{at}` eller `{to}` och aldrig `{place}`: det gamla namnet sa ingenting om
    // vilken form meningen ville ha, och det var precis det som inte gick att kontrollera.
    for (const lang of ['sv', 'en'] as const)
      for (const key of keysUnder('setup.step.')) expect(translate(lang, key as Key), key).not.toContain('{place}')
  })
})
