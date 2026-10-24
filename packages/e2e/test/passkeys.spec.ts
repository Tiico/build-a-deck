import { logIn } from '../support/api.js'
import { DESK } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// Passkeys, the way the box serves them (#1180, beslut A + B's suggestion): the offer on Mina spel
// after the link, the browser's own sheet, a login with no mail, and the passkey on the profile —
// in the built app, with Chromium's virtual authenticator where a fingerprint would be.
//
// On `localhost` rather than the stack's 127.0.0.1: a passkey belongs to a site, and a browser
// takes no IP address for one. The server takes the site from the page the browser stands on.
test('a passkey saved after the link logs in without a mail, and is taken away on the profile', async ({ browser, baseURL }) => {
  const origin = new URL(baseURL ?? '')
  origin.hostname = 'localhost'
  const context = await browser.newContext({ viewport: DESK.viewport, locale: 'sv-SE', baseURL: origin.origin })
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  })

  // The link, which the suite's server answers at once, by an account that has said what the others
  // should call it: until it has, Mina spel's one band is the name's (#1254).
  await logIn(page.request)
  await page.request.put('/me/name', { data: { name: 'Ada' } })
  await page.goto('/')
  const offer = page.getByRole('region', { name: 'Passkey' })
  await expect(offer).toContainText('Logga in utan mejl nästa gång.')
  await offer.getByRole('button', { name: 'Spara passkey' }).click()
  await expect(page.getByRole('main').getByText(/Passkeyn är sparad/)).toBeVisible()
  expect((await cdp.send('WebAuthn.getCredentials', { authenticatorId })).credentials).toHaveLength(1)

  // Logged out, and back in with the passkey the browser suggests in the address field: the virtual
  // authenticator picks it as the reader would, and the card goes on without a press.
  await page.request.post('/auth/logout')
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Mina spel' })).toBeVisible()
  expect(new URL(page.url()).pathname).toBe('/')
  // Not offered again in the browser that has one.
  await expect(offer).toHaveCount(0)

  // And with the button, in a browser that makes no suggestion: no address typed, no mail.
  await page.addInitScript(() => {
    PublicKeyCredential.isConditionalMediationAvailable = async () => false
  })
  await page.request.post('/auth/logout')
  await page.goto('/login')
  await page.getByRole('button', { name: 'Logga in med passkey' }).click()
  await expect(page.getByRole('heading', { name: 'Mina spel' })).toBeVisible()

  // On the profile: this browser's passkey, and taking it away after the one question.
  await page.goto('/profile')
  const box = page.getByRole('region', { name: 'Passkeys' })
  const row = box.getByRole('listitem')
  await expect(row).toContainText('Den här webbläsaren')
  await row.getByRole('button', { name: /^Ta bort / }).click()
  // Chromium's virtual authenticator names no keychain, and the question names none either.
  await expect(box.getByRole('alertdialog')).toContainText('Ta också bort den ur nyckelringen den ligger i')
  await box.getByRole('button', { name: 'Ja, ta bort' }).click()
  await expect(box).toContainText('Inga passkeys än.')

  // The keychain still holds it, but the service does not: the card sends the reader to the mail.
  await page.request.post('/auth/logout')
  await page.goto('/login')
  await page.getByRole('button', { name: 'Logga in med passkey' }).click()
  await expect(page.getByText('Den passkeyn känns inte igen här. Logga in med e\u2011post.')).toBeVisible()
  await context.close()
})
