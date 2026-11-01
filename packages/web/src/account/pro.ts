import type { Key, T } from '../i18n/index.js'
import { proStanding, type Interval, type ProStanding, type Tier } from './api.js'
import type { Quota } from './quota.js'
import { bytes } from './quota-words.js'

// How Pro is said (#1494, variant A): its price as Stripe holds it, in the reader's currency, and a
// tier's ceilings as one line. No price and no ceiling is a number here: the amounts are Stripe's,
// the ceilings `BYD_PLANS`', both read from `GET /me/subscription`.

// The reader's currency follows the language (kronor in Swedish, euro in English), and falls back
// to any currency the box has a price in.
export function currencyOf(standing: ProStanding, t: T): string | null {
  const prices = standing.prices ?? {}
  const wanted = t('profile.pro.currency')
  if (prices[wanted]) return wanted
  return Object.keys(prices).sort()[0] ?? null
}

// An amount in the currency's smallest unit, as the reader writes money: «99 kr», «9 €», «€9».
export function money(amount: number, currency: string, t: T): string {
  return new Intl.NumberFormat(t('quota.locale'), { style: 'currency', currency: currency.toUpperCase(), minimumFractionDigits: amount % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 }).format(amount / 100)
}

// «99 kr i månaden», «990 kr om året»; null when Stripe has no such price.
export function pricePhrase(standing: ProStanding, currency: string, interval: Interval, t: T): string | null {
  const amount = standing.prices?.[currency]?.[interval]
  return amount === undefined ? null : t(interval === 'month' ? 'profile.pro.month' : 'profile.pro.year', { price: money(amount, currency, t) })
}

// A day as the card says it: «1 dec 2026».
export function day(iso: string, t: T): string {
  return new Intl.DateTimeFormat(t('quota.locale'), { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso)).replace(/\./g, '')
}

// How many months a year's price gives away against twelve of the month's, when it is whole.
export function monthsFree(standing: ProStanding, currency: string): number {
  const month = standing.prices?.[currency]?.month
  const year = standing.prices?.[currency]?.year
  if (!month || !year) return 0
  const free = 12 - year / month
  return Number.isInteger(free) && free > 0 ? free : 0
}

// The measures a tier is said by, in Profil's order, and the words for each. Copies are said only
// where either tier puts a ceiling on them, since they are otherwise the rows again.
type Said = 'projects' | 'cardRowsPerProject' | 'cardCopiesPerProject' | 'openTables' | 'tablesPer30Days' | 'storageBytes'
const WORD: Record<Said, 'projects' | 'rows' | 'copies' | 'open' | 'started' | 'storage'> = {
  projects: 'projects',
  cardRowsPerProject: 'rows',
  cardCopiesPerProject: 'copies',
  openTables: 'open',
  tablesPer30Days: 'started',
  storageBytes: 'storage',
}
const ORDER: Said[] = ['projects', 'cardRowsPerProject', 'cardCopiesPerProject', 'openTables', 'tablesPer30Days', 'storageBytes']

// One measure of a tier in words: «2 spel», «obegränsat antal spel», «10 GB».
export function limitWords(measure: Said, limit: number | null, t: T): string {
  const word = WORD[measure]
  if (limit === null) return t(`profile.pro.${word}.none` as Key)
  const n = measure === 'storageBytes' ? bytes(limit, t) : new Intl.NumberFormat(t('quota.locale')).format(limit)
  return t(`profile.pro.${word}` as Key, { n })
}

// A tier as the parts of its line, each with whether it is better than the other tier's; the line
// ends with the print package when the tier has it.
export function tierParts(tier: Tier, other: Tier, t: T): { items: { text: string; better: boolean }[]; print: boolean } {
  const copies = typeof tier.limits['cardCopiesPerProject'] === 'number' || typeof other.limits['cardCopiesPerProject'] === 'number'
  const items = ORDER.filter((m) => m !== 'cardCopiesPerProject' || copies).map((m) => {
    const mine = tier.limits[m] ?? null
    const theirs = other.limits[m] ?? null
    return { text: limitWords(m, mine, t), better: mine !== theirs && (mine === null || (theirs !== null && mine > theirs)) }
  })
  return { items, print: tier.print }
}

// The standing is asked once per page and shared by every surface that offers Pro (#1494): Profil's
// card asks afresh, but a met ceiling's sentence only needs the tiers and the prices.
const asked = new Map<string, Promise<ProStanding | null>>()
export function proOnce(http: string): Promise<ProStanding | null> {
  const hit = asked.get(http)
  if (hit) return hit
  const ask = proStanding(http)
  asked.set(http, ask)
  void ask.then((s) => s === null && asked.delete(http))
  return ask
}

// What a met ceiling says of Pro (#1494, beställarens beslut 2026-11-01, revising #1198): one
// sentence with Pro's ceiling and its monthly price, and the way to the card. Only for the one whose
// ceiling it is (`bearer: 'you'`): a co-editor or test leader meeting the owner's has nothing to buy.
// Nothing when payments are off, when the account already has Pro, or when Pro holds no more.
const QUOTA_WORD: Partial<Record<string, 'projects' | 'rows' | 'copies' | 'open' | 'started' | 'storage'>> = WORD
export function proOffer(quota: Quota, standing: ProStanding | null, t: T): string | null {
  if (!standing || quota.bearer !== 'you' || standing.plan === standing.paid.plan) return null
  const word = QUOTA_WORD[quota.measure]
  if (!word) return null
  const pro = standing.paid.limits[quota.measure] ?? null
  if (pro !== null && pro <= quota.limit) return null
  const currency = currencyOf(standing, t)
  const price = currency ? pricePhrase(standing, currency, 'month', t) : null
  if (!price) return null
  return t(`quota.pro.${word}` as Key, { limit: limitWords(quota.measure as Said, pro, t), price })
}

// Where «Uppgradera till Pro» goes: the card in Profil, on the same server.
export function proCardUrl(): string {
  const server = new URLSearchParams(location.search).get('server')
  return `/profile${server ? `?server=${encodeURIComponent(server)}` : ''}#abonnemang`
}
