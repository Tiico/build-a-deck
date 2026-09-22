// Hur stor Mörks brödtext faktiskt blir (#420, E6, K20).
//
// Prototypen mätte en sak på vägen som inte stod i felrapporten: ramen Mörk ber om 8,5 punkter,
// och på den maskin prototypen kördes på steg `fitInDocument` ner den till 8,0 för att få plats
// i `system-ui`. Hur mycket den steg ner någon annanstans visste ingen, och det är hela felet i
// miniatyr — kortets grad berodde på vilken dator som råkade rita det.
//
// Just därför pinnas inte det gamla läget här. Ett prov som påstod «8,0 med `system-ui`» hade
// varit ett påstående om den här Macens ansikte, och CI ritar det i ett annat; det är precis den
// fällan `text-placement.test.tsx` är skriven runt. Det som går att mäta lika på varje maskin är
// det nya läget, och det är det som mäts: filen är exakt den bygget redan bär för filten (K20),
// så sättningen kommer ur bytesen och inte ur vad maskinen råkar ha.
//
// Bara Mörk. De två andra ramarna hämtar sina familjer ur katalogen när ett spel skapas (L27),
// och ingen av dem ligger som fil i repot — att mäta dem här hade betytt att skeppa dem, vilket
// är det B3 säger nej till.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser } from 'playwright'
import { CARD_STANDARD_63x88 } from '@byd/engine'
import { compile, fitInDocument, type FitReport } from '@byd/template'
import { hostDocument } from '@byd/render'
import { FRAMES, type Field, type Frame } from '../src/wizard/frames.js'

// Den funktion editorn importerar och renderaren bär in på sidan, körd på sidan. Transpileraren
// lindar inre funktioner i en `__name`-hjälpare sidan inte har, så källan körs i en scope som
// definierar den — precis som renderaren gör det.
const FIT = `(() => { const __name = (fn) => fn; return (${fitInDocument.toString()})(document) })()`

const FIELDS: Field[] = [
  { key: 'title', label: 'Titel', kind: 'text' },
  { key: 'cost', label: 'Kostnad', kind: 'number' },
  { key: 'body', label: 'Text', kind: 'text' },
]

// Två kort med riktig svensk regeltext: frågan är om brödtext på ett 63 mm-kort får plats, och en
// kort rad svarar inte på den.
const KORT = [
  { title: 'Skogsvakten', cost: 3, body: 'När Skogsvakten kommer i spel: dra ett kort.\n\nSå länge den står kvar får dina djur +1 i styrka.' },
  { title: 'Gläntans ljus', cost: 1, body: 'Lägg en markör här. Vid rundans slut flyttas den till ett annat kort du äger.' },
]

function darkFrame(): Frame {
  const found = FRAMES.find((frame) => frame.id === 'dark')
  if (!found) throw new Error('the dark frame is gone')
  return found
}
const dark = darkFrame()
const FAMILY = dark.font.family

// Filen som redan reser med bygget, buren in i sidan som bytes och inte som ett namn.
const file = readFileSync(join(import.meta.dirname, '..', 'src', 'fonts', 'roboto-condensed-latin-wght-normal.woff2'))
const fonts = { [FAMILY]: { stack: `"${FAMILY}", sans-serif`, src: `data:font/woff2;base64,${file.toString('base64')}` } }

let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser.close()
}, 60_000)

type Measured = { fit: FitReport[]; faces: string[]; asked: string[]; drawn: string }

async function measure(row: Record<string, string | number>): Promise<Measured> {
  const compiled = compile({ type: CARD_STANDARD_63x88, face: dark.front(FIELDS), row, icons: {}, fonts })
  const page = await browser.newPage({ viewport: { width: 800, height: 900 } })
  try {
    await page.setContent(hostDocument(compiled), { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    return {
      fit: (await page.evaluate(FIT)) as FitReport[],
      // Ansiktena sidan verkligen har. `document.fonts.check` duger inte: den svarar ja också för
      // en familj sidan aldrig fått, eftersom den räknar systemets egna som tillgängliga — och en
      // svit som mäter en fallback och kallar den för ett skeppat typsnitt mäter ingenting.
      faces: await page.evaluate(() => [...document.fonts].map((face) => `${face.family}:${face.status}`)),
      // Graden ramen *ber om*, som den står i markupen. Utan den skulle en ram som sänkte sin egen
      // brödtext till 8,0 för att slippa krympa läsas som en framgång.
      asked: await page.evaluate(() => [...document.querySelectorAll('[data-element][data-fit]')].map((el) => `${(el as HTMLElement).dataset['element']}:${(el as HTMLElement).dataset['sizePt']}`)),
      // Och att det är *brödtexten* som står i familjen. Att ansiktet finns på sidan räcker inte:
      // rubriken ensam får hit det, och då hade en brödtext kvar i `system-ui` mätts som om den
      // bar ansiktet.
      drawn: await page.evaluate(() => getComputedStyle(document.querySelector('[data-element="body"]') as HTMLElement).fontFamily),
    }
  } finally {
    await page.close()
  }
}

describe('Mörk’s body text, measured in the face the game carries (#420)', () => {
  let measured: Measured[]
  beforeAll(async () => {
    measured = await Promise.all(KORT.map((kort) => measure({ ...kort })))
  }, 120_000)

  it('is set in a face the page really holds, so what is measured is the game and not the machine', () => {
    expect(measured.map((m) => m.faces)).toEqual([[`${FAMILY}:loaded`], [`${FAMILY}:loaded`]])
    for (const m of measured) expect(m.drawn.startsWith(`"${FAMILY}"`), `the body is drawn in ${m.drawn}`).toBe(true)
  }, 60_000)

  it('still asks for 8.5 pt, and keeps it on every card instead of stepping down to fit', () => {
    for (const [i, m] of measured.entries()) {
      expect(m.asked, `kort ${i + 1}`).toContain('body:8.5')
      const body = m.fit.find((report) => report.element === 'body')
      expect(body, `kort ${i + 1} has no body to measure`).toBeTruthy()
      expect(body?.sizePt, `kort ${i + 1}: ${KORT[i]?.title}`).toBe(8.5)
      expect(body?.overflow).toBe(false)
    }
  }, 60_000)
})
