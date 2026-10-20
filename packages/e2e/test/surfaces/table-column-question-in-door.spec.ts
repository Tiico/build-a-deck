import type { Page } from '@playwright/test'
import type { ProjectDoc } from '@byd/server'
import { expect, test } from '../../support/test.js'
import { logIn, makeProjectOf } from '../../support/api.js'
import { prov, tät } from '../../support/spelkort.js'

// Kolumnens borttagningsfråga står i dörren (#1061, beställarens val B 2026-10-20).
//
// Den stod i flikens fot (#858), och dörren hänger ned till fönstrets fot i toppskiktet (L55): i en
// lek med många kolumner låg «Avbryt», och vid 1024 också «Ja, ta bort», under dörren. Och när
// frågan öppnades göms formuläret «Ny kolumn», listan växte, dess rullning kläms, och raden vars ×
// man just tryckt gled 53–76 px nedåt — ett annat × stod då under pekaren.
//
// Mätt som prototypen mättes: 1024, 1280 och 1440, svenska och engelska, Macens typsnitt och ett
// brett (Verdana, DejaVus bredd som på CI:s Linux, satt innan tabellen mäter sig), den täta leken
// med frågan om stämning och om body (som mallen ritar: den långa frågan), och provleken.

const BRETT = ".byd-editor *, .byd-columns * { font-family: Verdana, 'DejaVu Sans', sans-serif !important; }"

type Yta = { width: number; height: number; lang: 'sv' | 'en'; brett: boolean; lek: () => ProjectDoc; field: string }

async function openDoor(page: Page, { width, height, lang, brett, lek }: Yta) {
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
  const doc = lek()
  const project = await makeProjectOf(page.request, doc)
  await page.goto(`${project.editorUrl}&lang=${lang}`)
  await expect(page.getByText(doc.name).first()).toBeVisible()
  await page.locator('#byd-editor-tab-table').click()
  await expect(page.locator('.byd-data tbody tr').first()).toBeVisible()
  await page.waitForFunction(() => (document.querySelector('table.byd-data') as HTMLElement | null)?.style.tableLayout === 'fixed')
  await page.locator('.byd-data thead .byd-data-remove > button').click()
  await expect(page.locator('.byd-columns')).toBeVisible()
}

// Läget innan ×:et trycks: raden tas in i listans bild som en hand skulle rulla dit, och sedan läses
// var den står, var ×:ets mitt är och var tabellens första rad står.
const före = (page: Page, field: string) =>
  page.evaluate((field) => {
    const row = document.querySelector(`.byd-columns-list > li[data-col="${CSS.escape(field)}"]`) as HTMLElement
    row.scrollIntoView({ block: 'nearest' })
    const x = row.querySelector('.byd-data-dropfield')!.getBoundingClientRect()
    return {
      rowY: row.getBoundingClientRect().top,
      x: { x: x.left + x.width / 2, y: x.top + x.height / 2 },
      first: document.querySelector('.byd-data tbody tr')!.getBoundingClientRect().top,
      foot: document.querySelector('[role="tabpanel"]:not([hidden]) .byd-crown-foot')!.getBoundingClientRect().height,
    }
  }, field)

// Frågan och allt omkring den medan den står.
const medan = (page: Page, field: string) =>
  page.evaluate((field) => {
    const door = document.querySelector('.byd-columns') as HTMLElement
    const doorBox = door.getBoundingClientRect()
    const foot = document.querySelector('[role="tabpanel"]:not([hidden]) .byd-crown-foot') as HTMLElement
    const ask = door.querySelector('[role="alertdialog"]')
    const row = door.querySelector(`.byd-columns-list > li[data-col="${CSS.escape(field)}"]`) as HTMLElement
    const list = door.querySelector('.byd-columns-list') as HTMLElement
    const fel: string[] = []
    // «Nås» betyder att pekaren i elementets mitt trycker just det, och att det står helt i fönstret
    // och helt inne i lådan det står i.
    const nås = (el: Element, namn: string, inom: DOMRect) => {
      const r = el.getBoundingClientRect()
      if (r.width === 0) return fel.push(`${namn}: osynlig`)
      if (r.top < 0 || r.left < 0 || r.bottom > innerHeight || r.right > innerWidth) fel.push(`${namn}: utanför fönstret`)
      if (r.top < inom.top - 0.5 || r.bottom > inom.bottom + 0.5 || r.left < inom.left - 0.5 || r.right > inom.right + 0.5) fel.push(`${namn}: klippt`)
      const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      if (at !== el && !el.contains(at)) fel.push(`${namn}: täckt av ${at?.closest('.byd-columns') ? 'dörren' : (at?.className || at?.tagName)}`)
      return 0
    }
    if (ask) {
      nås(ask, 'frågan', doorBox)
      for (const b of ask.querySelectorAll('button')) nås(b, b.textContent ?? '?', doorBox)
    }
    if (door.scrollHeight > door.clientHeight + 0.5) fel.push('dörren rullar')
    for (const sel of ['.byd-data-count', '.byd-data-sort']) {
      const el = foot.querySelector(sel)
      if (el) nås(el, sel, foot.getBoundingClientRect())
    }
    const rowBox = row.getBoundingClientRect()
    const listBox = list.getBoundingClientRect()
    if (rowBox.top < listBox.top - 0.5 || rowBox.bottom > listBox.bottom + 0.5) fel.push('raden klippt i listan')
    const others = [...list.querySelectorAll(':scope > li')].filter((li) => li !== row)
    const a = document.activeElement
    return {
      iDörren: ask !== null,
      iFoten: foot.querySelector('[role="alertdialog"]') !== null,
      fel,
      rowY: rowBox.top,
      first: document.querySelector('.byd-data tbody tr')!.getBoundingClientRect().top,
      foot: foot.getBoundingClientRect().height,
      markerad: row.hasAttribute('data-asked') && getComputedStyle(row).opacity === '1',
      // Varje annan rad: ur tabbordningen och otryckbar (inert), och dämpad.
      inerta: others.filter((li) => li.closest('[inert]') === null).map((li) => li.getAttribute('data-col')),
      dämpade: others.filter((li) => Number(getComputedStyle(li).opacity) >= 1).map((li) => li.getAttribute('data-col')),
      nyKolumn: door.querySelector('.byd-newfield') !== null,
      fokus: a && ask?.contains(a) ? `frågan: ${a.textContent}` : (a?.getAttribute('aria-label') ?? a?.tagName ?? null),
    }
  }, field)

const centrum = (page: Page, locator: ReturnType<Page['locator']>) =>
  locator.evaluate((el) => {
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })

// Från tangentbordet, med riktiga tangenttryck så att fokusringarna ritas: frågan öppnas på
// «Avbryt», Escape svarar frågan och inte dörren, och fokus står på radens × med hela sin ring inne
// i listan — ×:et står mot listans högra kant, och listan rullar och klipper därför det som sticker ut.
test('frågan besvaras från tangentbordet: Escape lämnar fokus på ×:et, med ringen hel', async ({ page }) => {
  await openDoor(page, { width: 1280, height: 800, lang: 'sv', brett: false, lek: tät, field: 'kraft' })
  const door = page.locator('.byd-columns')
  await expect(door.getByRole('textbox', { name: 'Namn' })).toBeFocused()
  // Från formuläret till listans rad, ned till kraft, och till radens sista kontroll, som är ×:et.
  await page.keyboard.press('Shift+Tab')
  const kraft = door.locator('li[data-col="kraft"]')
  for (let i = 0; i < 20 && !(await kraft.evaluate((li) => li.contains(document.activeElement))); i++) await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowLeft')
  const x = kraft.getByRole('button', { name: 'Ta bort fältet kraft' })
  await expect(x).toBeFocused()
  await page.keyboard.press('Enter')
  const ask = door.getByRole('alertdialog')
  await expect(ask.getByRole('button', { name: 'Avbryt' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(ask).toHaveCount(0)
  await expect(door).toBeVisible()
  await expect(x).toBeFocused()
  const ringen = await x.evaluate((el) => {
    const cs = getComputedStyle(el)
    const ut = parseFloat(cs.outlineWidth) + parseFloat(cs.outlineOffset)
    const r = el.getBoundingClientRect()
    const list = el.closest('.byd-columns-list')!.getBoundingClientRect()
    return { ritad: el.matches(':focus-visible') && cs.outlineStyle !== 'none', höger: r.right + ut - list.right, vänster: list.left - (r.left - ut) }
  })
  expect(ringen.ritad).toBe(true)
  expect(ringen.höger).toBeLessThanOrEqual(0)
  expect(ringen.vänster).toBeLessThanOrEqual(0)
})

const STORLEKAR = [
  [1024, 768],
  [1280, 800],
  [1440, 900],
] as const
const FALL = [
  ['den täta leken', tät, 'stämning'],
  ['den täta leken', tät, 'body'],
  ['provleken', prov, 'body'],
] as const

for (const [width, height] of STORLEKAR) {
  for (const lang of ['sv', 'en'] as const) {
    for (const brett of [false, true]) {
      for (const [lekNamn, lek, field] of FALL) {
        test(`frågan om ${field} står i dörren och nås med pekaren, ${lekNamn} vid ${width}, ${lang}${brett ? ', brett typsnitt' : ''}`, async ({ page }) => {
          const yta: Yta = { width, height, lang, brett, lek, field }
          await openDoor(page, yta)
          const innan = await före(page, field)
          const door = page.locator('.byd-columns')
          const ask = door.locator('[role="alertdialog"]')

          await page.mouse.click(innan.x.x, innan.x.y)
          await expect(page.locator('[role="alertdialog"]')).toBeVisible()
          const nu = await medan(page, field)
          expect(nu.iDörren).toBe(true)
          expect(nu.iFoten).toBe(false)
          expect(nu.fel).toEqual([])
          // Raden står kvar under handen, och tabellen och foten likaså.
          expect(nu.rowY - innan.rowY).toBe(0)
          expect(nu.first - innan.first).toBe(0)
          expect(nu.foot - innan.foot).toBe(0)
          expect(nu.markerad).toBe(true)
          expect(nu.inerta).toEqual([])
          expect(nu.dämpade).toEqual([])
          // Frågan tar formulärets plats: två «Avbryt» är två svar på en fråga.
          expect(nu.nyKolumn).toBe(false)
          // Fokus står på svaret som inte förlorar något.
          expect(nu.fokus).toBe(`frågan: ${lang === 'sv' ? 'Avbryt' : 'Cancel'}`)

          // «Avbryt» med pekaren: frågan går, raden står kvar, och fokus går tillbaka till ×:et.
          const avbryt = ask.locator('button:not([data-kind])')
          const av = await centrum(page, avbryt)
          await page.mouse.click(av.x, av.y)
          await expect(ask).toHaveCount(0)
          await expect(door.locator('.byd-newfield')).toBeVisible()
          const tillbaka = await page.evaluate((field) => {
            const row = document.querySelector(`.byd-columns-list > li[data-col="${CSS.escape(field)}"]`)!
            return { rowY: row.getBoundingClientRect().top, fokus: document.activeElement === row.querySelector('.byd-data-dropfield'), inert: document.querySelectorAll('.byd-columns [inert]').length }
          }, field)
          expect(tillbaka.fokus).toBe(true)
          expect(tillbaka.inert).toBe(0)
          expect(tillbaka.rowY - innan.rowY).toBe(0)

          // Och «Ja, ta bort» med pekaren: kolumnen går, dörren står kvar, och fokus faller inte till
          // sidan.
          await page.mouse.click(innan.x.x, innan.x.y)
          const ja = ask.locator('button[data-kind="danger"]')
          await expect(ja).toBeVisible()
          const j = await centrum(page, ja)
          await page.mouse.click(j.x, j.y)
          await expect(door.locator(`li[data-col="${field}"]`)).toHaveCount(0)
          await expect(page.locator(`.byd-data thead th[data-col="${field}"]`)).toHaveCount(0)
          await expect(door).toBeVisible()
          expect(await page.evaluate(() => document.activeElement !== document.body && document.querySelector('.byd-data thead .byd-data-remove')!.contains(document.activeElement))).toBe(true)
        })
      }
    }
  }
}
