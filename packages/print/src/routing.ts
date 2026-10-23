import { prints } from './plan.js'
import type { PrintProvider } from './provider.js'
import { Destination, PrintManifest, type Country } from './schema.js'

// The member states of the European Union, by ISO 3166-1 alpha-2 (Greece is «GR» here, not the
// EU's own «EL»). Norway, Iceland, Switzerland and the United Kingdom are not in it.
export const EU_COUNTRIES: readonly Country[] = ['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK']
const EU = new Set<string>(EU_COUNTRIES)

export const inEU = (country: Country): boolean => EU.has(country)

// A provider prints in the EU only if every plant it names is in the EU: one that also makes
// things in China cannot promise the order is made in Europe, so it does not count.
export const manufacturesInEU = (provider: Pick<PrintProvider, 'manufacturesIn'>): boolean => provider.manufacturesIn.length > 0 && provider.manufacturesIn.every(inEU)

// The EU is one customs union; every other country is its own, as far as this goes.
const customsArea = (country: Country): string => (inEU(country) ? 'EU' : country)

// Whether a parcel from this provider meets customs on the way to `dest`: whenever any of its
// plants lies outside the destination's customs area, since nothing says which plant it uses.
export const crossesCustoms = (provider: Pick<PrintProvider, 'manufacturesIn'>, dest: Destination): boolean => provider.manufacturesIn.some((c) => customsArea(c) !== customsArea(dest.country))

export type Route = { kind: 'routed'; provider: PrintProvider } | { kind: 'none'; reason: 'no-eu-print' | 'no-provider' }

// Which provider makes this game for this address (F2). A pure choice over the providers in the
// order the platform prefers them.
//
// An EU address goes only to a provider that manufactures in the EU, and if there is none that
// can make the game, the answer is «no EU print»: never a quiet fallback to a partner outside
// it. Elsewhere, a provider that makes things in the destination's own country goes first, and
// otherwise the first that can make it. A provider can make the game if it prints every card;
// hardware it does not pack is left out of the order and said to be, and does not decide.
export function routeOrder(providers: readonly PrintProvider[], input: PrintManifest, to: Destination): Route {
  const manifest = PrintManifest.parse(input)
  const dest = Destination.parse(to)
  const able = providers.filter((p) => manifest.cards.every((c) => prints(p, c.type)))
  const local = (p: PrintProvider) => p.manufacturesIn.includes(dest.country)
  if (inEU(dest.country)) {
    const eu = able.filter(manufacturesInEU)
    const chosen = eu.find(local) ?? eu[0]
    return chosen ? { kind: 'routed', provider: chosen } : { kind: 'none', reason: 'no-eu-print' }
  }
  const chosen = able.find(local) ?? able[0]
  return chosen ? { kind: 'routed', provider: chosen } : { kind: 'none', reason: 'no-provider' }
}
