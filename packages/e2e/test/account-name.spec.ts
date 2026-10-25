import { logIn, makeProject } from '../support/api.js'
import { DESK, PHONE } from '../support/devices.js'
import { expect, test } from '../support/test.js'

test.use({ locale: 'sv-SE' })

// The account's own name (#1254, beställarens beslut 2026-10-24, variant C), the way the box serves
// it: the welcome step after the first login on the card, «Hoppa över», and the band on Mina spel for
// an account that was made before the name — and the name where the others then read it.

test('the first login asks what the others should call her, and the editor says it', async ({ page }) => {
  await page.setViewportSize(DESK.viewport)
  const email = `nicklas.ockelberg+${crypto.randomUUID().slice(0, 8)}@example.com`
  await page.goto('/login')
  await page.getByLabel('E-post').fill(email)
  await page.getByRole('button', { name: 'Skicka inloggningslänk' }).click()

  await expect(page).toHaveURL(/\/login\?step=name&next=%2F/)
  await expect(page.getByRole('heading', { name: 'Välkommen till Deckster' })).toBeVisible()
  await expect(page.getByText(`Du är inloggad som ${email}.`)).toBeVisible()
  const field = page.getByLabel('Vad ska andra kalla dig?')
  await expect(field).toHaveValue('Nicklas')
  await expect(field).toBeFocused()
  await field.fill('Nicklas Ockelberg')
  await page.getByRole('button', { name: 'Fortsätt' }).click()

  await expect(page.getByRole('heading', { name: 'Mina spel' })).toBeVisible()
  expect(new URL(page.url()).pathname).toBe('/')
  // Answered: no band on Mina spel, and Back does not lead to the question again.
  await expect(page.getByRole('region', { name: 'Namn' })).toHaveCount(0)
  expect(await (await page.request.get('/auth/me')).json()).toEqual({ email, name: 'Nicklas Ockelberg', asked: true })

  // In the editor's header the face is her name's letter, and the pointer says the whole name.
  const project = await makeProject(page.request, { name: 'Skogens råd' })
  await page.goto(project.editorUrl)
  const face = page.locator('.byd-editor-here i').first()
  await expect(face).toHaveText('N')
  await expect(face).toHaveAttribute('title', 'Nicklas Ockelberg')

  // A second login goes where it was going.
  await page.request.post('/auth/logout')
  await page.goto('/login?next=%2Fprofile')
  await page.getByLabel('E-post').fill(email)
  await page.getByRole('button', { name: 'Skicka inloggningslänk' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Profil' })).toBeVisible()
  await expect(page.getByLabel('Ditt namn')).toHaveValue('Nicklas Ockelberg')
})

test('«Hoppa över» keeps no name, and the question does not come back', async ({ page }) => {
  await page.setViewportSize(PHONE.viewport)
  const email = `info+${crypto.randomUUID().slice(0, 8)}@example.com`
  await page.goto('/login')
  await page.getByLabel('E-post').fill(email)
  await page.getByRole('button', { name: 'Skicka inloggningslänk' }).click()
  await expect(page.getByLabel('Vad ska andra kalla dig?')).toHaveValue('Info')
  // The step is the phone's whole screen, with nothing past its edge.
  const card = page.locator('.byd-welcome')
  await expect(card).toBeInViewport({ ratio: 1 })
  await page.getByRole('button', { name: 'Hoppa över' }).click()

  await expect(page.getByRole('heading', { name: 'Mina spel' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Namn' })).toHaveCount(0)
  expect(await (await page.request.get('/auth/me')).json()).toEqual({ email, name: null, asked: true })
  await page.goto('/login?step=name&next=%2Fprofile')
  await expect(page.getByRole('heading', { level: 1, name: 'Profil' })).toBeVisible()
})

test('an account from before the name is asked once, in a band on Mina spel', async ({ page }) => {
  await page.setViewportSize(DESK.viewport)
  // Logged in behind the page's back, as an account that was there before the welcome step was.
  const email = await logIn(page.request, `ada.lovelace+${crypto.randomUUID().slice(0, 8)}@example.com`)
  await page.goto('/')
  const band = page.getByRole('region', { name: 'Namn' })
  await expect(band).toContainText('Vad ska andra kalla dig? Namnet står när du delar ett spel och när du är online i det.')
  // One band at a time (L78's band waits).
  await expect(page.getByRole('region', { name: 'Passkey' })).toHaveCount(0)
  const field = band.getByRole('textbox', { name: 'Ditt namn' })
  await expect(field).toHaveValue('Ada')
  await field.fill('Ada Lovelace')
  await band.getByRole('button', { name: 'Spara' }).click()
  await expect(band).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Mina spel' })).toBeFocused()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Mina spel' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Namn' })).toHaveCount(0)
  expect(await (await page.request.get('/auth/me')).json()).toEqual({ email, name: 'Ada Lovelace', asked: true })
})
