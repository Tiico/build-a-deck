import { createServer, type IncomingMessage } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { stripeApi } from '../src/payments.js'
import { listenInBand } from './fixture.js'

// The box's client for Stripe's REST API (#1493), held to what Stripe documents — form-encoded
// requests with the secret key as bearer, JSON answers — against a stand-in on this machine, so no
// call leaves the suite.
type Seen = { method: string; path: string; query: URLSearchParams; form: URLSearchParams; auth: string }
const seen: Seen[] = []
const answers = new Map<string, { status: number; body: unknown }>()
const read = (req: IncomingMessage) => new Promise<string>((resolve) => {
  let body = ''
  req.on('data', (c: Buffer) => (body += String(c)))
  req.on('end', () => resolve(body))
})
const stand = createServer((req, res) => {
  void read(req).then((body) => {
    const at = new URL(req.url ?? '/', 'http://x')
    seen.push({ method: req.method ?? '', path: at.pathname, query: at.searchParams, form: new URLSearchParams(body), auth: String(req.headers.authorization) })
    const answer = answers.get(`${req.method} ${at.pathname}`) ?? { status: 404, body: { error: { message: 'no such thing' } } }
    res.writeHead(answer.status, { 'content-type': 'application/json' }).end(JSON.stringify(answer.body))
  })
})
let base = ''
beforeAll(async () => {
  base = `http://127.0.0.1:${await listenInBand(stand)}`
})
afterAll(async () => {
  await new Promise((resolve) => stand.close(resolve))
})

describe('the client for Stripe’s API', () => {
  it('makes a customer for an account, by its address, with the account in the metadata', async () => {
    answers.set('POST /v1/customers', { status: 200, body: { id: 'cus_123', object: 'customer' } })
    expect(await stripeApi('sk_test_k', base).createCustomer({ account: '42', email: 'ada@example.com' })).toBe('cus_123')
    const asked = seen.at(-1)!
    expect(asked.auth).toBe('Bearer sk_test_k')
    expect(Object.fromEntries(asked.form)).toEqual({ email: 'ada@example.com', 'metadata[account]': '42' })
  })

  it('asks for a subscription Checkout of one price and answers with its address', async () => {
    answers.set('POST /v1/checkout/sessions', { status: 200, body: { id: 'cs_1', url: 'https://checkout.stripe.com/c/pay/cs_1' } })
    const got = await stripeApi('sk_test_k', base).createCheckout({ customer: 'cus_123', account: '42', price: 'price_m', successUrl: 'http://app/p?pro=paid', cancelUrl: 'http://app/p?pro=cancelled' })
    expect(got).toBe('https://checkout.stripe.com/c/pay/cs_1')
    expect(Object.fromEntries(seen.at(-1)!.form)).toEqual({
      mode: 'subscription',
      customer: 'cus_123',
      client_reference_id: '42',
      'line_items[0][price]': 'price_m',
      'line_items[0][quantity]': '1',
      success_url: 'http://app/p?pro=paid',
      cancel_url: 'http://app/p?pro=cancelled',
      // VAT through Stripe Tax (#1521): reckoned on the customer's country, which Checkout asks for
      // and keeps on the customer, so the next invoice is taxed the same way.
      'automatic_tax[enabled]': 'true',
      billing_address_collection: 'auto',
      'customer_update[address]': 'auto',
    })
  })

  it('reads a price: its currency, its interval and whether VAT is inside it (#1521)', async () => {
    answers.set('GET /v1/prices/price_m', { status: 200, body: { id: 'price_m', object: 'price', currency: 'sek', unit_amount: 9900, tax_behavior: 'inclusive', recurring: { interval: 'month', interval_count: 1 } } })
    expect(await stripeApi('sk_test_k', base).priceOf('price_m')).toEqual({ id: 'price_m', currency: 'sek', interval: 'month', taxBehavior: 'inclusive' })
    answers.set('GET /v1/prices/price_once', { status: 200, body: { id: 'price_once', object: 'price', currency: 'eur', unit_amount: 900, tax_behavior: 'unspecified', recurring: null } })
    expect(await stripeApi('sk_test_k', base).priceOf('price_once')).toEqual({ id: 'price_once', currency: 'eur', interval: null, taxBehavior: 'unspecified' })
  })

  it('reads every subscription of a customer, cancelled ones too, with the prices each bills', async () => {
    answers.set('GET /v1/subscriptions', { status: 200, body: { object: 'list', data: [{ id: 'sub_1', status: 'canceled', items: { data: [{ price: { id: 'price_m' } }] } }, { id: 'sub_2', status: 'active', items: { data: [{ price: { id: 'price_y' } }] } }] } })
    expect(await stripeApi('sk_test_k', base).subscriptionsOf('cus_123')).toEqual([
      { id: 'sub_1', status: 'canceled', prices: ['price_m'] },
      { id: 'sub_2', status: 'active', prices: ['price_y'] },
    ])
    expect(Object.fromEntries(seen.at(-1)!.query)).toEqual({ customer: 'cus_123', status: 'all', limit: '100' })
  })

  it('cancels a subscription at once, not at the period’s end (#1520)', async () => {
    answers.set('DELETE /v1/subscriptions/sub_2', { status: 200, body: { id: 'sub_2', status: 'canceled' } })
    await stripeApi('sk_test_k', base).cancelNow('sub_2')
    expect(seen.at(-1)).toMatchObject({ method: 'DELETE', path: '/v1/subscriptions/sub_2', auth: 'Bearer sk_test_k' })
    await expect(stripeApi('sk_test_k', base).cancelNow('sub_gone')).rejects.toThrow(/404/)
  })

  it('throws Stripe’s message when Stripe refuses, never the key', async () => {
    answers.set('POST /v1/customers', { status: 401, body: { error: { message: 'Invalid API Key provided' } } })
    const failed = stripeApi('sk_test_secret', base).createCustomer({ account: '1', email: 'a@b.c' })
    await expect(failed).rejects.toThrow(/401 Invalid API Key provided/)
    await expect(failed).rejects.not.toThrow(/sk_test_secret/)
  })
})
