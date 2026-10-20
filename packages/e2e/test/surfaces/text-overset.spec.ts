import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from '../../support/test.js'
import { logIn, makeProjectOf } from '../../support/api.js'
import { gameDoc } from '../../support/game.js'

// En text som inte ryms ens i minsta graden säger det vid rutan (#808, beställarens beslut
// 2026-10-17, variant A «Kanten och brickan»).
//
// Rutan ramas in med en streckad bärnstensram över en mörk ring, 4 px utanför textrutan, och under
// den hänger en mörk bricka: «▲ Ryms inte · N rader till», på väggens små kort «▲ +N rader». Allt
// ligger utanpå kortet och aldrig i det kompilatorn ritar (E2). Kortets namn bär hela meningen, och
// Fysisk kontroll säger samma sak som väggens bricka, med en väg till raden i Tabell (E6).
//
// Vad som mäts är det byggda appen: guiden vid 1280 och 390, Mall och väggen. Hur många rader som
// inte ryms beror på typsnittets mått och står därför aldrig som ett tal här — bara att det är fler
// än noll, och att brickan, namnet och listan säger samma tal.
const GOOGLE = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//
const FACE = readFileSync(join(import.meta.dirname, '..', '..', '..', '..', 'docs', 'ux-audits', '2026-09-22', 'typsnitt', 'crimson-pro.woff2'))

// Prototypens regeltext, tre gånger om: för lång för rutan i 6 pt i varje typsnitt en maskin kan ha.
const ONCE =
  'När du spelar det här kortet: dra två kort och kasta ett. Om du har fler än tre kort på hand får du lägga ett under draghögen. ' +
  'Motståndaren till vänster visar sitt översta kort, och du väljer om det ska ligga kvar. Varje spelare som har ett kort med en sköld ' +
  'får behålla ett kort extra på handen till nästa runda, och den som har flest kvar när högen tar slut vinner. '
const LONG = ONCE.repeat(3).trim()

// Google answers with a face from the repo, so the theme's text is set in a file the page loaded
// and not in whatever the machine has (as in `wizard-theme-preselection.spec.ts`).
async function google(page: Page) {
  await page.route(GOOGLE, async (route) => {
    const url = route.request().url()
    if (!url.includes('googleapis.com')) return route.fulfill({ status: 200, contentType: 'font/woff2', headers: { 'access-control-allow-origin': '*' }, body: FACE })
    const family = new URL(url).searchParams.get('family')?.split(':')[0] ?? ''
    const slug = family.toLowerCase().replace(/ /g, '-')
    return route.fulfill({ status: 200, contentType: 'text/css', headers: { 'access-control-allow-origin': '*' }, body: `/* latin */\n@font-face { font-family: '${family}'; src: url(https://fonts.gstatic.com/s/${slug}/latin.woff2) format('woff2'); }\n` })
  })
}

type Box = { x: number; y: number; width: number; height: number }
const rect = (l: Locator): Promise<Box> => l.evaluate((el) => el.getBoundingClientRect().toJSON() as Box)

// The frame stands 4 px outside the box on every side, so it never touches a letter; the tag hangs
// under it, centred on the box.
async function expectMarked(box: Locator, frame: Locator, tag: Locator) {
  const b = await rect(box)
  const f = await rect(frame)
  for (const [got, want] of [
    [f.x, b.x - 4],
    [f.y, b.y - 4],
    [f.x + f.width, b.x + b.width + 4],
    [f.y + f.height, b.y + b.height + 4],
  ] as const) expect(Math.abs(got - want), JSON.stringify({ box: b, frame: f })).toBeLessThan(1)
  const k = await rect(tag)
  expect(k.y).toBeGreaterThanOrEqual(b.y + b.height + 4)
  expect(Math.abs(k.x + k.width / 2 - (b.x + b.width / 2))).toBeLessThan(1)
  // Written at the screen's own size, whatever the card is drawn at.
  expect(await tag.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThan(15)
}

const lost = async (tag: Locator): Promise<number> => Number(/(\d+)/.exec((await tag.textContent()) ?? '')?.[1] ?? Number.NaN)

async function guide(page: Page, phone = false) {
  await google(page)
  await logIn(page.request)
  await page.goto('/new')
  await page.getByLabel('Spelets namn').fill('Skogens herrar')
  if (phone) await page.getByRole('tab', { name: '2 · Fälten' }).click()
  await page.getByRole('button', { name: 'Klassisk', exact: true }).click()
  await page.getByRole('button', { name: 'Välj temat Krönika' }).click()
  if (phone) await page.getByRole('tab', { name: '3 · Korten' }).click()
  await page.getByLabel('kort 1 Titel').fill('Skogsvandring')
  await page.getByLabel('kort 1 Regeltext').fill(LONG)
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  // The card stands in the theme, and not greyed behind the catalogue's silence (#687).
  await expect(page.locator('.byd-wizard-preview')).not.toHaveAttribute('data-unseen')
}

test.describe('the guided start', () => {
  test.use({ viewport: { width: 1280, height: 800 }, locale: 'sv-SE' })

  test('frames the box whose text does not fit, says how much is lost under it, and names it in the card’s name', async ({ page }) => {
    await guide(page)
    const preview = page.locator('.byd-wizard-preview')
    const tag = preview.locator('.byd-overset-tag')
    await expect(tag).toHaveText(/^▲Ryms inte · \d+ rader till$/)
    const n = await lost(tag)
    expect(n).toBeGreaterThan(0)
    await expectMarked(page.locator('#wizard-live [data-element="body"]'), preview.locator('.byd-overset-frame'), tag)
    await expect(preview.getByRole('img', { name: /^Förhandsvisning av kort 1: Skogsvandring\./ })).toHaveAccessibleName(
      `Förhandsvisning av kort 1: Skogsvandring. «Regeltext» ryms inte ens i 6 pt: ${n} rader syns inte på kortet.`,
    )
    // The card is the compiler's, and nothing of the mark is in it (E2).
    await expect(page.locator('#wizard-live [data-card]')).not.toContainText('Ryms inte')

    // A text that fits is marked nowhere.
    await page.getByLabel('kort 1 Regeltext').fill('Dra ett kort.')
    await expect(preview.locator('.byd-overset-frame, .byd-overset-tag')).toHaveCount(0)
    await expect(preview.getByRole('img', { name: /^Förhandsvisning av kort 1: Skogsvandring$/ })).toBeVisible()
  })
})

test.describe('the guided start on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, locale: 'sv-SE', hasTouch: true, isMobile: true })

  test('keeps the mark and its tag inside the screen at 390 px', async ({ page }) => {
    await guide(page, true)
    const preview = page.locator('.byd-wizard-preview')
    const tag = preview.locator('.byd-overset-tag')
    await expect(tag).toHaveText(/^▲Ryms inte · \d+ rader till$/)
    await expectMarked(page.locator('#wizard-live [data-element="body"]'), preview.locator('.byd-overset-frame'), tag)
    const k = await rect(tag)
    expect(k.x).toBeGreaterThanOrEqual(0)
    expect(k.x + k.width).toBeLessThanOrEqual(390)
    // Not cut short: the whole of the tag's words are drawn.
    expect(await tag.evaluate((el) => el.scrollWidth <= el.clientWidth + 0.5)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  })
})

test.describe('the editor', () => {
  test.use({ viewport: { width: 1280, height: 800 }, locale: 'sv-SE' })

  async function editor(page: Page) {
    await logIn(page.request)
    const doc = gameDoc({ name: 'Skogens herrar', cards: 4 })
    const second = doc.rows[1]!
    second.fields['body'] = LONG
    second.fields['antal'] = 2
    const project = await makeProjectOf(page.request, doc)
    await page.goto(project.editorUrl)
    await expect(page.locator('.byd-wall-card')).toHaveCount(4)
    return second
  }

  test('marks the card on the wall in the short form, under the copies badge, and the check says the same', async ({ page }) => {
    const second = await editor(page)
    const tile = page.locator(`.byd-wall-card[data-card-ref="${second.id}"]`)
    const tag = tile.locator('.byd-overset-tag')
    await expect(tag).toHaveText(/^▲\+\d+ rader$/)
    const n = await lost(tag)
    expect(n).toBeGreaterThan(0)
    await expectMarked(tile.locator('[data-element="body"]'), tile.locator('.byd-overset-frame'), tag)
    // The only card marked is the one whose text does not fit.
    await expect(page.locator('.byd-overset-tag')).toHaveCount(1)
    // The card's name carries the whole sentence.
    await expect(tile).toHaveAccessibleName(new RegExp(`«body» ryms inte ens i 6 pt: ${n} rader syns inte på kortet\\.`))

    // The copies badge stands over the frame's corner and is not crossed by it.
    const copies = tile.locator('.byd-wall-copies')
    const c = await rect(copies)
    const over = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('.byd-wall-copies') !== null, { x: c.x + c.width / 2, y: c.y + c.height / 2 })
    expect(over).toBe(true)

    // Fysisk kontroll says it too, on that card, and its warning badge counts it.
    await expect(tile.locator('.byd-wall-warnings')).toHaveText('1')
    await page.getByRole('button', { name: /Fysisk kontroll/ }).click()
    const remark = page.locator('[data-check="text-overflow"]')
    await expect(remark).toContainText('text som inte ryms')
    await expect(remark).toContainText('1 kort')
    await remark.getByRole('button', { name: /text som inte ryms/ }).click()
    // And it leads to the card's row in the table (E6).
    const link = remark.getByRole('button', { name: `${String(second.fields['title'])}: «body» ryms inte ens i 6 pt: ${n} rader syns inte på kortet. Till raden i Tabell ›` })
    await link.click()
    await expect(page.locator('#byd-editor-tab-table')).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator(`tr[data-card-ref="${second.id}"]`)).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator(`tr[data-card-ref="${second.id}"]`)).toBeInViewport()
  })

  test('marks the box on the canvas in Mall, in the long form, and none of it is the card’s', async ({ page }) => {
    const second = await editor(page)
    await page.locator(`.byd-wall-card[data-card-ref="${second.id}"]`).click()
    await page.locator('#byd-editor-tab-template').click()
    const stage = page.locator('.byd-canvas-stage')
    const tag = stage.locator('.byd-overset-tag')
    await expect(tag).toHaveText(/^▲Ryms inte · \d+ rader till$/)
    const n = await lost(tag)
    await expect(tag).toHaveAccessibleName(`«body» ryms inte ens i 6 pt: ${n} rader syns inte på kortet.`)
    await expectMarked(page.locator('#canvas [data-element="body"]'), stage.locator('.byd-overset-frame'), tag)
    await expect(page.locator('#canvas [data-card]')).not.toContainText('Ryms inte')
  })
})
