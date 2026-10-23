import { expect, test } from '../support/test.js'
import { gameDoc } from '../support/game.js'
import { DESK } from '../support/devices.js'
import { serverWith } from '../support/stack.js'

test.use({ viewport: DESK.viewport, locale: 'sv-SE' })

// A met ceiling in the built app (#1198, variant A, PRD #1192): a box configured with tiers in
// `BYD_PLANS`, as the box is when the price decision is made, and a designer who reaches them. The
// answer stands where she pressed — under Mina spel's heading, in the editor's band, under «Starta
// nytt bord» — and the profile says what the account holds. Nothing is locked: the game still opens.
//
// The run's own server has every ceiling `null`, as the beta does, so this journey has a server of
// its own beside it, on the same app and database.
let planned: { origin: string; stop: () => Promise<void> }
test.beforeAll(async () => {
  planned = await serverWith({ BYD_PLANS: JSON.stringify({ default: 'free', plans: { free: { projects: 1, cardRowsPerProject: 4, openTables: 1 } } }) })
})
test.afterAll(async () => {
  await planned?.stop()
})

test('a designer who reaches her ceilings is told each one where she pressed, and nothing is locked', async ({ page }) => {
  const at = (path: string) => `${planned.origin}${path}`
  const email = `e2e-${crypto.randomUUID()}@example.com`
  expect((await page.request.post(at('/auth/login'), { data: { email } })).ok()).toBe(true)
  const made = await page.request.post(at('/projects'), { data: gameDoc({ name: 'Skogens råd', cards: 4 }) })
  expect(made.status()).toBe(201)
  const { id } = (await made.json()) as { id: string }

  // «＋ Nytt spel» asks before the guide opens, and says the ceiling under the heading.
  await page.goto(at('/'))
  await expect(page.getByRole('heading', { level: 1, name: 'Mina spel' })).toBeVisible()
  await page.getByRole('link', { name: '＋ Nytt spel' }).first().click()
  const notice = page.locator('.byd-home-notice')
  await expect(notice).toHaveText('Inget nytt spel skapades. Ditt konto rymmer 1 spel, och du har 1. Ta bort ett spel du inte behöver för att få plats. Exportera det först om du vill ha det kvar.')
  await expect(notice).toBeFocused()
  expect(new URL(page.url()).pathname).toBe('/')

  // The profile says what the account holds.
  await page.goto(at('/profile'))
  const usage = page.getByRole('region', { name: 'Förbrukning' })
  await expect(usage).toBeVisible()
  await expect(usage.locator('.byd-usage-row').filter({ hasText: /^Spel/ }).locator('.byd-usage-n')).toHaveText('1 av 1')
  await expect(usage.locator('.byd-usage-row[data-game]').filter({ hasText: 'Skogens råd' }).locator('.byd-usage-n')).toHaveText('4 av 4')

  // The game still opens; a card more is refused, said in the band, and taken off again.
  await page.goto(at(`/editor?project=${encodeURIComponent(id)}`))
  const table = page.locator('#byd-editor-tab-table')
  await table.click()
  await expect(table).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('button', { name: '+ Nytt kort' }).click()
  const band = page.locator('.byd-editor-notice')
  await expect(band).toHaveText('Kortet lades inte till. Skogens råd har 4 av 4 kort, så många som ett spel rymmer på ditt konto. Ta bort eller slå ihop kort för att få plats. Fler exemplar av ett kort går alltid: ändra Antal.')
  await expect(page.locator('.byd-data tbody tr[data-card-ref]')).toHaveCount(4)

  // A table more than the account holds: the line under «Starta nytt bord» says so.
  expect((await page.request.post(at(`/projects/${encodeURIComponent(id)}/sessions`))).status()).toBe(201)
  await page.getByRole('tab', { name: 'Bord' }).click()
  await page.getByRole('button', { name: 'Starta nytt bord' }).click()
  await page.getByRole('button', { name: 'Starta ett nytt ändå' }).click()
  const failed = page.locator('.byd-tables-failed[data-quota]')
  await expect(failed).toContainText('Bordet startades inte. Du har 1 av 1 bord öppna, 1 av dem i det här spelet. Avsluta ett bord som ingen spelar vid, eller öppna ett som redan kör och uppdatera det till version 1.')
  await expect(failed.getByRole('button', { name: 'Försök igen' })).toBeVisible()
})
