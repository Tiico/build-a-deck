import type { Page } from '@playwright/test'
import { join } from '../support/api.js'
import { expect, test } from '../support/test.js'

// Bordsläget får samma lins som /online (#720, beställarens beslut 2026-10-06, C5). Speltestet
// 2026-10-02 rullade hjulet över filten på /table?mode=table och ingenting hände — kortet är 48 × 65
// px vid 1024 och linsen fanns redan på samma renderare — och två fingrar isär över filten på en
// pekskärm förstorade hela sidan tre gånger, så att hjälpen och hörnknapparna hamnade utanför
// bilden. Hjul och nyp över filten ändrar linsen; sidan står kvar.
const lens = (page: Page) => page.locator('.byd-table-frame').first().evaluate((el) => Number(el.getAttribute('data-lens') ?? 'NaN'))
const pageScale = (page: Page) => page.evaluate(() => window.visualViewport?.scale ?? 1)

// Två fingrar som dras isär över en punkt, steg för steg, och varje steg väntas in: en CDP-sändning
// som inte väntas in över en upptagen sida är vad #590 var.
async function pinchOut(page: Page, at: { x: number; y: number }, from = 40, to = 160) {
  const cdp = await page.context().newCDPSession(page)
  const points = (d: number) => [
    { x: at.x - d / 2, y: at.y, id: 1 },
    { x: at.x + d / 2, y: at.y, id: 2 },
  ]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(from) })
  for (let step = 1; step <= 10; step++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(from + ((to - from) * step) / 10) })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}

// Mitt på filten, där ingenting ligger: en dragning som börjar på ett kort är kortets.
async function bareMiddle(page: Page): Promise<{ x: number; y: number }> {
  const f = (await page.locator('.byd-table-frame').first().boundingBox())!
  return { x: f.x + f.width / 2, y: f.y + f.height * 0.42 }
}

test.describe('linsen i bordsläget (#720)', () => {
  test('hjulet över filten förstorar den, och «Visa hela bordet» ger bordet tillbaka', async ({ tableOf, open }) => {
    const table = await tableOf({ players: 4, counters: [], cards: 20, copies: 1 })
    const { page } = await open({ name: 'laptop', viewport: { width: 1024, height: 768 } }, `${table.tableUrl}&lang=sv`)
    await expect(page.locator('.byd-table-frame[data-mode="table"]')).toBeVisible()
    expect(await lens(page)).toBe(100)
    const at = await bareMiddle(page)
    await page.mouse.move(at.x, at.y)
    await page.mouse.wheel(0, -400)
    await expect.poll(() => lens(page)).toBeGreaterThan(100)
    await page.getByRole('button', { name: 'Visa hela bordet' }).click()
    await expect.poll(() => lens(page)).toBe(100)
  })
})

for (const surface of ['bordsläget', '/online'] as const) {
  test.describe(`nyp över filten på ${surface} (#720)`, () => {
    test('förstorar filten och inte sidan', async ({ tableOf, open, request }) => {
      const table = await tableOf({ players: 4, counters: [], cards: 20, copies: 1 })
      const url = surface === 'bordsläget' ? table.tableUrl : (await join(request, table, { name: 'Ada', seat: 'A' })).onlineUrl
      const { page } = await open({ name: 'tablet', viewport: { width: 1024, height: 768 }, hasTouch: true }, `${url}&lang=sv`)
      await expect(page.locator('.byd-table-frame[data-mode="table"]')).toBeVisible()
      expect(await lens(page)).toBe(100)
      await pinchOut(page, await bareMiddle(page))
      await expect.poll(() => lens(page)).toBeGreaterThan(150)
      expect(await pageScale(page)).toBe(1)
    })
  })
}
