import { describe, expect, it } from 'vitest'
import { CARD_STANDARD_63x88, DICE, STANDARD_TYPES } from '@byd/engine'
import { manufacturesInEU, routeOrder, type PrintManifest } from '@byd/print'
import { printProviderContract } from '@byd/print/contract'
import { TEST_PRINTER_ID, printProvidersOf } from '../src/print-providers.js'

// Testtryckeriet (#1208): the one provider the beta registers, a fake that stands where a real
// partner will (F1, F2) so that the print package the designer sees and downloads is the one a
// partner would get, prepared by the same `PrintProvider` way an order goes.

const card = { id: CARD_STANDARD_63x88.id, version: CARD_STANDARD_63x88.version }
const testPrinter = () => {
  const found = printProvidersOf(STANDARD_TYPES).find((p) => p.id === TEST_PRINTER_ID)
  if (!found) throw new Error('Testtryckeriet is not registered')
  return found
}
const manifest: PrintManifest = {
  cards: [
    { cardRef: 'sheriffen', type: card, faces: { front: 'f:sheriffen', back: 'b' } },
    { cardRef: 'sheriffen', type: card, faces: { front: 'f:sheriffen', back: 'b' } },
    { cardRef: 'banditen', type: card, faces: { front: 'f:banditen', back: 'b' } },
  ],
  hardware: [{ type: { id: 'die.d6', version: 1 }, count: 2 }],
}

describe('Testtryckeriet', () => {
  it('is what the platform registers, and the only one in the beta', () => {
    expect(printProvidersOf(STANDARD_TYPES).map((p) => p.id)).toEqual([TEST_PRINTER_ID])
  })

  // Beställarens beslut 2026-10-23, punkt 4: it pretends to print inside the EU (F2), so an order to
  // Sweden is routed to it rather than answered «no EU print», and its example answer has no duty.
  it('pretends to print in the EU, so an order to Sweden is routed to it and meets no customs', async () => {
    const provider = testPrinter()
    expect(manufacturesInEU(provider)).toBe(true)
    const route = routeOrder([provider], manifest, { country: 'SE' })
    expect(route.kind === 'routed' && route.provider.id).toBe(TEST_PRINTER_ID)
    const quote = await provider.quote(manifest, { country: 'SE' })
    expect(quote.basis).toBe('fictional')
    expect(quote.duties).toEqual({ amountMinor: 0, currency: 'SEK' })
    expect(quote.unitPrice.currency).toBe('SEK')
  })

  // The handover from #1207: a provider whose bleed differs from the type's turns the start backs in
  // `web/src/editor/backs.ts`, which paint to exactly −3 mm, into `short-of-bleed` errors, and the
  // editor's `checks.ts` measures against the type's 3 mm. Testtryckeriet asks for exactly what the
  // type says, so the editor, `POST /print`, the export and the package all measure the same bleed.
  it('asks for exactly what each type it prints says: its trim, its bleed and its safe margin', () => {
    const provider = testPrinter()
    for (const def of STANDARD_TYPES) {
      const ref = { id: def.id, version: def.version }
      if (!provider.supports(ref)) continue
      const req = provider.requirements(ref)
      if (req.kind !== 'printed') continue
      expect(req.trim, def.id).toEqual({ widthMm: def.physical.widthMm, heightMm: def.physical.heightMm })
      expect(req.bleedMm, def.id).toBe(def.print.bleedMm)
      expect(req.safeMm, def.id).toBe(def.print.safeMm)
      // What the one renderer draws today: a vector PDF in sRGB (E2); CMYK is not built (#1207).
      expect(req.file, def.id).toEqual({ kind: 'vector', format: 'pdf' })
      expect(req.colorSpace, def.id).toBe('sRGB')
    }
    expect(provider.requirements(card).kind).toBe('printed')
  })

  it('packs every die the tool has, and names a card\'s files after the card and its side', () => {
    const provider = testPrinter()
    for (const die of DICE) expect(provider.requirements({ id: die.id, version: die.version }).kind, die.id).toBe('stock')
    const order = provider.prepare(manifest)
    expect(order.files.map((f) => f.name)).toEqual(['sheriffen-front.pdf', 'sheriffen-back.pdf', 'banditen-front.pdf'])
    expect(order.hardware).toEqual([{ type: { id: 'die.d6', version: 1 }, sku: 'd6', count: 2 }])
    expect(order.omitted).toEqual([])
  })
})

printProviderContract('Testtryckeriet', { provider: testPrinter })
