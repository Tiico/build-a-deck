import type { Page } from '@playwright/test'
import { logIn, makeProject } from '../support/api.js'
import { DESK } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// Vägen tillbaka (#1217, L80), i den byggda appen: ett bord öppnas bredvid editorn, och bordets
// «‹ spelet» tar fram editorns egen flik i stället för att öppna en ny. Ett bord som redan har en
// flik öppnas i den. Båda är flikar som letar upp varandra med namn, vilket bara en riktig
// webbläsare kan pröva — och som en flik öppnad med `noopener` aldrig hittar.
test.use({ viewport: DESK.viewport })

// A mark the editor's page carries for as long as it is not loaded again.
const kept = (page: Page) => page.evaluate(() => (window as unknown as { kept?: number }).kept)

test('the TV started from the editor leads back to the editor tab, and a way in that has a tab opens in it', async ({ page }) => {
  await logIn(page.request)
  const project = await makeProject(page.request, { name: 'Fredagskort', players: 2, cards: 3 })
  await page.goto(project.editorUrl)
  await expect(page.getByText('Fredagskort').first()).toBeVisible()
  await page.evaluate(() => ((window as unknown as { kept: number }).kept = 1))

  await page.locator('header').getByRole('button', { name: /^(Starta bord|Start a table)$/ }).click()
  const dialog = page.getByRole('dialog', { name: /^(Starta ett bord|Start a table)$/ })
  const opened = page.context().waitForEvent('page')
  await dialog.getByRole('button', { name: /^(Starta|Start)$/ }).click()
  const tv = await opened
  await tv.waitForURL(/\/table\?/)
  await expect(tv.locator('.byd-pile').first()).toBeVisible()

  // The TV's way back names the game, and takes the editor's own tab out: no tab is added, and
  // the editor is not loaded again — the mark it carried is still there.
  const tabs = page.context().pages().length
  await tv.getByRole('link', { name: /Fredagskort/ }).click()
  await expect.poll(() => page.url()).toMatch(/\/editor\?.*#$/)
  expect(page.context().pages(), 'no tab was opened for the way back').toHaveLength(tabs)
  expect(await kept(page), 'the editor was not loaded again').toBe(1)

  // «Öppna bordet» in the Bord tab opens the table in the tab it already has: the TV's.
  await page.getByRole('tab', { name: /^(Bord|Tables)$/ }).click()
  await Promise.all([tv.waitForEvent('load'), page.getByRole('link', { name: /^(Öppna bordet|Open the table)/ }).first().click()])
  expect(page.context().pages(), 'the table that has a tab opens in it').toHaveLength(tabs)

  // A table of computers seats the host beside the editor (#1286), and its «Öppna bordet» is that
  // seat, once: pressed again, the same tab is brought out rather than a second one opened.
  await page.locator('header').getByRole('button', { name: /^(Fler sätt att öppna bordet|More ways to open the table)$/ }).click()
  await page.getByRole('button', { name: /^(Nytt bord|New table)$/ }).click()
  await page.getByRole('button', { name: /^(Starta ett nytt ändå|Start a new one anyway)$/ }).click()
  const computers = page.getByRole('dialog', { name: /^(Starta ett bord|Start a table)$/ })
  await computers.getByRole('radio', { name: /^(Var och en vid sin dator|Each at their own computer)$/ }).check()
  await computers.getByRole('textbox').fill('Vera')
  const seated = page.context().waitForEvent('page')
  await computers.getByRole('button', { name: /^(Starta och sätt dig|Start and sit down)$/ }).click()
  const online = await seated
  await online.waitForURL(/\/online\?/)
  await expect(online.locator('.byd-seat-name[data-me="true"]')).toBeAttached()
  const withSeat = page.context().pages().length
  const mine = page.locator(`.byd-table-row[data-table="${new URL(online.url()).searchParams.get('session')}"]`).getByRole('link', { name: /^(Öppna bordet|Open the table)/ })
  await Promise.all([online.waitForEvent('load'), mine.click()])
  expect(page.context().pages(), 'the seat that has a tab opens in it').toHaveLength(withSeat)
  await expect(online.locator('.byd-seat-name[data-me="true"]')).toBeAttached()

  // And the seat's own way back leads to the same editor tab, the seat kept: from its head, and
  // from the exit sheet's first choice — which the waiting room, still standing over a table that
  // has not started, used to cover.
  await online.getByRole('link', { name: /Fredagskort/ }).click()
  await expect.poll(() => page.url()).toMatch(/\/editor\?.*#$/)
  expect(page.context().pages()).toHaveLength(withSeat)
  expect(await kept(page)).toBe(1)
  await online.getByRole('button', { name: /^(Lämna|Leave)/ }).click()
  const sheet = online.getByRole('dialog', { name: /^(Lämna bordet\?|Leave the table\?)$/ })
  await sheet.getByRole('link', { name: /Fredagskort/ }).click()
  await expect(sheet).toBeHidden()
  expect(page.context().pages()).toHaveLength(withSeat)
  expect(await kept(page)).toBe(1)
  await expect(online.locator('.byd-seat-name[data-me="true"]')).toBeAttached()
})
