import type { Locator, Page } from '@playwright/test'
import { PHONE } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// What looks modal on the phone is modal (#559 P-19, WCAG 4.1.2): the counter's number lock and the
// card reader stand behind a dark veil over the whole screen, and said `aria-modal="false"` — a
// screen reader was told the page behind was still there to use, and Tab walked out to it. And the
// hand's help is called what its question mark is called, not the topic word alone.
const staysIn = async (page: Page, box: Locator, presses: number) => {
  for (let i = 0; i < presses; i++) {
    await page.keyboard.press('Tab')
    expect(await box.evaluate((el) => el.contains(document.activeElement))).toBe(true)
  }
}

test('the number lock and the reader are modal and keep Tab inside, and the help is named for its topic', async ({ tableOf, player, host }) => {
  const table = await tableOf({ players: 2, cards: 8 })
  const ada = await player(table, { name: 'Ada', seat: 'A', device: PHONE })
  const dealer = await host(table)
  await dealer.send([{ v: 'deal', from: 'draw', to: ['hand:A'], each: 3 }])
  const page = ada.page
  await expect(page.locator('.byd-strip[data-hand] [data-hand-card]')).toHaveCount(3)

  await page.getByRole('button', { name: /Set value|Sätt värde/ }).first().click()
  const lock = page.locator('.byd-set-value')
  await expect(lock).toHaveAttribute('aria-modal', 'true')
  await staysIn(page, lock, 20)
  await page.keyboard.press('Escape')
  await expect(lock).toHaveCount(0)

  await page.locator('.byd-strip[data-hand] [data-hand-card]').first().tap()
  const reader = page.locator('.byd-inspect')
  await expect(reader).toBeVisible()
  await page.waitForTimeout(400)
  await expect(reader).toHaveAttribute('aria-modal', 'true')
  await staysIn(page, reader, 12)
  await page.keyboard.press('Escape')
  await expect(reader).toHaveCount(0)

  await page.getByRole('button', { name: /^(Help about|Hjälp om) / }).first().click()
  await expect(page.getByRole('dialog', { name: /^(Help about|Hjälp om) / })).toBeVisible()
})
