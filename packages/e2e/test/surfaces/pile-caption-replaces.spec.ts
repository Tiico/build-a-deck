import type { APIRequestContext, Page } from '@playwright/test'
import type { Intent } from '@byd/protocol'
import { deckFromProject } from '@byd/server'
import { setupFromProject } from '@byd/server/doc'
import { spelkortDoc } from '../../../server/scripts/spelkort.js'
import { join, tableOf, type Table } from '../../support/api.js'
import { PHONE, SMALL_TV } from '../../support/devices.js'
import type { Host } from '../../support/host.js'
import { expect, test } from '../../support/test.js'

// Zonnamnen och skyltarna läggs ut igen när kasthögens bildtext byter bredd (#886).
//
// Bildtexten (#771) står under en hög medan dess översta kort saknar bild, och den är lika bred som
// kortets namn, upp till 10 em. Zonnamnen (#685, `placeNames`) och skyltarna på rummets TV (#683,
// `placePlates`) räknar den som ett ord att gå fri från — men bara den bildtext som stod där när
// filten lades ut. Ett kort med längre namn som läggs på högen efteråt gör bildtexten bredare, och
// ett namn eller en skylt som stod fritt bredvid den korta stod då under den långa.
//
// Mätt på den byggda appen i rektanglar, med varje korts bild på väg (`/faces` svarar 202, som när
// renderingen arbetar), så att bildtexten står där hela tiden.

const SHORT = 'Duel'
const LONG = 'Last Train Out of Town'
const titled = (title: string) => [{ field: 'title', is: [title] }]

type Geometry = { x: number; y: number; w: number; h: number; rot: number }

type Reading = {
  caption: { text: string; width: number } | null
  /** Zonnamn och skyltar vars ruta möter bildtextens. */
  onCaption: string[]
  /** Zonnamn som är kapade: ett namn som flyttar undan får inte köpa det med sina bokstäver. */
  cut: string[]
}

const read = (page: Page): Promise<Reading> =>
  page.evaluate(() => {
    const felt = document.querySelector('[data-table]')
    if (!felt) throw new Error('ingen filt att mäta på')
    const shown = (el: Element): DOMRect | null => {
      for (let e: Element | null = el; e && e !== felt; e = e.parentElement) {
        const s = getComputedStyle(e)
        if (s.display === 'none' || s.visibility === 'hidden') return null
      }
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0 ? r : null
    }
    const cut = [...felt.querySelectorAll<HTMLElement>('.byd-zone > span')].filter((el) => shown(el) && el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent ?? '')
    const cap = felt.querySelector('.byd-pile[data-zone="discard"] .byd-pile-caption')
    const c = cap ? shown(cap) : null
    if (!cap || !c) return { caption: null, onCaption: [], cut }
    const meet = (r: DOMRect) => r.left < c.right - 0.5 && c.left < r.right - 0.5 && r.top < c.bottom - 0.5 && c.top < r.bottom - 0.5
    const onCaption: string[] = []
    for (const el of felt.querySelectorAll<HTMLElement>('.byd-zone > span, [data-seat-plate]')) {
      const r = shown(el)
      if (r && meet(r)) onCaption.push(el.dataset['seatPlate'] ? `skylt ${el.dataset['seatPlate']}` : `namn «${el.textContent}»`)
    }
    return { caption: { text: cap.textContent ?? '', width: Math.round(c.width) }, onCaption, cut }
  })

// Avläsningen när bilden står stilla: samma rutor några renderingssteg i rad. TV:ns kamera glider
// till sin ram (#325), och appen lägger ut namn och skyltar igen när något av dem byter storlek.
async function settled(page: Page): Promise<Reading> {
  const frames = () => page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(ok, 0)))))
  const where = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-table] > .byd-zone, [data-table] > .byd-zone > span, [data-seat-plate], .byd-pile-caption, .byd-card[data-component]')].map((el) => {
        const r = el.getBoundingClientRect()
        return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join()
      }),
    )
  let last = JSON.stringify(await where())
  let still = 0
  for (let i = 0; i < 120; i++) {
    await frames()
    const now = JSON.stringify(await where())
    still = now === last ? still + 1 : 0
    if (still >= 2) return read(page)
    last = now
  }
  throw new Error('filten stannade aldrig')
}

// Ett bord som det spelas, som #683 mättes på: fem kort i varje hand, tre i saloonen och ett framför
// varje plats — och på kasthögen kort med ett kort namn. Leken blandas inte, så att det
// långa namnet ligger kvar i den tills det läggs på kasthögen.
//
// Spelet har dessutom en egen yta, «Skrot», lagd intill kasthögen där dess bildtext når med det långa
// namnet men inte med det korta. Zonerna är formgivarens och får ligga var som helst (K2, B5); var
// ytan ligger är mätt per skärm, eftersom filtens skala och textens storlek är skärmens.
async function dealt(request: APIRequestContext, dealer: (t: Table) => Promise<Host>, scrap: Geometry): Promise<{ table: Table; dealer: Host }> {
  const doc = spelkortDoc(4)
  doc.setup.zones.push({ id: 'scrap', kind: 'area', name: 'Skrot', visibility: 'all', geometry: scrap })
  const table = await tableOf(request, setupFromProject(doc), deckFromProject(doc))
  const host = await dealer(table)
  // `which` tar varje kort som svarar på frågan, alltså alla exemplar med det namnet — och tas före
  // utdelningen, eftersom de ligger högt i den oblandade leken.
  await host.send([{ v: 'draw', from: 'draw', to: 'discard', count: 1, face: 'front', which: titled(SHORT) }])
  await host.send([{ v: 'deal', from: 'draw', to: table.seats.map((s) => `hand:${s}`), each: 5 }])
  await host.send([{ v: 'draw', from: 'draw', to: 'market', count: 3, face: 'front' }])
  for (const seat of table.seats) await host.send([{ v: 'draw', from: 'draw', to: `mine:${seat}`, count: 1, face: 'front' }])
  return { table, dealer: host }
}

const LONGER: Intent = { v: 'draw', from: 'draw', to: 'discard', count: 1, face: 'front', which: titled(LONG) }

// Skärmen med varje korts bild på väg.
async function waiting(page: Page): Promise<void> {
  await page.route('**/faces/**', (r) => r.fulfill({ status: 202, body: 'queued' }))
  await page.reload()
}

// Bildtexten med det korta namnet, och sedan med det långa: samma filt, fri från namn och skyltar
// båda gångerna. Icke-vakuitet: bildtexten står där båda gångerna, och den blev bredare.
async function lengthened(page: Page, dealer: Host, where: string): Promise<void> {
  const before = await settled(page)
  expect({ where, caption: before.caption?.text }).toEqual({ where, caption: SHORT })
  expect({ where, onCaption: before.onCaption, cut: before.cut }).toEqual({ where, onCaption: [], cut: [] })
  await dealer.send([LONGER])
  await expect(page.locator('.byd-pile[data-zone="discard"] .byd-pile-caption')).toHaveText(LONG)
  const after = await settled(page)
  expect(after.caption!.width).toBeGreaterThan(before.caption!.width * 2)
  expect({ where, onCaption: after.onCaption, cut: after.cut }).toEqual({ where, onCaption: [], cut: [] })
  expect({ where, laidOutAgain: await churn(page) }).toEqual({ where, laidOutAgain: 0 })
}

// Hur många gånger namnen och skyltarna skrivs om under en sekund på en filt som står still. Varje
// utläggning flyttar skyltarna hem innan den ställer dem, så en utläggning som utlöser sig själv —
// en bildtext som bytte storlek av att namnen lades ut — syns här som ändringar utan slut. `poke`
// byter en skylts text på riktigt, för att visa att räkningen ser en utläggning när en sker.
const churn = (page: Page, poke = false): Promise<number> =>
  page.evaluate(
    (poke) =>
      new Promise<number>((done) => {
        const felt = document.querySelector('[data-table]')!
        let n = 0
        const watch = new MutationObserver((records) => {
          n += records.filter((r) => (r.target as Element).matches('.byd-zone > span, [data-seat-plate]')).length
        })
        watch.observe(felt, { subtree: true, attributes: true, attributeFilter: ['style', 'data-form', 'data-plate-at'] })
        if (poke) felt.querySelector<HTMLElement>('[data-seat-plate] > span')!.style.letterSpacing = '3px'
        setTimeout(() => {
          watch.disconnect()
          done(n)
        }, 1000)
      }),
    poke,
  )

// Var varje zonnamn står, från sin egen zons övre vänstra hörn: kameran får glida emellan.
const names = (page: Page): Promise<Record<string, number[]>> =>
  page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll<HTMLElement>('[data-table] > .byd-zone > span')].map((el) => {
        const z = el.parentElement!.getBoundingClientRect()
        const r = el.getBoundingClientRect()
        return [el.textContent ?? '', [Math.round(r.left - z.left), Math.round(r.top - z.top)]]
      }),
    ),
  )

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')

// Var ett namn står i förhållande till sin egen zon: sidan, och inte pixlarna, som kameran flyttar.
const sides = (page: Page): Promise<Record<string, string>> =>
  page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll<HTMLElement>('[data-table] > .byd-zone > span')].map((el) => {
        const z = el.parentElement!.getBoundingClientRect()
        const r = el.getBoundingClientRect()
        const v = r.bottom <= z.top + 1 ? 'över' : r.top >= z.bottom - 1 ? 'under' : 'i höjd med'
        const h = r.right <= z.left + 1 ? 'vänster om' : r.left >= z.right - 1 ? 'höger om' : 'i bredd med'
        return [el.textContent ?? '', `${v}, ${h}`]
      }),
    ),
  )

test.describe('namn och skyltar läggs ut igen när kasthögens bildtext blir bredare (#886)', () => {
  test.use({ locale: 'sv-SE' })

  test('rummets TV 1280, fyra platser', async ({ request, open, host, player }) => {
    const { table, dealer } = await dealt(request, host, { x: 200, y: 60, w: 100, h: 40, rot: 0 })
    await player(table, { name: 'Ada', seat: 'A' })
    const { page } = await open(SMALL_TV, `${table.tvUrl}&lang=sv`)
    await waiting(page)
    await expect(page.locator('[data-seat-plate]')).toHaveCount(table.seats.length, { timeout: 20_000 })
    await settled(page)
    const home = await names(page)
    await lengthened(page, dealer, 'rummets TV 1280, fyra platser')
    // Icke-vakuitet: «Skrot» stod där den långa bildtexten kom, och flyttades.
    expect((await names(page))['Skrot']).not.toEqual(home['Skrot'])

    // Kameran zoomar med den långa bildtexten framme: ingenting byter sida (#43), och ingenting
    // läggs ut gång på gång.
    const before = await sides(page)
    const card = () => page.evaluate(() => document.querySelector('.byd-pile')!.getBoundingClientRect().width)
    const small = await card()
    await page.locator('[data-table]').hover()
    for (let i = 0; i < 6; i++) await page.keyboard.press('+')
    await settled(page)
    expect((await card()) / small).toBeGreaterThan(2)
    expect(await sides(page)).toEqual(before)
    expect(await churn(page)).toBe(0)
    // Icke-vakuitet: en skylt som byter storlek läggs ut igen, och räkningen ser det.
    expect(await churn(page, true)).toBeGreaterThan(0)
  })

  // Bildtexten försvinner när bilden kommer, och namnet går tillbaka dit det stod innan den långa kom.
  test('rummets TV 1280, fyra platser, när bilden kommer', async ({ request, open, host, player }) => {
    const { table, dealer } = await dealt(request, host, { x: 200, y: 60, w: 100, h: 40, rot: 0 })
    await player(table, { name: 'Ada', seat: 'A' })
    const { page } = await open(SMALL_TV, `${table.tvUrl}&lang=sv`)
    await waiting(page)
    await expect(page.locator('[data-seat-plate]')).toHaveCount(table.seats.length, { timeout: 20_000 })
    await settled(page)
    const home = await names(page)
    await lengthened(page, dealer, 'rummets TV 1280, fyra platser')
    expect((await names(page))['Skrot']).not.toEqual(home['Skrot'])
    await page.unroute('**/faces/**')
    await page.route('**/faces/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }))
    await expect(page.locator('.byd-pile[data-zone="discard"] .byd-pile-top img.byd-texture[data-state="ready"]')).toHaveCount(1, { timeout: 30_000 })
    const gone = await settled(page)
    expect(gone.caption).toBe(null)
    expect((await names(page))['Skrot']).toEqual(home['Skrot'])
    expect(await churn(page)).toBe(0)
  })

  test('observatören 390, fyra platser', async ({ request, open, host }) => {
    const { table, dealer } = await dealt(request, host, { x: 180, y: -75, w: 70, h: 30, rot: 0 })
    const eva = await join(request, table, { name: 'Eva' })
    const { page } = await open(PHONE, `${eva.observeUrl}&lang=sv`)
    await waiting(page)
    await expect(page.locator('.byd-pile[data-zone="discard"]')).toBeVisible({ timeout: 20_000 })
    await lengthened(page, dealer, 'observatören 390, fyra platser')
  })
})
