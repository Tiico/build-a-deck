import { describe, expect, it } from 'vitest'
import { ASSET_FORMATS, ASSET_MAX_BYTES, sniffAsset } from '@byd/protocol'
import { RULE_IMAGE_MAX_BYTES, assetUrl, assetsInUse, imageFieldsOf, imageTypeOf, isAssetRef, resolveAssetRow } from '../src/editor/assets.js'
import { projectDoc } from './project-doc.js'

const HASH = 'a'.repeat(64)

describe('assets in the editor (E1): rows point at images by hash', () => {
  it('turns an asset reference into the server\'s URL for the card compiler and leaves other values alone', () => {
    expect(isAssetRef(`asset:${HASH}`)).toBe(true)
    expect(isAssetRef('asset:nope')).toBe(false)
    expect(isAssetRef('data:image/png;base64,AA==')).toBe(false)
    expect(assetUrl('http://api.local', HASH)).toBe(`http://api.local/assets/${HASH}`)
    expect(resolveAssetRow({ title: 'Drake', art: `asset:${HASH}`, cost: 5, ok: true }, 'http://api.local')).toEqual({ title: 'Drake', art: `http://api.local/assets/${HASH}`, cost: 5, ok: true })
  })

  it('knows which fields are images from the template, and which images the deck uses', () => {
    const doc = projectDoc()
    expect(imageFieldsOf(doc)).toEqual([])
    doc.template.faces['front']!.base.push({ kind: 'image', id: 'art', x: 4, y: 4, w: 55, h: 36, bind: { field: 'art' } })
    expect(imageFieldsOf(doc)).toEqual(['art'])
    doc.rows[0]!.fields['art'] = `asset:${HASH}`
    doc.rows[1]!.fields['art'] = `asset:${HASH}`
    doc.rows[2]!.fields['art'] = `asset:${'b'.repeat(64)}`
    expect(assetsInUse(doc)).toEqual([
      { hash: HASH, cards: ['dragon', 'knight'] },
      { hash: 'b'.repeat(64), cards: ['wizard'] },
    ])
  })
})

// A file a designer picks is untrusted input, and a picture is a new kind of it (#173). What the
// file calls itself — its name, and the type the browser guessed from that name — is not evidence.
// The bytes are, so the type a picture is stored and served as is read out of the bytes.
describe('what a picked file actually is (#173)', () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
  const bytes = (...head: number[]) => new Uint8Array([...head, ...new Array(32).fill(0)])

  it('reads the type out of the bytes, for the four raster formats a book may hold', () => {
    expect(imageTypeOf(new Uint8Array(png))).toBe('image/png')
    expect(imageTypeOf(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg')
    expect(imageTypeOf(new Uint8Array([...Buffer.from('GIF89a'), ...new Array(32).fill(0)]))).toBe('image/gif')
    const webp = new Uint8Array([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP'), ...new Array(16).fill(0)])
    expect(imageTypeOf(webp)).toBe('image/webp')
  })

  it('refuses everything else, however the file was named', () => {
    // A page that claims to be a picture stays a page: it is never stored, never served with a
    // type it talked its way into, and never drawn.
    expect(imageTypeOf(new Uint8Array(Buffer.from('<svg onload="alert(1)"/>')))).toBeNull()
    expect(imageTypeOf(new Uint8Array(Buffer.from('<!doctype html><script>x</script>')))).toBeNull()
    expect(imageTypeOf(new Uint8Array(Buffer.from('%PDF-1.7')))).toBeNull()
    expect(imageTypeOf(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBeNull()
    expect(imageTypeOf(new Uint8Array([]))).toBeNull()
    // RIFF is not WebP on its own; a wave file wearing a .png is still not a picture.
    expect(imageTypeOf(new Uint8Array([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WAVE')]))).toBeNull()
  })

  it('reads off the very list the server gates on, so the editor and the gate cannot say different things (#204)', () => {
    // The four are not written here a second time: this is the shared list, and the editor's
    // answer is that reading with everything that is not a picture kept out of it.
    expect(ASSET_FORMATS.filter((f) => f.kind === 'image').map((f) => f.type)).toEqual(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
    // A typeface is read too, and is not a picture: the kinds are what keep a font out of a
    // picture field and a picture out of a font field.
    const woff2 = new Uint8Array([...Buffer.from('wOF2'), 0, 1, 0, 0])
    expect(sniffAsset(woff2)?.type).toBe('font/woff2')
    expect(imageTypeOf(woff2)).toBeNull()
    // And the weight the import reports on is the gate's own limit, not a number kept in step.
    expect(RULE_IMAGE_MAX_BYTES).toBe(ASSET_MAX_BYTES)
  })
})
