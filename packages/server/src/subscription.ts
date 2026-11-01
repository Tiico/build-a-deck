import type { AccountPlanStore } from './account-plans.js'
import { LIVE, type Interval, type PaymentsConfig, type PriceOf, type StripeApi, type StripePrice, type Subscription } from './payments.js'
import { hasPrint, limitOf, type Limit, type Plans } from './quotas.js'

// What Profil's card «Abonnemang» reads (#1494, variant A): the tier the account is held to, the
// free tier and the paid one with their ceilings, what Stripe charges for the paid one in each
// currency and interval, and the account's own subscription as Stripe has it. No price is a number
// here or in the web: the amounts are the prices Stripe holds under `BYD_STRIPE_PRICES`' ids.

// The measures a ceiling is asked at, in Profil's order; renders have no door yet (#1197).
const SAID = ['projects', 'cardRowsPerProject', 'cardCopiesPerProject', 'openTables', 'tablesPer30Days', 'storageBytes'] as const
export type Tier = { plan: string; limits: Record<(typeof SAID)[number], Limit>; print: boolean }
export type OwnSubscription = { status: string; currency: string; interval: Interval; amount: number | null; periodEnd: string | null; cancelAtPeriodEnd: boolean }
export type SubscriptionView = {
  plan: string
  free: Tier
  paid: Tier
  // Per currency and interval, in the currency's smallest unit; null when Stripe could not be asked.
  prices: Record<string, Partial<Record<Interval, number>>> | null
  subscription: OwnSubscription | null
}

// The paid tier: the one tier `BYD_STRIPE_PRICES` prices (A2 has one, Pro).
export const paidPlan = (config: PaymentsConfig): string => Object.keys(config.prices).sort()[0] ?? ''

const tier = (plans: Plans, plan: string): Tier => ({ plan, limits: Object.fromEntries(SAID.map((m) => [m, limitOf(plans, plan, m)])) as Tier['limits'], print: hasPrint(plans, plan) })

// A price's amount never changes at Stripe, so each is asked once per process; one that could not
// be read is asked again next time.
const known = new WeakMap<StripeApi, Map<string, StripePrice>>()
async function priceOf(stripe: StripeApi, id: string): Promise<StripePrice> {
  const cache = known.get(stripe) ?? new Map<string, StripePrice>()
  known.set(stripe, cache)
  const hit = cache.get(id)
  if (hit) return hit
  const price = await stripe.priceOf(id)
  cache.set(id, price)
  return price
}

export type SubscriptionStores = { accountPlans: AccountPlanStore; payments: { config: PaymentsConfig; stripe: StripeApi }; plans: Plans }

export async function subscriptionView(stores: SubscriptionStores, account: string): Promise<SubscriptionView> {
  const { config, stripe } = stores.payments
  const own = await stores.accountPlans.planOf(account)
  const plan = own && own.lapsed === undefined ? own.plan : stores.plans.default
  let prices: SubscriptionView['prices'] = {}
  try {
    for (const [id, of] of config.byId) {
      const amount = (await priceOf(stripe, id)).amount
      if (of.plan === paidPlan(config) && amount !== null) prices[of.currency] = { ...prices[of.currency], [of.interval]: amount }
    }
  } catch (err) {
    console.error(JSON.stringify({ msg: 'stripe', prices: 'failed', error: err instanceof Error ? err.message : String(err) }))
    prices = null
  }
  return { plan, free: tier(stores.plans, stores.plans.default), paid: tier(stores.plans, paidPlan(config)), prices, subscription: await ownSubscription(stores, account) }
}

// «Säg upp Pro» and «Fortsätt med Pro» (#1494, variant A): the account's live subscription set to
// end when the period it is paid for ends, or to renew again. Pro holds until then, and Stripe's
// webhook lapses the account when the period is over (#1491). Nothing is cancelled at once here:
// that is the erasure's (#1520) and the operator's. False when the account has no live subscription.
export async function setCancellation(stores: SubscriptionStores, account: string, cancel: boolean): Promise<boolean> {
  const live = await liveOf(stores, account)
  if (!live) return false
  await stores.payments.stripe.setCancelAtPeriodEnd(live.sub.id, cancel)
  return true
}

async function liveOf(stores: SubscriptionStores, account: string): Promise<{ sub: Subscription; price: string; of: PriceOf } | null> {
  const customer = await stores.accountPlans.customerOf(account)
  if (!customer) return null
  return liveOfCustomer(stores.payments, customer)
}
// A customer's live subscription at a price the box knows, as Stripe has it now.
export async function liveOfCustomer(payments: { config: PaymentsConfig; stripe: StripeApi }, customer: string): Promise<{ sub: Subscription; price: string; of: PriceOf } | null> {
  for (const sub of await payments.stripe.subscriptionsOf(customer)) {
    if (!LIVE.has(sub.status)) continue
    const price = sub.prices.find((p) => payments.config.byId.has(p))
    const of = price ? payments.config.byId.get(price) : undefined
    if (price && of) return { sub, price, of }
  }
  return null
}

// The account's live subscription at a price the box knows, as Stripe has it now; none for an
// account that never went to the checkout, or whose subscriptions have all ended.
async function ownSubscription(stores: SubscriptionStores, account: string): Promise<OwnSubscription | null> {
  const live = await liveOf(stores, account)
  if (!live) return null
  const { sub, price, of } = live
  const amount = await priceOf(stores.payments.stripe, price).then(
    (p) => p.amount,
    () => null,
  )
  return { status: sub.status, currency: of.currency, interval: of.interval, amount, periodEnd: sub.periodEnd, cancelAtPeriodEnd: sub.cancelAtPeriodEnd }
}
