import type { Page } from '@playwright/test'
import { expect, test } from '../../support/test.js'
import { logIn, makeProjectOf } from '../../support/api.js'
import { tät } from '../../support/spelkort.js'

// Det fastnålade i tabellen står still när det får fokus (#1067).
//
// Kolumndörrens handtag «Kolumner» står klistrat mot lådans högra kant, listen (bocken och det
// designern låst, titeln från start sedan #1408) mot dess vänstra, och sedan #695 tas en cell in i
// det rum som går att läsa och inte till lådans kant. När handtaget fick fokus rullade lådan 432 px åt sidan vid 1280, och bocken i en
// rad drog en rullad låda nästan hela vägen tillbaka — en kontroll som alltid står i bild flyttade
// allt annat för att visa sig.
//
// Med riktiga tangenttryck, från där en tangentbordsanvändare kommer: bakåt från radens första cell
// till huvudets sista kontroll, och framåt genom huvudet till raderna. Vid 1024, 1280 och 1440, på
// svenska och engelska, med Macens typsnitt och med ett så brett som DejaVu på CI:s Linux.

const BRETT = '.byd-editor * { font-family: Verdana, "DejaVu Sans", sans-serif !important; }'

type Yta = { width: number; height: number; lang: 'sv' | 'en'; brett: boolean }

async function openTable(page: Page, { width, height, lang, brett }: Yta) {
  await page.setViewportSize({ width, height })
  if (brett) {
    await page.addInitScript((css) => {
      document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style')
        style.textContent = css
        document.head.append(style)
      })
    }, BRETT)
  }
  await logIn(page.request)
  const doc = tät()
  const project = await makeProjectOf(page.request, doc)
  await page.goto(`${project.editorUrl}&lang=${lang}`)
  await expect(page.getByText(doc.name).first()).toBeVisible()
  await page.locator('#byd-editor-tab-table').click()
  await expect(page.locator('.byd-data tbody tr').first()).toBeVisible()
  await page.waitForFunction(() => (document.querySelector('table.byd-data') as HTMLElement | null)?.style.tableLayout === 'fixed')
}

// Var lådan står och vad som har fokus: kolumnen eller den fastnålade cellens klass, och om fokus
// står i huvudet. Och det läsbara rummet: mellan listens högerkant och ×:ets vänsterkant.
const läge = (page: Page) =>
  page.evaluate(() => {
    const box = document.querySelector('.byd-data-scroll') as HTMLElement
    const a = document.activeElement as HTMLElement
    const cell = a.closest('th, td')
    const r = a.getBoundingClientRect()
    const rail = document.querySelector('.byd-data thead th[data-pinned-last]')!.getBoundingClientRect()
    const pin = document.querySelector('.byd-data thead .byd-data-remove')!.getBoundingClientRect()
    return {
      x: box.scrollLeft,
      slut: box.scrollWidth - box.clientWidth,
      var: cell ? `${cell.closest('thead') ? 'huvudet' : 'raden'} ${cell.getAttribute('data-col') ?? cell.className}` : a.tagName,
      vänster: r.left - rail.right,
      höger: pin.left - r.right,
    }
  })

// Tabb tills fokus står där `där` säger, och läget vid varje steg.
async function tabbaTill(page: Page, där: string, key = 'Tab', max = 60) {
  const steg: Awaited<ReturnType<typeof läge>>[] = []
  for (let i = 0; i < max; i++) {
    await page.keyboard.press(key)
    const nu = await läge(page)
    steg.push(nu)
    if (nu.var === där) return steg
  }
  throw new Error(`nådde aldrig ${där}: ${steg.map((s) => s.var).join(' → ')}`)
}

// Rullad med pekaren, och färdigrullad: samma läge två bildrutor i rad, så att ett rullhjul som
// glider inte läses mitt i glidningen.
async function rullaMedPekaren(page: Page, dx: number) {
  const box = page.locator('.byd-data-scroll')
  const före = await box.evaluate((el) => el.scrollLeft)
  await page.mouse.wheel(dx, 0)
  await expect.poll(() => box.evaluate((el) => el.scrollLeft)).not.toBe(före)
  return box.evaluate(
    (el) =>
      new Promise<number>((done) => {
        let last = -1
        const look = () => {
          if (el.scrollLeft === last) return done(last)
          last = el.scrollLeft
          setTimeout(() => requestAnimationFrame(look), 50)
        }
        look()
      }),
  )
}

const STORLEKAR = [
  [1024, 768],
  [1280, 800],
  [1440, 900],
] as const

for (const [width, height] of STORLEKAR) {
  for (const lang of ['sv', 'en'] as const) {
    for (const brett of [false, true]) {
      const yta: Yta = { width, height, lang, brett }
      const namn = `vid ${width}, ${lang}${brett ? ', brett typsnitt' : ''}`

      test(`handtaget «Kolumner» rullar inte lådan när det nås bakåt från första raden, ${namn}`, async ({ page }) => {
        await openTable(page, yta)
        // Handen i första radens första cell som inte står på listen, med pekaren: den står i bild.
        await page.locator('.byd-data tbody tr:first-child td[data-col="typ"] input').click()
        const start = await läge(page)
        expect(start.x).toBe(0)
        // Premissen: tabellen är bredare än lådan, annars finns ingenting att rulla.
        expect(start.slut).toBeGreaterThan(200)
        // Bakåt över antal och titeln, som står i bild respektive på listen, och bocken, till
        // huvudets sista kontroll.
        const steg = await tabbaTill(page, 'huvudet byd-data-remove', 'Shift+Tab', 5)
        expect(steg.map((s) => s.var)).toEqual(['raden antal', 'raden title', 'raden byd-data-check', 'huvudet byd-data-remove'])
        expect(steg.map((s) => s.x)).toEqual([0, 0, 0, 0])
        // Och tillbaka: framåt igen till bocken, titeln, titelcellens ikonflik (#33) och antal,
        // utan att något rör sig.
        await page.keyboard.press('Tab')
        await page.keyboard.press('Tab')
        await page.keyboard.press('Tab')
        await page.keyboard.press('Tab')
        expect(await läge(page)).toMatchObject({ var: 'raden antal', x: 0 })
      })

      test(`det fastnålade drar inte tillbaka en rullad låda, och en cell tas fortfarande in i det läsbara rummet, ${namn}`, async ({ page }) => {
        await openTable(page, yta)
        // Rullad med pekaren till mitten, och sedan med tangentbordet från flikens verktyg in i
        // huvudet: bocken och titeln står på listen (#1408) och ska inte flytta lådan.
        const box = page.locator('.byd-data-scroll')
        const mått = await box.boundingBox()
        await page.mouse.move(mått!.x + mått!.width / 2, mått!.y + mått!.height / 2)
        const mitt = await rullaMedPekaren(page, 400)
        expect(mitt).toBeGreaterThan(0)
        await page.locator('#byd-editor-tab-table').focus()
        const in_ = await tabbaTill(page, 'huvudet byd-data-check')
        expect(in_.map((s) => `${s.var} ${s.x}`)).toEqual(in_.map((s) => `${s.var} ${mitt}`))
        const lista = await tabbaTill(page, 'huvudet title', 'Tab', 1)
        expect(lista.map((s) => s.var)).toEqual(['huvudet title'])
        expect(lista.map((s) => s.x)).toEqual([mitt])

        // Framåt genom huvudet till handtaget: rubrikerna tas in i bild, och lådan står vid sista
        // kolumnen.
        const huvud = await tabbaTill(page, 'huvudet byd-data-remove')
        const sist = huvud.at(-1)!.x
        expect(sist).toBeGreaterThan(mitt)
        // Och in i första raden: bocken och titeln står på listen, och lådan står kvar.
        const rad = await tabbaTill(page, 'raden title', 'Tab', 2)
        expect(rad.map((s) => s.var)).toEqual(['raden byd-data-check', 'raden title'])
        expect(rad.map((s) => s.x)).toEqual([sist, sist])
        // Bakåt till handtaget igen, lika stilla.
        const bak = await tabbaTill(page, 'huvudet byd-data-remove', 'Shift+Tab', 2)
        expect(bak.map((s) => s.x)).toEqual([sist, sist])

        // Men en cell utanför bild tas fortfarande in, och i det rum som går att läsa: antal står
        // utanför till vänster sedan den rullar med raden (#1408), och tas in till höger om listen.
        await tabbaTill(page, 'raden title', 'Tab', 2)
        // Över titelcellens ikonflik (#33), som står i samma cell.
        const typ = (await tabbaTill(page, 'raden antal', 'Tab', 2)).at(-1)!
        expect(typ.x).toBeLessThan(sist)
        expect(typ.vänster).toBeGreaterThanOrEqual(0)
        expect(typ.höger).toBeGreaterThanOrEqual(0)
        // Och kolumnen efter body, som står utanför till höger, tas in till vänster om ×.
        const efter = (await tabbaTill(page, 'raden sida')).at(-1)!
        expect(efter.vänster).toBeGreaterThanOrEqual(0)
        expect(efter.höger).toBeGreaterThanOrEqual(0)
        // Radens × står också fastnålat. Framåt från radens sista cell, ut ur tabellen (bara raden
        // man står i har tabbstopp), lådan rullad tillbaka en bit med pekaren, och bakåt till ×:et.
        await tabbaTill(page, 'raden byd-data-remove')
        await page.keyboard.press('Tab')
        expect((await läge(page)).var).not.toMatch(/^raden /)
        const förbi = await box.evaluate((el) => el.scrollLeft)
        const rullad = await rullaMedPekaren(page, -300)
        expect(rullad).toBeGreaterThan(0)
        expect(rullad).toBeLessThan(förbi)
        expect(await tabbaTill(page, 'raden byd-data-remove', 'Shift+Tab', 1)).toMatchObject([{ x: rullad }])
      })
    }
  }
}
