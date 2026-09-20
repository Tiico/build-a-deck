import { globSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contrastRatio, cssCustomProperties, cssDeclaredUnder } from '../src/player/contrast.js'

// Skrollisten är en kontroll och ritas därför av tjänsten och inte av webbläsaren (#321).
//
// Den har två delar: spåret den går i och tummen som dras. Tummen är det man tar tag i, alltså en
// grafisk komponent, och 1.4.11 ger den 3:1 mot det som ligger intill — vilket är spåret. Det
// mäts här, per rum och i båda tillstånden, eftersom ett färgpar som klarar gränsen i ett rum
// inte bär med sig den botten det mättes mot till nästa (#281, #287).
const read = (file: string): string => readFileSync(join(import.meta.dirname, '..', 'src', file), 'utf8')

const A11Y = read('a11y.css')
const BUTTONS = read('buttons.css')

// Rummen, och var vart och ett av dem deklarerar de färger dess skrolltoken pekar på. Bindningen
// står i `a11y.css` bredvid själva definitionen, precis som knappspråkets sex token står bredvid
// rollerna i `buttons.css` (L13); färgen den pekar på står i rummets eget ark.
const ROOMS: Record<string, { selector: string; sheets: string[] }> = {
  editorn: { selector: '.byd-editor', sheets: [read('editor/editor.css'), BUTTONS] },
  filten: { selector: '.byd-table', sheets: [read('table/table.css'), BUTTONS] },
  // Telefonen är fyra rötter och inte en: spelarens sida, `/online`, `/observe` och enkäten, som
  // alla öppnar samma ark och därför är samma rum (L13). Att binda bara `.byd-player` var precis
  // felet knappspråket redan gjort en gång.
  telefonen: { selector: '.byd-player', sheets: [read('player/player.css'), BUTTONS] },
  'telefonen på /online': { selector: '.byd-online', sheets: [read('player/player.css'), BUTTONS] },
  'telefonen som åskådare': { selector: '.byd-observer', sheets: [read('player/player.css'), BUTTONS] },
  enkäten: { selector: '.byd-survey', sheets: [read('player/player.css'), BUTTONS] },
  guiden: { selector: '.byd-wizard', sheets: [read('wizard/wizard.css'), BUTTONS] },
  // Regelboken är ett rum som öppnas inuti ett annat — luckan hänger på filten, på TV:n och i
  // editorns förhandsvisning — och den är papper där alla tre är mörka. Ett rum ärver inte sitt
  // omland, så boken binder sina egna token; det är också hela skälet att den räknas som ett rum.
  regelboken: { selector: '.byd-rules-panel', sheets: [read('rules/rules.css')] },
  // Rummet under alla andra. Kontosidorna, platsväljaren och statussidorna binder ingenting av
  // sitt eget, och det är dem `:root` svarar för — liksom varje yta som råkar hamna utanför alla
  // rum. En grund som bara gäller «resten» är fortfarande en grund och mäts som en.
  grundrummet: { selector: ':root', sheets: [] },
}

// De tre färgerna ett rum binder, med varje `var()` följd hela vägen fram till en färg. En token
// som inte löser ut är inget svar: `var(--byd-något-som-inte-finns)` ritas av webbläsaren som
// ingenting alls, och det är just det här issuet fanns för att få bort.
function scrollColours(room: { selector: string; sheets: string[] }): { track: string; thumb: string; hover: string } {
  const env = cssCustomProperties([...room.sheets, A11Y].map((css) => cssDeclaredUnder(css, room.selector)).join(''))
  const pick = (name: string): string => {
    const value = env.get(name)
    if (value === undefined) throw new Error(`${room.selector} binder ingen ${name}`)
    if (value.includes('var(')) throw new Error(`${room.selector}: ${name} löser inte ut till en färg (${value})`)
    return value
  }
  return { track: pick('--byd-scroll-track'), thumb: pick('--byd-scroll-thumb'), hover: pick('--byd-scroll-thumb-hover') }
}

// Varje ark tjänsten har, så att en ny yta med en list av sitt eget hittas här och inte på skärmen.
const SHEETS = globSync('**/*.css', { cwd: join(import.meta.dirname, '..', 'src') })
  .filter((file) => !file.includes('prototype'))
  .map((file) => ({ file, css: read(file) }))

describe('en enda definition, och den står i basarket (#321)', () => {
  it('hittar arken alls, så vakten inte går igenom på att inte ha läst något', () => {
    expect(SHEETS.length).toBeGreaterThan(8)
    expect(SHEETS.map((s) => s.file)).toContain('a11y.css')
  })

  it('säger listens bredd och färg en gång, på varje element', () => {
    const shared = cssDeclaredUnder(A11Y, '*')
    expect(shared).toContain('scrollbar-width: thin')
    expect(shared).toContain('scrollbar-color: var(--byd-scroll-thumb) var(--byd-scroll-track)')
  })

  // Och ingen annanstans. De spridda `scrollbar-width: thin` var hela fyndet i issuet: åtta ytor
  // som var för sig hade bestämt att listen skulle vara smal, och ingen som hade bestämt vad den
  // skulle se ut som. En yta som vill något eget om sin list säger `none`, och det är ett annat
  // besked — det mäts strax nedan.
  it.each(SHEETS.filter((s) => s.file !== 'a11y.css').map((s) => s.file))('och %s upprepar den inte', (file) => {
    expect(SHEETS.find((s) => s.file === file)!.css).not.toContain('scrollbar-width: thin')
  })
})

// De tre ytorna som medvetet inte har någon list, och skälet var aldrig att listen var ful. Kronan
// och filterrälsen rullar i sidled inuti en rad som ska läsas som en rad (#128, #130), och
// väggens remsa är en stapel där varje grupps höjd är dess andel av leken — en list i den vore en
// fjärde kolumn i en bild som redan räknar tre. Alla tre har en väg vidare som inte är listen:
// pilen, tonandet i kanten, tangentbordet. Den gemensamma definitionen står på `*` och är (0,0,0),
// så de vinner över den — men det är en tyst sak att luta sig mot, och därför mäts den.
const GÖMDA: Record<string, { selector: string; css: string }> = {
  'kronan under skrivbordsbredd': { selector: '.byd-crown', css: read('editor/editor.css') },
  'filterrälsen i kronan': { selector: '.byd-crown-rail-scroll', css: read('editor/editor.css') },
  'väggens remsa': { selector: '.byd-wall-rail', css: read('editor/editor.css') },
}

describe('ytorna som medvetet inte har någon list (#128, #130, #179)', () => {
  it.each(Object.entries(GÖMDA))('döljer den fortfarande för standarden i %s', (_what, { selector, css }) => {
    expect(cssDeclaredUnder(css, selector)).toContain('scrollbar-width: none')
  })

  // Och på webkit-vägen, som är ett annat besked i ett annat språk: `scrollbar-width: none` säger
  // ingenting till en Safari som inte kan standarden, och där är det pseudoelementet som får bära
  // det. Båda, annars gömmer ytan sin list i hälften av webbläsarna.
  it.each(Object.entries(GÖMDA))('och för webkit-fallbacken i %s', (_what, { selector, css }) => {
    expect(cssDeclaredUnder(css, `${selector}::-webkit-scrollbar`)).toContain('display: none')
  })
})

describe('skrollistens tumme mot sitt spår (1.4.11, #321)', () => {
  it.each(Object.entries(ROOMS))('syns i vila i %s', (_room, where) => {
    const { track, thumb } = scrollColours(where)
    expect(contrastRatio(thumb, track)).toBeGreaterThanOrEqual(3)
  })

  it.each(Object.entries(ROOMS))('syns under pekaren i %s', (_room, where) => {
    const { track, hover } = scrollColours(where)
    expect(contrastRatio(hover, track)).toBeGreaterThanOrEqual(3)
  })

  // Och tillståndet får inte vara tyst: en tumme som ser likadan ut under pekaren säger inte att
  // den går att ta tag i. Den ska stiga, inte bara hålla sig över gränsen.
  it.each(Object.entries(ROOMS))('stiger under pekaren i %s', (_room, where) => {
    const { track, thumb, hover } = scrollColours(where)
    expect(contrastRatio(hover, track)).toBeGreaterThan(contrastRatio(thumb, track))
  })
})
