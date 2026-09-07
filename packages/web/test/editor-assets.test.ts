import { describe, expect, it } from 'vitest'
import { assetUrl, assetsInUse, imageFieldsOf, isAssetRef, resolveAssetRow } from '../src/editor/assets.js'
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
