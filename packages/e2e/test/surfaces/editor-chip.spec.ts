import type { Page } from '@playwright/test'
import { logIn, makeProjectOf, startTable } from '../../support/api.js'
import { gameDoc } from '../../support/game.js'
import { expect, test, type Fixtures } from '../../support/test.js'

// One chip (#648, beställarens beslut A 2026-10-01, prototyp 06). The editor had two forms for
// «a thing with an × beside it that takes it away»: the table's filter token, a rounded box of
// 34 px in the search field (#617), and the strip's seat, a pill of 44 px (#621). Now both are the
// same `.byd-chip`, a pill of 44 with the × a full target at its end, and only the surface's
// colour tells them apart.
//
// Measured on the built app with both chips drawn at once. Nothing here is a text width: the facts
// are which shape and how tall, so a wider font on Linux moves no answer.
const NAMES = ['Ada', 'Bo', 'Cy']

async function aTableAndAFilter(page: Page, host: Fixtures['host']) {
  await logIn(page.request)
  const doc = gameDoc({ name: 'Brickan', players: 3, cards: 4 })
  doc.rows = doc.rows.map((row, i) => ({ ...row, fields: { ...row.fields, typ: i % 2 ? 'plats' : 'varelse' } }))
  const project = await makeProjectOf(page.request, doc)
  const table = await startTable(page.request, project.id)
  const seats = doc.setup.seats
  const dealer = await host({ ...table, seats })
  await dealer.send(seats.map((seat, i) => ({ v: 'seat.claim', seat, name: NAMES[i] }) as never))
  await page.goto(project.editorUrl)
  await page.locator('#byd-editor-tab-table').click()
}

for (const width of [1024, 1280]) {
  test.describe(`the editor's chips at ${width} (#648)`, () => {
    test.use({ viewport: { width, height: 800 }, locale: 'sv-SE' })

    test('are one pill of 44 px, in the search field and in the table strip, without the crown growing', async ({ page, host }) => {
      await aTableAndAFilter(page, host)
      const strip = page.locator('.byd-editor-table-link')
      await expect(strip.getByRole('button', { name: 'Sparka Ada', exact: true })).toBeVisible()
      const crown = page.locator('[role="tabpanel"]:not([hidden]) .byd-crown').first()
      const bare = (await crown.boundingBox())!.height

      const field = page.getByRole('searchbox', { name: 'Sök i alla fält' })
      await field.click()
      await page.keyboard.type('typ:v')
      await page.keyboard.press('Enter')
      await expect(page.getByRole('button', { name: 'Ta bort filtret typ: varelse', exact: true })).toBeVisible()

      const drawn = await page.evaluate(() => {
        const read = (chip: Element) => {
          const box = chip.getBoundingClientRect()
          const button = chip.querySelector('button')!.getBoundingClientRect()
          const s = getComputedStyle(chip)
          return { classes: [...chip.classList], height: box.height, radius: parseFloat(s.borderTopLeftRadius), button: { width: button.width, height: button.height, right: button.right }, right: box.right }
        }
        const token = document.querySelector('.byd-data-filter')!.firstElementChild!
        const seat = document.querySelector('[data-host-seat]')!
        return { token: read(token), seat: read(seat), old: document.querySelectorAll('.byd-data-token').length }
      })
      expect(drawn.old).toBe(0)
      for (const [where, chip] of Object.entries({ field: drawn.token, strip: drawn.seat })) {
        expect(chip.classes, where).toContain('byd-chip')
        expect(Math.round(chip.height), where).toBe(44)
        // A pill: the corner is half the height, so the ends are round.
        expect(chip.radius, where).toBeGreaterThanOrEqual(chip.height / 2)
        // The × is a full target, square, at the chip's end.
        expect(chip.button.width, where).toBeGreaterThanOrEqual(44)
        expect(chip.button.height, where).toBeGreaterThanOrEqual(44)
        expect(Math.abs(chip.button.width - chip.button.height), where).toBeLessThan(1)
        expect(Math.abs(chip.button.right - chip.right), where).toBeLessThan(1)
      }
      // The field holds the 44 px chip inside its own edge, and the crown stays the row it was
      // before the filter was chosen (#130).
      expect(Math.abs((await crown.boundingBox())!.height - bare)).toBeLessThan(1)
    })
  })
}
