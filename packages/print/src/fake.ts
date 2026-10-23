import { typeKey } from '@byd/engine'
import type { TypeRef } from '@byd/protocol'
import { planFiles, type FilePlan } from './plan.js'
import type { PrintProvider } from './provider.js'
import { crossesCustoms } from './routing.js'
import { Destination, PreparedOrder, PrintRequirements, ProviderOrderRef, type Country, type Money, type OrderStatus, type OrderStep } from './schema.js'

// How the partner takes an order, in the two shapes #1199 found. A multi-step partner is handed
// each picture as an upload, then an object tree built from them in batches, then a cart; a
// single-order partner is handed one order with every picture as a URL.
export type FakeForm = { kind: 'multi-step'; batchSize: number } | { kind: 'single-order' }

export type FakeConfig = {
  id: string
  label: string
  manufacturesIn: Country[]
  catalog: PrintRequirements[]
  form: FakeForm
  // A partner that reports how the order goes, or one that does not say (QPMN in #1199).
  tracking: 'push' | 'unknown'
  // Made up, and the quote says so (`basis: 'fictional'`).
  price: { currency: Money['currency']; perCardMinor: number; perPartMinor: number; shippingMinor: number; leadTimeDays: number }
}

// A provider that stands where a real partner will (F2): it passes the contract suite every
// adapter is held to, and talks to nobody.
export function createFakeProvider(config: FakeConfig): PrintProvider {
  const catalog = new Map(config.catalog.map((r) => [typeKey(r.type), PrintRequirements.parse(r)]))
  const orders = new Map<string, PreparedOrder>()
  const provider: PrintProvider = {
    id: config.id,
    label: config.label,
    manufacturesIn: config.manufacturesIn,
    supports: (type: TypeRef) => catalog.has(typeKey(type)),
    requirements(type: TypeRef) {
      const found = catalog.get(typeKey(type))
      if (!found) throw new Error(`${config.id} does not make ${typeKey(type)}`)
      return found
    },
    prepare(manifest) {
      const plan = planFiles(provider, manifest)
      const steps = config.form.kind === 'multi-step' ? multiStep(plan, config.form.batchSize) : singleOrder(plan)
      return { provider: config.id, ...plan, steps }
    },
    // A made-up price for what it would make: the cards it prints and the parts it packs, and
    // nothing for the parts it leaves out. It knows no border's duties, so across one it says so.
    async quote(manifest, to) {
      const dest = Destination.parse(to)
      const plan = planFiles(provider, manifest)
      const { currency, perCardMinor, perPartMinor, shippingMinor, leadTimeDays } = config.price
      const parts = plan.hardware.reduce((n, h) => n + h.count, 0)
      const money = (amountMinor: number): Money => ({ amountMinor, currency })
      return {
        basis: 'fictional',
        unitPrice: money(plan.cards.length * perCardMinor + parts * perPartMinor),
        shipping: money(shippingMinor),
        duties: crossesCustoms(provider, dest) ? 'unknown' : money(0),
        leadTimeDays,
      }
    },
    // Gets every file the steps name, as an upload or as a URL by the form, and keeps the order.
    // Nothing leaves the process.
    async submit(input, files) {
      const order = PreparedOrder.parse(input)
      if (order.provider !== config.id) throw new Error(`${config.id} cannot submit an order ${order.provider} prepared`)
      for (const { name } of order.files) {
        if (config.form.kind === 'multi-step') await files.bytes(name)
        else await files.url(name)
      }
      const id = `${config.id}-order-${orders.size + 1}`
      orders.set(id, order)
      return { provider: config.id, id }
    },
    async track(input): Promise<OrderStatus> {
      const ref = ProviderOrderRef.parse(input)
      if (ref.provider !== config.id || !orders.has(ref.id)) throw new Error(`${config.id} has no order ${ref.provider}/${ref.id}`)
      return { state: config.tracking === 'push' ? 'received' : 'unknown' }
    },
  }
  return provider
}

const ref = (name: string) => ({ file: name })

// The Game Crafter's model: a File per picture, a Game, a Deck per back with the back as its
// `back_id`, the cards added at most `batchSize` at a time, the stock parts, and then a cart.
// A deck has one back, so a card group with a back of its own is a deck of its own (L7).
function multiStep(plan: FilePlan, batchSize: number): OrderStep[] {
  const sideOf = new Map(plan.files.map((f) => [f.name, f.side]))
  const decks = new Map<string, { sku: string; back: string | null; cards: Map<string, number> }>()
  for (const card of plan.cards) {
    const files = Object.values(card.files)
    const back = files.find((f) => sideOf.get(f) === 'back') ?? null
    const face = files.find((f) => sideOf.get(f) !== 'back')
    if (face === undefined) continue
    const key = JSON.stringify([card.sku, back])
    const deck = decks.get(key) ?? { sku: card.sku, back, cards: new Map<string, number>() }
    decks.set(key, deck)
    deck.cards.set(face, (deck.cards.get(face) ?? 0) + 1)
  }
  const steps: OrderStep[] = plan.files.map((f) => ({ action: 'upload file', payload: { name: f.name, file: ref(f.name) } }))
  steps.push({ action: 'create game', payload: {} })
  let n = 0
  for (const deck of decks.values()) {
    n++
    steps.push({ action: 'create deck', payload: { deck: n, sku: deck.sku, back: deck.back === null ? null : ref(deck.back) } })
    const cards = [...deck.cards].map(([face, quantity]) => ({ face: ref(face), quantity }))
    for (let at = 0; at < cards.length; at += batchSize) steps.push({ action: 'add cards', payload: { deck: n, cards: cards.slice(at, at + batchSize) } })
  }
  for (const part of plan.hardware) steps.push({ action: 'add part', payload: { sku: part.sku, quantity: part.count } })
  steps.push({ action: 'create cart', payload: {} })
  return steps
}

// QPMN's model: one order, a product per kind of thing, and per product a `designData` that
// names every printed card by its index and each side by the URL of its picture.
function singleOrder(plan: FilePlan): OrderStep[] {
  const sideOf = new Map(plan.files.map((f) => [f.name, f.side]))
  const products = new Map<string, { sku: string; quantity: number; designData: { material: string; side: string; index: number; url: { file: string } }[] }>()
  for (const card of plan.cards) {
    const product = products.get(card.sku) ?? { sku: card.sku, quantity: 1, designData: [] }
    products.set(card.sku, product)
    const index = new Set(product.designData.map((d) => d.index)).size + 1
    for (const file of Object.values(card.files)) product.designData.push({ material: card.sku, side: sideOf.get(file) ?? '', index, url: ref(file) })
  }
  return [{ action: 'create order', payload: { products: [...products.values()] } }]
}

const CARD = { id: 'card.standard.63x88', version: 1 }
const die = (faces: number) => ({ id: `die.d${faces}`, version: 1 })

// The shape of The Game Crafter in #1199: uploads, an object tree and a cart, rasters in inches.
// TGC's poker deck is 2.5 × 3.5 in, 825 × 1125 px at 300 dpi with an eighth of an inch of bleed;
// the fake prints our own 63 × 88 mm with that same eighth of an inch at 300 dpi, which is
// 819 × 1114 px, because the platform draws a type at its own size and nothing scales a card to
// a partner's (#1207, #1199 question 8). The dice are parts it stocks.
export const MULTI_STEP_INCHES: FakeConfig = {
  id: 'fake-multi-step',
  label: 'Fake-tryckeri i flerstegsform (påhittat)',
  manufacturesIn: ['US'],
  catalog: [
    {
      kind: 'printed',
      type: CARD,
      sku: 'PokerDeck',
      trim: { widthMm: 63, heightMm: 88 },
      bleedMm: 3.175,
      safeMm: 3.175,
      file: { kind: 'raster', format: 'png', dpi: 300, widthPx: 819, heightPx: 1114 },
      colorSpace: 'sRGB',
      fileName: '{cardRef}-{face}',
      sides: { front: 'face', back: 'back' },
    },
    ...[4, 6, 8, 10, 12, 20].map((n) => ({ kind: 'stock' as const, type: die(n), sku: `d${n}` })),
  ],
  form: { kind: 'multi-step', batchSize: 100 },
  tracking: 'push',
  price: { currency: 'USD', perCardMinor: 17, perPartMinor: 109, shippingMinor: 2200, leadTimeDays: 10 },
}

// The shape of QPMN in #1199: one order with each picture as a URL, in millimetres, a vector PDF
// allowed, and no polyhedral dice.
export const SINGLE_ORDER_MM: FakeConfig = {
  id: 'fake-single-order',
  label: 'Fake-tryckeri med en order (påhittat)',
  manufacturesIn: ['CN', 'VN'],
  catalog: [
    {
      kind: 'printed',
      type: CARD,
      sku: 'poker-size-cards',
      trim: { widthMm: 63, heightMm: 88 },
      bleedMm: 3.175,
      safeMm: 3,
      file: { kind: 'vector', format: 'pdf' },
      colorSpace: 'sRGB',
      fileName: '{side}-{n}',
      sides: { front: 'Card_Front', back: 'Card_Back' },
    },
  ],
  form: { kind: 'single-order' },
  tracking: 'unknown',
  price: { currency: 'USD', perCardMinor: 29, perPartMinor: 0, shippingMinor: 900, leadTimeDays: 12 },
}
