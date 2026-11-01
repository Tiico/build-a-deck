import { describe, expect, it } from 'vitest'
import { bootMain } from './boot.js'

// The tiers as the box's process reads them (#1193, #1192), held as `main.ts` starts and not as a
// fixture does: without `BYD_PLANS` the app starts and says that nothing is limited, and with one it
// cannot read it does not start at all, and its log says why. In memory, so no database is touched;
// what a tier an account has does to the start is asked of `plansAtStart` against both stores in
// `account-plans.test.ts`.
const boot = (plans: string | undefined) => bootMain(plans === undefined ? {} : { BYD_PLANS: plans })

describe('the tiers at start (#1193)', () => {
  it('without BYD_PLANS, starts and says no ceiling is set', async () => {
    const { lines } = await boot(undefined)
    expect(lines).toContainEqual({ msg: 'plans', plans: ['free'], default: 'free', limited: false, print: ['free'], warning: 'no ceiling is set; nothing is limited' })
    expect(lines.some((l) => l['msg'] === 'listening')).toBe(true)
  })

  it('with a BYD_PLANS that sets a ceiling, starts and says so', async () => {
    const { lines } = await boot(JSON.stringify({ default: 'free', plans: { free: { projects: 3 }, pro: {} } }))
    expect(lines).toContainEqual({ msg: 'plans', plans: ['free', 'pro'], default: 'free', limited: true, print: [] })
    expect(lines.some((l) => l['msg'] === 'listening')).toBe(true)
  })

  // The print package is a property of a tier (#1490): the line says which tiers have it, never who.
  it('with a BYD_PLANS that gives Pro the print package, starts and says which tiers have it', async () => {
    const { lines } = await boot(JSON.stringify({ default: 'free', plans: { free: { projects: 3 }, pro: { print: true } } }))
    expect(lines).toContainEqual({ msg: 'plans', plans: ['free', 'pro'], default: 'free', limited: true, print: ['pro'] })
    expect(lines.some((l) => l['msg'] === 'listening')).toBe(true)
  })

  it.each([
    ['is not JSON', '{default: free', /BYD_PLANS is not JSON/],
    ['does not hold the schema', JSON.stringify({ default: 'free', plans: { free: { projekts: 3 } } }), /BYD_PLANS does not hold: .*projekts/],
    ['misspells a property', JSON.stringify({ default: 'free', plans: { free: {}, pro: { prnit: true } } }), /BYD_PLANS does not hold: .*prnit/],
  ])('with a BYD_PLANS that %s, does not start, and the log says why', async (_what, raw, why) => {
    const { code, lines } = await boot(raw)
    expect(code).not.toBe(0)
    expect(lines.some((l) => l['msg'] === 'listening')).toBe(false)
    const said = lines.find((l) => l['msg'] === 'plans')
    expect(String(said?.['error'])).toMatch(why)
  })
})
