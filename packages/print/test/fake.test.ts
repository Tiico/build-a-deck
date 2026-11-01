import { describe, expect, it } from 'vitest'
import { CONTRACT_MANIFEST } from '../contract/suite.js'
import { createFakeProvider, MULTI_STEP_INCHES, SINGLE_ORDER_MM, widestBleedMm, type FakeConfig, type OrderStep, type PrintManifest } from '../src/index.js'

const CARD = { id: 'card.standard.63x88', version: 1 }
const MEEPLE = { id: 'piece.meeple', version: 1 }
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
    // Two decks of cards by their backs, the board, and the two kinds of tile by theirs (#1488).
    const decks = ['create deck', 'add cards']
    expect(actions(prepared.steps).slice(uploads.length)).toEqual(['create game', ...decks, ...decks, ...decks, ...decks, ...decks, 'add part', 'add part', 'add part', 'add part', 'create cart'])
  })

  it('gör en lek per baksida, så att en grupps kort får gruppens baksida (L7)', () => {
    const prepared = provider.prepare(CONTRACT_MANIFEST)
    const decks = prepared.steps.filter((s) => s.action === 'create deck').map((s) => s.payload as { back: { file: string } | null })
    // The board has no back (#1488); the tiles are decks of their own by theirs.
    expect(decks.map((d) => d.back?.file ?? null)).toEqual(['eld-back.png', 'drake-back.png', null, 'guld-back.png', 'torn-back.png'])
    const cards = prepared.steps.filter((s) => s.action === 'add cards').map((s) => s.payload as { deck: number; cards: { face: { file: string }; quantity: number }[] })
    expect(cards[1]).toEqual({ deck: 2, cards: [{ face: { file: 'drake-front.png' }, quantity: 1 }, { face: { file: 'troll-front.png' }, quantity: 1 }] })
    expect(cards[0]!.cards.find((c) => c.face.file === 'Alg_pa_vag-front.png')).toEqual({ face: { file: 'Alg_pa_vag-front.png' }, quantity: 2 })
    // Another card whose id folds to the same name is numbered apart, as the export does.
    expect(cards[0]!.cards.find((c) => c.face.file === 'Alg_pa_vag-front-2.png')).toEqual({ face: { file: 'Alg_pa_vag-front-2.png' }, quantity: 1 })
  })

  // Brädet och brickorna (#1488): en fil per sida i delens eget mått med utfallet, och två identiska
  // markörer är en bild per sida och två exemplar i sin lek.
  it('ritar brädet och brickorna i sina egna mått, och de identiska markörerna en gång', () => {
    const prepared = provider.prepare(CONTRACT_MANIFEST)
    const file = (name: string) => prepared.files.find((f) => f.name === name)
    expect(file('Kartan-front.png')?.file).toEqual({ kind: 'raster', format: 'png', dpi: 300, widthPx: 5473, heightPx: 5473 })
    expect(file('guld-front.png')?.trim).toEqual({ widthMm: 52, heightMm: 60.04 })
    expect(prepared.files.filter((f) => f.cardRef === 'guld').map((f) => f.name)).toEqual(['guld-front.png', 'guld-back.png'])
    const hex = prepared.steps.filter((s) => s.action === 'add cards').map((s) => s.payload as { cards: { face: { file: string }; quantity: number }[] }).find((p) => p.cards.some((c) => c.face.file === 'guld-front.png'))
    expect(hex?.cards).toEqual([{ face: { file: 'guld-front.png' }, quantity: 2 }])
  })

  it('lägger korten i omgångar om högst hundra', () => {
    const batches = provider.prepare(many(250)).steps.filter((s) => s.action === 'add cards').map((s) => (s.payload as { cards: unknown[] }).cards.length)
    expect(batches).toEqual([100, 100, 50])
  })

  it('packar tärningarna, och meeplarna i den färg det har närmast (#1478)', () => {
    expect(provider.prepare(CONTRACT_MANIFEST).hardware.map((h) => [h.sku, h.count])).toEqual([['d6', 2], ['d20', 1], ['meeple-red', 5], ['meeple-blue', 5]])
    // Lila (#8e6bd9) och rosa (#d9699f) finns inte i lagret; närmast är blått och rött.
    const odd = provider.prepare({ cards: [], hardware: [{ type: MEEPLE, count: 1, colour: '#8e6bd9' }, { type: MEEPLE, count: 1, colour: '#d9699f' }] })
    expect(odd.hardware.map((h) => [h.sku, h.colour])).toEqual([['meeple-blue', '#8e6bd9'], ['meeple-red', '#d9699f']])
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
    // The cards, the board and each kind of tile are a product each (#1488).
    expect(order.products.map((p) => p.sku)).toEqual(['poker-size-cards', 'board-square457', 'tile-hex.52', 'tile-square.45'])
    const design = order.products[0]!.designData
    expect(design).toHaveLength(CONTRACT_MANIFEST.cards.filter((c) => c.type.id === 'card.standard.63x88').length * 2)
    expect(design.slice(0, 2)).toEqual([
      { material: 'poker-size-cards', side: 'Card_Front', index: 1, url: { file: 'Card_Front-1.pdf' } },
      { material: 'poker-size-cards', side: 'Card_Back', index: 1, url: { file: 'Card_Back-1.pdf' } },
    ])
    // The copy is its own index, on the same pictures.
    expect(design.filter((d) => d.index === 3 || d.index === 4).map((d) => d.url.file)).toEqual(['Card_Front-3.pdf', 'Card_Back-1.pdf', 'Card_Front-3.pdf', 'Card_Back-1.pdf'])
  })

  it('lämnar tärningarna och meeplarna och säger det, meeplarna per färg', () => {
    const prepared = provider.prepare(CONTRACT_MANIFEST)
    expect(prepared.hardware).toEqual([])
    expect(prepared.omitted.map((o) => [o.type.id, o.count, o.colour, o.reason])).toEqual([
      ['die.d6', 2, undefined, 'not-packed'],
      ['die.d20', 1, undefined, 'not-packed'],
      ['piece.meeple', 5, '#e05a4f', 'not-packed'],
      ['piece.meeple', 5, '#3c8ce7', 'not-packed'],
    ])
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
