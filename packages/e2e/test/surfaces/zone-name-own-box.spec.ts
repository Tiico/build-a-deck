import type { APIRequestContext, Page } from '@playwright/test'
import { deckFromProject } from '@byd/server'
import { setupFromProject } from '@byd/server/doc'
import { spelkortDoc } from '../../../server/scripts/spelkort.js'
import { join, logIn, makeProjectOf, tableOf, type Table } from '../../support/api.js'
import { PHONE, type Device } from '../../support/devices.js'
import { expect, test, type Client, type Fixtures } from '../../support/test.js'

// Ett zonnamn står aldrig i en annan zons ruta (#685, K19, beslut G 2026-10-03).
//
// K19 ställer ett namn utanför sin egen zon, bort från närmaste kant och mot platsens mitt. Men
// zonerna är formgivarens (K2, B5) och får ligga var som helst, så den sidan kan vara grannens:
// med fyra platser ligger saloonen 30 mm under «Framför B», och saloonens namn stod i Framför B
// och Framför B:s i saloonen — på TV:n, i bordsläget, på /online, på Bord-fliken och hos
// observatören. Med åtta platser hos observatören vid 390 stod fyra räknarnamn i sina grannzoner.
//
// Regeln är G: namnet står bredvid sin zon som K19 säger, på varje filt (#76:s undantag för den
// smala filten är borta), och landar det i en annan zons ruta prövas i tur och ordning en rad
// längre ut, motsatt sida, zonens två ändar och sist inuti. Sidan avgörs en gång, i filtens
// inpassade skala, och står sedan still när kameran zoomar (#43).
//
// Mätt på den byggda appen med Sal's Saloon-leken, i rektanglar och aldrig i typsnittets pixlar:
// varje synligt zonnamn mot varje annan zons ruta. Och en gång till med varje namn ritat 15 %
// bredare (K20:s marginal), utlagt på nytt av appen själv, eftersom ett bredare typsnitt är vad
// en annan maskin ger.

type Seen = { names: string[]; inZone: string[] }

// Vad sidan ritar: varje synligt zonnamn, och vilka av dem som ligger i en annan zons ruta. En
// halv pixel tas av för rundningen av en ruta, så att två rutor som bara möts inte räknas.
const read = (page: Page): Promise<Seen> =>
  page.evaluate(() => {
    // The Bord tab's own felt where there is one: the tab also draws the tables' small felts.
    const felt = document.querySelector('.byd-setup-felt [data-table]') ?? document.querySelector('[data-table]')
    if (!felt) throw new Error('ingen filt att mäta på')
    const zones = [...felt.querySelectorAll<HTMLElement>(':scope > .byd-zone')]
    const shown = (el: HTMLElement): DOMRect | null => {
      const s = getComputedStyle(el)
      if (s.display === 'none' || s.visibility === 'hidden') return null
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0 ? r : null
    }
    const hits = (p: DOMRect, q: DOMRect) => p.left < q.right - 0.5 && q.left < p.right - 0.5 && p.top < q.bottom - 0.5 && q.top < p.bottom - 0.5
    const names: string[] = []
    const inZone: string[] = []
    for (const zone of zones) {
      const label = zone.querySelector<HTMLElement>(':scope > span')
      const r = label ? shown(label) : null
      if (!label || !r) continue
      const text = (label.textContent ?? '').trim()
      names.push(text)
      for (const other of zones) if (other !== zone && hits(r, other.getBoundingClientRect())) inZone.push(`${text} i ${other.dataset['area']}`)
    }
    return { names: names.sort(), inZone }
  })

// Samma läsning med varje namn 15 % bredare. Bredden läggs på med `letter-spacing`, som är hur ett
// bredare typsnitt skiljer sig för den här layouten: Δ = 0,15 · w / n på ett namn med n tecken och
// bredden w. Appen får sedan lägga ut namnen igen, som den gör när ett namn byter storlek.
async function readWide(page: Page): Promise<Seen> {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll<HTMLElement>('[data-table] > .byd-zone > span')) {
      const range = document.createRange()
      range.selectNodeContents(el)
      const w = range.getBoundingClientRect().width
      const ls = parseFloat(getComputedStyle(el).letterSpacing) || 0
      el.style.letterSpacing = `${ls + (0.15 * w) / Math.max(1, (el.textContent ?? '').trim().length)}px`
    }
  })
  return settled(page)
}

// Avläsningen när bilden står stilla: samma svar två gånger, några renderingssteg isär. TV:ns
// kamera glider till sin ram (#325), och en mätning tagen i samma andetag som sidan laddades är en
// mätning av en bild på väg någon annanstans.
async function settled(page: Page): Promise<Seen> {
  const frames = () => page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(ok, 0)))))
  const where = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-table] > .byd-zone, [data-table] > .byd-zone > span')].map((el) => {
        const r = el.getBoundingClientRect()
        return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join()
      }),
    )
  let last = JSON.stringify(await where())
  for (let i = 0; i < 80; i++) {
    await frames()
    const now = JSON.stringify(await where())
    if (now === last) return read(page)
    last = now
  }
  throw new Error('filten stannade aldrig')
}

// Ett bord som det spelas: fem kort i varje hand, tre i saloonen, två i kasthögen och ett framför
// varje plats. Ett namn döms mot det som ligger nära det, inte mot tom filt.
async function dealt(request: APIRequestContext, host: Fixtures['host'], seats: 4 | 8): Promise<Table> {
  const doc = spelkortDoc(seats)
  const table = await tableOf(request, setupFromProject(doc), deckFromProject(doc))
  const dealer = await host(table)
  await dealer.send([{ v: 'shuffle', pile: 'draw' }])
  await dealer.send([{ v: 'deal', from: 'draw', to: table.seats.map((s) => `hand:${s}`), each: 5 }])
  await dealer.send([{ v: 'draw', from: 'draw', to: 'market', count: 3, face: 'front' }])
  await dealer.send([{ v: 'draw', from: 'draw', to: 'discard', count: 2, face: 'front' }])
  for (const seat of table.seats) await dealer.send([{ v: 'draw', from: 'draw', to: `mine:${seat}`, count: 1, face: 'front' }])
  return table
}

const SEATS = [4, 8] as const
const device = (name: string, width: number, height: number, touch = false): Device => ({ name, viewport: { width, height }, ...(touch ? { hasTouch: true, isMobile: true } : {}) })

// Ytorna som ritar filtens namn, i de fönster beslutet mättes i.
type Surface = { name: string; device: Device; url: (table: Table, request: APIRequestContext) => Promise<string> }
const SURFACES: Surface[] = [
  { name: 'TV:n 1920', device: device('tv', 1920, 1080), url: async (t) => t.tvUrl },
  { name: 'bordsläget 1024', device: device('bord-1024', 1024, 768), url: async (t) => t.tableUrl },
  { name: 'bordsläget 1280', device: device('bord-1280', 1280, 800), url: async (t) => t.tableUrl },
  { name: 'bordsläget 1440', device: device('bord-1440', 1440, 900), url: async (t) => t.tableUrl },
  { name: '/online 1280', device: device('online', 1280, 800), url: async (t, r) => (await join(r, t, { name: 'Ada', seat: 'A' })).onlineUrl },
  { name: 'observatören 390', device: PHONE, url: async (t, r) => (await join(r, t, { name: 'Eva' })).observeUrl },
  { name: 'observatören 768', device: device('obs-768', 768, 1024, true), url: async (t, r) => (await join(r, t, { name: 'Eva' })).observeUrl },
]

async function opened(open: Fixtures['open'], surface: Surface, table: Table, request: APIRequestContext): Promise<Client> {
  const client = await open(surface.device, `${await surface.url(table, request)}&lang=sv`)
  await expect(client.page.locator('[data-table] > .byd-zone').first()).toBeAttached({ timeout: 20_000 })
  return client
}

test.describe('ett zonnamn står aldrig i en annan zons ruta (#685)', () => {
  test.use({ locale: 'sv-SE' })

  for (const seats of SEATS)
    for (const surface of SURFACES)
      test(`${surface.name}, ${seats} platser`, async ({ request, open, host }) => {
        const table = await dealt(request, host, seats)
        const { page } = await opened(open, surface, table, request)
        const at = await settled(page)
        // Inte tomt: en mätning av noll namn är grön för evigt. Saloonen är en zon ingen äger och
        // har sitt namn på varje yta, också på TV:n där platsernas egna står på skylten.
        expect(at.names).toContain("Sal's Saloon")
        expect({ where: surface.name, seats, inZone: at.inZone }).toEqual({ where: surface.name, seats, inZone: [] })
        const wide = await readWide(page)
        expect({ where: `${surface.name}, 15 % bredare`, seats, inZone: wide.inZone }).toEqual({ where: `${surface.name}, 15 % bredare`, seats, inZone: [] })
      })

  // Sidan avgörs en gång, i filtens inpassade skala, och står sedan still (#43). Mätt live bytte
  // saloonens namn sida från under till över när kameran zoomade till 3,3 px/mm — det får inte ske.
  test('TV:ns namn byter inte sida när kameran zoomar', async ({ request, open, host }) => {
    const table = await dealt(request, host, 4)
    const { page } = await opened(open, SURFACES[0]!, table, request)
    await settled(page)
    const sides = () =>
      page.evaluate(() =>
        Object.fromEntries(
          [...document.querySelectorAll<HTMLElement>('[data-table] > .byd-zone')].flatMap((zone) => {
            const label = zone.querySelector<HTMLElement>(':scope > span')
            if (!label || getComputedStyle(label).display === 'none') return []
            const r = label.getBoundingClientRect()
            const z = zone.getBoundingClientRect()
            const side = r.bottom <= z.top + 1 ? 'över' : r.top >= z.bottom - 1 ? 'under' : r.right <= z.left + 1 ? 'vänster' : r.left >= z.right - 1 ? 'höger' : 'inuti'
            return [[(label.textContent ?? '').trim(), side]]
          }),
        ),
      )
    const cardPx = () => page.evaluate(() => document.querySelector('.byd-pile')!.getBoundingClientRect().width)
    const before = { sides: await sides(), card: await cardPx() }
    // Kamerans eget steg, med tangentbordet (#325): ett steg närmare kring bildens mitt, sex gånger.
    await page.locator('[data-table]').hover()
    for (let i = 0; i < 6; i++) await page.keyboard.press('+')
    await settled(page)
    const after = { sides: await sides(), card: await cardPx() }
    // Icke-vakuitet: kameran kom verkligen närmare, mer än dubbelt så nära.
    expect(after.card / before.card).toBeGreaterThan(2)
    expect(Object.keys(before.sides)).toContain("Sal's Saloon")
    // Och det är ett namn regeln har flyttat: K19:s egen plats för saloonens namn är i Framför B.
    await expect(page.locator('[data-table] > .byd-zone[data-area="market"] > span')).not.toHaveAttribute('data-name-at', 'k19')
    expect(after.sides).toEqual(before.sides)
  })
})

// Bord-fliken visar ett namn i taget, det som pekas på (#581). Där mäts varje zon tänd ensam, som
// fliken faktiskt visar den, och dessutom alla tända på en gång vid 1280 och 1440 — det mesta något
// pekande kan tända.
test.describe('Bord-flikens namn står aldrig i en annan zons ruta (#685, #581)', () => {
  test.use({ locale: 'sv-SE' })

  async function bord(page: Page, width: number, height: number, seats: 4 | 8) {
    await page.setViewportSize({ width, height })
    await logIn(page.request)
    const project = await makeProjectOf(page.request, spelkortDoc(seats))
    await page.goto(`${project.editorUrl}&lang=sv`)
    await page.locator('#byd-editor-tab-tables').click()
    await expect(page.locator('.byd-setup-felt [data-zone-handle="market"]')).toBeAttached()
    await page.mouse.move(1, 1)
  }

  const lightAll = (page: Page) => page.evaluate(() => document.querySelectorAll('.byd-setup-felt .byd-zone').forEach((z) => z.setAttribute('data-lit', '')))

  for (const seats of SEATS)
    for (const [width, height] of [
      [1024, 768],
      [1280, 800],
      [1440, 900],
    ] as const) {
      test(`en zon i taget, ${width} × ${height}, ${seats} platser`, async ({ page }) => {
        await bord(page, width, height, seats)
        const areas = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.byd-setup-felt [data-table] > .byd-zone')].map((z) => z.dataset['area']!))
        expect(areas).toContain('market')
        const inZone: string[] = []
        for (const area of areas) {
          // Pekad på filten, som formgivaren pekar: zonens eget handtag tänder den.
          await page.locator(`.byd-setup-felt [data-zone-handle="${area}"]`).hover({ force: true })
          await expect(page.locator(`.byd-setup-felt [data-area="${area}"]`)).toHaveAttribute('data-lit', '')
          const at = await settled(page)
          const lit = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.byd-setup-felt [data-lit]')].map((z) => z.dataset['area'] ?? z.dataset['zone'] ?? '?'))
          expect({ area, lit, names: at.names.length }).toEqual({ area, lit, names: 1 })
          inZone.push(...at.inZone)
        }
        expect({ width, seats, inZone }).toEqual({ width, seats, inZone: [] })
      })

      test(`alla tända, ${width} × ${height}, ${seats} platser`, async ({ page }) => {
        await bord(page, width, height, seats)
        await lightAll(page)
        const at = await settled(page)
        expect(at.names).toContain("Sal's Saloon")
        expect({ width, seats, inZone: at.inZone }).toEqual({ width, seats, inZone: [] })
        // Undantaget vid 1024, skrivet uttryckligen (beslutet 2026-10-03). Filten är där 382 px
        // bred, och med alla zoner tända finns inte plats för varje namn utanför varje annat: några
        // av räknarnamnen och «Framför»-namnen får ingen fri plats alls. Fliken visar ett namn i
        // taget (#581), på en egen platta som ritas över allt annat, så en sådan platta får stå på
        // ett annat namn eller en plats namnkort — men aldrig i en annan zons ruta, och namnet kapas
        // aldrig. Det som står på ett annat namn här är alltså ett namn appen själv har lagt på sin
        // platta (`plate-…`), och inget annat; vid 1280 och 1440 finns inget sådant alls.
        const plates = await page.evaluate(() => {
          const shown = [...document.querySelectorAll<HTMLElement>('.byd-setup-felt [data-table] > .byd-zone > span, .byd-setup-felt .byd-seat-name')].filter(
            (el) => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0,
          )
          const hits = (p: DOMRect, q: DOMRect) => p.left < q.right - 0.5 && q.left < p.right - 0.5 && p.top < q.bottom - 0.5 && q.top < p.bottom - 0.5
          const plate = (el: HTMLElement) => (el.dataset['nameAt'] ?? '').startsWith('plate-')
          const on: string[] = []
          const unplated: string[] = []
          const cut: string[] = []
          for (const el of shown) {
            if (!el.matches('.byd-zone > span')) continue
            if (el.scrollWidth > el.clientWidth + 1) cut.push((el.textContent ?? '').trim())
            for (const o of shown) {
              if (o === el || !hits(el.getBoundingClientRect(), o.getBoundingClientRect())) continue
              const pair = `${(el.textContent ?? '').trim()} × ${(o.textContent ?? '').trim()}`
              on.push(pair)
              if (!plate(el) && !plate(o)) unplated.push(pair)
            }
          }
          return { on, unplated, cut }
        })
        expect({ width, seats, cut: plates.cut }).toEqual({ width, seats, cut: [] })
        expect({ width, seats, on: width >= 1280 ? plates.on : plates.unplated }).toEqual({ width, seats, on: [] })
        const wide = await readWide(page)
        expect({ width, seats, wide: wide.inZone }).toEqual({ width, seats, wide: [] })
      })
    }
})
