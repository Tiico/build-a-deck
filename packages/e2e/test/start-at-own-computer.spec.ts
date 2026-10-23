import { logIn, makeProject } from '../support/api.js'
import { DESK } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// Starta frågar hur ni sitter (L77, #1130), i den byggda appen: värden trycker Starta i editorns
// huvud, väljer «Var och en vid sin dator», skriver sitt namn och hamnar vid bordet på `/online`
// i en egen flik — på första lediga plats, under det namnet, och inte som «Designern».
//
// Fliken öppnas i själva klicket och får adressen när starten har svarat, för att en webbläsare
// bara släpper fram ett nytt fönster i handens egen gest. Det är just det som bara en riktig
// webbläsare kan pröva.
test.use({ viewport: DESK.viewport })

test('Starta → «Var och en vid sin dator» seats the host at /online under the name she gave', async ({ page }) => {
  await logIn(page.request)
  const project = await makeProject(page.request, { name: 'Fredagskort', players: 2, cards: 3 })
  await page.goto(project.editorUrl)
  await expect(page.getByText('Fredagskort').first()).toBeVisible()

  await page.locator('header').getByRole('button', { name: /^(Starta bord|Start a table)$/ }).click()
  const dialog = page.getByRole('dialog', { name: /^(Starta ett bord|Start a table)$/ })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('radio', { name: /^(Var och en vid sin dator|Each at their own computer)$/ }).check()
  await dialog.getByRole('textbox', { name: /^(Ditt namn vid bordet|Your name at the table)$/ }).fill('Vera')

  const opened = page.context().waitForEvent('page')
  await dialog.getByRole('button', { name: /^(Starta och sätt dig|Start and sit down)$/ }).click()
  const seat = await opened
  await seat.waitForURL(/\/online\?/)
  const q = new URL(seat.url()).searchParams
  expect(q.get('name')).toBe('Vera')
  expect(q.get('owner')).toBe('1')

  // Seated for real: the table itself says the seat is hers, under her name.
  await expect(seat.locator('.byd-seat-name[data-me="true"]', { hasText: 'Vera' })).toBeAttached()
  // And the editor kept its band, with the room the host can send on.
  await expect(page.locator('[data-room-code]')).toHaveText(/\S+/)
  await expect(dialog).toBeHidden()
})
