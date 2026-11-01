// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ProfilePage } from '../src/account/ProfilePage.js'
import { StatusLive } from '../src/status/StatusLive.js'
import { plansFromEnv } from '../../server/src/quotas.js'
import { startServer, type Running } from './fixture.js'
import { projectDoc } from './project-doc.js'

// Pro in Profil (#1494, variant A, beställarens beslut 2026-11-01): a card «Abonnemang» above
// Förbrukning that compares Gratis and Pro, buys Pro at Stripe's Checkout, waits on the way back
// until Stripe's webhook has made the account Pro, and cancels it at the period's end after a
// question that names the games that would become read-only. Stripe is the stand-in on this
// machine (`packages/server/scripts/stripe-stand-in.ts`), asked by the box's own client.
let run: Running
afterEach(async () => {
  await run.stop()
})

// The tiers the beställare set 2026-11-01 (#1469 question 3), and Pro's from proposal A.
const TIERS = plansFromEnv({
  BYD_PLANS: JSON.stringify({ default: 'free', plans: { free: { projects: 2, cardRowsPerProject: 150, openTables: 1, tablesPer30Days: 8, storageBytes: 300_000_000 }, pro: { openTables: 3, storageBytes: 10_000_000_000, print: true } } }),
})
const login = async (email: string): Promise<string> => {
  await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
  return (await run.auth!.accountByEmail(email))!.id
}
const open = (search = '') => {
  history.replaceState(null, '', `/profile?server=${encodeURIComponent(run.http)}${search}`)
  const gone: string[] = []
  render(
    <StatusLive>
      <ProfilePage onNavigate={(url) => gone.push(url)} />
    </StatusLive>,
  )
  return gone
}
const card = () => screen.findByRole('region', { name: /^Abonnemang/ })

describe('the card «Abonnemang» in Profil (#1494)', () => {
  it('is not there when the box takes no payments', async () => {
    run = await startServer({ auth: true, authBypass: true, ai: true, plans: TIERS })
    await login('ada@example.com')
    open()
    await screen.findByRole('region', { name: 'Förbrukning' })
    expect(screen.queryByRole('region', { name: /^Abonnemang/ })).toBeNull()
  })

  it('compares Gratis and Pro above Förbrukning, and buys Pro at Stripe’s Checkout by the month or the year', async () => {
    run = await startServer({ auth: true, authBypass: true, ai: true, plans: TIERS, payments: true })
    await login('ada@example.com')
    const gone = open()
    const abo = await card()
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Namn', 'AI-nyckel', 'Passkeys', 'Abonnemang Gratis', 'Förbrukning', 'Språk', 'Konto'])
    const rows = [...abo.querySelectorAll('.byd-pro-compare > dt')].map((dt) => `${dt.textContent}: ${dt.nextElementSibling?.textContent}`)
    expect(rows).toEqual([
      'Gratis: 2 spel, 150 kort per spel, 1 bord åt gången, 8 bord på 30 dygn, 300 MB.',
      'Pro: obegränsat antal spel, obegränsat antal kort per spel, 3 bord åt gången, obegränsat antal bord, 10 GB, och tryckpaketet när en tryckpartner finns.',
    ])
    const buy = await within(abo).findByRole('button', { name: 'Uppgradera till Pro, 99\u00a0kr i månaden' })
    expect(within(abo).getByText('Priset är med moms. Du betalar hos Stripe och säger upp när du vill, här i Profil; Pro gäller då perioden ut.')).toBeTruthy()
    fireEvent.click(within(abo).getByRole('radio', { name: /Per år/ }))
    expect(within(abo).getByRole('radio', { name: 'Per år 2 månader gratis' })).toBeTruthy()
    expect(buy.textContent).toBe('Uppgradera till Pro, 990\u00a0kr om året')
    fireEvent.click(buy)
    await waitFor(() => expect(gone).toHaveLength(1))
    expect(gone[0]).toMatch(new RegExp(`^${run.payments!.stripe.url}/c/pay/cs_test_`))
    const asked = run.payments!.stripe.checkouts.at(-1)!
    expect(asked.price).toBe('price_sek_y')
    expect(new URL(asked.successUrl).pathname).toBe('/profile')
  })

  // Stripe's webhook, signed with the box's secret, as Stripe sends it when it has decided.
  const webhook = async (type: string, customer: string) => {
    const { body, signature } = run.payments!.stripe.event(type, customer, run.payments!.webhookSecret)
    expect((await fetch(`${run.http}/stripe/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': signature }, body })).status).toBe(200)
  }
  // An account that has paid at Checkout: a customer, a subscription, and Stripe's word sent or not.
  const paid = async (email: string, price = 'price_sek_m', told = true) => {
    const id = await login(email)
    const res = await fetch(`${run.http}/me/subscription/checkout`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ currency: 'sek', interval: 'month' }) })
    expect(res.status).toBe(200)
    const customer = run.payments!.stripe.checkouts.at(-1)!.customer
    run.payments!.stripe.pay(customer, price)
    if (told) await webhook('customer.subscription.created', customer)
    return { id, customer }
  }
  const made = async (name: string, cards: number) => {
    const rows = Array.from({ length: cards }, (_, i) => ({ id: `c${i}`, fields: { title: `Kort ${i}` } }))
    const res = await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...projectDoc(), name, rows }) })
    expect(res.status).toBe(201)
  }

  // The way back comes before the webhook (#1494, finding 1): the card waits without a purchase, so
  // nobody pays twice, and says Pro when Stripe's word has come.
  it('waits on the way back until Stripe’s word has come, with no purchase meanwhile, and then says Pro', async () => {
    run = await startServer({ auth: true, authBypass: true, ai: true, plans: TIERS, payments: true })
    const { customer } = await paid('ada@example.com', 'price_sek_m', false)
    open('&pro=paid')
    const abo = await card()
    const waiting = await within(abo).findByRole('status')
    expect(waiting.textContent).toBe('Betalningen är gjord. Stripes besked brukar komma inom några sekunder, och du behöver inte betala igen.')
    expect(within(abo).queryByRole('button')).toBeNull()
    expect(new URL(location.href).searchParams.has('pro')).toBe(false)
    await webhook('customer.subscription.created', customer)
    await waitFor(() => expect(within(abo).getByRole('status').textContent).toMatch(/^Du har Pro nu\. Tack\. Kvittot kommer med mejl från Stripe, och nästa betalning är \d+ \w+ \d{4}\.$/), { timeout: 8000 })
    expect(abo.querySelector('h2')?.textContent).toBe('Abonnemang Pro')
    expect(within(abo).getByRole('button', { name: 'Säg upp Pro' })).toBeTruthy()
  }, 20_000)

  it('says nothing was bought when Checkout was left', async () => {
    run = await startServer({ auth: true, authBypass: true, ai: true, plans: TIERS, payments: true })
    await login('ada@example.com')
    open('&pro=cancelled')
    const abo = await card()
    expect((await within(abo).findByRole('status')).textContent).toBe('Inget köptes. Du har kvar Gratis, och ingenting har dragits.')
    expect(await within(abo).findByRole('button', { name: /^Uppgradera till Pro/ })).toBeTruthy()
  })

  // Variant A: «Säg upp Pro» as large as the purchase, a question naming the games that would become
  // read-only with «Behåll Pro» holding the focus, then the cancellation said, and taken back.
  it('cancels Pro at the period’s end after a question that names the games that would become read-only, and takes it back', async () => {
    run = await startServer({ auth: true, authBypass: true, ai: true, plans: TIERS, payments: true })
    await paid('ada@example.com')
    await made('Drakhamnen', 160)
    await made('Skogens råd', 3)
    open()
    const abo = await card()
    const price = await within(abo).findByText(/^99 kr i månaden · förnyas /)
    expect(price.textContent).toMatch(/förnyas 1 \w+ \d{4}$/)
    fireEvent.click(within(abo).getByRole('button', { name: 'Säg upp Pro' }))
    const question = await within(abo).findByRole('group', { name: /^Säga upp Pro\?/ })
    await waitFor(() => expect(document.activeElement?.textContent).toBe('Behåll Pro'))
    expect([...question.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['Drakhamnen'])
    expect(question.querySelector('p')?.textContent).toMatch(/^Säga upp Pro\? Pro gäller till 1 \w+ \d{4}, och du betalar ingenting mer\. Sedan rymmer kontot det Gratis rymmer, och de här spelen går att läsa och exportera men inte ändra:$/)
    fireEvent.click(within(question).getByRole('button', { name: 'Behåll Pro' }))
    await waitFor(() => expect(within(abo).queryByRole('group')).toBeNull())
    expect(run.payments!.stripe.subs[0]!.cancelAtPeriodEnd).toBe(false)
    fireEvent.click(within(abo).getByRole('button', { name: 'Säg upp Pro' }))
    fireEvent.click(await within(abo).findByRole('button', { name: 'Säg upp' }))
    const said = await within(abo).findByRole('status')
    await waitFor(() => expect(said.textContent).toMatch(/^Pro är uppsagt och gäller till 1 \w+ \d{4}\. Inget mer dras\. Efter det hamnar Drakhamnen i läsläge\.$/))
    expect(run.payments!.stripe.subs[0]!.cancelAtPeriodEnd).toBe(true)
    fireEvent.click(within(abo).getByRole('button', { name: 'Fortsätt med Pro' }))
    await within(abo).findByRole('button', { name: 'Säg upp Pro' })
    expect(run.payments!.stripe.subs[0]!.cancelAtPeriodEnd).toBe(false)
  }, 20_000)

  it('sends the account to Stripe’s customer portal for its receipts and its card', async () => {
    run = await startServer({ auth: true, authBypass: true, ai: true, plans: TIERS, payments: true })
    const { customer } = await paid('ada@example.com')
    const gone = open()
    const abo = await card()
    fireEvent.click(await within(abo).findByRole('button', { name: 'Kvitton och betalkort' }))
    await waitFor(() => expect(gone).toEqual([`${run.payments!.stripe.url}/p/session/${customer}`]))
    expect(new URL(run.payments!.stripe.portals[0]!.returnUrl).pathname).toBe('/profile')
  })

  // A renewal that failed (#1494, finding 3): Pro holds while Stripe retries, and the card asks for
  // a new card first.
  it('says a failed renewal, with Pro still on and the way to a new card first', async () => {
    run = await startServer({ auth: true, authBypass: true, ai: true, plans: TIERS, payments: true })
    await paid('ada@example.com')
    run.payments!.stripe.subs[0]!.status = 'past_due'
    open()
    const abo = await card()
    expect((await within(abo).findByRole('status')).textContent).toBe('Betalningen gick inte igenom. Pro gäller medan Stripe försöker igen. Byt betalkort så fortsätter det som vanligt.')
    expect(within(abo).getAllByRole('button').map((b) => b.textContent)).toEqual(['Byt betalkort', 'Säg upp Pro', 'Kvitton och betalkort'])
  })
})
