import type { Page } from '@playwright/test'
import { logIn, makeProject } from '../support/api.js'
import { expect, test } from '../support/test.js'

// Lådan växer i kortväggens fot (#1415, L91, introduktion 2), i den byggda appen.
//
// Ett tomt spel har ingen låda, ingen «Starta bord» och ingen flik «Låda». Med första kortet är leken
// spelbar (beställarens beslut 2026-10-27): lådan står längst ut i foten med sina mått, «Starta bord»
// och fliken kommer, och lådan blir tjockare för varje kort. Raden är en knapp till fliken. Den tar en
// rad i foten och inget annat i foten flyttar sig för den, vid 1024, 1280 och 1440 (L12).

const foot = (page: Page) => page.locator('.byd-crown-foot').first()
const box = (page: Page) => foot(page).locator('.byd-wall-box')
const tab = (page: Page, name: string) => page.getByRole('tablist', { name: 'Editorlägen' }).getByRole('tab', { name, exact: true })

for (const width of [1024, 1280, 1440]) {
  test.describe(`vid ${width}`, () => {
    test.use({ viewport: { width, height: 800 }, locale: 'sv-SE' })

    test('lådan kommer med första kortet, växer med leken och är vägen till fliken «Låda»', async ({ page }) => {
      await logIn(page.request)
      const project = await makeProject(page.request, { name: 'Skogens råd', cards: 0 })
      await page.goto(project.editorUrl)
      await expect(page.getByRole('heading', { name: 'Mallen är ritad, men det finns inga kort' })).toBeVisible()

      // Tom lek: ingenting om lådan, och inget bord att starta.
      await expect(box(page)).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Starta bord' })).toHaveCount(0)
      await expect(tab(page, 'Låda')).toHaveCount(0)
      const count = foot(page).getByText('0 kort', { exact: true })
      const before = { foot: (await foot(page).boundingBox())!, count: (await count.boundingBox())! }

      // Första kortet: lådan står i foten, och leken är spelbar.
      await page.getByRole('button', { name: '+ Nytt kort' }).click()
      const first = page.getByRole('button', { name: 'Låda 65 × 90 × 2,5 mm' })
      await expect(first).toBeVisible()
      await expect(page.getByRole('button', { name: 'Starta bord' })).toBeVisible()
      await expect(tab(page, 'Låda')).toBeVisible()

      // Inget i foten flyttade sig för lådan: foten är lika hög, och antalet står där det stod.
      const after = { foot: (await foot(page).boundingBox())!, count: (await foot(page).getByText('1 kort', { exact: true }).boundingBox())! }
      expect(after.foot.height).toBeCloseTo(before.foot.height, 0)
      expect(after.foot.y).toBeCloseTo(before.foot.y, 0)
      expect(after.count.x).toBeCloseTo(before.count.x, 0)
      expect(after.count.y).toBeCloseTo(before.count.y, 0)
      // Längst ut i foten, och helt inom den.
      const drawn = (await first.boundingBox())!
      expect(drawn.x + drawn.width).toBeLessThanOrEqual(after.foot.x + after.foot.width + 0.5)
      expect(drawn.x).toBeGreaterThan(after.count.x + after.count.width)
      // Knappens träffyta är editorns 44 px, och det som ritas står inom fotens rad.
      expect(drawn.height).toBeGreaterThanOrEqual(44)
      const symbol = (await first.locator('.byd-wall-box-symbol').boundingBox())!
      expect(symbol.y).toBeGreaterThanOrEqual(after.foot.y)
      expect(symbol.y + symbol.height).toBeLessThanOrEqual(after.foot.y + after.foot.height + 0.5)
      const words = (await first.locator('.byd-wall-box-words').boundingBox())!
      expect(words.y + words.height / 2).toBeCloseTo(after.count.y + after.count.height / 2, 0)
      const symbolWidth = await first.locator('.byd-wall-box-side').evaluate((el) => (el as SVGGraphicsElement).getBBox().width)

      // Ett kort till, i Tabell: lådan blir tjockare.
      await tab(page, 'Tabell').click()
      await page.getByRole('button', { name: '+ Nytt kort' }).first().click()
      await tab(page, 'Kortvägg').click()
      const second = page.getByRole('button', { name: 'Låda 65 × 90 × 3 mm' })
      await expect(second).toBeVisible()
      expect(await second.locator('.byd-wall-box-side').evaluate((el) => (el as SVGGraphicsElement).getBBox().width)).toBeGreaterThan(symbolWidth)

      // Knappen nås med tangentbordet och öppnar fliken.
      await second.focus()
      await page.keyboard.press('Enter')
      await expect(tab(page, 'Låda')).toHaveAttribute('aria-selected', 'true')
      await expect(page.locator('.byd-box-net')).toBeVisible()
    })
  })
}
