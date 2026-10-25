import { logIn, makeProject } from '../support/api.js'
import { DESK, PHONE } from '../support/devices.js'
import { expect, test } from '../support/test.js'

test.use({ locale: 'sv-SE' })

// The beta's terms (#1272, beställarens beslut 2026-10-24, variant B), the way the box serves them:
// a new account's name and terms as two steps of one card, «Inte nu» and the read mode it leaves the
// account in, and an account from before the terms meeting them in the band first on Mina spel. The
// box runs with the beta's register (`TERMS`), so every account here starts with the terms to accept.
//
// The editor holding an edit under the dialog is `terms-step.test.tsx`'s: an account that has not
// accepted cannot be given a game here, since every way that would make one is closed to it.

const signUp = async (page: import('@playwright/test').Page, email: string) => {
  await page.goto('/login')
  await page.getByLabel('E-post').fill(email)
  await page.getByRole('button', { name: 'Skicka inloggningslänk' }).click()
}

test('a new account gives its name, accepts the terms in the same card, and lands on Mina spel', async ({ page }) => {
  await page.setViewportSize(DESK.viewport)
  const email = `nicklas.ockelberg+${crypto.randomUUID().slice(0, 8)}@example.com`
  await signUp(page, email)

  await expect(page.getByRole('heading', { level: 1, name: 'Välkommen till Deckster' })).toBeVisible()
  await expect(page.getByText('Steg 1 av 2')).toBeVisible()
  await page.getByRole('button', { name: 'Fortsätt' }).click()

  const heading = page.getByRole('heading', { level: 1, name: 'Villkoren för betan' })
  await expect(heading).toBeFocused()
  await expect(page).toHaveURL(/\/login\?step=terms&/)
  await expect(page.getByText('Steg 2 av 2')).toBeVisible()
  await expect(page.getByText(/^Version \d{4}-\d{2}-\d{2}, ett utkast som inte är juridiskt granskat\. Kort sagt:$/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Läs hela villkoren' })).toHaveAttribute('href', '/villkor')
  await expect(page.getByText('Genom att godkänna intygar du att du är 18 år eller äldre.')).toBeVisible()
  // The card is the screen, and its one press is in it at the desk's height.
  await expect(page.getByRole('button', { name: 'Godkänn och fortsätt' })).toBeInViewport({ ratio: 1 })
  await page.getByRole('button', { name: 'Godkänn och fortsätt' }).click()

  await expect(page.getByRole('heading', { name: 'Mina spel' })).toBeVisible()
  expect(new URL(page.url()).pathname).toBe('/')
  await expect(page.getByText('Villkoren inte godkända')).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Villkor' })).toHaveCount(0)
  expect(await (await page.request.get('/auth/me')).json()).toMatchObject({ email, name: 'Nicklas', asked: true, terms: { due: false } })
  // Every way is open: a game can be made.
  await makeProject(page.request, { name: 'Skogens råd' })
})

test('«Inte nu» leaves Mina spel as it is, asks on a press, and the server refuses what would write', async ({ page, browser }) => {
  await page.setViewportSize(PHONE.viewport)
  const email = `ada+${crypto.randomUUID().slice(0, 8)}@example.com`
  await signUp(page, email)
  await page.getByRole('button', { name: 'Hoppa över' }).click()
  // The second step is the phone's whole screen, its press within it.
  await expect(page.locator('[data-terms-step]')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Godkänn och fortsätt' })).toBeInViewport()
  await page.getByRole('button', { name: 'Inte nu' }).click()

  await expect(page.getByRole('heading', { name: 'Mina spel' })).toBeVisible()
  // The quiet word, and no band this visit: «Inte nu» was the answer to it.
  await expect(page.getByText('Villkoren inte godkända')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Villkor' })).toHaveCount(0)

  // A press that would make something opens the step as a dialog, and «Inte nu» leaves the page as it was.
  await page.getByRole('link', { name: '＋ Nytt spel' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Godkänn villkoren först' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Godkänn och fortsätt' })).toBeInViewport()
  await dialog.getByRole('button', { name: 'Inte nu' }).click()
  await expect(dialog).toHaveCount(0)
  expect(new URL(page.url()).pathname).toBe('/')

  // The server is the gate, not the page: a write by hand is refused with the terms' own answer.
  const refused = await page.request.post('/projects', { data: { name: 'Förbi sidan' } })
  expect(refused.status()).toBe(403)
  expect(await refused.json()).toMatchObject({ error: 'terms', current: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) })
  // Reading is open: the terms themselves, from the row at the foot of the page.
  await page.getByRole('link', { name: 'Villkor', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Villkor och integritet' })).toBeVisible()
  await expect(page.getByText('Utkast, inte juridiskt granskat')).toBeVisible()
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(wide, 'nothing past the phone’s edge').toBeLessThanOrEqual(0)
  await page.goBack()
  // And logging out.
  await page.getByRole('link', { name: 'Logga ut' }).click()
  await expect(page.getByRole('heading', { name: 'Mina spel' })).toHaveCount(0)
  expect(await (await page.request.get('/auth/me')).json()).toEqual({ email: null })

  // The next visit asks again, in the band first in the queue.
  const next = await browser.newContext({ locale: 'sv-SE', viewport: DESK.viewport })
  const again = await next.newPage()
  await signUp(again, email)
  await expect(again.getByRole('heading', { name: 'Mina spel' })).toBeVisible()
  await expect(again.getByRole('region', { name: 'Villkor' })).toContainText('Deckster har fått villkor. Läs dem och godkänn för att fortsätta skapa och ändra.')
  await next.close()
})

test('an account from before the terms meets them in a band, first in the queue, and the passkey follows', async ({ page }) => {
  await page.setViewportSize(DESK.viewport)
  // Logged in behind the page's back, with its name given, as an account that was there before the terms.
  const email = await logIn(page.request, `bo+${crypto.randomUUID().slice(0, 8)}@example.com`, { terms: false })
  await page.request.put('/me/name', { data: { name: 'Bo' } })
  await page.goto('/')
  const band = page.getByRole('region', { name: 'Villkor' })
  await expect(band).toContainText('Deckster har fått villkor.')
  await expect(page.getByText('Villkoren inte godkända')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Passkey' })).toHaveCount(0)

  await band.getByRole('button', { name: 'Läs och godkänn' }).click()
  const dialog = page.getByRole('dialog', { name: 'Villkoren för betan' })
  await expect(dialog.getByText('Det du gör i Deckster är ditt, och du kan exportera allt när som helst.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Godkänn och fortsätt' }).click()

  await expect(dialog).toHaveCount(0)
  await expect(band).toHaveCount(0)
  await expect(page.getByText('Villkoren inte godkända')).toHaveCount(0)
  // One band at a time: the passkey's comes now that the terms' has been answered (L78, #1254).
  await expect(page.getByRole('region', { name: 'Passkey' })).toBeVisible()
  expect(await (await page.request.get('/auth/me')).json()).toMatchObject({ email, terms: { due: false } })
  await makeProject(page.request, { name: 'Hamnen' })
})
