import type { Server } from 'node:http'
import { expect, test } from '../support/test.js'
import { gameDoc } from '../support/game.js'
import { DESK } from '../support/devices.js'
import { serverWith } from '../support/stack.js'
import { free } from '../support/ports.js'
import { acceptTerms } from '../support/api.js'
import { stripeStandIn, type StandIn } from '../../server/scripts/stripe-stand-in.js'

test.use({ viewport: DESK.viewport, locale: 'sv-SE' })

// Pro bought, seen and cancelled in the built app (#1494, variant A): a Gratis account finds Pro in
// Profil, picks the year, pays at Stripe's Checkout with the test card, comes back before Stripe's
// webhook and is told to wait without a second purchase, sees Pro once the webhook has come, and
// cancels it at the period's end after a question naming the game that would become read-only.
//
// Stripe is the stand-in on this machine (`packages/server/scripts/stripe-stand-in.ts`), which the
// box's own client asks through `STRIPE_API_BASE` with a test key; the journey sends Stripe's webhook
// itself, signed with the box's secret, when it wants it to have come. No call leaves the machine.
const SECRET = 'whsec_e2e_pro'
const PRICES = { price_sek_m: { currency: 'sek', interval: 'month', amount: 9900 }, price_sek_y: { currency: 'sek', interval: 'year', amount: 99000 }, price_eur_m: { currency: 'eur', interval: 'month', amount: 900 }, price_eur_y: { currency: 'eur', interval: 'year', amount: 9000 } } as const
const listenInBand = async (server: Server): Promise<number> => {
  let port = await free()
  for (let i = 0; i < 8; i++) {
    const bound = await new Promise<boolean>((resolve) => {
      server.once('error', () => resolve(false))
      server.listen(port, '127.0.0.1', () => resolve(true))
    })
    if (bound) return port
    port = await free(port + 1)
  }
  throw new Error('Stripe’s stand-in found no port')
}

let stripe: StandIn
let box: { origin: string; stop: () => Promise<void> }
test.beforeAll(async () => {
  stripe = await stripeStandIn(PRICES, listenInBand)
  box = await serverWith({
    BYD_PLANS: JSON.stringify({ default: 'free', plans: { free: { projects: 2, cardRowsPerProject: 4, openTables: 1, tablesPer30Days: 8, storageBytes: 300_000_000 }, pro: { openTables: 3, storageBytes: 10_000_000_000, print: true } } }),
    STRIPE_SECRET_KEY: 'sk_test_e2e',
    STRIPE_WEBHOOK_SECRET: SECRET,
    BYD_STRIPE_PRICES: JSON.stringify({ pro: { sek: { month: 'price_sek_m', year: 'price_sek_y' }, eur: { month: 'price_eur_m', year: 'price_eur_y' } } }),
    STRIPE_API_BASE: stripe.url,
  })
})
test.afterAll(async () => {
  await box?.stop()
  await stripe?.stop()
})

test('a Gratis account buys Pro by the year, waits for Stripe’s word, and cancels it at the period’s end', async ({ page }) => {
  const at = (path: string) => `${box.origin}${path}`
  const email = `e2e-${crypto.randomUUID()}@example.com`
  expect((await page.request.post(at('/auth/login'), { data: { email } })).ok()).toBe(true)
  await acceptTerms(page.request, box.origin)
  await page.goto(at('/profile'))
  const card = page.getByRole('region', { name: 'Abonnemang Gratis' })
  await expect(card).toBeVisible()
  await card.getByText('Per år').click()
  await card.getByRole('button', { name: 'Uppgradera till Pro, 990 kr om året' }).click()

  // Stripe's Checkout, with VAT through Stripe Tax (#1521).
  await expect(page.getByRole('heading', { name: 'Stripes kassa (testläge)' })).toBeVisible()
  expect(stripe.checkouts.at(-1)).toMatchObject({ price: 'price_sek_y', form: { 'automatic_tax[enabled]': 'true' } })
  await page.getByRole('button', { name: 'Betala' }).click()

  // Back before the webhook: waiting, and no purchase to press.
  await expect(page).toHaveURL(/\/profile/)
  const waiting = page.getByRole('region', { name: /^Abonnemang/ })
  await expect(waiting.getByRole('status')).toHaveText('Betalningen är gjord. Stripes besked brukar komma inom några sekunder, och du behöver inte betala igen.')
  await expect(waiting.getByRole('button')).toHaveCount(0)
  expect(new URL(page.url()).searchParams.has('pro')).toBe(false)
  // A second checkout meanwhile is refused at the box, whatever the page shows.
  expect((await page.request.post(at('/me/subscription/checkout'), { data: { currency: 'sek', interval: 'month' } })).status()).toBe(409)

  const customer = stripe.checkouts.at(-1)!.customer
  const { body, signature } = stripe.event('customer.subscription.created', customer, SECRET)
  expect((await page.request.post(at('/stripe/webhook'), { data: body, headers: { 'content-type': 'application/json', 'stripe-signature': signature } })).status()).toBe(200)
  const pro = page.getByRole('region', { name: 'Abonnemang Pro' })
  await expect(pro.getByRole('status')).toContainText('Du har Pro nu.')
  await expect(pro.locator('.byd-pro-price')).toHaveText(/^990\skr om året · förnyas 1 \w+ \d{4}$/)

  // With Pro a game may have more than Gratis's four cards: this one would become read-only.
  expect((await page.request.post(at('/projects'), { data: gameDoc({ name: 'Drakhamnen', cards: 5 }) })).status()).toBe(201)
  await page.reload()

  // «Säg upp Pro»: the question names Drakhamnen, and «Behåll Pro» holds the focus.
  await pro.getByRole('button', { name: 'Säg upp Pro' }).click()
  const question = pro.getByRole('group', { name: /^Säga upp Pro\?/ })
  await expect(question.getByRole('listitem')).toHaveText(['Drakhamnen'])
  await expect(question.getByRole('button', { name: 'Behåll Pro' })).toBeFocused()
  await question.getByRole('button', { name: 'Säg upp', exact: true }).click()
  await expect(pro.getByRole('status')).toHaveText(/^Pro är uppsagt och gäller till 1 \w+ \d{4}\. Inget mer dras\. Efter det hamnar Drakhamnen i läsläge\.$/)
  expect(stripe.subs.find((s) => s.customer === customer)).toMatchObject({ status: 'active', cancelAtPeriodEnd: true })
  // Pro holds until the period ends.
  expect(((await (await page.request.get(at('/me/usage'))).json()) as { plan: string }).plan).toBe('pro')

  // The account deletes itself (#1520): Stripe stops at once, and the database the run shares keeps
  // no tier `pro` that a server started after this one without it would refuse to start on.
  expect((await page.request.delete(at('/me'))).status()).toBe(200)
  expect(stripe.subs.find((s) => s.customer === customer)).toMatchObject({ status: 'canceled' })
})
