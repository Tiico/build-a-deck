import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { fitInDocument, type FitReport } from '@byd/template'
import { logIn } from '../../support/api.js'

// Guidens förhandsvisning anpassar brödtexten som editorn gör (#688, E2, E6, L8).
//
// Speltestet satte en nio raders brödtext i Krönika: guiden lät den stå kvar i 8,5 pt och klippte
// nionde raden, Mall satte samma text i 7,5 pt och hel. Båda går genom samma `CardPreview` och
// samma `fitInDocument`; skillnaden var *när*. Guiden anpassade texten i samma ögonblick som den
// ritades, och då hade temats brödtextfamilj inte kommit än — den börjar hämtas först när en text
// står i den. Texten mättes i reservtypsnittet, och när den riktiga familjen landade med andra mått
// mätte ingen om.
//
// Det går inte att se i jsdom, som inte lägger ut något, och inte i en ögonblicksbild av markupen,
// där ingenting lever som kunde anpassa om. Därför mäts den byggda guiden medan den kör.
//
// Google besvaras här och nås inte, som i `wizard-frame-face.spec.ts`. Filen hålls kvar tills
// texten står i kortet, så att den första anpassningen säkert görs innan ansiktet finns — det är
// ordningen speltestet råkade ut för, gjord säker i stället för sannolik.
//
// Ansiktet som till sist landar är Oswald, ett smalt ansikte, och texten är för lång för 8,5 pt i
// varje vanligt reservtypsnitt (Times här, DejaVu på CI:s Linux) men ryms i Oswald. Det är samma fel
// åt andra hållet — kortet visar en annan grad än det spelet får — och det enda håll där provet inte
// beror på vems reservtypsnitt som råkar vara bredast: ett ansikte som är bredare än *alla* maskiners
// reserv finns inte bland de filer repot har, men ett som är smalare gör det.
const GOOGLE = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//
const NARROW = readFileSync(join(import.meta.dirname, '..', '..', '..', '..', 'docs', 'ux-audits', '2026-09-22', 'typsnitt', 'oswald.woff2'))

// Samma funktion editorn importerar och renderaren bär in i sidan, körd på sidan (som i
// `packages/web/test/wizard-frame-fit.test.tsx`): vad en ny anpassning säger när allt har landat.
const FIT = `(() => { const __name = (fn) => fn; return (${fitInDocument.toString()})(document.querySelector('#wizard-live')) })()`

const BODY =
  'När du spelar det här kortet: dra två kort och kasta ett. Om du har fler än tre kort på hand får du lägga ett under draghögen. ' +
  'Motståndaren till vänster visar sitt översta kort, och du väljer om det ska ligga kvar. Den här texten är med flit längre än ' +
  'rutan rymmer i ett brett typsnitt, för att se vad som händer med den. Varje spelare som har ett kort med en sköld får behålla ' +
  'ett kort extra på handen till nästa runda, och den som har flest kvar när högen tar slut vinner.'

test.use({ viewport: { width: 1280, height: 800 }, locale: 'sv-SE' })

type Body = { sizePx: number; clipped: boolean }

const body = (page: Page) =>
  page.evaluate((): Body => {
    const el = document.querySelector<HTMLElement>('#wizard-live [data-element="body"]')
    if (!el) throw new Error('the card has no body')
    return { sizePx: Number.parseFloat(getComputedStyle(el).fontSize), clipped: el.scrollHeight > el.clientHeight + 0.5 }
  })

test('fits the body text again once the theme’s face has landed, as the editor and the print do (#688)', async ({ page }) => {
  let release: () => void = () => undefined
  const held = new Promise<void>((resolve) => (release = resolve))
  await page.route(GOOGLE, async (route) => {
    const url = route.request().url()
    if (!url.includes('googleapis.com')) {
      await held
      return route.fulfill({ status: 200, contentType: 'font/woff2', body: NARROW })
    }
    const family = new URL(url).searchParams.get('family')?.split(':')[0] ?? ''
    const slug = family.toLowerCase().replace(/ /g, '-')
    return route.fulfill({ status: 200, contentType: 'text/css', body: `/* latin */\n@font-face { font-family: '${family}'; src: url(https://fonts.gstatic.com/s/${slug}/latin.woff2) format('woff2'); }\n` })
  })
  await logIn(page.request)
  await page.goto('/new', { waitUntil: 'load' })
  await page.getByRole('button', { name: 'Klassisk', exact: true }).click()
  await page.getByRole('button', { name: 'Välj temat Krönika' }).click()
  // The sheet has answered once the file is asked for, and the file is held: the card says so (#687).
  await expect(page.locator('.byd-wizard-preview').getByText('Hämtar typsnitten för Krönika …')).toBeVisible()
  await page.getByLabel('kort 1 Regeltext').fill(BODY)

  // Före ansiktet: texten är anpassad i reservtypsnittet, och har fått krympa under 8,5 pt.
  const merriweather = () => page.evaluate(() => [...document.fonts].filter((f) => f.family.replace(/"/g, '') === 'Merriweather').map((f) => f.status))
  expect(await merriweather()).not.toContain('loaded')
  const before = await body(page)
  expect(before.sizePx, 'the text must be too long for 8.5 pt in the fallback, or nothing here is measured').toBeLessThan((8.5 * 4) / 3 - 0.01)

  release()
  await expect.poll(merriweather).toContain('loaded')
  await page.evaluate(() => document.fonts.ready.then(() => undefined))

  // Efter: ansiktet är smalare, så samma text står nu större — den grad editorn och trycket ger
  // den, och inte den som gällde ett typsnitt kortet aldrig bär.
  await expect.poll(async () => (await body(page)).sizePx, `före ansiktet: ${JSON.stringify(before)}`).toBeGreaterThan(before.sizePx)
  const settled = await body(page)
  expect(settled.clipped).toBe(false)

  // Och en ny anpassning nu, med allt på plats, säger samma sak som kortet redan visar: det är den
  // editorn och renderaren gör, så kortet i guiden är kortet spelet får.
  const fresh = ((await page.evaluate(FIT)) as FitReport[]).find((r) => r.element === 'body')
  expect(fresh?.overflow).toBe(false)
  expect(await body(page)).toEqual(settled)
})
