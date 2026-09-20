import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contrastRatio } from '../src/player/contrast.js'

// Efterledet i platsrutan (#255) är verktygets ord inuti designerns rad, och det syns på att det är
// dämpat. Dämpat betyder mörkare än raden omkring, och mörkare har en botten: under 4,5:1 är ordet
// inte längre läsbart och dämpningen har ätit upp det den skulle säga.
//
// Regeln finns för att formen kopierades ordagrant ur zonlistan, där den är felfri, in i en ruta
// vars hover-botten är en helt annan färg (#281). En ordagrann kopia bär inte med sig bottnen den
// mättes mot, och rutan öppnas med musen — pekaren *ligger* i listan medan man väljer, så den
// hovrade raden är det normala läget här och inte ett undantag.
//
// Ramen mäts här också, och på båda ytorna (#287). Den är inte utsmyckning: hela skälet att «Bricka»
// valdes framför «Tyst» i #255 är att ramen säger att bokstaven är verktygets ord och inte något
// designern döpt zonen till. En ram under 3:1 syns inte, och då *är* Bricka den avvisade Tyst.
//
// Kommentarerna först, för en regels kropp läses nedan som «allt fram till nästa klammer» och en
// deklaration som föregås av en kommentar skulle annars inte gå att hitta. Bara deklarationer
// räknas ändå: en kommentar kan berätta historien om en färg men aldrig sätta den.
const css = readFileSync(join(import.meta.dirname, '..', 'src/editor/editor.css'), 'utf8').replaceAll(/\/\*[\s\S]*?\*\//g, '')

// Färgen en regel sätter, läst ur arket självt. Regeln söks ordagrant, så att en omskrivning som
// flyttar färgen någon annanstans fäller provet i stället för att tyst sluta mäta något.
//
// `inherited` är vad kaskaden ger när regeln inte säger något: en hovrad rad som inte skriver om
// ramen bär formens egen. Utan det svaret hade provet kraschat på den saknade deklarationen och
// sagt «regeln finns inte» där frågan är «syns ramen», vilket är två olika besked.
function declared(selector: string, property: string, inherited?: string): string {
  const rule = css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`))
  if (!rule) throw new Error(`editor.css har ingen regel för ${selector}`)
  const found = rule[1]!.match(new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+)`))
  if (!found && inherited !== undefined) return inherited
  if (!found) throw new Error(`${selector} sätter ingen ${property}`)
  return found[1]!.trim()
}

// Färgen ur en `border`-kortform, som är bredd, form och färg i en följd. Det är färgen som mäts,
// och en kortform utan färg i ärver radens och är därför inget svar.
function hexIn(value: string): string {
  const found = value.match(/#[0-9a-f]{3,8}\b/i)
  if (!found) throw new Error(`ingen färg i "${value}"`)
  return found[0]
}

// Rutans egen botten, som raden är genomskinlig mot.
const RESTING = declared('.byd-slot-pop', 'background')
const HOVER = declared('.byd-slot-pop button:hover, .byd-slot-chips button:hover', 'background')
const ROW = declared('.byd-slot-pop button', 'color')

// Brickan i vila, och brickan när raden bär pekaren. Två färger, eftersom bottnen är två.
const BADGE: Record<string, { ink: string; ground: string }> = {
  'i vila': { ink: declared('.byd-slot-pop em', 'color'), ground: RESTING },
  'under pekaren': { ink: declared('.byd-slot-pop button:hover em', 'color'), ground: HOVER },
}

describe('efterledet i platsrutan (#255, #281)', () => {
  it.each(Object.entries(BADGE))('är läsbart %s', (_var, { ink, ground }) => {
    expect(contrastRatio(ink, ground)).toBeGreaterThanOrEqual(4.5)
  })

  // Och det får inte lösas genom att brickan blir radens egen text. Då bär bara ramen skillnaden
  // mellan verktygets ord och designerns, och en ram ensam är ett tunnare besked än en ram och en
  // dämpning tillsammans.
  it.each(Object.entries(BADGE))('är fortfarande dämpat mot radens egen text %s', (_var, { ink, ground }) => {
    expect(contrastRatio(ink, ground)).toBeLessThan(contrastRatio(ROW, ground))
  })
})

// Zonlistans rad är genomskinlig och står därför på editorns eget krom — utom under pekaren, och
// utom i en utfälld zonfamilj, som har en botten av sitt eget (#175). Platsrutan har sin egen mörka
// botten och en blå rad under pekaren. Bottnarna är alltså fyra, och ramen ritas på allihop.
const CHROME = declared('.byd-editor', '--byd-editor-chrome-bg')
const OPEN_FAMILY = declared(".byd-setup-zones li[data-open='true']", 'background')
const ZONE_HOVER = declared('.byd-setup-name:hover', 'background')

// Varje ram arket ritar runt ett efterled, med bottnen den hamnar på och ordet den ramar in.
// Avvikelsens egen ram står med: den skriver över både färgen och ramen och är alltså en andra ram,
// som kan vara osynlig för sig (#287).
const ZONE_LINE = hexIn(declared('.byd-setup-name em', 'border'))
const ZONE_WORD = declared('.byd-setup-name em', 'color')
const POP_LINE = hexIn(declared('.byd-slot-pop em', 'border'))
const FRAME: Record<string, { line: string; ground: string; word: string }> = {
  'i zonlistan': { line: ZONE_LINE, ground: CHROME, word: ZONE_WORD },
  'i zonlistan under pekaren': { line: ZONE_LINE, ground: ZONE_HOVER, word: ZONE_WORD },
  'i en utfälld zonfamilj': { line: ZONE_LINE, ground: OPEN_FAMILY, word: ZONE_WORD },
  'runt en avvikelse': { line: declared('.byd-setup-name em[data-differ]', 'border-color', ZONE_LINE), ground: CHROME, word: declared('.byd-setup-name em[data-differ]', 'color') },
  'runt en avvikelse under pekaren': { line: declared('.byd-setup-name em[data-differ]', 'border-color', ZONE_LINE), ground: ZONE_HOVER, word: declared('.byd-setup-name em[data-differ]', 'color') },
  'i platsrutan': { line: POP_LINE, ground: RESTING, word: declared('.byd-slot-pop em', 'color') },
  'i platsrutan under pekaren': { line: declared('.byd-slot-pop button:hover em', 'border-color', POP_LINE), ground: HOVER, word: declared('.byd-slot-pop button:hover em', 'color') },
}

describe('ramen runt efterledet (#287)', () => {
  // 1.4.11: en kant som bär betydelse är en grafisk komponent och ska nå 3:1. Den här bär hela
  // motiveringen för formen, så under 3:1 är den inte en dämpad ram utan ingen ram alls — och då är
  // «Bricka» i praktiken «Tyst», som prototypen i #255 avrådde från.
  it.each(Object.entries(FRAME))('syns %s', (_var, { line, ground }) => {
    expect(contrastRatio(line, ground)).toBeGreaterThanOrEqual(3)
  })

  // Och den får inte synas genom att bli lika stark som ordet den ramar in. En ram som är starkare
  // än sin text är en knappruta, och en lista av knapprutor är väggen #230 gjorde sig av med.
  it.each(Object.entries(FRAME))('är fortfarande tystare än ordet den ramar in %s', (_var, { line, ground, word }) => {
    expect(contrastRatio(line, ground)).toBeLessThan(contrastRatio(word, ground))
  })
})
