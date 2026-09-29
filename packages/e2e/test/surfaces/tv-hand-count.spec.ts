import type { Page } from '@playwright/test'
import { TV_OVERSCAN } from '../../../web/src/table/camera.js'
import { TV } from '../../support/devices.js'
import { expect, test, type Fixtures } from '../../support/test.js'

// Handens antal ligger innanför fönstret på TV:n (#413, K9, K17, C5).
//
// Antalet stod förr på en bricka, `.byd-hand-count`, som hängde ut ur filten i skärmens egna
// pixlar. Vid 1920 × 1080 hängde platsen vid överkanten nio pixlar ovanför fönstret: siffran
// klipptes mitt itu och gick inte att läsa, vilket är hela poängen med den. På rummets TV står
// antalet nu på platsens skylt, intill platsens zoner och vänd mot bordets mitt (#573, beslut C),
// och kravet är detsamma: hela skylten innanför fönstret och utanför TV:ns overscan.
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
    const badges = [...document.querySelectorAll<HTMLElement>('[data-seat-plate]')].map((el) => {
      const r = el.getBoundingClientRect()
      return {
        zone: `hand:${el.dataset['seatPlate'] ?? '?'}`,
        count: (/(\d+) kort på hand/.exec(el.textContent ?? '')?.[1] ?? '').trim(),
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
  const tv = await open({ name: `tv-${win.width}`, viewport: win }, `${table.tvUrl}&lang=sv`)
  const dealer = await host(table)
  await dealer.send([{ v: 'shuffle', pile: 'draw' }])
  // Kort på hand vid *varje* kant, vilket är vad kriteriet begär: det är platsen vid överkanten som
  // klipptes, och den finns bara om någon sitter där och håller något.
  await dealer.send([{ v: 'deal', from: 'draw', to: ['hand:A', 'hand:B', 'hand:C', 'hand:D'], each: 5 }])
  await expect(tv.page.locator('[data-seat-plate]')).toHaveCount(4)
  const now = await settled(tv.page)
  // Inte tomt: fyra skyltar som var och en säger fem kort. En inneslutningsmätning på noll rutor är
  // grön för evigt och bevisar ingenting.
  expect(now.badges.map((b) => b.count).sort()).toEqual(['5', '5', '5', '5'])
  expect(now.cardShortPx).toBeGreaterThan(0)
  return now
}

test.describe('TV:ns antal på hand ligger innanför fönstret (#413, #573)', () => {
  for (const win of WINDOWS) {
    test(`vid ${win.name} ligger varje plats skylt helt innanför fönstret`, async ({ tableOf, open, host }) => {
      const now = await dealtTable({ tableOf, open, host }, win)
      for (const badge of now.badges) expect({ zone: badge.zone, ...outside(badge, now.window) }).toEqual({ zone: badge.zone, left: 0, top: 0, right: 0, bottom: 0 })
    })
  }

  // Utanför TV:ns overscan (#322, C5): att dra tillbaka bilden för att få ut ett antal ur bandet
  // kostade kortet under K9:s golv (#413). Skylten står inne på filten, vänd mot mitten, och bilden
  // behöver inte köpa luft åt den.
  test('står utanför TV:ns overscan vid 1920 × 1080', async ({ tableOf, open, host }) => {
    const tv = { width: 1920, height: 1080 }
    const now = await dealtTable({ tableOf, open, host }, tv)
    const safe = TV_OVERSCAN * Math.min(tv.width, tv.height)
    for (const b of now.badges) {
      const edge = Math.min(b.left, b.top, now.window.w - b.right, now.window.h - b.bottom)
      expect({ zone: b.zone, outside: edge >= safe - 0.5 }).toEqual({ zone: b.zone, outside: true })
    }
  })
})
