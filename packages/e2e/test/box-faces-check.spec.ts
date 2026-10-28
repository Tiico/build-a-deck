import type { Page } from '@playwright/test'
import { expect, test } from '../support/test.js'
import { logIn, makeProjectOf } from '../support/api.js'
import { DESK } from '../support/devices.js'
import { gameDoc } from '../support/game.js'

// #1459: Fysisk kontroll (E5) läste bara kortens ytor, så en text på 2 pt på en ritad låda gav ingen
// anmärkning i editorn och stoppade ingen beställning. Här står en sådan text på lådans lock, i den
// byggda appen: raden för lådan säger felet och ytan, och tar designern till locket i fliken «Låda».
test.use({ viewport: DESK.viewport, locale: 'sv-SE' })

const errors = (page: Page): string[] => {
  const seen: string[] = []
  page.on('pageerror', (error) => seen.push(error.message))
  return seen
}

// 40 kort: lådan är 65 × 90 × 14 mm, så locket är 65 × 14 mm.
const withLid = (sizePt: number) => ({
  ...gameDoc({ name: 'Skogens råd', cards: 40 }),
  box: {
    type: { id: 'box.tuck', version: 1 },
    faces: {
      lid: {
        base: [
          { kind: 'shape', id: 'ground', x: -3, y: -3, w: 71, h: 20, shape: 'rect', fill: '#2b3a4a' },
          { kind: 'text', id: 'namnet', x: 5, y: 4, w: 55, h: 6, bind: { literal: 'SR' }, font: { family: 'sans-serif', sizePt }, color: '#f3ecdc' },
        ],
        variants: {},
      },
    },
  },
})

test('säger att texten på lådans lock är för liten och tar designern till locket', async ({ page }) => {
  const thrown = errors(page)
  await logIn(page.request)
  const project = await makeProjectOf(page.request, withLid(2))
  await page.goto(project.editorUrl)
  await page.getByRole('button', { name: /^Fysisk kontroll/ }).click()
  const remark = page.locator('.byd-wall-checks li[data-check="box-faces"]')
  await expect(remark).toHaveAttribute('data-severity', 'error')
  await remark.getByRole('button', { name: /^Lådans ytor/ }).click()
  const go = remark.getByRole('list', { name: 'Ytorna den gäller' }).getByRole('button')
  await expect(go).toHaveText('Lock: för liten text, 2 pt är under 6 pt, som är minsta läsbara storlek för skriften. Till ytan i Låda ›')
  await go.click()
  await expect(page.locator('#byd-editor-tab-box')).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.byd-box-panel[data-face="lid"]')).toHaveAttribute('data-chosen', '')
  await expect(page.locator('[data-layer="namnet"]')).toHaveAttribute('aria-selected', 'true')
  expect(thrown).toEqual([])
})

test('stoppar en beställning så länge lådans text är för liten, och inte för en läsbar', async ({ page }) => {
  await logIn(page.request)
  const small = await makeProjectOf(page.request, withLid(2))
  const refused = await page.request.post(`/projects/${small.id}/print`, { data: {} })
  expect(refused.status()).toBe(422)
  expect(((await refused.json()) as { errors: unknown[] }).errors).toContainEqual({ face: 'box.lid', element: 'namnet', code: 'text-too-small', severity: 'error', values: { sizePt: 2, floor: 6 } })
  const readable = await makeProjectOf(page.request, withLid(9))
  const body = (await (await page.request.post(`/projects/${readable.id}/print`, { data: {} })).json()) as { errors?: { face: string }[]; warnings?: { face: string }[] }
  expect((body.errors ?? []).filter((e) => e.face.startsWith('box.'))).toEqual([])
})
