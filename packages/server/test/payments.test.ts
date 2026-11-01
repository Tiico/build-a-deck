import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { paymentsFromEnv, paymentsLine, planOfSubscriptions, priceFor, signatureHolds } from '../src/payments.js'
import { DEFAULT_PLANS, plansFromEnv } from '../src/quotas.js'

// Subscriptions through Stripe (#1493, A2, DRIFT §12): what the box is configured with, and the
// pieces of Stripe's answers that decide an account's tier, asked here without HTTP and without
// Stripe. The keys and the price ids are the box's `.env`, never the repo; without them the server
// starts as it always did, with payments off.
const tiers = plansFromEnv({ BYD_PLANS: JSON.stringify({ default: 'free', plans: { free: { projects: 3 }, pro: { print: true } } }) })
const prices = { pro: { sek: { month: 'price_sek_m', year: 'price_sek_y' }, eur: { month: 'price_eur_m', year: 'price_eur_y' } } }
const env = { STRIPE_SECRET_KEY: 'sk_test_abc', STRIPE_WEBHOOK_SECRET: 'whsec_xyz', BYD_STRIPE_PRICES: JSON.stringify(prices) }

describe('the payments the box is given', () => {
  it('are off without any of the variables, so a box without keys starts as before', () => {
    expect(paymentsFromEnv({}, tiers)).toBeNull()
    expect(paymentsLine(null)).toEqual({ msg: 'payments', on: false })
  })

  it('are read from the keys and the price ids, and say test or live but never a key', () => {
    const config = paymentsFromEnv(env, tiers)!
    expect(priceFor(config, 'sek', 'month')).toBe('price_sek_m')
    expect(priceFor(config, 'eur', 'year')).toBe('price_eur_y')
    expect(priceFor(config, 'usd', 'year')).toBeNull()
    expect(paymentsLine(config)).toEqual({ msg: 'payments', on: true, mode: 'test', plans: ['pro'] })
    expect(paymentsLine(paymentsFromEnv({ ...env, STRIPE_SECRET_KEY: 'sk_live_abc' }, tiers))).toMatchObject({ mode: 'live' })
    expect(JSON.stringify(paymentsLine(config))).not.toContain('sk_test_abc')
  })

  // Half a configuration stops the start, as BYD_PLANS does: a box must never quietly take money it
  // cannot record, nor quietly fail to take it.
  it.each([
    ['a secret key without the webhook secret', { STRIPE_SECRET_KEY: 'sk_test_abc', BYD_STRIPE_PRICES: JSON.stringify(prices) }, /STRIPE_WEBHOOK_SECRET/],
    ['keys without prices', { STRIPE_SECRET_KEY: 'sk_test_abc', STRIPE_WEBHOOK_SECRET: 'whsec_xyz' }, /BYD_STRIPE_PRICES/],
    ['prices that are not JSON', { ...env, BYD_STRIPE_PRICES: '{pro' }, /BYD_STRIPE_PRICES is not JSON/],
    ['prices for a tier BYD_PLANS lacks', { ...env, BYD_STRIPE_PRICES: JSON.stringify({ gold: prices.pro }) }, /gold/],
    ['prices for the default tier, which is free', { ...env, BYD_STRIPE_PRICES: JSON.stringify({ free: prices.pro }) }, /free/],
    ['an interval Stripe has no word for here', { ...env, BYD_STRIPE_PRICES: JSON.stringify({ pro: { sek: { week: 'price_w' } } }) }, /week/],
    ['one price id for two prices', { ...env, BYD_STRIPE_PRICES: JSON.stringify({ pro: { sek: { month: 'price_x', year: 'price_x' } } }) }, /price_x/],
    ['a key that is not a secret key', { ...env, STRIPE_SECRET_KEY: 'pk_test_abc' }, /STRIPE_SECRET_KEY/],
  ])('refuse %s, saying why', (_what, given, why) => {
    expect(() => paymentsFromEnv(given, tiers)).toThrow(why)
  })

  // The built app's journeys (#1494) point the box at a Stripe of their own; with a live key that
  // would be a way round Stripe for real money, so only a test key may.
  it('take another address for Stripe’s API only with a test key', () => {
    expect(paymentsFromEnv(env, tiers)!.apiBase).toBe('https://api.stripe.com')
    expect(paymentsFromEnv({ ...env, STRIPE_API_BASE: 'http://127.0.0.1:4242' }, tiers)!.apiBase).toBe('http://127.0.0.1:4242')
    expect(() => paymentsFromEnv({ ...env, STRIPE_SECRET_KEY: 'sk_live_abc', STRIPE_API_BASE: 'http://127.0.0.1:4242' }, tiers)).toThrow(/STRIPE_API_BASE/)
    expect(() => paymentsFromEnv({ ...env, STRIPE_API_BASE: 'not a url' }, tiers)).toThrow(/STRIPE_API_BASE/)
  })

  it('refuse prices on the built-in standard, which has no paid tier', () => {
    expect(() => paymentsFromEnv(env, DEFAULT_PLANS)).toThrow(/pro/)
  })
})

// Stripe signs every webhook (`Stripe-Signature: t=…,v1=…`): an HMAC-SHA256 of `t.body` under the
// webhook secret. A body that is not signed so, or signed too long ago to be anything but a replay,
// is not Stripe's.
describe('a webhook’s signature', () => {
  const secret = 'whsec_xyz'
  const body = '{"id":"evt_1"}'
  const sign = (t: number, payload = body, key = secret) => `t=${t},v1=${createHmac('sha256', key).update(`${t}.${payload}`).digest('hex')}`
  const now = new Date('2026-11-01T12:00:00Z')
  const t = Math.floor(now.getTime() / 1000)

  it('holds when it is Stripe’s, among other schemes and signatures', () => {
    expect(signatureHolds(body, sign(t), secret, now)).toBe(true)
    expect(signatureHolds(body, `${sign(t)},v1=deadbeef,v0=abc`, secret, now)).toBe(true)
    expect(signatureHolds(body, `t=${t},v1=deadbeef,${sign(t).split(',')[1]}`, secret, now)).toBe(true)
  })

  it.each([
    ['another body', () => signatureHolds('{"id":"evt_2"}', sign(t), secret, now)],
    ['another secret', () => signatureHolds(body, sign(t, body, 'whsec_other'), secret, now)],
    ['no header', () => signatureHolds(body, undefined, secret, now)],
    ['a header without a v1', () => signatureHolds(body, `t=${t}`, secret, now)],
    ['a signature more than five minutes old', () => signatureHolds(body, sign(t - 301), secret, now)],
    ['a signature from the future', () => signatureHolds(body, sign(t + 301), secret, now)],
  ])('does not hold for %s', (_what, holds) => {
    expect(holds()).toBe(false)
  })
})

// What a customer's subscriptions come to: the tier of a subscription that is live and whose price
// the box knows, or none. Asked of Stripe's state as it is now, never of one event, so events that
// come twice or out of order come to the same answer.
describe('the tier a customer’s subscriptions give', () => {
  const config = paymentsFromEnv(env, tiers)!
  it.each([
    ['an active subscription', [{ status: 'active', prices: ['price_sek_m'] }], 'pro'],
    ['one in a trial', [{ status: 'trialing', prices: ['price_eur_y'] }], 'pro'],
    // Stripe is still retrying the payment: the period is paid for until it gives up.
    ['one past due', [{ status: 'past_due', prices: ['price_sek_y'] }], 'pro'],
    ['one cancelled', [{ status: 'canceled', prices: ['price_sek_m'] }], null],
    ['one unpaid', [{ status: 'unpaid', prices: ['price_sek_m'] }], null],
    ['one never paid', [{ status: 'incomplete', prices: ['price_sek_m'] }], null],
    ['an active one at a price the box does not know', [{ status: 'active', prices: ['price_other'] }], null],
    ['a cancelled one and a new active one', [{ status: 'canceled', prices: ['price_sek_m'] }, { status: 'active', prices: ['price_eur_m'] }], 'pro'],
    ['none', [], null],
  ])('are %s', (_what, subs, tier) => {
    expect(planOfSubscriptions(config, subs)).toBe(tier)
  })
})
