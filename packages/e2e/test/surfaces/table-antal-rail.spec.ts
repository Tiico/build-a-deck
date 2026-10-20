import type { Page } from '@playwright/test'
import type { ProjectDoc } from '@byd/server'
import { expect, test } from '../../support/test.js'
import { logIn, makeProjectOf } from '../../support/api.js'
import { prov, tät } from '../../support/spelkort.js'

// antal på listen, grupp i typ och foten som säger vad som står utanför (#695, beställarens val
// D + A 2026-10-20), mätt i det byggda appen på de lekar prototypen mättes på.
//
// antal stod sist, och L46:s tak gör body exakt lika bred som det rum som syns, så en kolumn efter
// body kunde inte börja i bild vid någon bredd — antal började bakom × också vid 1440. I en tät lek
// stod dessutom sju kolumner till utanför vid varje bredd, och ingenting sa det.
test.use({ locale: 'sv-SE' })

// Text 15 % bredare, som DejaVu på CI:s Linux mot Macens typsnitt (#325): satt innan tabellen mäter
// sig, så att mätningen räknar med den.
const LINUX = `.byd-data :is(input:not([type=checkbox]), td, th > button, .byd-data-id) { font-size: 13.8px !important; }`

async function openTable(page: Page, doc: ProjectDoc, { width, height, linux = false, lang = 'sv' }: { width: number; height: number; linux?: boolean; lang?: string }) {
  await page.setViewportSize({ width, height })
  if (linux) {
    await page.addInitScript((css) => {
      document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style')
        style.textContent = css
        document.head.append(style)
      })
    }, LINUX)
  }
  await logIn(page.request)
  const project = await makeProjectOf(page.request, doc)
  await page.goto(`${project.editorUrl}&lang=${lang}`)
  await expect(page.getByText(doc.name).first()).toBeVisible()
  await page.locator('#byd-editor-tab-table').click()
  await expect(page.locator('.byd-data tbody tr').first()).toBeVisible()
  // Mätt: tabellen har sagt sina bredder.
  await page.waitForFunction(() => (document.querySelector('table.byd-data') as HTMLElement | null)?.style.tableLayout === 'fixed')
}

// antal i huvudet och på de rader som syns: helt i bild, ritad ovanpå det som rullar, och direkt
// efter id.
const antalSyns = (page: Page) =>
  page.evaluate(() => {
    const box = document.querySelector('.byd-data-scroll') as HTMLElement
    const room = box.getBoundingClientRect()
    const fel: string[] = []
    const rows = [...box.querySelectorAll('thead tr, tbody tr')].filter((tr) => {
      const r = tr.getBoundingClientRect()
      return r.top >= room.top - 0.5 && r.bottom <= room.bottom + 0.5
    })
    for (const row of rows) {
      const cell = row.querySelector('[data-col="antal"]') as HTMLElement | null
      const id = row.querySelector('[data-col="id"]') as HTMLElement | null
      const vem = row.getAttribute('data-card-ref') ?? 'huvudet'
      if (!cell || !id) {
        fel.push(`${vem}: ingen cell`)
        continue
      }
      const r = cell.getBoundingClientRect()
      if (r.left < room.left - 0.5 || r.right > room.left + box.clientWidth + 0.5) fel.push(`${vem}: utanför lådan`)
      if (Math.abs(r.left - id.getBoundingClientRect().right) > 0.5) fel.push(`${vem}: inte bredvid id`)
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      if (hit !== cell && !cell.contains(hit)) fel.push(`${vem}: täckt`)
    }
    return { rader: rows.length, fel, sidled: document.documentElement.scrollWidth - document.documentElement.clientWidth }
  })

const rollToEnd = (page: Page) => page.locator('.byd-data-scroll').evaluate((box) => (box.scrollLeft = box.scrollWidth))

for (const [width, height] of [[1280, 800], [1024, 768]] as const) {
  for (const [lek, doc] of [['provleken', prov], ['den täta leken', tät]] as const) {
    for (const linux of [false, true]) {
      test(`antal syns utan rullning i sidled och står kvar när lådan rullas, ${lek} vid ${width}${linux ? ' med text 15 % bredare' : ''}`, async ({ page }) => {
        await openTable(page, doc(), { width, height, linux })
        const vid0 = await antalSyns(page)
        expect(vid0.rader).toBeGreaterThan(5)
        expect(vid0.fel).toEqual([])
        // Och sidan själv rullar aldrig i sidled: lådan gör det.
        expect(vid0.sidled).toBe(0)
        await rollToEnd(page)
        await expect.poll(() => page.locator('.byd-data-scroll').evaluate((box) => box.hasAttribute('data-under'))).toBe(true)
        expect((await antalSyns(page)).fel).toEqual([])
      })
    }
  }
}

// typ förklarar kortgruppen (#695): märket «kortgrupp» och L32:s frågetecken på typ:s rubrik.
test('typ bär märket kortgrupp, och dess frågetecken säger var utseendet ändras', async ({ page }) => {
  await openTable(page, prov(), { width: 1280, height: 800 })
  const typ = page.locator('.byd-data thead th[data-col="typ"]')
  await expect(typ.getByText('kortgrupp', { exact: true })).toBeVisible()
  await expect(page.locator('.byd-data thead th[data-col="#group"]')).toHaveCount(0)
  await typ.getByRole('button', { name: 'Hjälp om typ styr kortgruppen' }).click()
  const box = page.getByRole('dialog', { name: 'Hjälp om typ styr kortgruppen' })
  await expect(box).toBeInViewport({ ratio: 1 })
  await expect(box).toContainText('Hur en grupp ser ut ändras i Mall, under Kortgrupper.')
})

// Foten och dess rader. En rad är en rad: textens rektanglar står på en enda höjd.
const fot = (page: Page) =>
  page.evaluate(() => {
    const foot = document.querySelector('[role="tabpanel"]:not([hidden]) .byd-crown-foot') as HTMLElement
    const lines = (el: Element | null) => {
      if (!el) return 0
      const range = document.createRange()
      range.selectNodeContents(el)
      return new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top + r.height / 2))).size
    }
    const shown = [...foot.querySelectorAll(':scope > *, :scope > .byd-foot-quiet > *')].filter((el) => el.checkVisibility() && el.getBoundingClientRect().width > 0 && !el.classList.contains('byd-foot-quiet'))
    const boxes = shown.map((el) => ({ name: el.className || el.tagName, r: el.getBoundingClientRect() }))
    const krockar: string[] = []
    for (const [i, a] of boxes.entries()) for (const b of boxes.slice(i + 1)) if (a.r.left < b.r.right - 0.5 && b.r.left < a.r.right - 0.5) krockar.push(`${a.name} × ${b.name}`)
    const outside = foot.querySelector('.byd-data-outside')
    return {
      höjd: Math.round(foot.getBoundingClientRect().height),
      // Hur många rader fotens delar står på: deras mittlinjer, på två bildpunkter när.
      rader: new Set(boxes.map((b) => Math.round((b.r.top + b.r.height / 2) / 4))).size,
      tyst: lines(foot.querySelector('.byd-data-sort')),
      mening: outside?.checkVisibility() ? lines(outside) : 0,
      krockar,
      utanför: foot.scrollWidth - foot.clientWidth,
      högerkant: Math.max(...boxes.map((b) => b.r.right)) - foot.getBoundingClientRect().right,
    }
  })

for (const [width, height] of [[1280, 800], [1024, 768]] as const) {
  test(`foten säger vilka kolumner som står utanför, och knappen rullar dit, vid ${width}`, async ({ page }) => {
    await openTable(page, prov(), { width, height })
    const tyst = await fot(page)
    await page.goto('about:blank')
    await openTable(page, tät(), { width, height })
    const sägs = page.locator('.byd-crown-foot .byd-data-outside[data-side="right"]')
    await expect(sägs).toBeVisible()
    await expect(sägs).toHaveAccessibleName(/^\d+ kolumner till höger: (\p{L}+, )+\p{L}+$/u)
    const ute = await fot(page)
    // En rad, och lika hög som provlekens fot där ingenting står utanför.
    expect(ute.höjd).toBe(tyst.höjd)
    expect(ute.rader).toBe(1)
    expect(ute.mening).toBe(1)
    expect(ute.tyst).toBe(1)
    expect(ute.krockar).toEqual([])
    expect(ute.utanför).toBe(0)
    expect(ute.högerkant).toBeLessThanOrEqual(0.5)

    const box = page.locator('.byd-data-scroll')
    const före = await box.evaluate((el) => el.scrollLeft)
    await sägs.click()
    await expect.poll(() => box.evaluate((el) => el.scrollLeft)).toBeGreaterThan(före)
    // Och när något rullats förbi åt vänster säger den det också.
    await expect(page.locator('.byd-crown-foot .byd-data-outside[data-side="left"]')).toHaveAccessibleName(/^\d+ kolumn(er)? till vänster: /)
  })
}

// Meningen viker för markeringens verktyg och för kolumndörrens fråga (#858, i dörren sedan #1061),
// så att fotens tysta rad inte bryts vid 1024 — och ingenting i foten krockar.
test('foten håller en rad vid 1024 med två markerade kort och med kolumndörrens fråga, i den täta leken', async ({ page }) => {
  await openTable(page, tät(), { width: 1024, height: 768 })
  // Premissen: meningen står där innan något markeras.
  expect((await fot(page)).mening).toBe(1)
  const ticks = page.locator('.byd-data tbody .byd-data-check input')
  await ticks.nth(0).check()
  await ticks.nth(1).check()
  await expect(page.getByRole('toolbar', { name: /markerade/i })).toBeVisible()
  const markerat = await fot(page)
  expect(markerat.mening).toBe(0)
  expect(markerat.rader).toBe(1)
  expect(markerat.tyst).toBe(1)
  expect(markerat.krockar).toEqual([])
  expect(markerat.utanför).toBe(0)
  expect(markerat.högerkant).toBeLessThanOrEqual(0.5)
  await page.getByRole('button', { name: 'Avmarkera alla' }).click()

  await page.getByRole('button', { name: 'Kolumner', exact: true }).click()
  await page.getByRole('group', { name: 'Kolumner', exact: true }).getByRole('button', { name: 'Ta bort fältet stämning' }).click()
  await expect(page.getByRole('group', { name: 'Kolumner', exact: true }).getByRole('alertdialog')).toBeVisible()
  const frågan = await fot(page)
  expect(frågan.mening).toBe(0)
  expect(frågan.rader).toBe(1)
  expect(frågan.tyst).toBe(1)
  expect(frågan.krockar).toEqual([])
  expect(frågan.utanför).toBe(0)
  expect(frågan.högerkant).toBeLessThanOrEqual(0.5)
  // Besvarad med pekaren: frågan står i dörren (#1061), och ingenting ligger över den.
  await page.getByRole('alertdialog').getByRole('button', { name: 'Avbryt' }).click()
  await expect(page.getByRole('alertdialog')).toBeHidden()
  // Och dörren stängd, dit fokus gick tillbaka, så att den inte ligger över någon cell nedan.
  await page.keyboard.press('Escape')
  await expect(page.getByRole('group', { name: 'Kolumner', exact: true })).toBeHidden()

  // Och L67:s bekräftelse, som står i den tysta radens ställe: meningen kortar sina namn för den,
  // och bekräftelsen står hel.
  const cell = page.getByLabel('juice-em-up title', { exact: true })
  await cell.fill('Juice em up!!')
  await cell.press('Tab')
  await page.getByRole('button', { name: /^Ångra/ }).first().click()
  const said = page.locator('.byd-crown-foot .byd-editor-confirm')
  await expect(said).toBeVisible()
  const bekräftat = await fot(page)
  expect(bekräftat.rader).toBe(1)
  expect(bekräftat.krockar).toEqual([])
  expect(bekräftat.utanför).toBe(0)
  expect(bekräftat.högerkant).toBeLessThanOrEqual(0.5)
  expect(await said.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  await expect(page.locator('.byd-crown-foot .byd-data-outside[data-side="right"]')).toBeVisible()
})

test('foten säger det på engelska för en läsare på engelska', async ({ page }) => {
  await openTable(page, tät(), { width: 1280, height: 800, lang: 'en' })
  await expect(page.locator('.byd-crown-foot .byd-data-outside[data-side="right"]')).toHaveAccessibleName(/^\d+ columns to the right: /)
})
