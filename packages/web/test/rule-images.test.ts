// Taking the rulebook's pictures into the game (B7, #173).
//
// The file names a picture by an address, and the book may hold nothing but one of the game's own
// assets — it is versioned with the cards (B4, B7). So the bytes are found beside the Markdown,
// weighed against the very gate the upload route keeps, measured, and taken in; and a picture that
// cannot be taken in is answered for by name and reason rather than quietly left out.
import { describe, expect, it } from 'vitest'
import type { RuleImagePick } from '@byd/template'
import { ASSET_MAX_BYTES } from '@byd/server/doc'
import { takeRuleImages } from '../src/editor/ruleImages.js'

const pick = (address: string, alt: string | null = 'Bordet.', id = 'i1'): RuleImagePick => ({ id, after: 'b1', alt, address })
const png = (name: string, bytes = 8) => new File([new Uint8Array(bytes)], name, { type: 'image/png' })
const hash = 'a'.repeat(64)
const upload = async () => hash
const measure = async () => ({ w: 2400, h: 1350 })

describe('taking the rulebook’s pictures into the game (#173)', () => {
  it('finds the file the address names, uploads it once, and keeps an absent alt text decorative', async () => {
    const file = png('bordet.png')
    const picks = [pick('bilder/bordet.png'), pick('BORDET.PNG', null, 'i2')]
    const out = await takeRuleImages(picks, [file], upload, measure)
    expect(out.left).toEqual([])
    expect(out.taken).toEqual([
      { id: 'i1', src: `asset:${hash}`, alt: 'Bordet.', px: { w: 2400, h: 1350 } },
      // No alt text in the file is an empty alt text in the book, which is decorative.
      { id: 'i2', src: `asset:${hash}`, alt: '', px: { w: 2400, h: 1350 } },
    ])
  })

  it('says by name and by reason what did not come in, with the limit written out', async () => {
    const picks = [
      pick('uppstallning.tiff', 'Uppställningen', 'i1'),
      pick('bordet-4k.png', 'Bordet', 'i2'),
      pick('borta.png', 'Borta', 'i3'),
      pick('https://example.invalid/bordet.png', 'Ute', 'i4'),
    ]
    const files = [new File([new Uint8Array(4)], 'uppstallning.tiff', { type: 'image/tiff' }), png('bordet-4k.png', ASSET_MAX_BYTES + 1)]
    const out = await takeRuleImages(picks, files, upload, measure)
    expect(out.taken).toEqual([])
    expect(out.left).toEqual([
      { id: 'i1', after: 'b1', file: 'uppstallning.tiff', why: 'type' },
      { id: 'i2', after: 'b1', file: 'bordet-4k.png', why: 'big', bytes: ASSET_MAX_BYTES + 1 },
      { id: 'i3', after: 'b1', file: 'borta.png', why: 'missing' },
      // An address pointing out of the game is not fetched: the book is versioned with the cards,
      // and a figure at the end of somebody else's URL goes missing on somebody else's schedule.
      { id: 'i4', after: 'b1', file: 'https://example.invalid/bordet.png', why: 'missing' },
    ])
  })

  it('calls a picture broken when the browser cannot measure it, rather than taking in an unmeasurable figure', async () => {
    const out = await takeRuleImages([pick('bordet.png')], [png('bordet.png')], upload, async () => null)
    expect(out.taken).toEqual([])
    expect(out.left).toEqual([{ id: 'i1', after: 'b1', file: 'bordet.png', why: 'broken' }])
  })
})
