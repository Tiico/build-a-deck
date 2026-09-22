import type { Page } from '@playwright/test'
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

type Badge = { zone: string; side: string; count: string; left: number; top: number; right: number; bottom: number }
type Reading = { badges: Badge[]; window: { w: number; h: number }; cardShortPx: number; pile: { x: number; y: number } }

// Vad sidan har ritat: varje antalsbricka med sin ruta, fönstret den ligger i, och kortets
// kortsida på filten — det sista för att en inpassning som löser problemet genom att krympa bordet
// löser fel problem (#413:s tredje kriterium).
const read = (page: Page): Promise<Reading> =>
  page.evaluate(() => {
    const badges = [...document.querySelectorAll<HTMLElement>('.byd-hand-count')].map((el) => {
      const r = el.getBoundingClientRect()
      return {
        zone: el.closest<HTMLElement>('[data-zone]')?.dataset['zone'] ?? '?',
        // Åt vilket håll zonens inre linje ligger, som filten själv svarar: det är den kant av
        // brickan som vilar på linjen, och den kanten är den som ska stå still.
        side: el.closest<HTMLElement>('[data-count-side]')?.dataset['countSide'] ?? '?',
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
    // Högens mitt, som en fast punkt på filten: en hög ligger på en millimeter som inte ändras av
    // att någon drar kort. Med den och kortets kortsida kan en plats uttryckas i filtens egna
    // mått, och en växande hand — som skalar om hela bordet — kan inte läsas som en förflyttning.
    const p = pile.getBoundingClientRect()
    return {
      badges,
      window: { w: window.innerWidth, h: window.innerHeight },
      cardShortPx: Math.round(cardShortPx * 10) / 10,
      pile: { x: p.left + p.width / 2, y: p.top + p.height / 2 },
    }
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

  // Det tredje kriteriet: kortets kortsida minskar inte (#413).
  //
  // Det mäts som en skillnad och aldrig i absoluta pixlar. Vad ett kort blir på TV:n hänger på
  // filtens egen skärning, och ett pinnat kortmått här vore den här maskinens typsnitt och inte
  // produktens (#111, `felt-font`). Det som mäts är vad brickan *kostade*: samma bord, samma
  // fönster, en gång utan kort på hand och en gång med fem vid varje kant. Förslag A lägger
  // brickan innanför handens egen remsa, så inpassningen har ingenting nytt att hålla och talet
  // ska vara detsamma. Hade någon i stället löst det genom att dra ut kameran skulle kortet
  // krympa här, och det här säger ifrån.
  test('kostar filten ingenting: kortet är lika stort med fulla händer som med tomma', async ({ tableOf, open, host }) => {
    const table = await tableOf({ players: 4, cards: 24, copies: 2 })
    const tv = await open({ name: 'tv-1920', viewport: { width: 1920, height: 1080 } }, table.tvUrl)
    const dealer = await host(table)
    await dealer.send([{ v: 'shuffle', pile: 'draw' }])

    await expect(tv.page.locator('.byd-hand-count').first()).toHaveText('0')
    const empty = await settled(tv.page)

    await dealer.send([{ v: 'deal', from: 'draw', to: ['hand:A', 'hand:B', 'hand:C', 'hand:D'], each: 5 }])
    await expect(tv.page.locator('.byd-hand-count').first()).toHaveText('5')
    const full = await settled(tv.page)

    // Icke-vakuitet: det finns ett kort att mäta, och händerna blev verkligen fulla.
    expect(empty.cardShortPx).toBeGreaterThan(0)
    expect(empty.badges.map((b) => b.count).sort()).toEqual(['0', '0', '0', '0'])
    expect(full.badges.map((b) => b.count).sort()).toEqual(['5', '5', '5', '5'])
    expect(full.cardShortPx).toBe(empty.cardShortPx)
  })

  // Det som skilde A från B: brickan hänger på zonens linje och inte på fläkten, så den står
  // stilla medan korten kommer och går. I dag flyttade den sig med fläkten.
  test('står stilla medan handen växer', async ({ tableOf, open, host }) => {
    const table = await tableOf({ players: 4, cards: 24, copies: 2 })
    const tv = await open({ name: 'tv-1920', viewport: { width: 1920, height: 1080 } }, table.tvUrl)
    const dealer = await host(table)
    await dealer.send([{ v: 'shuffle', pile: 'draw' }])
    await dealer.send([{ v: 'deal', from: 'draw', to: ['hand:A', 'hand:B', 'hand:C', 'hand:D'], each: 5 }])
    await expect(tv.page.locator('.byd-hand-count')).toHaveCount(4)
    const five = await settled(tv.page)

    await dealer.send([{ v: 'deal', from: 'draw', to: ['hand:A', 'hand:B', 'hand:C', 'hand:D'], each: 5 }])
    await expect(tv.page.locator('.byd-hand-count').first()).toHaveText('10')
    const ten = await settled(tv.page)

    // Icke-vakuitet: fläkten växte verkligen, annars vore stillheten ingen bedrift.
    expect(five.badges.map((b) => b.count).sort()).toEqual(['5', '5', '5', '5'])
    expect(ten.badges.map((b) => b.count).sort()).toEqual(['10', '10', '10', '10'])

    // Platsen mätt från högen och i kortbredder, alltså i filtens egna millimeter. Brickan hänger
    // på en linje som står stilla där; att filten samtidigt skalas om av inpassningen är en annan
    // sak, och en mätning i skärmens pixlar hade blandat ihop de två.
    // Den kant som vilar på linjen, mätt från högen och i kortbredder — alltså i filtens egna
    // millimeter. Mitten duger inte: brickan blir bredare när fem blir tio, och en bricka som
    // växer utåt från en still linje skulle då läsas som en bricka som flyttat sig.
    const onTheLine = (b: Badge) => (b.side === 'above' ? b.top : b.side === 'below' ? b.bottom : b.side === 'left' ? b.left : b.right)
    const across = (b: Badge) => (b.side === 'above' || b.side === 'below' ? (b.left + b.right) / 2 : (b.top + b.bottom) / 2)
    const place = (r: Reading) =>
      r.badges
        .map((b) => ({
          zone: b.zone,
          side: b.side,
          line: Math.round(((onTheLine(b) - (b.side === 'above' || b.side === 'below' ? r.pile.y : r.pile.x)) / r.cardShortPx) * 100),
          along: Math.round(((across(b) - (b.side === 'above' || b.side === 'below' ? r.pile.x : r.pile.y)) / r.cardShortPx) * 100),
        }))
        .sort((a, b) => a.zone.localeCompare(b.zone))

    // Icke-vakuitet: filten svarade verkligen med fyra håll, ett per kant, och inte fyra gånger
    // samma. Utan det vore jämförelsen nedan blind för att alla brickor låg på samma sida.
    expect([...new Set(ten.badges.map((b) => b.side))].sort()).toEqual(['above', 'below', 'left', 'right'])

    // Inom en hundradels kortbredd, och inte på pricken. Linjen brickan hänger på står stilla i
    // *millimeter*; skärmen ritar den två gånger i två olika filtskalor, eftersom en växande hand
    // ändrar inpassningen, och de två avrundningarna till enhetspixlar behöver inte hamna på
    // samma hundradel. Marginalen är fem hundradels kortbredd — drygt två pixlar på den här
    // filten — och en bricka som verkligen vandrade med fläkten skulle röra sig kortbredder.
    const five_ = place(five)
    for (const now of place(ten)) {
      const then = five_.find((p) => p.zone === now.zone)!
      expect({ zone: now.zone, side: now.side }).toEqual({ zone: then.zone, side: then.side })
      expect(Math.abs(now.line - then.line), `${now.zone}: linjen flyttade sig ${Math.abs(now.line - then.line)} hundradels kortbredd`).toBeLessThanOrEqual(5)
      expect(Math.abs(now.along - then.along), `${now.zone}: brickan flyttade sig ${Math.abs(now.along - then.along)} hundradels kortbredd längs kanten`).toBeLessThanOrEqual(5)
    }
  })
})
