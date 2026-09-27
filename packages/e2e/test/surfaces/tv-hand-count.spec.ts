import type { Page } from '@playwright/test'
import { TV_AIR_PX } from '../../../web/src/table/fit.js'
import { TV } from '../../support/devices.js'
import { expect, test, type Fixtures } from '../../support/test.js'

// Handens antalsbricka ligger innanför fönstret på TV:n (#413, K9, K17, C5).
//
// Brickan, `.byd-hand-count`, är den enda sak på TV:n som hänger ut ur filten i skärmens egna
// pixlar i stället för i bordets millimeter, och den är det enda TV-lägets luft finns till för
// (`TV_AIR_PX`). Vid 1920 × 1080 hängde platsen vid överkanten nio pixlar ovanför fönstret:
// siffran klipptes mitt itu och gick inte att läsa, vilket är hela poängen med den.
//
// Måttet tas i Chromium på den byggda appen, för det är det enda som kan svara: brickan är text i
// pixlar ovanpå en fläkt i millimeter, och var de två hamnar i förhållande till varandra vet bara
// en motor som faktiskt har lagt ut sidan.
//
// Mätningen är geometrisk och aldrig i absoluta pixlar: brickans bredd är siffrans, och siffran
// sätts i vilket typsnitt maskinen nu råkar ha — CI:s Linux sätter den bredare än en Mac. Det som
// kontrolleras är därför inneslutning, alltså att rutan ligger innanför fönstrets, och ingenting
// om hur stor rutan blev.

/** Fönstren filtens grindar läses vid (#99, #413): de två TV-formaten och de två som ryms under. */
const WINDOWS = [
  { name: '1280 × 720', width: 1280, height: 720 },
  { name: '1366 × 768', width: 1366, height: 768 },
  { name: '1920 × 1080', ...TV.viewport },
  { name: '2560 × 1440', width: 2560, height: 1440 },
] as const

type Badge = { zone: string; count: string; left: number; top: number; right: number; bottom: number }
type Reading = { badges: Badge[]; window: { w: number; h: number }; cardShortPx: number }

// Vad sidan har ritat: varje antalsbricka med sin ruta, fönstret den ligger i, och kortets
// kortsida på filten — det sista för att en inpassning som löser problemet genom att krympa bordet
// löser fel problem (#413:s tredje kriterium).
const read = (page: Page): Promise<Reading> =>
  page.evaluate(() => {
    const badges = [...document.querySelectorAll<HTMLElement>('.byd-hand-count')].map((el) => {
      const r = el.getBoundingClientRect()
      return {
        zone: el.closest<HTMLElement>('[data-zone]')?.dataset['zone'] ?? '?',
        count: (el.textContent ?? '').trim(),
        left: Math.round(r.left * 10) / 10,
        top: Math.round(r.top * 10) / 10,
        right: Math.round(r.right * 10) / 10,
        bottom: Math.round(r.bottom * 10) / 10,
      }
    })
    // Kortets kortsida, som filten själv ritar den: en hög är ett kort brett (`CARD_MM.w`), och en
    // hög ligger alltid på bordet. Det är talet K9 sätter golvet för, och det som en inpassning som
    // löser problemet genom att krympa bordet skulle betala med.
    const pile = document.querySelector<HTMLElement>('.byd-pile')
    if (!pile) throw new Error('det finns ingen hög här att mäta kortets kortsida på')
    const cardShortPx = pile.getBoundingClientRect().width
    return { badges, window: { w: window.innerWidth, h: window.innerHeight }, cardShortPx: Math.round(cardShortPx * 10) / 10 }
  })

// Avläsningen när bilden står stilla: samma svar två gånger, ett renderingssteg isär. TV:ns kamera
// glider till sin ram (#325), så en mätning tagen i samma andetag som sidan laddades är en mätning
// av en bild på väg någon annanstans.
async function settled(page: Page): Promise<Reading> {
  let last = await read(page)
  for (let i = 0; i < 80; i++) {
    await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => setTimeout(ok, 0))))
    const now = await read(page)
    if (JSON.stringify(now) === JSON.stringify(last)) return now
    last = now
  }
  throw new Error(`bilden stannade aldrig: ${JSON.stringify(last)}`)
}

/** Hur många pixlar av rutan som ligger utanför fönstret, åt vart och ett av de fyra hållen. */
const outside = (b: Badge, w: { w: number; h: number }) => ({
  left: Math.max(0, -b.left),
  top: Math.max(0, -b.top),
  right: Math.max(0, b.right - w.w),
  bottom: Math.max(0, b.bottom - w.h),
})

/** Ett bord med fyra platser och kort på hand vid var och en av kanterna, sett på en TV. */
async function dealtTable({ tableOf, open, host }: Pick<Fixtures, 'tableOf' | 'open' | 'host'>, win: { width: number; height: number }): Promise<Reading> {
  const table = await tableOf({ players: 4, cards: 24, copies: 2 })
  const tv = await open({ name: `tv-${win.width}`, viewport: win }, table.tvUrl)
  const dealer = await host(table)
  await dealer.send([{ v: 'shuffle', pile: 'draw' }])
  // Kort på hand vid *varje* kant, vilket är vad kriteriet begär: det är platsen vid överkanten som
  // klipptes, och den finns bara om någon sitter där och håller något.
  await dealer.send([{ v: 'deal', from: 'draw', to: ['hand:A', 'hand:B', 'hand:C', 'hand:D'], each: 5 }])
  await expect(tv.page.locator('.byd-hand-count')).toHaveCount(4)
  const now = await settled(tv.page)
  // Inte tomt: fyra brickor som var och en säger fem kort. En inneslutningsmätning på noll rutor är
  // grön för evigt och bevisar ingenting.
  expect(now.badges.map((b) => b.count).sort()).toEqual(['5', '5', '5', '5'])
  expect(now.cardShortPx).toBeGreaterThan(0)
  return now
}

test.describe('TV:ns handbricka ligger innanför fönstret (#413)', () => {
  for (const win of WINDOWS) {
    test(`vid ${win.name} ligger varje antalsbricka helt innanför fönstret`, async ({ tableOf, open, host }) => {
      const now = await dealtTable({ tableOf, open, host }, win)
      for (const badge of now.badges) expect({ zone: badge.zone, ...outside(badge, now.window) }).toEqual({ zone: badge.zone, left: 0, top: 0, right: 0, bottom: 0 })
    })
  }

  // Det tredje kriteriet: kortets kortsida minskar inte mer än vad brickans höjd kostar (#413).
  //
  // Det mäts inte som ett kortmått i pixlar. Vad ett kort blir på TV:n hänger på hur bred klungan i
  // hörnet råkar bli, och den är satt i filtens egen skärning — ett pinnat kortmått här vore den
  // här maskinens typsnitt och inte produktens (#111, `felt-font`). Det som mäts är i stället vad
  // inpassningen *betalade*: brickan hänger från en linje på filten, och luften förbi den linjen är
  // en pillerbredd, `TV_AIR_PX`. Ligger den linje som kom närmast kanten ungefär sin egen luft in,
  // har bilden köpt brickan och ingenting mer; hade någon löst det genom att krympa bordet i stället
  // skulle brickorna ligga långt inne på skärmen, och det här säger ifrån.
  //
  // Linjen och inte rutan, eftersom linjen är millimeter gånger skala och rutan är siffrans bredd i
  // maskinens typsnitt. Övre gränsen är rundlig med flit: bilden binds inte alltid av brickorna —
  // är ramen smal nog binder spelets bredd i stället, och då blir luften på höjden ramens form och
  // inte ett överköp. En pillerbredd till är taket, och ett överköp värt namnet är långt över det.
  test('köper brickans luft och inte flera: den linje som kom närmast kanten ligger ungefär sin egen luft in', async ({ tableOf, open, host }) => {
    const now = await dealtTable({ tableOf, open, host }, { width: 1920, height: 1080 })
    // Linjen varje bricka hänger från är dess inre kant, den mot fläkten: brickan hänger utåt från
    // den, uppåt vid norra platsen och nedåt vid alla andra (#84).
    const closest = Math.round(Math.min(...now.badges.map((b) => (b.top < now.window.h / 2 ? b.bottom : now.window.h - b.top))) * 10) / 10
    expect({ closest, given: closest >= TV_AIR_PX - 0.5, andNoMore: closest <= 2 * TV_AIR_PX }).toEqual({ closest, given: true, andNoMore: true })
  })
})
