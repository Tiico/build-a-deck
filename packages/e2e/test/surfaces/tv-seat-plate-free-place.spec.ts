import type { APIRequestContext, Page } from '@playwright/test'
import { deckFromProject } from '@byd/server'
import { setupFromProject } from '@byd/server/doc'
import { spelkortDoc } from '../../../server/scripts/spelkort.js'
import { tableOf, type Table } from '../../support/api.js'
import type { Device } from '../../support/devices.js'
import { expect, test, type Fixtures } from '../../support/test.js'

// Platsens skylt på rummets TV står på en fri plats och säger bara bokstav, namn och hand (#683,
// beställarens beslut E 2026-10-05).
//
// Skylten bar förr platsens räknare med namn och värde (#573), och #750 gav den ett tak: den växte
// till första hinder och kapade resten. Med Sal's Saloon stod B:s skylt ändå i saloonens ruta vid
// både 1280 och 1920, C och D kapades till «5 kor…» och «Guld…» vid 1280 med fyra platser, och med
// åtta platser vid 1280 bröts fyra skyltar till två rader och låg på grannens skylt.
//
// Beslutet: skylten säger «(B) ledig 5 kort», och räknarens tal står på platsens egen mark, i
// rummets 24 px-pill. Skylten placeras i #685:s ordning — egen plats, zonernas andra ände, en rad
// ut, motsatt sida, ändarna av platsens rad — och får lämna sin egen plats. Ryms den ingenstans blir
// den en bricka med platsens mark, i stället för att kapas. Sidan avgörs i filtens inpassade skala
// och står still när kameran zoomar (#43).
//
// Mätt på den byggda appen i rektanglar, som prototypen mättes: varje skylt mot varje hög, bricka,
// högnamn och bildtext (#771), varje zons ruta, varje zonnamn, varje annan skylt och varje hands
// kort. Och en gång till med skylttexten 15 % bredare (K20:s marginal), utlagd på nytt av appen.

type Reading = {
  plates: { seat: string; text: string; form: string }[]
  over: string[]
  inZone: string[]
  onPlate: string[]
  onZoneName: string[]
  onHand: string[]
  cut: string[]
  smallest: number
  card: number
}

// Vad sidan har ritat. Text som är dold med flit — en brickas namn, som finns kvar för den som
// läser upp sidan — är inte text på skärmen och räknas varken som kapad eller som storlek.
const read = (page: Page): Promise<Reading> =>
  page.evaluate(() => {
    const felt = document.querySelector('[data-table]')
    if (!felt) throw new Error('ingen filt att mäta på')
    const hidden = (el: Element): boolean => {
      for (let e: Element | null = el; e && e !== felt; e = e.parentElement) {
        const s = getComputedStyle(e)
        if (s.display === 'none' || s.visibility === 'hidden' || s.clipPath !== 'none') return true
      }
      return false
    }
    const shown = (el: Element): DOMRect | null => {
      if (hidden(el)) return null
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0 ? r : null
    }
    const all = (sel: string) => [...felt.querySelectorAll(sel)].flatMap((el) => {
      const r = shown(el)
      return r ? [{ el: el as HTMLElement, r }] : []
    })
    const meet = (a: DOMRect, b: DOMRect) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5
    const name = (el: HTMLElement) => el.dataset['zone'] ?? el.dataset['area'] ?? (el.textContent ?? '').trim()
    const plates = all('[data-seat-plate]')
    const out: Reading = { plates: [], over: [], inZone: [], onPlate: [], onZoneName: [], onHand: [], cut: [], smallest: Infinity, card: 0 }
    for (const { el: p, r } of plates) {
      const seat = p.dataset['seatPlate'] ?? '?'
      const visible = [...p.querySelectorAll('*')].filter((e) => !hidden(e) && [...e.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim()))
      out.plates.push({ seat, text: visible.map((e) => [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('')).join(' '), form: p.dataset['form'] ?? 'plate' })
      for (const o of all('.byd-pile, .byd-pile-n, .byd-pile-name, .byd-pile-caption')) if (meet(r, o.r)) out.over.push(`${seat} × ${o.el.className} ${name(o.el)}`)
      for (const o of all('.byd-zone')) if (meet(r, o.r)) out.inZone.push(`${seat} × ${name(o.el)}`)
      for (const o of all('.byd-zone > span')) if (meet(r, o.r)) out.onZoneName.push(`${seat} × ${name(o.el)}`)
      for (const o of all('.byd-hand-fan > i')) if (meet(r, o.r)) out.onHand.push(`${seat} × ${(o.el.closest('.byd-hand') as HTMLElement).dataset['zone']}`)
      for (const o of plates) if (o.el !== p && seat < (o.el.dataset['seatPlate'] ?? '') && meet(r, o.r)) out.onPlate.push(`${seat} × ${o.el.dataset['seatPlate']}`)
      for (const e of [p, ...p.querySelectorAll<HTMLElement>('*')]) if (!hidden(e) && e.scrollWidth > e.clientWidth + 1) out.cut.push(`${seat}: ${(e.textContent ?? '').trim()}`)
      for (const e of visible) out.smallest = Math.min(out.smallest, parseFloat(getComputedStyle(e).fontSize))
    }
    const card = felt.querySelector('.byd-card[data-component]')
    if (card) {
      const c = card.getBoundingClientRect()
      out.card = Math.round(Math.min(c.width, c.height))
    }
    return out
  })

// Avläsningen när bilden står stilla: samma rutor några renderingssteg i rad. TV:ns kamera glider
// till sin ram (#325), och appen lägger ut skyltarna igen när deras text byter storlek.
async function settled(page: Page): Promise<Reading> {
  const frames = () => page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(ok, 0)))))
  const where = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-table] > .byd-zone, [data-table] > .byd-zone > span, [data-seat-plate], .byd-card[data-component]')].map((el) => {
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

// Skylttexten 15 % bredare, på det sätt ett bredare typsnitt skiljer sig för den här layouten: Δ =
// 0,15 · w / n i `letter-spacing` på varje text med n tecken och bredden w. Appen får sedan lägga
// ut skyltarna igen, som den gör när en skylt byter storlek.
async function widen(page: Page): Promise<Reading> {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll<HTMLElement>('[data-seat-plate] > b > span, [data-seat-plate] > span')) {
      const range = document.createRange()
      range.selectNodeContents(el)
      const w = range.getBoundingClientRect().width
      const ls = parseFloat(getComputedStyle(el).letterSpacing) || 0
      el.style.letterSpacing = `${ls + (0.15 * w) / Math.max(1, (el.textContent ?? '').trim().length)}px`
    }
  })
  return settled(page)
}

// Ett bord som det spelas, som prototypen mättes på: fem kort i varje hand, tre i saloonen, två i
// kasthögen och ett framför varje plats. Ada sitter på plats A; de andra platserna är lediga.
async function dealt(request: APIRequestContext, host: Fixtures['host'], player: Fixtures['player'], seats: 4 | 8): Promise<Table> {
  const doc = spelkortDoc(seats)
  const table = await tableOf(request, setupFromProject(doc), deckFromProject(doc))
  const dealer = await host(table)
  await dealer.send([{ v: 'shuffle', pile: 'draw' }])
  await dealer.send([{ v: 'deal', from: 'draw', to: table.seats.map((s) => `hand:${s}`), each: 5 }])
  await dealer.send([{ v: 'draw', from: 'draw', to: 'market', count: 3, face: 'front' }])
  await dealer.send([{ v: 'draw', from: 'draw', to: 'discard', count: 2, face: 'front' }])
  for (const seat of table.seats) await dealer.send([{ v: 'draw', from: 'draw', to: `mine:${seat}`, count: 1, face: 'front' }])
  await player(table, { name: 'Ada', seat: 'A' })
  return table
}

// Rummets TV, med varje korts bild på väg — `/faces` svarar 202 som när renderingen arbetar — så att
// kasthögens bildtext (#771) står där och skylten mäts mot den.
async function television(open: Fixtures['open'], device: Device, table: Table): Promise<Page> {
  const { page } = await open(device, `${table.tvUrl}&lang=sv`)
  await page.route('**/faces/**', (r) => r.fulfill({ status: 202, body: 'queued' }))
  await page.reload()
  await expect(page.locator('[data-seat-plate]')).toHaveCount(table.seats.length, { timeout: 20_000 })
  await expect(page.locator('[data-seat-plate="A"]')).toContainText('Ada')
  return page
}

// Det typsnitt Chromium ritade varje nods glyfer med, och om det kom från sidan själv: en familj per
// nod, eller en lista där en nod ritades med mer än ett.
async function drawnWith(page: Page, selector: string): Promise<{ family: string; custom: boolean }[]> {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('DOM.enable')
  await cdp.send('CSS.enable')
  const { root } = (await cdp.send('DOM.getDocument', { depth: -1 })) as { root: { nodeId: number } }
  const { nodeIds } = (await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector })) as { nodeIds: number[] }
  const out: { family: string; custom: boolean }[] = []
  for (const nodeId of nodeIds) {
    const { fonts } = (await cdp.send('CSS.getPlatformFontsForNode', { nodeId })) as { fonts: { familyName: string; isCustomFont: boolean; glyphCount: number }[] }
    const used = fonts.filter((f) => f.glyphCount > 0)
    out.push({ family: used.map((f) => f.familyName).join(' + '), custom: used.length > 0 && used.every((f) => f.isCustomFont) })
  }
  await cdp.detach()
  return out
}

const CELLS = [
  { device: { name: 'tv-1280', viewport: { width: 1280, height: 800 } }, seats: 4, card: 46 },
  { device: { name: 'tv-1280', viewport: { width: 1280, height: 800 } }, seats: 8, card: 31 },
  { device: { name: 'tv-1920', viewport: { width: 1920, height: 1080 } }, seats: 4, card: 77 },
  { device: { name: 'tv-1920', viewport: { width: 1920, height: 1080 } }, seats: 8, card: 45 },
] as const

const clean = (r: Reading) => ({ over: r.over, inZone: r.inZone, onPlate: r.onPlate, onZoneName: r.onZoneName, onHand: r.onHand, cut: r.cut })
const CLEAN = { over: [], inZone: [], onPlate: [], onZoneName: [], onHand: [], cut: [] }

test.describe('platsens skylt på rummets TV står fritt och säger bokstav, namn och hand (#683)', () => {
  test.use({ locale: 'sv-SE' })

  for (const cell of CELLS)
    test(`TV ${cell.device.viewport.width}, ${cell.seats} platser`, async ({ request, open, host, player }) => {
      const table = await dealt(request, host, player, cell.seats)
      const page = await television(open, cell.device, table)
      const now = await settled(page)
      const where = `TV ${cell.device.viewport.width}, ${cell.seats} platser`
      // Inte tomt: en skylt per plats, var och en hel och ingen av dem en bricka.
      expect(now.plates.map((p) => p.seat)).toEqual(table.seats)
      expect({ where, badges: now.plates.filter((p) => p.form !== 'plate').map((p) => p.seat) }).toEqual({ where, badges: [] })
      // Skylten säger bokstav, namn och hand — och inte räknaren.
      for (const p of now.plates) {
        expect(p.text).toMatch(/^\S \S.* \d+ kort$/)
        expect(p.text).not.toContain('Guld')
        expect(p.text).not.toContain('…')
      }
      expect(now.plates.find((p) => p.seat === 'A')!.text).toBe('A Ada 5 kort')
      expect(now.plates.find((p) => p.seat === 'B')!.text).toBe('B ledig 5 kort')
      expect({ where, ...clean(now) }).toEqual({ where, ...CLEAN })
      // K26:s golv, och K9:s kort som det var: skylten köper inte sin plats med kortets storlek.
      expect(now.smallest).toBeGreaterThanOrEqual(24)
      expect(now.card).toBeGreaterThanOrEqual(cell.card - 1)

      // Och med texten 15 % bredare, utlagd på nytt: fortfarande ren, ingenting kapat och ingen skylt
      // en bricka. #880 släppte det sista kravet när skylten skrev i `system-ui`, som på CI:s Linux är
      // bredare än en Macs, och B där blev en bricka vid 1280 med fyra platser; sedan #887 skriver
      // skylten i filtens skeppade typsnitt (K20), och bredden är densamma på båda maskinerna.
      const wide = await widen(page)
      expect({ where: `${where}, 15 % bredare`, ...clean(wide) }).toEqual({ where: `${where}, 15 % bredare`, ...CLEAN })
      expect({ where: `${where}, 15 % bredare`, badges: wide.plates.filter((p) => p.form !== 'plate').map((p) => p.seat) }).toEqual({ where: `${where}, 15 % bredare`, badges: [] })
    })

  // Räknarens tal står på platsens egen mark igen, i rummets 24 px-pill, som en mark utan ägare
  // redan bär på TV:n. Räknarens namn skrivs inte längre på filten.
  test('räknarens tal står på platsens mark, i 24 px', async ({ request, open, host, player }) => {
    const table = await dealt(request, host, player, 4)
    const page = await television(open, CELLS[0].device, table)
    await settled(page)
    const chips = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.byd-zone[data-area^="counters:"]')].map((strip) => {
        const s = strip.getBoundingClientRect()
        const chip = [...document.querySelectorAll<HTMLElement>('.byd-token')].find((t) => {
          const r = t.getBoundingClientRect()
          return r.left >= s.left - 1 && r.right <= s.right + 1 && r.top >= s.top - 1 && r.bottom <= s.bottom + 1
        })
        const figure = chip?.querySelector('b')
        const r = figure?.getBoundingClientRect()
        return {
          strip: strip.dataset['area'],
          figure: figure?.textContent ?? null,
          px: figure ? parseFloat(getComputedStyle(figure).fontSize) : null,
          seen: !!r && r.width > 0 && r.height > 0,
          named: (chip?.textContent ?? '').includes('Guld'),
        }
      }),
    )
    expect(chips).toHaveLength(4)
    for (const c of chips) expect(c).toEqual({ strip: c.strip, figure: '0', px: 24, seen: true, named: false })
    await expect(page.locator('[data-table]')).not.toContainText('Guld')
  })

  // Skylten skriver i filtens skeppade typsnitt, som högnamnen bredvid den (K20, #887). Den satte en
  // egen `font:` med `system-ui`, så dess bredd var maskinens: på CI:s Linux blev B en bricka i
  // 15 %-passet där en Mac fick plats (#880).
  //
  // Det som läses är vilket typsnitt Chromium ritade glyferna med, inte vad kaskaden bad om: en
  // regel står kvar även när ansiktet inte kommer fram. Högens namn är kontrollen — det ritas i det
  // skeppade ansiktet på samma filt — så att ett namn som läses fel inte kan bli grönt av sig självt.
  test('skylten skriver i filtens skeppade typsnitt (K20)', async ({ request, open, host, player }) => {
    const table = await dealt(request, host, player, 4)
    const page = await television(open, CELLS[0].device, table)
    await settled(page)
    const felt = await drawnWith(page, '[data-table] .byd-pile-name')
    expect(felt.length).toBeGreaterThan(0)
    for (const f of felt) expect(f).toEqual({ family: 'Roboto Condensed', custom: true })
    const plates = await drawnWith(page, '[data-seat-plate] > b > i, [data-seat-plate] > b > span, [data-seat-plate] > span')
    expect(plates).toHaveLength(table.seats.length * 3)
    for (const f of plates) expect(f).toEqual(felt[0])
  })

  // Sidan avgörs en gång, i filtens inpassade skala, och står still när kameran zoomar (#43, #685).
  test('skylten byter inte sida när kameran zoomar', async ({ request, open, host, player }) => {
    const table = await dealt(request, host, player, 4)
    const page = await television(open, CELLS[2].device, table)
    await settled(page)
    const sides = () =>
      page.evaluate(() =>
        Object.fromEntries(
          [...document.querySelectorAll<HTMLElement>('[data-seat-plate]')].map((p) => {
            const seat = p.dataset['seatPlate']!
            const zones = [...document.querySelectorAll<HTMLElement>(`.byd-zone[data-area$=":${seat}"]`)].map((z) => z.getBoundingClientRect())
            const z = { left: Math.min(...zones.map((r) => r.left)), top: Math.min(...zones.map((r) => r.top)), right: Math.max(...zones.map((r) => r.right)), bottom: Math.max(...zones.map((r) => r.bottom)) }
            const r = p.getBoundingClientRect()
            const v = r.bottom <= z.top + 1 ? 'över' : r.top >= z.bottom - 1 ? 'under' : 'i höjd med'
            const h = r.right <= z.left + 1 ? 'vänster om' : r.left >= z.right - 1 ? 'höger om' : 'i bredd med'
            return [seat, `${v}, ${h}`]
          }),
        ),
      )
    const cardPx = () => page.evaluate(() => document.querySelector('.byd-pile')!.getBoundingClientRect().width)
    const before = { sides: await sides(), card: await cardPx() }
    // Icke-vakuitet: B:s skylt är en som regeln har flyttat från sin egen plats, under zonerna mot
    // saloonen, till zonernas kantsida.
    expect(before.sides['B']).not.toBe('under, i bredd med')
    await page.locator('[data-table]').hover()
    for (let i = 0; i < 6; i++) await page.keyboard.press('+')
    await settled(page)
    const after = { sides: await sides(), card: await cardPx() }
    expect(after.card / before.card).toBeGreaterThan(2)
    expect(after.sides).toEqual(before.sides)
  })

  // Sista utvägen: en skylt som inte ryms någonstans blir en bricka med platsens mark, i stället för
  // att kapas (#750). Filten tvingas utan plats genom att skylten ritas mycket bredare än någon text
  // kan bli; brickan står då fritt, och namnet finns kvar i sidan för den som läser upp den.
  test('en skylt som inte ryms någonstans blir en bricka med platsens mark', async ({ request, open, host, player }) => {
    const table = await dealt(request, host, player, 8)
    const page = await television(open, CELLS[1].device, table)
    await settled(page)
    await page.addStyleTag({ content: '[data-seat-plate] > b > span { letter-spacing: 200px; }' })
    const now = await settled(page)
    expect(now.plates.map((p) => ({ seat: p.seat, form: p.form, text: p.text }))).toEqual(table.seats.map((seat) => ({ seat, form: 'badge', text: seat === 'A' ? 'A' : seat })))
    expect(clean(now)).toEqual(CLEAN)
    await expect(page.locator('[data-seat-plate="A"]')).toContainText('Ada')
    await expect(page.locator('[data-seat-plate="B"]')).toContainText('ledig')
  })
})
