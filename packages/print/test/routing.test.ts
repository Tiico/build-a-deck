import { describe, expect, it } from 'vitest'
import { CONTRACT_MANIFEST } from '../contract/suite.js'
import { EU_COUNTRIES, createFakeProvider, MULTI_STEP_INCHES, routeOrder, SINGLE_ORDER_MM } from '../src/index.js'

const us = createFakeProvider(MULTI_STEP_INCHES)
const asia = createFakeProvider(SINGLE_ORDER_MM)
const eu = createFakeProvider({ ...SINGLE_ORDER_MM, id: 'fake-eu', label: 'Fake-tryckeri i EU (påhittat)', manufacturesIn: ['FR'] })
const se = { country: 'SE' }

// F2: EU customers go to EU print, and when nobody prints in the EU the answer says so rather
// than picking a partner outside it.
describe('regiondirigeringen (F2)', () => {
  it('skickar en EU-destination till den som tillverkar i EU, även när den står sist', () => {
    expect(routeOrder([us, asia, eu], CONTRACT_MANIFEST, se)).toEqual({ kind: 'routed', provider: eu })
  })

  it('säger «inget EU-tryck» hellre än att välja en provider utanför EU', () => {
    expect(routeOrder([us, asia], CONTRACT_MANIFEST, se)).toEqual({ kind: 'none', reason: 'no-eu-print' })
  })

  it('räknar inte en provider som tillverkar både i och utanför EU som EU-tryck', () => {
    const both = createFakeProvider({ ...SINGLE_ORDER_MM, id: 'fake-both', manufacturesIn: ['DE', 'CN'] })
    expect(routeOrder([both], CONTRACT_MANIFEST, se)).toEqual({ kind: 'none', reason: 'no-eu-print' })
  })

  it('föredrar tryck i destinationens land utanför EU, och tar annars den första som kan', () => {
    expect(routeOrder([asia, us], CONTRACT_MANIFEST, { country: 'US' })).toEqual({ kind: 'routed', provider: us })
    expect(routeOrder([asia, us], CONTRACT_MANIFEST, { country: 'NO' })).toEqual({ kind: 'routed', provider: asia })
  })

  it('väljer bara en provider som trycker varje kort i manifestet', () => {
    const none = createFakeProvider({ ...SINGLE_ORDER_MM, id: 'fake-empty', manufacturesIn: ['FR'], catalog: [] })
    expect(routeOrder([none, eu], CONTRACT_MANIFEST, se)).toEqual({ kind: 'routed', provider: eu })
    expect(routeOrder([none], CONTRACT_MANIFEST, { country: 'US' })).toEqual({ kind: 'none', reason: 'no-provider' })
    // An EU destination whose only EU printer cannot make the game is still «no EU print».
    expect(routeOrder([none, us], CONTRACT_MANIFEST, se)).toEqual({ kind: 'none', reason: 'no-eu-print' })
  })

  it('känner EU:s tjugosju medlemsländer', () => {
    expect(EU_COUNTRIES).toHaveLength(27)
    expect(EU_COUNTRIES).toContain('SE')
    expect(EU_COUNTRIES).not.toContain('NO')
    expect(EU_COUNTRIES).not.toContain('GB')
  })
})
