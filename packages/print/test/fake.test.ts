import { describe, expect, it } from 'vitest'
import { CONTRACT_MANIFEST } from '../contract/suite.js'
import { createFakeProvider, MULTI_STEP_INCHES, SINGLE_ORDER_MM, widestBleedMm, type FakeConfig, type OrderStep, type PrintManifest } from '../src/index.js'

const CARD = { id: 'card.standard.63x88', version: 1 }
const actions = (steps: OrderStep[]) => steps.map((s) => s.action)
const many = (n: number): PrintManifest => ({
  cards: Array.from({ length: n }, (_, i) => ({ cardRef: `k${i}`, type: CARD, faces: { front: `front:${i}`, back: 'back:bas' } })),
  hardware: [],
})

// The two partner shapes #1199 found, as the fake writes them out. The contract suite holds both
// to the same promises; these say that each is the shape it claims to be.
describe('fake-providern i flerstegsform (The Game Crafters form)', () => {
  const provider = createFakeProvider(MULTI_STEP_INCHES)

  it('laddar upp varje bild en gång, bygger spelet och lägger det i en vagn', () => {
    const prepared = provider.prepare(CONTRACT_MANIFEST)
    const uploads = prepared.steps.filter((s) => s.action === 'upload file')
    expect(uploads.map((s) => s.payload)).toEqual(prepared.files.map((f) => ({ name: f.name, file: { file: f.name } })))
    expect(actions(prepared.steps).slice(uploads.length)).toEqual(['create game', 'create deck', 'add cards', 'create deck', 'add cards', 'add part', 'add part', 'create cart'])
  })

  it('gör en lek per baksida, så att en grupps kort får gruppens baksida (L7)', () => {
    const prepared = provider.prepare(CONTRACT_MANIFEST)
    const decks = prepared.steps.filter((s) => s.action === 'create deck').map((s) => s.payload as { back: { file: string } })
    expect(decks.map((d) => d.back.file)).toEqual(['eld-back.png', 'drake-back.png'])
    const cards = prepared.steps.filter((s) => s.action === 'add cards').map((s) => s.payload as { deck: number; cards: { face: { file: string }; quantity: number }[] })
    expect(cards[1]).toEqual({ deck: 2, cards: [{ face: { file: 'drake-front.png' }, quantity: 1 }, { face: { file: 'troll-front.png' }, quantity: 1 }] })
    expect(cards[0]!.cards.find((c) => c.face.file === 'Alg_pa_vag-front.png')).toEqual({ face: { file: 'Alg_pa_vag-front.png' }, quantity: 2 })
    // Another card whose id folds to the same name is numbered apart, as the export does.
    expect(cards[0]!.cards.find((c) => c.face.file === 'Alg_pa_vag-front-2.png')).toEqual({ face: { file: 'Alg_pa_vag-front-2.png' }, quantity: 1 })
  })

  it('lägger korten i omgångar om högst hundra', () => {
    const batches = provider.prepare(many(250)).steps.filter((s) => s.action === 'add cards').map((s) => (s.payload as { cards: unknown[] }).cards.length)
    expect(batches).toEqual([100, 100, 50])
  })

  it('packar tärningarna', () => {
    expect(provider.prepare(CONTRACT_MANIFEST).hardware.map((h) => [h.sku, h.count])).toEqual([['d6', 2], ['d20', 1]])
  })
})

describe('fake-providerns pris', () => {
  it('är påhittat och märkt som det', async () => {
    const quote = await createFakeProvider(MULTI_STEP_INCHES).quote(CONTRACT_MANIFEST, { country: 'SE' })
    expect(quote.basis).toBe('fictional')
    expect(quote.duties).toBe('unknown')
  })

  it('räknar korten och lagervarorna den packar, inte dem den lämnar', async () => {
    const withDice = await createFakeProvider(MULTI_STEP_INCHES).quote(CONTRACT_MANIFEST, { country: 'US' })
    const without = await createFakeProvider(MULTI_STEP_INCHES).quote({ ...CONTRACT_MANIFEST, hardware: [] }, { country: 'US' })
    expect(withDice.unitPrice.amountMinor).toBeGreaterThan(without.unitPrice.amountMinor)
    // Inside its own customs area there is no border to pay at.
    expect(withDice.duties).toEqual({ amountMinor: 0, currency: 'USD' })
  })
})

describe('fake-providern med en order (QPMN:s form)', () => {
  const provider = createFakeProvider(SINGLE_ORDER_MM)

  it('är en enda order där varje kort är ett index med sin bild per sida', () => {
    const prepared = provider.prepare(CONTRACT_MANIFEST)
    expect(actions(prepared.steps)).toEqual(['create order'])
    const order = prepared.steps[0]!.payload as { products: { sku: string; quantity: number; designData: { side: string; index: number; url: { file: string } }[] }[] }
    expect(order.products).toHaveLength(1)
    const design = order.products[0]!.designData
    expect(design).toHaveLength(CONTRACT_MANIFEST.cards.length * 2)
    expect(design.slice(0, 2)).toEqual([
      { material: 'poker-size-cards', side: 'Card_Front', index: 1, url: { file: 'Card_Front-1.pdf' } },
      { material: 'poker-size-cards', side: 'Card_Back', index: 1, url: { file: 'Card_Back-1.pdf' } },
    ])
    // The copy is its own index, on the same pictures.
    expect(design.filter((d) => d.index === 3 || d.index === 4).map((d) => d.url.file)).toEqual(['Card_Front-3.pdf', 'Card_Back-1.pdf', 'Card_Front-3.pdf', 'Card_Back-1.pdf'])
  })

  it('lämnar tärningarna och säger det', () => {
    const prepared = provider.prepare(CONTRACT_MANIFEST)
    expect(prepared.hardware).toEqual([])
    expect(prepared.omitted.map((o) => [o.type.id, o.count, o.reason])).toEqual([['die.d6', 2, 'not-packed'], ['die.d20', 1, 'not-packed']])
  })
})

describe('fake-providerns order', () => {
  const source = (log: string[]) => ({
    bytes: async (name: string) => (log.push(`bytes ${name}`), new Uint8Array()),
    url: async (name: string) => (log.push(`url ${name}`), `https://example.test/${name}`),
  })

  it('laddar upp bilderna i flerstegsformen och säger att ordern är mottagen', async () => {
    const provider = createFakeProvider(MULTI_STEP_INCHES)
    const log: string[] = []
    const ref = await provider.submit(provider.prepare(CONTRACT_MANIFEST), source(log))
    expect(log.length).toBeGreaterThan(0)
    expect(log.every((l) => l.startsWith('bytes '))).toBe(true)
    expect(await provider.track(ref)).toEqual({ state: 'received' })
  })

  it('ger URL:er i en order, och säger att spårningen är okänd', async () => {
    const provider = createFakeProvider(SINGLE_ORDER_MM)
    const log: string[] = []
    const ref = await provider.submit(provider.prepare(CONTRACT_MANIFEST), source(log))
    expect(log.length).toBeGreaterThan(0)
    expect(log.every((l) => l.startsWith('url '))).toBe(true)
    expect(await provider.track(ref)).toEqual({ state: 'unknown' })
  })
})

// The bleed the physical checks (E5) hold a type to when no partner is chosen (#1207): the most any
// registered provider asks for, so a card that passes passes every one of them; and nothing to
// say when none prints the type, where the type's own bleed stands.
describe('utfallet som kontrollen mäter mot', () => {
  const thin: FakeConfig = { ...SINGLE_ORDER_MM, id: 'thin', catalog: SINGLE_ORDER_MM.catalog.map((r) => (r.kind === 'printed' ? { ...r, bleedMm: 1.5 } : r)) }

  it('är det största utfall någon provider som trycker typen kräver', () => {
    expect(widestBleedMm([createFakeProvider(thin), createFakeProvider(MULTI_STEP_INCHES)], CARD)).toBe(3.175)
    expect(widestBleedMm([createFakeProvider(thin)], CARD)).toBe(1.5)
  })

  it('finns inte för en typ ingen trycker, och inte utan providers', () => {
    expect(widestBleedMm([], CARD)).toBeUndefined()
    // A die is packed, not printed: it has no bleed.
    expect(widestBleedMm([createFakeProvider(MULTI_STEP_INCHES)], { id: 'die.d6', version: 1 })).toBeUndefined()
    expect(widestBleedMm([createFakeProvider(SINGLE_ORDER_MM)], { id: 'die.d6', version: 1 })).toBeUndefined()
  })
})
