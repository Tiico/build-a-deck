import { describe, expect, it } from 'vitest'
import { bootMain } from './boot.js'

// Payments as the box's process reads them (#1493), held as `main.ts` starts: without Stripe's
// variables the app starts as it always did and says payments are off; with them it says test or
// live and which tiers can be bought, never a key; with half of them it does not start at all.
const PLANS = JSON.stringify({ default: 'free', plans: { free: { projects: 3 }, pro: { print: true } } })
const PRICES = JSON.stringify({ pro: { sek: { month: 'price_sek_m', year: 'price_sek_y' } } })

describe('payments at start (#1493)', () => {
  it('without Stripe’s variables, starts and says payments are off', async () => {
    const { lines } = await bootMain({ STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '', BYD_STRIPE_PRICES: '' })
    expect(lines).toContainEqual({ msg: 'payments', on: false })
    expect(lines.some((l) => l['msg'] === 'listening')).toBe(true)
  })

  it('with test keys and prices, starts and says so without a key', async () => {
    const { lines } = await bootMain({ BYD_PLANS: PLANS, STRIPE_SECRET_KEY: 'sk_test_boot', STRIPE_WEBHOOK_SECRET: 'whsec_boot', BYD_STRIPE_PRICES: PRICES })
    expect(lines).toContainEqual({ msg: 'payments', on: true, mode: 'test', plans: ['pro'] })
    expect(lines.some((l) => l['msg'] === 'listening')).toBe(true)
    expect(JSON.stringify(lines)).not.toContain('sk_test_boot')
    expect(JSON.stringify(lines)).not.toContain('whsec_boot')
  })

  it('with half of them, does not start, and the log says why', async () => {
    const { code, lines } = await bootMain({ BYD_PLANS: PLANS, STRIPE_SECRET_KEY: 'sk_test_boot', STRIPE_WEBHOOK_SECRET: '', BYD_STRIPE_PRICES: PRICES })
    expect(code).not.toBe(0)
    expect(lines.some((l) => l['msg'] === 'listening')).toBe(false)
    expect(String(lines.find((l) => l['msg'] === 'payments')?.['error'])).toMatch(/STRIPE_WEBHOOK_SECRET/)
  })
})
