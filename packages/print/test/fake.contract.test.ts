import { printProviderContract } from '../contract/suite.js'
import { createFakeProvider, MULTI_STEP_INCHES, SINGLE_ORDER_MM } from '../src/index.js'

// The fake stands where a real partner will (F2): the same suite every adapter is held to, in
// both partner shapes #1199 found, so the suite proves the contract carries both.
printProviderContract('fake-provider i flerstegsform, raster i tum', { provider: () => createFakeProvider(MULTI_STEP_INCHES) })
printProviderContract('fake-provider i en order, URL:er i mm', { provider: () => createFakeProvider(SINGLE_ORDER_MM) })
