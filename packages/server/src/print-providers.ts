import type { ComponentTypeDef } from '@byd/engine'
import { createFakeProvider, type FakeConfig, type PrintProvider, type PrintRequirements } from '@byd/print'

// The print providers the platform registers (F2, #1208). In the beta there is no real partner, so
// the one provider is Testtryckeriet: a fake that stands where a partner will stand, so that the
// print package a designer sees and downloads is what a partner would be sent, prepared by the same
// `PrintProvider` way an order goes (F1, #1199).

export const TEST_PRINTER_ID = 'testtryckeriet'

// What Testtryckeriet asks for is what each type says of itself, and nothing else:
//
// - Its bleed is the type's. A partner's bleed is what the physical checks (E5) hold every card to
//   once it is registered (#1207), and the editor's own check in `web/src/editor/checks.ts` measures
//   against the type's. Asking for the type's means the editor, `POST /print`, the export and the
//   package measure one bleed, and the start backs in `web/src/editor/backs.ts`, which paint to
//   exactly −3 mm, stay printable. A partner that wants more is a decision for the day one is chosen,
//   and the editor's check is then given the server's bleed rather than the type's.
// - Its files are what the one renderer draws today: a vector PDF of the page with its bleed, in
//   sRGB (E2). CMYK is not built (#1207), so it does not ask for it.
// - It pretends to print in Sweden, inside the EU (beställarens beslut 2026-10-23, punkt 4): an
//   order to an EU address is routed to it (F2), and its example answer meets no customs.
// - Its price is made up, in kronor, and its quote says so (`basis: 'fictional'`).
export function testPrinterConfig(types: readonly ComponentTypeDef[]): FakeConfig {
  const catalog: PrintRequirements[] = []
  for (const def of types) {
    const type = { id: def.id, version: def.version }
    if (def.print.stock) catalog.push({ kind: 'stock', type, sku: def.id.replace(/^die\./, '') })
    else if (!def.behaviours.counter) {
      catalog.push({
        kind: 'printed',
        type,
        sku: def.id,
        trim: { widthMm: def.physical.widthMm, heightMm: def.physical.heightMm },
        bleedMm: def.print.bleedMm,
        safeMm: def.print.safeMm,
        file: { kind: 'vector', format: 'pdf' },
        colorSpace: 'sRGB',
        fileName: '{cardRef}-{face}',
        sides: Object.fromEntries(def.faces.map((face) => [face, face])),
      })
    }
  }
  return {
    id: TEST_PRINTER_ID,
    label: 'Testtryckeriet',
    manufacturesIn: ['SE'],
    catalog,
    form: { kind: 'single-order' },
    tracking: 'unknown',
    price: { currency: 'SEK', perCardMinor: 278, perPartMinor: 750, shippingMinor: 9000, leadTimeDays: 7 },
  }
}

// What `main.ts` hands the server, for the types its registry knows.
export function printProvidersOf(types: readonly ComponentTypeDef[]): PrintProvider[] {
  return [createFakeProvider(testPrinterConfig(types))]
}
