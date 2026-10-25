import { describe, expect, it } from 'vitest'
import { matchReference, PDQ_MATCH_DISTANCE, ScreeningReference, type PerceptualHash } from '../src/index.js'

// The reference list (F4, beslut 9; #1273): PDQ hashes of pictures that must not be printed — what
// has been taken down, and later commercial card art — kept in the database and not in the repo.
// A picture matches a reference within PDQ's own threshold, and only when both hashes say enough.

const bits = (flip: number, base = 'a5'.repeat(32)) => {
  const n = BigInt(`0x${base}`) ^ ((1n << BigInt(flip)) - 1n)
  return n.toString(16).padStart(64, '0')
}
const pdqOf = (b: string, quality = 90): PerceptualHash => ({ algorithm: 'pdq-256', bits: b, quality })
const ref = (b: string, source = 'borttagen 2026-10-25', quality = 90): ScreeningReference => ({ imageHash: { algorithm: 'pdq-256', bits: b, quality }, source, addedAt: 1 })

describe('referenslistan', () => {
  it('ger träff inom PDQ:s tröskel, med den närmaste referensen och avståndet', () => {
    const list = [ref(bits(0), 'a'), ref(bits(100), 'b')]
    expect(matchReference(pdqOf(bits(PDQ_MATCH_DISTANCE)), list)).toEqual({ reference: list[0], distance: PDQ_MATCH_DISTANCE })
    expect(matchReference(pdqOf(bits(96)), list)).toEqual({ reference: list[1], distance: 4 })
  })

  it('ger ingen träff utanför tröskeln', () => {
    expect(matchReference(pdqOf(bits(PDQ_MATCH_DISTANCE + 1)), [ref(bits(0))])).toBeNull()
    expect(matchReference(pdqOf(bits(0)), [])).toBeNull()
  })

  // A hash of a picture with nothing in it — a flat colour, an empty frame — is near every other
  // such hash, and a match on it would say nothing.
  it('ger ingen träff när någon av hasharna har för låg kvalitet', () => {
    expect(matchReference(pdqOf(bits(0), 49), [ref(bits(0))])).toBeNull()
    expect(matchReference(pdqOf(bits(0)), [ref(bits(0), 'x', 10)])).toBeNull()
  })

  it('jämför bara PDQ med PDQ', () => {
    expect(matchReference({ algorithm: 'dhash-64', bits: '00'.repeat(8) }, [ref(bits(0))])).toBeNull()
  })

  it('är en PDQ-hash och en källa, och vägrar något annat', () => {
    expect(() => ScreeningReference.parse(ref(bits(0)))).not.toThrow()
    expect(() => ScreeningReference.parse({ ...ref(bits(0)), imageHash: { algorithm: 'dhash-64', bits: '00'.repeat(8) } })).toThrow()
    expect(() => ScreeningReference.parse({ ...ref(bits(0)), imageHash: pdqOf('ab') })).toThrow()
    expect(() => ScreeningReference.parse({ ...ref(bits(0)), source: '' })).toThrow()
  })
})
