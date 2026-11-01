import { createHmac } from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { MemoryAuthStore, MemoryLogStore, MemoryProjectStore, PostgresLogStore, type AuthStore, type LogStore } from '../src/index.js'
import { MemoryAccountPlanStore, type AccountPlanStore } from '../src/account-plans.js'
import type { ProjectStore } from '../src/projects.js'
import { paymentsFromEnv, syncByAddress, type StripeApi, type Subscription } from '../src/payments.js'
import { plansFromEnv } from '../src/quotas.js'
import { start, type Running } from './fixture.js'

// Subscriptions through Stripe on the server (#1493): a logged-in account asks for a checkout for
// Pro and is sent to Stripe's Checkout, and Stripe's webhook writes the account's tier in
// `account_plans` with the source `stripe`. Stripe is a fake here — no call leaves the suite — and
// its webhooks are signed the way Stripe signs them, with the box's webhook secret.
//
// Against the memory stores and against Postgres. The Postgres half runs only with DATABASE_URL.
const url = process.env['DATABASE_URL']
const schema = `test_stripe_${process.pid}_${Date.now()}`

type Backend = { store: LogStore; projects: ProjectStore; auth: AuthStore; accountPlans: AccountPlanStore; close(): Promise<void> }
const backends: { name: string; skip: boolean; open(): Promise<Backend> }[] = [
  { name: 'memory', skip: false, open: async () => ({ store: new MemoryLogStore(), projects: new MemoryProjectStore(), auth: new MemoryAuthStore(), accountPlans: new MemoryAccountPlanStore(), close: () => Promise.resolve() }) },
  {
    name: 'Postgres',
    skip: !url,
    open: async () => {
      const store = PostgresLogStore.connect(url!, { schema })
      await store.migrate()
      return {
        store,
        projects: store.projects(),
        auth: store.auth(),
        accountPlans: store.accountPlans(),
        close: async () => {
          await store.dropSchema()
          await store.close()
        },
      }
    },
  },
]

const tiers = plansFromEnv({ BYD_PLANS: JSON.stringify({ default: 'free', plans: { free: { projects: 3 }, pro: { print: true } } }) })
const WEBHOOK_SECRET = 'whsec_test_suite'
const config = paymentsFromEnv(
  { STRIPE_SECRET_KEY: 'sk_test_suite', STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET, BYD_STRIPE_PRICES: JSON.stringify({ pro: { sek: { month: 'price_sek_m', year: 'price_sek_y' }, eur: { month: 'price_eur_m', year: 'price_eur_y' } } }) },
  tiers,
)!

// Stripe as the suite plays it: customers it made, the checkouts it was asked for, and each
// customer's subscriptions as they stand, which a test sets.
class FakeStripe implements StripeApi {
  readonly customers: { id: string; account: string; email: string }[] = []
  readonly checkouts: { customer: string; account: string; price: string; successUrl: string; cancelUrl: string }[] = []
  readonly subs = new Map<string, Subscription[]>()
  asked = 0
  async createCustomer(input: { account: string; email: string }): Promise<string> {
    const id = `cus_${this.customers.length + 1}_${Math.random().toString(36).slice(2, 8)}`
    this.customers.push({ id, ...input })
    return id
  }
  async createCheckout(input: { customer: string; account: string; price: string; successUrl: string; cancelUrl: string }): Promise<string> {
    this.checkouts.push(input)
    return `https://checkout.stripe.com/c/pay/cs_test_${this.checkouts.length}`
  }
  async subscriptionsOf(customer: string): Promise<Subscription[]> {
    this.asked += 1
    return this.subs.get(customer) ?? []
  }
}

// An event as Stripe sends it, about a customer's subscription, signed now with the given secret.
let events = 0
const event = (type: string, customer: string) => JSON.stringify({ id: `evt_${++events}`, object: 'event', type, created: Math.floor(Date.now() / 1000), data: { object: { id: `sub_${events}`, object: 'subscription', customer, status: 'active' } } })
const signed = (body: string, secret = WEBHOOK_SECRET, at = Math.floor(Date.now() / 1000)) => `t=${at},v1=${createHmac('sha256', secret).update(`${at}.${body}`).digest('hex')}`

for (const backend of backends) {
  describe.skipIf(backend.skip)(`subscriptions through Stripe, in ${backend.name} (#1493)`, () => {
    let db: Backend
    let run: Running | null = null
    let stripe: FakeStripe
    let n = 0
    const open = async (withPayments = true) => {
      stripe = new FakeStripe()
      run = await start({ store: db.store, projects: db.projects, auth: db.auth, accountPlans: db.accountPlans, plans: tiers, appOrigin: 'http://app.test', ...(withPayments ? { payments: { config, stripe } } : {}) })
      return run
    }
    const login = async (email: string): Promise<{ cookie: string; id: string; email: string }> => {
      await fetch(`${run!.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
      const link = /\/auth\/verify\?token=\S+/.exec(run!.mail.sent.at(-1)?.text ?? '')?.[0] ?? ''
      const res = await fetch(`${run!.http}${link}`, { redirect: 'manual' })
      return { cookie: (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '', id: (await db.auth.accountByEmail(email))!.id, email }
    }
    const someone = (who: string) => login(`${who}-${++n}@example.com`)
    const checkout = (cookie: string | null, body: unknown) =>
      fetch(`${run!.http}/me/subscription/checkout`, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) })
    const webhook = (body: string, signature: string | null = signed(body)) =>
      fetch(`${run!.http}/stripe/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', ...(signature ? { 'stripe-signature': signature } : {}) }, body })
    const usage = async (cookie: string) => (await (await fetch(`${run!.http}/me/usage`, { headers: { cookie } })).json()) as { plan: string; print: boolean; lapsed?: { plan: string } }
    // An account that has been through the checkout: a customer of its own at Stripe.
    const customer = async (cookie: string) => {
      expect((await checkout(cookie, { currency: 'sek', interval: 'month' })).status).toBe(200)
      return stripe.checkouts.at(-1)!.customer
    }

    beforeAll(async () => {
      db = await backend.open()
    })
    afterAll(async () => {
      await db.close()
    })
    afterEach(async () => {
      await run?.stop()
      run = null
    })

    it('are off without the box’s configuration: no checkout and no webhook', async () => {
      await open(false)
      const ada = await someone('ada')
      expect((await checkout(ada.cookie, { currency: 'sek', interval: 'month' })).status).toBe(404)
      expect((await webhook(event('customer.subscription.created', 'cus_x'))).status).toBe(404)
    })

    it('send a logged-in account to Stripe’s Checkout for Pro, with one customer of its own', async () => {
      await open()
      expect((await checkout(null, { currency: 'sek', interval: 'month' })).status).toBe(401)
      const ada = await someone('ada')
      const res = await checkout(ada.cookie, { currency: 'eur', interval: 'year', back: '/profil' })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' })
      expect(stripe.customers).toEqual([{ id: expect.any(String), account: ada.id, email: ada.email }])
      expect(stripe.checkouts[0]).toMatchObject({ customer: stripe.customers[0]!.id, account: ada.id, price: 'price_eur_y' })
      expect(stripe.checkouts[0]!.successUrl).toMatch(/^http:\/\/app\.test\/profil\?/)
      expect(stripe.checkouts[0]!.cancelUrl).toMatch(/^http:\/\/app\.test\/profil\?/)
      expect(await db.accountPlans.customerOf(ada.id)).toBe(stripe.customers[0]!.id)
      // A second checkout is the same customer, and nothing is a tier until Stripe says it is paid.
      expect((await checkout(ada.cookie, { currency: 'sek', interval: 'month' })).status).toBe(200)
      expect(stripe.customers).toHaveLength(1)
      expect(stripe.checkouts[1]).toMatchObject({ customer: stripe.customers[0]!.id, price: 'price_sek_m' })
      expect(await db.accountPlans.planOf(ada.id)).toBeNull()
    })

    it.each([
      ['a currency the box has no price in', { currency: 'usd', interval: 'month' }],
      ['an interval that is not month or year', { currency: 'sek', interval: 'week' }],
      ['a way back to another site', { currency: 'sek', interval: 'month', back: '//evil.example/' }],
      ['a way back that is no path', { currency: 'sek', interval: 'month', back: 'https://evil.example/' }],
    ])('refuse a checkout with %s', async (_what, body) => {
      await open()
      const ada = await someone('ada')
      expect((await checkout(ada.cookie, body)).status).toBe(400)
      expect(stripe.checkouts).toHaveLength(0)
    })

    it('write Pro with the source stripe when Stripe says the subscription is paid', async () => {
      await open()
      const ada = await someone('ada')
      const cus = await customer(ada.cookie)
      stripe.subs.set(cus, [{ status: 'active', prices: ['price_sek_m'] }])
      expect((await webhook(event('customer.subscription.created', cus))).status).toBe(200)
      expect(await db.accountPlans.planOf(ada.id)).toMatchObject({ plan: 'pro', source: 'stripe' })
      expect(await usage(ada.cookie)).toMatchObject({ plan: 'pro', print: true })
      // Already Pro: a second checkout would bill twice.
      expect((await checkout(ada.cookie, { currency: 'sek', interval: 'month' })).status).toBe(409)
    })

    it('lapse the account when the subscription has ended, and lift the lapse when it is renewed', async () => {
      await open()
      const ada = await someone('ada')
      const cus = await customer(ada.cookie)
      stripe.subs.set(cus, [{ status: 'active', prices: ['price_sek_y'] }])
      await webhook(event('customer.subscription.created', cus))
      stripe.subs.set(cus, [{ status: 'canceled', prices: ['price_sek_y'] }])
      expect((await webhook(event('customer.subscription.deleted', cus))).status).toBe(200)
      expect(await usage(ada.cookie)).toMatchObject({ plan: 'free', print: false, lapsed: { plan: 'pro' } })
      stripe.subs.set(cus, [{ status: 'canceled', prices: ['price_sek_y'] }, { status: 'active', prices: ['price_sek_y'] }])
      await webhook(event('customer.subscription.created', cus))
      expect(await db.accountPlans.planOf(ada.id)).toMatchObject({ plan: 'pro', source: 'stripe' })
      expect((await usage(ada.cookie)).lapsed).toBeUndefined()
    })

    it('change nothing for a webhook that is not Stripe’s, or one signed too long ago', async () => {
      await open()
      const ada = await someone('ada')
      const cus = await customer(ada.cookie)
      stripe.subs.set(cus, [{ status: 'active', prices: ['price_sek_m'] }])
      const body = event('customer.subscription.created', cus)
      for (const signature of [null, signed(body, 'whsec_other'), signed(body, WEBHOOK_SECRET, Math.floor(Date.now() / 1000) - 3600), 't=1,v1=00']) {
        expect((await webhook(body, signature)).status).toBe(400)
      }
      expect(stripe.asked).toBe(0)
      expect(await db.accountPlans.planOf(ada.id)).toBeNull()
    })

    // Stripe retries and replays, and sends events in no promised order. The box reads the
    // subscriptions as they stand each time, so a replay changes nothing and a late event cannot
    // undo a later one.
    it('change nothing wrong for a webhook that comes twice, or late', async () => {
      await open()
      const ada = await someone('ada')
      const cus = await customer(ada.cookie)
      stripe.subs.set(cus, [{ status: 'active', prices: ['price_sek_m'] }])
      const created = event('customer.subscription.created', cus)
      await webhook(created)
      const since = (await db.accountPlans.planOf(ada.id))!.since
      expect((await webhook(created)).status).toBe(200)
      expect((await db.accountPlans.planOf(ada.id))!.since).toBe(since)
      // Cancelled, then the created event comes once more, late: still lapsed.
      stripe.subs.set(cus, [{ status: 'canceled', prices: ['price_sek_m'] }])
      await webhook(event('customer.subscription.deleted', cus))
      const lapsed = (await db.accountPlans.planOf(ada.id))!.lapsed
      expect(lapsed).toEqual(expect.any(String))
      expect((await webhook(created)).status).toBe(200)
      expect((await db.accountPlans.planOf(ada.id))!.lapsed).toBe(lapsed)
    })

    it('never write over a tier the operator set, until she clears it', async () => {
      await open()
      const ada = await someone('ada')
      const cus = await customer(ada.cookie)
      await db.accountPlans.setPlan(ada.id, 'pro', 'operator')
      stripe.subs.set(cus, [{ status: 'canceled', prices: ['price_sek_m'] }])
      await webhook(event('customer.subscription.deleted', cus))
      expect(await db.accountPlans.planOf(ada.id)).toMatchObject({ plan: 'pro', source: 'operator' })
      expect((await db.accountPlans.planOf(ada.id))!.lapsed).toBeUndefined()
      await db.accountPlans.clearPlan(ada.id)
      stripe.subs.set(cus, [{ status: 'active', prices: ['price_sek_m'] }])
      await webhook(event('customer.subscription.updated', cus))
      expect(await db.accountPlans.planOf(ada.id)).toMatchObject({ plan: 'pro', source: 'stripe' })
    })

    // Stripe that does not answer: the checkout says so as a gateway's failure, and the webhook as the
    // box's, so that Stripe sends it again; nothing is written either way.
    it('answer 502 for a checkout and 500 for a webhook when Stripe cannot be reached, and write nothing', async () => {
      await open()
      const ada = await someone('ada')
      const cus = await customer(ada.cookie)
      const down = () => Promise.reject(new Error('stripe GET /v1/subscriptions: 500 '))
      stripe.subscriptionsOf = down
      stripe.createCheckout = down
      expect((await webhook(event('customer.subscription.created', cus))).status).toBe(500)
      const refused = await checkout(ada.cookie, { currency: 'sek', interval: 'month' })
      expect(refused.status).toBe(502)
      expect(await refused.json()).toEqual({ error: 'stripe unavailable' })
      expect(await db.accountPlans.planOf(ada.id)).toBeNull()
    })

    // A webhook that never came (RUNBOOK): the operator reads the account's subscriptions from Stripe
    // by its address and writes them as the webhook would have.
    it('are read back by address for the operator, as a webhook would have written them', async () => {
      await open()
      const ada = await someone('ada')
      const stores = { auth: db.auth, accountPlans: db.accountPlans, stripe, config }
      expect(await syncByAddress(stores, ada.email)).toEqual({ ok: false, why: 'no stripe customer' })
      expect(await syncByAddress(stores, 'nobody@example.com')).toEqual({ ok: false, why: 'no such account' })
      const cus = await customer(ada.cookie)
      stripe.subs.set(cus, [{ status: 'active', prices: ['price_eur_m'] }])
      expect(await syncByAddress(stores, ` ${ada.email.toUpperCase()} `)).toEqual({ ok: true, outcome: 'subscribed' })
      expect(await db.accountPlans.planOf(ada.id)).toMatchObject({ plan: 'pro', source: 'stripe' })
      expect(await syncByAddress(stores, ada.email)).toEqual({ ok: true, outcome: 'unchanged' })
    })

    it('answer an event about a customer the box does not know, or about none, and change nothing', async () => {
      await open()
      const before = await db.accountPlans.plansNamed()
      expect((await webhook(event('customer.subscription.created', 'cus_nobody'))).status).toBe(200)
      const none = JSON.stringify({ id: 'evt_none', object: 'event', type: 'product.updated', data: { object: { id: 'prod_1', object: 'product' } } })
      expect((await webhook(none)).status).toBe(200)
      // Stripe is not even asked about a customer that is nobody's here.
      expect(stripe.asked).toBe(0)
      expect(await db.accountPlans.plansNamed()).toEqual(before)
    })
  })
}
