import { describe, expect, it } from 'vitest'
import { DEFAULT_PLANS, growth, limitOf, ownerNameOf, plansFromEnv, plansLine } from '../src/quotas.js'

// The tiers as configuration (A2, #1192, #1193): read once at start from `BYD_PLANS`, and without it
// a single tier where nothing is limited — the beta's state, and the state a box lands in when the
// variable is forgotten, so that no deploy can shut a designer out by mistake.
describe('the tiers the box is given', () => {
  it('are one tier, free, with no ceiling anywhere, when BYD_PLANS is unset or empty', () => {
    expect(plansFromEnv({})).toEqual(DEFAULT_PLANS)
    expect(plansFromEnv({ BYD_PLANS: '' })).toEqual(DEFAULT_PLANS)
    expect(plansFromEnv({ BYD_PLANS: '  ' })).toEqual(DEFAULT_PLANS)
    expect(DEFAULT_PLANS.default).toBe('free')
    expect(limitOf(DEFAULT_PLANS, 'free', 'projects')).toBeNull()
  })

  it('are read from BYD_PLANS as JSON', () => {
    const plans = plansFromEnv({ BYD_PLANS: JSON.stringify({ default: 'free', plans: { free: { projects: 3 }, pro: { projects: null } } }) })
    expect(limitOf(plans, 'free', 'projects')).toBe(3)
    expect(limitOf(plans, 'pro', 'projects')).toBeNull()
  })

  it('leave a measure a tier does not name unlimited on that tier', () => {
    const plans = plansFromEnv({ BYD_PLANS: JSON.stringify({ default: 'free', plans: { free: {} } }) })
    expect(limitOf(plans, 'free', 'projects')).toBeNull()
  })

  it('take every measure the PRD names, as an integer or null', () => {
    const all = { projects: 3, cardRowsPerProject: 120, cardCopiesPerProject: null, openTables: 1, tablesPer30Days: 10, storageBytes: 50_000_000, rendersPer30Days: null }
    const plans = plansFromEnv({ BYD_PLANS: JSON.stringify({ default: 'free', plans: { free: all } }) })
    expect(limitOf(plans, 'free', 'cardRowsPerProject')).toBe(120)
    expect(limitOf(plans, 'free', 'rendersPer30Days')).toBeNull()
  })

  // A configuration that cannot be read stops the start (#1192): an error must never quietly become
  // unlimited, nor quietly become closed. What is wrong is said, so the log can tell the operator.
  it.each([
    ['not JSON', '{default: free', /BYD_PLANS is not JSON/],
    ['no tiers', JSON.stringify({ default: 'free', plans: {} }), /BYD_PLANS/],
    ['a default that is not a tier', JSON.stringify({ default: 'gratis', plans: { free: {} } }), /default.*gratis/],
    ['a ceiling that is not a whole number', JSON.stringify({ default: 'free', plans: { free: { projects: 2.5 } } }), /projects/],
    ['a negative ceiling', JSON.stringify({ default: 'free', plans: { free: { projects: -1 } } }), /projects/],
    ['a measure nobody knows', JSON.stringify({ default: 'free', plans: { free: { projekts: 3 } } }), /projekts/],
  ])('refuse %s, saying why', (_what, raw, why) => {
    expect(() => plansFromEnv({ BYD_PLANS: raw })).toThrow(why)
  })

  // What the start says about them (DRIFT §8): the tiers' names, the default and whether any ceiling
  // is set at all — never who has which tier.
  it('are said in one log line, which says when no ceiling is set', () => {
    expect(plansLine(DEFAULT_PLANS)).toEqual({ msg: 'plans', plans: ['free'], default: 'free', limited: false, warning: 'no ceiling is set; nothing is limited' })
    const plans = plansFromEnv({ BYD_PLANS: JSON.stringify({ default: 'free', plans: { free: { projects: 3 }, pro: {} } }) })
    expect(plansLine(plans)).toEqual({ msg: 'plans', plans: ['free', 'pro'], default: 'free', limited: true })
  })
})

// The one question a ceiling answers: may this measure grow by n, given what is used and the limit?
describe('a measure growing', () => {
  it('always may when the ceiling is null', () => {
    expect(growth('projects', null, 1_000_000, 1)).toBeNull()
  })

  it('may up to the ceiling and not past it', () => {
    expect(growth('projects', 2, 1, 1)).toBeNull()
    expect(growth('projects', 2, 2, 1)).toEqual({ measure: 'projects', limit: 2, used: 2 })
    expect(growth('projects', 10, 8, 3)).toEqual({ measure: 'projects', limit: 10, used: 8 })
  })

  // An account over its ceiling (the ceiling lowered after the fact) may still shrink and stand still.
  it('never refuses what does not grow, even over the ceiling', () => {
    expect(growth('projects', 2, 5, 0)).toBeNull()
    expect(growth('projects', 2, 5, -1)).toBeNull()
  })
})

// Whose ceiling a test leader or a co-editor met (#1198, beställarens beslut 3): the owner by name,
// and never by address or tier. An account has no name of its own, so the name is the first word of
// the address before the @ that reads as a name, with a capital; an address with none is no name.
describe('the owner named on a ceiling someone else met', () => {
  it('is the first word of the address that reads as a name, with a capital', () => {
    expect(ownerNameOf('nicklas.ockelberg@example.com')).toBe('Nicklas')
    expect(ownerNameOf('ockelberg@gmail.com')).toBe('Ockelberg')
    expect(ownerNameOf('ada-3@example.com')).toBe('Ada')
    expect(ownerNameOf('e2e-owner+1198@example.com')).toBe('Owner')
    expect(ownerNameOf('åsa_lind@example.se')).toBe('Åsa')
  })

  it('is nothing when no word of the address reads as a name, so the sentence says «the game’s owner»', () => {
    expect(ownerNameOf('x1@example.com')).toBeNull()
    expect(ownerNameOf('12345@example.com')).toBeNull()
    expect(ownerNameOf('a.b@example.com')).toBeNull()
  })

  it('never carries the rest of the address', () => {
    for (const email of ['nicklas.ockelberg@example.com', 'ada-3@example.com', 'ockelberg@gmail.com']) expect(ownerNameOf(email)).not.toMatch(/[@.\-+_\d]|example|gmail/i)
  })
})
