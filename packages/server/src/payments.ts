import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import type { AccountPlanStore } from './account-plans.js'
import type { Plans } from './quotas.js'

// Subscriptions through Stripe (#1493, A2, DRIFT §12): a checkout for a paid tier, and Stripe's word
// on the subscription written as the account's tier in `account_plans` with the source `stripe`.
// No card passes the box: the designer pays on Stripe's own Checkout page, and the box keeps only
// which Stripe customer is which account.
//
// Configuration only, read once at start like `BYD_PLANS`: `STRIPE_SECRET_KEY`, the API's secret
// key (test mode's until release); `STRIPE_WEBHOOK_SECRET`, what the webhook's signatures are made
// with; and `BYD_STRIPE_PRICES`, the price ids per tier, currency and interval, as JSON:
//   {"pro":{"sek":{"month":"price_…","year":"price_…"},"eur":{"month":"price_…","year":"price_…"}}}
// None of them is in the repo, and no price is a number in the code: what a tier costs is the
// price Stripe holds under the id. Without any of them payments are off and the box starts as it
// always did. Half of them, or prices that cannot be read, stop the start: a box must never quietly
// take money it cannot record, nor quietly fail to take it.

export const INTERVALS = ['month', 'year'] as const
export type Interval = (typeof INTERVALS)[number]
const PlanName = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,31}$/)
const Currency = z.string().regex(/^[a-z]{3}$/, 'a currency is three lower-case letters, as Stripe writes it')
const PriceId = z.string().min(1)
const Prices = z.record(PlanName, z.record(Currency, z.strictObject({ month: PriceId.optional(), year: PriceId.optional() })))
type Prices = z.infer<typeof Prices>

export type PriceOf = { plan: string; currency: string; interval: Interval }
export type PaymentsConfig = { secretKey: string; webhookSecret: string; prices: Prices; byId: ReadonlyMap<string, PriceOf> }

export function paymentsFromEnv(env: Record<string, string | undefined>, plans: Plans): PaymentsConfig | null {
  const secretKey = (env['STRIPE_SECRET_KEY'] ?? '').trim()
  const webhookSecret = (env['STRIPE_WEBHOOK_SECRET'] ?? '').trim()
  const raw = (env['BYD_STRIPE_PRICES'] ?? '').trim()
  if (secretKey === '' && webhookSecret === '' && raw === '') return null
  const missing = [secretKey === '' && 'STRIPE_SECRET_KEY', webhookSecret === '' && 'STRIPE_WEBHOOK_SECRET', raw === '' && 'BYD_STRIPE_PRICES'].filter(Boolean)
  if (missing.length > 0) throw new Error(`payments are half configured: ${missing.join(', ')} unset`)
  if (!/^(sk|rk)_(test|live)_/.test(secretKey)) throw new Error('STRIPE_SECRET_KEY is not a secret key (sk_test_…, sk_live_…)')
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch (e) {
    throw new Error(`BYD_STRIPE_PRICES is not JSON: ${(e as Error).message}`)
  }
  const parsed = Prices.safeParse(json)
  if (!parsed.success) throw new Error(`BYD_STRIPE_PRICES does not hold: ${parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')}`)
  const prices = parsed.data
  const byId = new Map<string, PriceOf>()
  for (const [plan, currencies] of Object.entries(prices)) {
    if (!(plan in plans.plans)) throw new Error(`BYD_STRIPE_PRICES names a tier BYD_PLANS does not have: ${plan}`)
    // The default is what an account without a tier of its own has, and what a lapse falls back to
    // (A2): it is never paid for.
    if (plan === plans.default) throw new Error(`BYD_STRIPE_PRICES prices the default tier, which is free: ${plan}`)
    for (const [currency, intervals] of Object.entries(currencies)) {
      for (const interval of INTERVALS) {
        const id = intervals[interval]
        if (id === undefined) continue
        if (byId.has(id)) throw new Error(`BYD_STRIPE_PRICES names one price id twice: ${id}`)
        byId.set(id, { plan, currency, interval })
      }
    }
  }
  if (byId.size === 0) throw new Error('BYD_STRIPE_PRICES names no price')
  return { secretKey, webhookSecret, prices, byId }
}

// What the start says about payments (DRIFT §8): whether they are on, test or live, and which tiers
// can be bought. Never a key, a price id or who pays.
export function paymentsLine(config: PaymentsConfig | null): Record<string, unknown> {
  if (!config) return { msg: 'payments', on: false }
  return { msg: 'payments', on: true, mode: config.secretKey.includes('_live_') ? 'live' : 'test', plans: Object.keys(config.prices).sort() }
}

// The price id for a tier in a currency and interval, or null when the box has none. The paid tier
// is the one tier that has prices; with more than one, the first by name (A2 has one: Pro).
export function priceFor(config: PaymentsConfig, currency: string, interval: Interval, plan = Object.keys(config.prices).sort()[0] ?? ''): string | null {
  return config.prices[plan]?.[currency]?.[interval] ?? null
}

// Whether a webhook body is Stripe's (`Stripe-Signature: t=…,v1=…`): an HMAC-SHA256 of `t.body`
// under the webhook secret, in any of the v1 signatures, made within five minutes of `now` either
// way. Anything older is a replay, and anything else is not Stripe.
export const SIGNATURE_TOLERANCE_S = 300
export function signatureHolds(body: string, header: string | undefined, secret: string, now: Date): boolean {
  if (!header) return false
  const parts = header.split(',').map((p) => p.trim().split('=') as [string, string | undefined])
  const t = Number(parts.find(([k]) => k === 't')?.[1])
  if (!Number.isInteger(t) || Math.abs(now.getTime() / 1000 - t) > SIGNATURE_TOLERANCE_S) return false
  const expected = createHmac('sha256', secret).update(`${t}.${body}`).digest()
  return parts.some(([k, v]) => {
    if (k !== 'v1' || !v || !/^[0-9a-f]{64}$/.test(v)) return false
    return timingSafeEqual(Buffer.from(v, 'hex'), expected)
  })
}

// A subscription as the box reads it: its id, Stripe's status and the price ids it bills.
export type Subscription = { id: string; status: string; prices: string[] }
// The statuses in which the period is paid for: active, in a trial, or past due while Stripe still
// retries the payment. Cancelled, unpaid, never paid and expired are not.
const LIVE = new Set(['active', 'trialing', 'past_due'])
// The tier a customer's subscriptions give: that of a live one at a price the box knows, or none.
export function planOfSubscriptions(config: PaymentsConfig, subs: readonly Pick<Subscription, 'status' | 'prices'>[]): string | null {
  for (const sub of subs) {
    if (!LIVE.has(sub.status)) continue
    for (const price of sub.prices) {
      const known = config.byId.get(price)
      if (known) return known.plan
    }
  }
  return null
}

// What the box asks of Stripe, and nothing else: a customer for an account, a Checkout page for a
// price, a customer's subscriptions as they stand, and a subscription cancelled at once (#1520). The suite answers it with a fake; the box
// with `stripeApi`, Stripe's REST API over fetch.
export type StripeApi = {
  createCustomer(input: { account: string; email: string }): Promise<string>
  createCheckout(input: { customer: string; account: string; price: string; successUrl: string; cancelUrl: string }): Promise<string>
  subscriptionsOf(customer: string): Promise<Subscription[]>
  cancelNow(subscription: string): Promise<void>
}

export const STRIPE_API = 'https://api.stripe.com'
// Stripe's REST API: form-encoded requests, bearer secret key, JSON answers. `base` is Stripe's
// unless a test points it elsewhere. A request Stripe answers with an error throws, with Stripe's
// message and never the key.
export function stripeApi(secretKey: string, base = STRIPE_API, fetcher: typeof fetch = fetch): StripeApi {
  const call = async (method: 'GET' | 'POST' | 'DELETE', path: string, params: Record<string, string>): Promise<Record<string, unknown>> => {
    const query = new URLSearchParams(params).toString()
    const res = await fetcher(`${base}${path}${method === 'GET' && query ? `?${query}` : ''}`, {
      method,
      headers: { authorization: `Bearer ${secretKey}`, ...(method === 'POST' ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
      ...(method === 'POST' ? { body: query } : {}),
    })
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) throw new Error(`stripe ${method} ${path}: ${res.status} ${String((body['error'] as { message?: unknown } | undefined)?.message ?? '')}`)
    return body
  }
  return {
    async createCustomer({ account, email }) {
      const body = await call('POST', '/v1/customers', { email, 'metadata[account]': account })
      return String(body['id'])
    },
    async createCheckout({ customer, account, price, successUrl, cancelUrl }) {
      const body = await call('POST', '/v1/checkout/sessions', {
        mode: 'subscription',
        customer,
        client_reference_id: account,
        'line_items[0][price]': price,
        'line_items[0][quantity]': '1',
        success_url: successUrl,
        cancel_url: cancelUrl,
      })
      return String(body['url'])
    },
    async subscriptionsOf(customer) {
      const body = await call('GET', '/v1/subscriptions', { customer, status: 'all', limit: '100' })
      const data = (body['data'] ?? []) as { id?: unknown; status?: unknown; items?: { data?: { price?: { id?: unknown } }[] } }[]
      return data.map((s) => ({ id: String(s.id), status: String(s.status), prices: (s.items?.data ?? []).map((i) => String(i.price?.id ?? '')) }))
    },
    async cancelNow(subscription) {
      await call('DELETE', `/v1/subscriptions/${encodeURIComponent(subscription)}`, {})
    },
  }
}

// The operator's way round a webhook that never came (RUNBOOK): the account by its address, read
// from Stripe and written exactly as a webhook would. An account that never went to the checkout
// has no customer, and nothing is asked.
export async function syncByAddress(stores: { auth: { accountByEmail(email: string): Promise<{ id: string } | null> }; accountPlans: AccountPlanStore; stripe: StripeApi; config: PaymentsConfig }, email: string): Promise<{ ok: true; outcome: Synced } | { ok: false; why: string }> {
  const account = await stores.auth.accountByEmail(email.trim().toLowerCase())
  if (!account) return { ok: false, why: 'no such account' }
  const customer = await stores.accountPlans.customerOf(account.id)
  if (!customer) return { ok: false, why: 'no stripe customer' }
  return { ok: true, outcome: await syncCustomer(stores, customer) }
}

// The customer a webhook event is about: Stripe's events name it on their object, either as an id
// or, expanded, as an object with one.
export function customerOfEvent(event: unknown): string | null {
  const object = (event as { data?: { object?: { object?: unknown; id?: unknown; customer?: unknown } } } | null)?.data?.object
  if (!object) return null
  if (object.object === 'customer' && typeof object.id === 'string') return object.id
  const customer = object.customer
  if (typeof customer === 'string') return customer
  if (customer && typeof customer === 'object' && typeof (customer as { id?: unknown }).id === 'string') return (customer as { id: string }).id
  return null
}

// What one customer's subscriptions come to, written to the account it is linked to (#1493):
// asked of Stripe as it stands now, never read out of the event, so an event that comes twice, late
// or out of order comes to the same answer as the one before it. A live subscription gives its tier
// and ends a lapse; none, on an account whose tier Stripe gave, lapses it (G5, L2, #1491). Nothing is
// written when nothing changes. A tier the operator set (`source: 'operator'`) is never written
// over: the operator's word stands until she clears it, and the next event then holds (DRIFT §12).
export type Synced = 'unknown-customer' | 'operator' | 'subscribed' | 'lapsed' | 'unchanged'
export async function syncCustomer(stores: { accountPlans: AccountPlanStore; stripe: StripeApi; config: PaymentsConfig }, customer: string): Promise<Synced> {
  const account = await stores.accountPlans.accountOfCustomer(customer)
  if (!account) return 'unknown-customer'
  const tier = planOfSubscriptions(stores.config, await stores.stripe.subscriptionsOf(customer))
  const row = await stores.accountPlans.planOf(account)
  if (row?.source === 'operator') return 'operator'
  if (tier !== null) {
    if (row && row.plan === tier && row.lapsed === undefined) return 'unchanged'
    await stores.accountPlans.setPlan(account, tier, 'stripe')
    return 'subscribed'
  }
  if (!row || row.lapsed !== undefined) return 'unchanged'
  await stores.accountPlans.lapse(account)
  return 'lapsed'
}

// What an account that deletes itself does at Stripe (#1520, G6): every subscription of its customer
// that Stripe could still bill is cancelled at once, not at the period's end, before the account
// goes. The customer is queued first, where the account's erasure does not reach (`stripe_
// cancellations`), and leaves the queue when Stripe has said yes; a Stripe that does not answer
// leaves it there for `retryCancellations`, and never stops the erasure. Without payments on the
// box nothing can be asked, and the customer waits in the queue for them.
export type Cancelled = 'no-customer' | 'cancelled' | 'queued'
export async function cancelForErasure(stores: { accountPlans: AccountPlanStore; stripe: StripeApi | null }, account: string): Promise<Cancelled> {
  const customer = await stores.accountPlans.customerOf(account)
  if (!customer) return 'no-customer'
  await stores.accountPlans.queueCancellation(customer)
  return (await cancelQueued(stores, customer)) === 'cancelled' ? 'cancelled' : 'queued'
}

// The statuses Stripe can no longer bill from: cancelled, or never paid and expired.
const ENDED = new Set(['canceled', 'incomplete_expired'])
async function cancelQueued(stores: { accountPlans: AccountPlanStore; stripe: StripeApi | null }, customer: string): Promise<'cancelled' | 'failed'> {
  if (!stores.stripe) return 'failed'
  try {
    for (const sub of await stores.stripe.subscriptionsOf(customer)) if (!ENDED.has(sub.status)) await stores.stripe.cancelNow(sub.id)
  } catch (err) {
    await stores.accountPlans.cancellationFailed(customer)
    console.error(JSON.stringify({ msg: 'stripe', cancel: 'failed', error: err instanceof Error ? err.message : String(err) }))
    return 'failed'
  }
  await stores.accountPlans.unqueueCancellation(customer)
  return 'cancelled'
}

// The queue tried again (#1520): at start and every hour beside the other sweeps, and by the
// operator with `stripe sync` and no address. Says each customer and what came of it, which is for
// the operator's eyes only; the box's log says how many.
export async function retryCancellations(stores: { accountPlans: AccountPlanStore; stripe: StripeApi | null }): Promise<{ customer: string; outcome: 'cancelled' | 'failed'; queued: string; tries: number }[]> {
  const out: { customer: string; outcome: 'cancelled' | 'failed'; queued: string; tries: number }[] = []
  for (const pending of await stores.accountPlans.pendingCancellations()) {
    const outcome = await cancelQueued(stores, pending.customer)
    out.push({ customer: pending.customer, outcome, queued: pending.queued, tries: pending.tries + 1 })
  }
  return out
}
