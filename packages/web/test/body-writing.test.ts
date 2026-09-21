// Att skriva i body-cellen, ställt till en riktig webbläsare (#324, L39).
//
// `contenteditable` i jsdom är inte `contenteditable` i en webbläsare: där finns ingen markör att
// flytta, inget `execCommand` och ingen vilja att lägga till en `<span style>` eller ett hårt
// mellanslag. Ett prov på skrivandet i jsdom vore därför grönt utan att betyda något — samma slags
// fel som jsdom-uppladdningarna som skickade «[object Blob]» och passerade. Så frågan ställs här
// till Chromium, till de funktioner som ska ta emot vad webbläsaren än gör: `fillBody` in,
// `tillStrang` ut, och ingenting annat som rör elementen.
//
// Modulen bakas med projektets egen bundlare och körs i sidan, så det som prövas är den kod som
// skeppas och inte en avskrift av den.
//
// Varje prov här har en egen budget och inte vitests fem sekunder: att öppna en webbläsare är
// mest av arbetet innan provet gjort någonting, vilket är samma skäl som hookarna fick sina
// sextio för. `browser-suite-budget.test.ts` håller den andra änden av det paret.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser, type Page } from 'playwright'
import { build } from 'vite'

let browser: Browser
let bundle: string
beforeAll(async () => {
  const out = await build({
    logLevel: 'silent',
    configFile: false,
    build: { write: false, minify: false, lib: { entry: 'src/editor/body.ts', formats: ['iife'], name: 'BYD', fileName: 'body' } },
  })
  const chunks = Array.isArray(out) ? out[0]!.output : 'output' in out ? out.output : []
  bundle = (chunks[0] as { code: string }).code
  browser = await chromium.launch()
}, 120_000)
afterAll(async () => {
  await browser.close()
}, 60_000)

// En skrivyta som den i cellen: samma element, samma fyllning, samma väg ut.
async function open(text: string): Promise<Page> {
  const page = await browser.newPage()
  await page.setContent('<!doctype html><meta charset="utf-8"><div id="skriv" contenteditable style="font: 12px/1.45 sans-serif"></div>')
  await page.addScriptTag({ content: bundle })
  await page.evaluate((text) => BYD.fillBody(document.getElementById('skriv')!, text), text)
  await page.focus('#skriv')
  return page
}

const strang = (page: Page) => page.evaluate(() => BYD.tillStrang(document.getElementById('skriv')!).text)
const markup = (page: Page) => page.evaluate(() => document.getElementById('skriv')!.innerHTML)

// Markören satt runt ett ord i den första textnoden, som en hand gör med musen.
const select = (page: Page, from: number, to: number) =>
  page.evaluate(
    ({ from, to }) => {
      const el = document.getElementById('skriv')!
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      const node = walker.nextNode()!
      const range = document.createRange()
      range.setStart(node, from)
      range.setEnd(node, to)
      const selection = getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)
    },
    { from, to },
  )

describe('att skriva i body-cellen, i en riktig webbläsare (L39)', () => {
  it('skriver text som text', async () => {
    const page = await open('')
    try {
      await page.keyboard.type('Flyger tyst över skogen')
      expect(await strang(page)).toBe('Flyger tyst över skogen')
    } finally {
      await page.close()
    }
  }, 60_000)

  it('gör tre tecken feta som `**tre**` och inget mer', async () => {
    const page = await open('När kommer den i spel')
    try {
      await select(page, 0, 3)
      await page.evaluate(() => document.execCommand('bold'))
      expect(await strang(page)).toBe('**När** kommer den i spel')
      await select(page, 0, 3)
      await page.evaluate(() => document.execCommand('italic'))
      expect(await strang(page)).toBe('***När*** kommer den i spel')
    } finally {
      await page.close()
    }
  }, 60_000)

  it('gör Enter till ett nytt stycke och `- ` till en punktlista', async () => {
    const page = await open('Först')
    try {
      await page.keyboard.press('End')
      await page.keyboard.press('Enter')
      await page.keyboard.type('Sedan')
      expect(await strang(page)).toBe('Först\n\nSedan')

      await page.keyboard.press('Enter')
      await page.keyboard.type('- ')
      // Samma funktion som cellen kallar på varje `input`.
      expect(await page.evaluate(() => BYD.openBullet(document.getElementById('skriv')!))).toBe(true)
      await page.keyboard.type('en punkt')
      await page.keyboard.press('Enter')
      await page.keyboard.type('en till')
      expect(await strang(page)).toBe('Först\n\nSedan\n\n- en punkt\n- en till')
    } finally {
      await page.close()
    }
  }, 60_000)

  it('låter ingenting webbläsaren hittar på nå strängen', async () => {
    const page = await open('Gör så här')
    try {
      // Det `execCommand` gör åt en är sitt eget: Chromium kan skriva `<b>`, `<span style>` eller
      // en `<div>` där ett stycke väntades, och den lägger ett hårt mellanslag där ett vanligt
      // annars fallit bort.
      await page.evaluate(() => document.execCommand('styleWithCSS', false, 'true'))
      await select(page, 4, 6)
      await page.evaluate(() => document.execCommand('bold'))
      await page.keyboard.press('End')
      await page.keyboard.type('   ')
      const html = await markup(page)
      expect(html).toMatch(/style=|&nbsp;/)
      const text = await strang(page)
      expect(text).toBe('Gör **så** här   ')
      // Skrivet som `\u00a0` och inte som tecknet självt: ett hårt mellanslag i källan är
      // osynligt för den som läser den.
      expect(text).not.toMatch(/[<>\u00a0]/)
    } finally {
      await page.close()
    }
  }, 60_000)

  it('säger var markören står i strängens tecken, så klammern hittar rätt', async () => {
    const page = await open('Betala för att dra')
    try {
      await select(page, 7, 7)
      await page.keyboard.type('{')
      const seen = await page.evaluate(() => {
        const el = document.getElementById('skriv')!
        const caret = getSelection()!
        return BYD.tillStrang(el, { node: caret.anchorNode!, offset: caret.anchorOffset })
      })
      expect(seen.text).toBe('Betala {för att dra')
      expect(seen.at).toBe(8)
    } finally {
      await page.close()
    }
  }, 60_000)

  it('bär en symbol som `{namn}` ut ur elementen', async () => {
    const page = await open('Betala {droppe} för att dra')
    try {
      expect(await page.evaluate(() => document.querySelectorAll('.byd-body-symbol').length)).toBe(1)
      // Chippet visar sitt namn och bär `{namn}` i sitt attribut; det är attributet strängen får.
      expect(await strang(page)).toBe('Betala {droppe} för att dra')
      await page.keyboard.press('End')
      await page.keyboard.type(' ett kort')
      expect(await strang(page)).toBe('Betala {droppe} för att dra ett kort')
    } finally {
      await page.close()
    }
  }, 60_000)
})

declare global {
  // Modulen som den bakas in i sidan.
  const BYD: typeof import('../src/editor/body.js')
}
