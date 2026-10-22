import type { Page } from '@playwright/test'
import { expect, test } from '../../support/test.js'
import { spelkortDoc } from '../../../server/scripts/spelkort.js'
import { svEditor } from '../../../web/src/i18n/sv.editor.js'
import { enEditor } from '../../../web/src/i18n/en.editor.js'
import { logIn, makeProjectOf, startTable } from '../../support/api.js'

// Editorns notis står i ett band under huvudet (#1073, beställarens val B 2026-10-21).
//
// Det som inte kunde hända — ett steg tillbaka som vägrades, en sparning som inte gick igenom, ett
// bord som inte kunde uppdateras — stod i huvudets rad, där det inte fanns något rum över under 1440.
// Notisen tog sitt rum från spelets namn, som klipptes till «S…», och bröts på fyra till tjugo rader
// i det som blev kvar; huvudet växte till 353 px och varje kontroll i det flyttade. Nu står den i
// ett amber band först under huvudet, som läsbandet: en rad, huvudet orört, och ett × som tar bort
// den.
//
// Mätt i den byggda appen på varje yta prototypen mätte: tre fönster, båda språken, Macens typsnitt
// och ett brett (Verdana, DejaVus bredd, som på CI:s Linux), med ett bord igång och utan, och med
// AI-panelen öppen och stängd.

const SIZES = [
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
] as const
const WIDE = ".byd-editor, .byd-editor * { font-family: Verdana, 'DejaVu Sans', sans-serif !important; }"
// Stackens låtsasleverantör tar den här nyckeln (test-support/fake-ai-provider.ts), och en
// formgivare med en nyckel har AI-panelen bredvid arbetet.
const KEY = 'sk-ant-api03-good-e2eNotARealKey-0123456789abcdefN1n2'

// De längsta meningarna notisen säger, ur editorns egna ord: sparningen som inte fick något svar
// (den längsta av alla), ångrans och gör oms vägran med de längsta «vad», #1072:s kolumn som är
// borta, #993:s avvisade ändring, en ikon vars fil inte kom fram och tagits bort igen (#1093: ikonverktyget
// lägger inte längre en ikon själv, så den som inte kunde läggas på kortet sägs inte), och den korta om bordet.
const said = (words: Record<string, string>) => {
  const fill = (key: string, values: Record<string, string> = {}) => words[key]!.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? '')
  return [
    fill('editor.save.offline'),
    fill('editor.save.forbidden'),
    fill('undo.refused', { what: words['undo.what.symbols']! }),
    fill('redo.refused', { what: words['undo.what.font']! }),
    fill('undo.dropped.one', { fields: fill('undo.dropped.field', { field: 'stämning' }) }),
    fill('editor.edit.refused'),
    fill('upload.undone', { what: fill('upload.undone.symbol', { name: 'svärd' }), why: words['upload.failed']! }),
    fill('editor.table.error.update'),
  ]
}
const SAID = { sv: said(svEditor), en: said(enEditor) }

const band = (page: Page) => page.locator('.byd-editor > header + .byd-editor-notice-band')

// Huvudet som det står: höjden, spelets namn och varje del av raden.
const headerNow = (page: Page) =>
  page.evaluate(() => {
    const header = document.querySelector('.byd-editor > header')!
    const name = header.querySelector<HTMLElement>(':scope > .byd-editor-name')!
    const shown = (el: Element) => el.getClientRects().length > 0 && el.getBoundingClientRect().width > 0
    const pieces = [...header.children].flatMap((el) => (el.classList.contains('byd-editor-split') ? [...el.children] : [el])).filter(shown)
    return {
      height: Math.round(header.getBoundingClientRect().height),
      name: { width: Math.round(name.getBoundingClientRect().width), cut: name.scrollWidth > name.clientWidth + 1 },
      pieces: pieces.map((el) => {
        const b = el.getBoundingClientRect()
        return `${el.className || el.tagName}@${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.width)}×${Math.round(b.height)}`
      }),
    }
  })

// Bandet med en mening: hur många rader den står på, var bandet står, vad det ligger över och hur
// stort ×-et är.
const bandNow = (page: Page) =>
  page.evaluate(() => {
    const header = document.querySelector('.byd-editor > header')!
    const el = document.querySelector<HTMLElement>('.byd-editor-notice-band')!
    const words = el.querySelector<HTMLElement>('.byd-editor-notice')!
    const close = el.querySelector<HTMLElement>('button')!
    const range = document.createRange()
    range.selectNodeContents(words)
    const lines = new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top))).size
    const b = el.getBoundingClientRect()
    const x = close.getBoundingClientRect()
    const next = el.nextElementSibling?.getBoundingClientRect()
    // Varje synlig kontroll utanför bandet vars ruta möter bandets, och som bandet skulle ta trycket från.
    const covers: string[] = []
    for (const c of document.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [role="tab"], [tabindex="0"]')) {
      if (el.contains(c) || c.getClientRects().length === 0) continue
      const r = c.getBoundingClientRect()
      const across = Math.min(r.right, b.right) - Math.max(r.left, b.left)
      const down = Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top)
      if (across <= 0.5 || down <= 0.5) continue
      const at = document.elementFromPoint(Math.max(r.left, b.left) + across / 2, Math.max(r.top, b.top) + down / 2)
      if (el.contains(at) || !c.contains(at)) covers.push((c.getAttribute('aria-label') ?? c.textContent ?? c.tagName).trim().slice(0, 30))
    }
    const t = range.getBoundingClientRect()
    return {
      lines,
      top: Math.round(b.top),
      headerBottom: Math.round(header.getBoundingClientRect().bottom),
      bottom: Math.round(b.bottom),
      nextTop: next ? Math.round(next.top) : null,
      left: Math.round(b.left),
      right: Math.round(b.right),
      window: document.documentElement.clientWidth,
      across: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      close: { width: x.width, height: x.height, fromRight: Math.round(b.right - x.right) },
      covers,
      text: { x: Math.floor(t.x), y: Math.floor(t.y), width: Math.ceil(t.width), height: Math.ceil(t.height) },
    }
  })

// Kontrasten läst på målade pixlar i meningens egen ruta: marken är den vanligaste färgen, och
// bläcket den av färgerna som täcker minst en hundradel av rutan som ligger längst från marken.
// Chromium svarar `color(srgb …)` på en beräknad färg, och en deklaration säger inte vad som ritades.
async function painted(page: Page, clip: { x: number; y: number; width: number; height: number }): Promise<{ ground: string; ink: string; ratio: number }> {
  const png = await page.screenshot({ clip })
  return page.evaluate(async (b64) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const canvas = new OffscreenCanvas(img.width, img.height)
    const g = canvas.getContext('2d')!
    g.drawImage(img, 0, 0)
    const d = g.getImageData(0, 0, img.width, img.height).data
    const count = new Map<number, number>()
    for (let i = 0; i < d.length; i += 4) {
      const k = (d[i]! << 16) | (d[i + 1]! << 8) | d[i + 2]!
      count.set(k, (count.get(k) ?? 0) + 1)
    }
    const all = [...count.entries()].sort((a, b) => b[1] - a[1])
    const rgb = (k: number) => [(k >> 16) & 255, (k >> 8) & 255, k & 255] as const
    const lum = ([r, gr, b]: readonly number[]) => {
      const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
      return 0.2126 * f(r!) + 0.7152 * f(gr!) + 0.0722 * f(b!)
    }
    const ground = rgb(all[0]![0])
    const px = d.length / 4
    let ink = ground
    let best = 1
    for (const [k, n] of all) {
      if (n < px * 0.01) continue
      const c = rgb(k)
      const [hi, lo] = [lum(c), lum(ground)].sort((a, b) => b - a) as [number, number]
      const ratio = (hi + 0.05) / (lo + 0.05)
      if (ratio > best) {
        best = ratio
        ink = c
      }
    }
    const hex = (c: readonly number[]) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('')
    return { ground: hex(ground), ink: hex(ink), ratio: Math.round(best * 100) / 100 }
  }, png.toString('base64'))
}

for (const size of SIZES) {
  for (const lang of ['sv', 'en'] as const) {
    for (const font of ['mac', 'bred'] as const) {
      for (const table of ['bord', 'utan'] as const) {
        for (const ai of ['plain', 'ai'] as const) {
          test.describe(`notisens band vid ${size.width} × ${size.height}, ${lang}, ${font}, ${table}, ${ai}`, () => {
            test.use({ viewport: size, locale: lang === 'sv' ? 'sv-SE' : 'en-GB' })

            test('står på en rad under huvudet, rör inte huvudet, ligger inte över något och stängs med ×', async ({ page }) => {
              await logIn(page.request)
              if (ai === 'ai') expect((await page.request.put('/me/ai-key', { data: { provider: 'anthropic', key: KEY } })).status()).toBe(200)
              const project = await makeProjectOf(page.request, spelkortDoc(4))
              if (table === 'bord') await startTable(page.request, project.id)
              await page.goto(`${project.editorUrl}&lang=${lang}`)
              if (font === 'bred') await page.addStyleTag({ content: WIDE })
              const primary = page.locator('.byd-editor > header .byd-editor-primary:not(.byd-editor-caret)')
              await expect(primary).toHaveAttribute('data-table-kind', table === 'bord' ? 'running' : 'none')
              // AI-panelen öppen bredvid arbetet, eller hopfälld till sin flik.
              const panel = page.locator('aside.byd-ai[data-open]')
              if (ai === 'ai') {
                const rail = page.locator('.byd-ai-rail')
                if (await rail.isVisible()) await rail.click()
                await expect(panel).toBeVisible()
              } else await expect(panel).toHaveCount(0)
              // Huvudet är inte färdigt förrän socketen har sagt vem som är inne: utan den väntan
              // mättes huvudet 28 px smalare än det blev en stund senare, och notisen fick skulden
              // för att den egna initialen kom fram (#1104, grinden under last).
              await expect(page.locator('.byd-editor > header .byd-editor-here i')).toHaveCount(1)
              const before = await headerNow(page)
              const workBefore = await page.locator('.byd-editor > main').evaluate((m) => Math.round(m.getBoundingClientRect().top))

              // En riktig notis: bordets begäran faller, och editorn säger det.
              if (table === 'bord') await page.route('**/sessions/*/prepare**', (r) => r.fulfill({ status: 500, body: 'nej' }))
              else await page.route('**/projects/*/sessions', (r) => (r.request().method() === 'POST' ? r.fulfill({ status: 500, body: 'nej' }) : r.continue()))
              await primary.click()
              const words = lang === 'sv' ? svEditor : enEditor
              await expect(band(page).locator('.byd-editor-notice')).toHaveText(words[table === 'bord' ? 'editor.table.error.update' : 'editor.table.error.start'])
              await expect(band(page).locator('.byd-editor-notice')).toHaveAttribute('role', 'alert')
              // Huvudet bär den inte längre.
              await expect(page.locator('.byd-editor > header .byd-editor-notice')).toHaveCount(0)

              // Varje mening står i samma element och samma stilmall som den riktiga.
              for (const text of SAID[lang]) {
                await band(page).locator('.byd-editor-notice').evaluate((el, t) => {
                  el.firstChild!.nodeValue = t
                }, text)
                const now = await bandNow(page)
                expect(now.lines, text).toBe(1)
                expect(await headerNow(page), text).toEqual(before)
                // Först under huvudet, och det som står under det börjar där det slutar.
                expect(now.top, text).toBe(now.headerBottom)
                expect(now.nextTop, text).toBe(now.bottom)
                expect([now.left, now.right], text).toEqual([0, now.window])
                expect(now.across, text).toBe(0)
                expect(now.covers, text).toEqual([])
                expect(now.close.width, text).toBeGreaterThanOrEqual(44)
                expect(now.close.height, text).toBeGreaterThanOrEqual(44)
                expect(now.close.fromRight, text).toBeLessThanOrEqual(16)
              }
              const now = await bandNow(page)
              const ink = await painted(page, now.text)
              expect(ink.ratio, `${ink.ink} på ${ink.ground}`).toBeGreaterThanOrEqual(4.5)
              // Arbetet flyttas ned med bandet och inget mer.
              const workDown = (await page.locator('.byd-editor > main').evaluate((m) => Math.round(m.getBoundingClientRect().top))) - workBefore
              expect(workDown).toBe(now.bottom - now.top)

              // × tar bort bandet, och arbetet står där det stod.
              const close = band(page).getByRole('button', { name: lang === 'sv' ? 'Stäng meddelandet' : 'Close the message' })
              await close.click()
              await expect(band(page)).toHaveCount(0)
              expect(await page.locator('.byd-editor > main').evaluate((m) => Math.round(m.getBoundingClientRect().top))).toBe(workBefore)
              expect(await headerNow(page)).toEqual(before)
              // Fokus låg på × när bandet gick, och hamnar på arbetet och aldrig på ingenting.
              expect(await page.evaluate(() => document.activeElement?.getAttribute('role'))).toBe('tabpanel')
            })
          })
        }
      }
    }
  }
}

// Färgerna som täcker minst en hundradel av en ruta, som de målades.
async function colours(page: Page, clip: { x: number; y: number; width: number; height: number }): Promise<string[]> {
  const png = await page.screenshot({ clip })
  return page.evaluate(async (b64) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const canvas = new OffscreenCanvas(img.width, img.height)
    const g = canvas.getContext('2d')!
    g.drawImage(img, 0, 0)
    const d = g.getImageData(0, 0, img.width, img.height).data
    const count = new Map<string, number>()
    for (let i = 0; i < d.length; i += 4) {
      const k = '#' + [d[i]!, d[i + 1]!, d[i + 2]!].map((v) => v.toString(16).padStart(2, '0')).join('')
      count.set(k, (count.get(k) ?? 0) + 1)
    }
    return [...count.entries()].filter(([, n]) => n >= d.length / 4 / 100).map(([k]) => k)
  }, png.toString('base64'))
}

// Med tangentbordet: från huvudets sista kontroll är ×-et nästa tabbstopp, ringen ritas inuti det
// så att fönstrets kant aldrig klipper den, och Enter stänger bandet och lämnar fokus åt arbetet.
// Tab och Enter är riktiga tangenttryckningar, eftersom det bara är på den vägen ringen ritas.
test.describe('notisens band med tangentbordet', () => {
  test.use({ viewport: { width: 1280, height: 800 }, locale: 'sv-SE' })

  test('nås med Tab efter huvudet, ritar sin ring inuti ×-et och stängs med Enter', async ({ page }) => {
    await logIn(page.request)
    const project = await makeProjectOf(page.request, spelkortDoc(4))
    await page.goto(`${project.editorUrl}&lang=sv`)
    const primary = page.locator('.byd-editor > header .byd-editor-primary:not(.byd-editor-caret)')
    await expect(primary).toHaveAttribute('data-table-kind', 'none')
    await page.route('**/projects/*/sessions', (r) => (r.request().method() === 'POST' ? r.fulfill({ status: 500, body: 'nej' }) : r.continue()))
    await primary.click()
    await expect(band(page).locator('.byd-editor-notice')).toHaveText(svEditor['editor.table.error.start'])

    await page.locator('.byd-editor > header .byd-editor-caret').focus()
    await page.keyboard.press('Tab')
    const close = band(page).getByRole('button', { name: 'Stäng meddelandet' })
    await expect(close).toBeFocused()
    expect(await close.evaluate((el) => el.matches(':focus-visible'))).toBe(true)
    // Ringen är målad inuti ×-ets egen ruta, och rutan slutar innanför fönstret.
    const box = (await close.boundingBox())!
    expect(box.x + box.width).toBeLessThanOrEqual(1280)
    expect(await colours(page, box)).toContain('#9cc6ff')

    await page.keyboard.press('Enter')
    await expect(band(page)).toHaveCount(0)
    expect(await page.evaluate(() => document.activeElement?.getAttribute('role'))).toBe('tabpanel')
  })
})
