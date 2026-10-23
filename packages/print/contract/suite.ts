import { describe, expect, it } from 'vitest'
import { STANDARD_TYPES } from '@byd/engine'
import type { TypeRef } from '@byd/protocol'
import { Country, crossesCustoms, EU_COUNTRIES, manufacturesInEU, OrderStatus, PreparedOrder, PrintRequirements, ProviderOrderRef, Quote, routeOrder, type FileSource, type PrintManifest, type PrintProvider } from '../src/index.js'
import { CONTRACT_MANIFEST } from './fixture.js'

export { CONTRACT_MANIFEST }

export type ContractSubject = {
  provider: () => PrintProvider
  // What the provider is asked about. Every type the platform knows, by default.
  types?: readonly TypeRef[]
  // The game it prepares. CONTRACT_MANIFEST by default.
  manifest?: PrintManifest
}

// Every `{ "file": name }` a step's payload stands a file in with.
function fileRefs(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(fileRefs)
  if (value === null || typeof value !== 'object') return []
  const record = value as Record<string, unknown>
  if (Object.keys(record).length === 1 && typeof record.file === 'string') return [record.file]
  return Object.values(record).flatMap(fileRefs)
}

export function printProviderContract(name: string, subject: ContractSubject): void {
  const types = subject.types ?? STANDARD_TYPES.map(({ id, version }) => ({ id, version }))
  const manifest = subject.manifest ?? CONTRACT_MANIFEST

  describe(`PrintProvider-kontraktet: ${name}`, () => {
    it('har krav för varje typ den säger ja till, och bara för dem', () => {
      const provider = subject.provider()
      for (const type of types) {
        if (provider.supports(type)) expect(() => PrintRequirements.parse(provider.requirements(type)), `${type.id}`).not.toThrow()
        else expect(() => provider.requirements(type), `${type.id}`).toThrow()
      }
      expect(types.some((t) => provider.supports(t))).toBe(true)
    })

    it('ritar ett raster i exakt trim plus utfall vid sin DPI', () => {
      const provider = subject.provider()
      for (const type of types.filter((t) => provider.supports(t))) {
        const req = provider.requirements(type)
        if (req.kind !== 'printed' || req.file.kind !== 'raster') continue
        const px = (mm: number) => ((mm + 2 * req.bleedMm) / 25.4) * (req.file.kind === 'raster' ? req.file.dpi : 0)
        expect(Math.abs(req.file.widthPx - px(req.trim.widthMm)), `${type.id} width`).toBeLessThanOrEqual(1)
        expect(Math.abs(req.file.heightPx - px(req.trim.heightMm)), `${type.id} height`).toBeLessThanOrEqual(1)
      }
    })

    it('förbereder en fil för varje sida av varje kort, i kravens mått, med paret hållet ihop', () => {
      const provider = subject.provider()
      const prepared = PreparedOrder.parse(provider.prepare(manifest))
      const byName = new Map(prepared.files.map((f) => [f.name, f]))
      expect(prepared.cards).toHaveLength(manifest.cards.length)
      manifest.cards.forEach((card, i) => {
        const out = prepared.cards[i]
        const req = provider.requirements(card.type)
        if (out === undefined || req.kind !== 'printed') throw new Error(`card ${i} «${card.cardRef}» is a printed card of the manifest`)
        expect(out.cardRef).toBe(card.cardRef)
        expect(out.sku).toBe(req.sku)
        expect(Object.keys(out.files).sort()).toEqual(Object.keys(card.faces).sort())
        for (const [face, content] of Object.entries(card.faces)) {
          const file = byName.get(out.files[face] ?? '')
          // The file draws this card's own face: a group's front never lands on the base back.
          expect(file, `${card.cardRef} ${face}`).toMatchObject({ content, face, side: req.sides[face], trim: req.trim, bleedMm: req.bleedMm, safeMm: req.safeMm, file: req.file, colorSpace: req.colorSpace })
          expect(file?.name.endsWith(`.${req.file.format}`), `${card.cardRef} ${face}`).toBe(true)
        }
      })
      expect(new Set(prepared.files.map((f) => f.name)).size).toBe(prepared.files.length)
    })

    it('förbereder samma sak varje gång ur samma manifest', () => {
      expect(subject.provider().prepare(structuredClone(manifest))).toEqual(subject.provider().prepare(structuredClone(manifest)))
    })

    it('packar bara lagervaror den har, och säger vilka den lämnade', () => {
      const provider = subject.provider()
      const prepared = provider.prepare(manifest)
      const total = (list: readonly { type: TypeRef; count: number }[], type: TypeRef) => list.filter((h) => h.type.id === type.id && h.type.version === type.version).reduce((n, h) => n + h.count, 0)
      for (const { type } of manifest.hardware) {
        const asked = total(manifest.hardware, type)
        if (provider.supports(type)) {
          expect(total(prepared.hardware, type), type.id).toBe(asked)
          expect(total(prepared.omitted, type), type.id).toBe(0)
        } else {
          expect(total(prepared.hardware, type), type.id).toBe(0)
          expect(total(prepared.omitted, type), type.id).toBe(asked)
        }
      }
      expect(prepared.omitted.every((o) => o.reason === 'not-packed')).toBe(true)
    })

    it('hänvisar i sina steg till varje förberedd fil, och bara till dem', () => {
      const prepared = subject.provider().prepare(manifest)
      const referred = new Set(prepared.steps.flatMap((s) => fileRefs(s.payload)))
      expect([...referred].sort()).toEqual(prepared.files.map((f) => f.name).sort())
    })

    it('dirigeras aldrig en EU-destination om den tillverkar utanför EU', () => {
      const provider = subject.provider()
      expect(provider.manufacturesIn.length).toBeGreaterThan(0)
      for (const country of provider.manufacturesIn) expect(() => Country.parse(country)).not.toThrow()
      for (const country of EU_COUNTRIES) {
        const route = routeOrder([provider], manifest, { country })
        if (manufacturesInEU(provider)) expect(route, country).toEqual({ kind: 'routed', provider })
        else expect(route, country).toEqual({ kind: 'none', reason: 'no-eu-print' })
      }
    })

    it('ger ett pris, och säger «okänt» om tull hellre än att gissa', async () => {
      const provider = subject.provider()
      for (const country of ['SE', 'US', 'NO', ...provider.manufacturesIn]) {
        const quote = Quote.parse(await provider.quote(manifest, { country }))
        // A price nobody quoted cannot know what customs will take at the border.
        if (quote.basis === 'fictional' && crossesCustoms(provider, { country })) expect(quote.duties, country).toBe('unknown')
      }
    })

    it('skickar det förberedda med varje fil, och spårar ordern den fick', async () => {
      const provider = subject.provider()
      const prepared = provider.prepare(manifest)
      const asked: string[] = []
      const files: FileSource = {
        bytes: async (name) => (asked.push(name), new TextEncoder().encode(name)),
        url: async (name) => (asked.push(name), `https://example.test/print/${encodeURIComponent(name)}`),
      }
      const ref = ProviderOrderRef.parse(await provider.submit(prepared, files))
      expect(ref.provider).toBe(provider.id)
      expect([...new Set(asked)].sort()).toEqual(prepared.files.map((f) => f.name).sort())
      OrderStatus.parse(await provider.track(ref))
      await expect(provider.track({ provider: provider.id, id: 'no-such-order' })).rejects.toThrow()
      await expect(provider.track({ provider: `${provider.id}-other`, id: ref.id })).rejects.toThrow()
    })

    it('skickar inte en order som en annan provider förberett', async () => {
      const provider = subject.provider()
      const prepared = { ...provider.prepare(manifest), provider: `${provider.id}-other` }
      const asked: string[] = []
      const files: FileSource = { bytes: async (n) => (asked.push(n), new Uint8Array()), url: async (n) => (asked.push(n), 'https://example.test/') }
      await expect(provider.submit(prepared, files)).rejects.toThrow()
      expect(asked).toEqual([])
    })

    it('vägrar ett kort av en typ den inte trycker', () => {
      const provider = subject.provider()
      const foreign = { id: 'card.contract.unknown', version: 1 }
      expect(provider.supports(foreign)).toBe(false)
      expect(() => provider.prepare({ cards: [{ cardRef: 'x', type: foreign, faces: { front: 'f' } }], hardware: [] })).toThrow()
    })
  })
}
