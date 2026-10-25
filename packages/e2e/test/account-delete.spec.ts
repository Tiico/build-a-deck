import { readFile } from 'node:fs/promises'
import { strFromU8, unzipSync } from 'fflate'
import { logIn, mailTo, makeProject } from '../support/api.js'
import { DESK } from '../support/devices.js'
import { expect, test } from '../support/test.js'

test.use({ locale: 'sv-SE' })

// The account's own two rights in Profil (#1280, beställarens beslut A), the way the box serves them:
// «Ladda ner mina uppgifter» saves the extract as a file at once, and «Radera kontot…» asks in L9's
// strip, naming the game that goes, before the account, its game and its login are gone, and a last
// letter says so.
test('downloads the account’s data as a file, then deletes the account and lands at the door told so', async ({ page }) => {
  await page.setViewportSize(DESK.viewport)
  const email = await logIn(page.request)
  await page.request.put('/me/name', { data: { name: 'Nicklas Raderas' } })
  const game = await makeProject(page.request, { name: 'Stjärnhandel' })
  await page.goto('/profile')
  const account = page.getByRole('region', { name: 'Konto' })
  await expect(account.getByRole('heading', { level: 3, name: 'Dina uppgifter' })).toBeVisible()

  const download = page.waitForEvent('download')
  await account.getByRole('button', { name: 'Ladda ner mina uppgifter' }).click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/^deckster-uppgifter-\d{4}-\d{2}-\d{2}\.zip$/)
  const files = unzipSync(new Uint8Array(await readFile((await file.path())!)))
  expect(Object.keys(files).sort()).toEqual(['LASMIG.md', 'schema.json', 'uppgifter.json'])
  const data = JSON.parse(strFromU8(files['uppgifter.json']!)) as { account: { email: string; name: string }; games: { name: string; role: string }[] }
  expect(data.account).toMatchObject({ email, name: 'Nicklas Raderas' })
  expect(data.games).toEqual([expect.objectContaining({ name: 'Stjärnhandel', role: 'owner' })])
  await expect(account.getByRole('status')).toContainText(`${file.suggestedFilename()} är nedladdad.`)

  await account.getByRole('button', { name: 'Radera kontot…' }).click()
  const strip = page.getByRole('alertdialog', { name: 'Radera kontot? Det går inte att ångra.' })
  await expect(strip.getByRole('listitem').first()).toHaveText('Stjärnhandel tas bort med alla versioner och bord, som när du tar bort ett spel i Mina spel.')
  await expect(strip.getByRole('button', { name: 'Avbryt' })).toBeFocused()
  await strip.getByRole('button', { name: 'Ja, radera kontot' }).click()

  await expect(page.locator('.byd-login-done[role="status"]')).toHaveText(`Ditt konto är raderat. Du är utloggad på alla enheter, och ett mejl till ${email} bekräftar det.`)
  await expect(page.getByLabel('E-post')).toBeVisible()
  expect(await (await page.request.get('/auth/me')).json()).toMatchObject({ email: null })
  expect((await page.request.get(`/projects/${encodeURIComponent(game.id)}`)).status()).toBe(401)
  expect((await page.request.get('/me/data')).status()).toBe(401)
  const letter = await mailTo(email)
  expect(letter.subject).toBe('Ditt konto hos Deckster är raderat')
  expect(letter.text).toContain('Stjärnhandel är borttaget med alla versioner och bord.')
})
