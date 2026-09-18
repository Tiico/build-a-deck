import { describe, expect, it } from 'vitest'
import { MemoryObjectStore } from '@byd/render'
import { croppedMotif } from '@byd/template'
import { MemoryAssetStore, resolveAssets } from '../src/assets.js'
import { applyEdit } from '../src/edits.js'
import { ProjectDoc } from '../src/projects.js'
import { twoSeatSetup } from './fixture.js'

// A picture's own crop (#222, L22, beslut 2): the window the deck looks at a file through, made
// once and obeyed by every card drawn from that file. It is a fact about the picture and not
// about the card, so it is filed under the picture — the hash of its bytes, which is the only
// name a content-addressed file has.
const SKOG = '1'.repeat(64)

const base = (): ProjectDoc => {
  const { zones, seats, floor } = twoSeatSetup()
  return {
    name: 'Skogens herrar',
    template: { faces: { front: { base: [], variants: {} } } },
    rows: [{ id: 'dragon', fields: { title: 'Drake', art: `asset:${SKOG}`, antal: 1 } }],
    icons: {},
    setup: { zones, seats, floor, deckZone: 'draw' },
  }
}

describe('a picture’s crop in the project document (#222)', () => {
  it('is filed under the picture rather than under a card, and survives the schema', () => {
    const doc = ProjectDoc.parse({ ...base(), pictures: { [SKOG]: { crop: { x: 0.1, y: 0.05, w: 0.6, h: 0.8 } } } })

    expect(doc.pictures).toEqual({ [SKOG]: { crop: { x: 0.1, y: 0.05, w: 0.6, h: 0.8 } } })
  })

  it('refuses a window that cannot be cut, because a stored one crops every card from now on', () => {
    const bad = (pictures: unknown) => () => ProjectDoc.parse({ ...base(), pictures })

    // A window of nothing is no picture.
    expect(bad({ [SKOG]: { crop: { x: 0, y: 0, w: 0, h: 1 } } })).toThrow()
    // A window that reaches outside the file is a window nothing can cut.
    expect(bad({ [SKOG]: { crop: { x: 0.6, y: 0, w: 0.6, h: 1 } } })).toThrow()
    expect(bad({ [SKOG]: { crop: { x: 0, y: -0.2, w: 1, h: 1 } } })).toThrow()
    // A key that names no picture is a crop nothing will ever apply.
    expect(bad({ skogsbryn: { crop: { x: 0, y: 0, w: 1, h: 1 } } })).toThrow()
  })

  // A crop is dragged to its edges, and a share arrived at by adding up pointer deltas overshoots
  // in binary where the same number written by hand would not. Refusing the window a designer
  // pushed flush against the right edge would be refusing the commonest crop there is.
  it('lets a window stand flush against the far edge, where the arithmetic overshoots', () => {
    const flush = { x: 0.6000000000000001, y: 0, w: 0.4000000000000001, h: 1 }
    expect(flush.x + flush.w).toBeGreaterThan(1)

    expect(ProjectDoc.parse({ ...base(), pictures: { [SKOG]: { crop: flush } } }).pictures?.[SKOG]?.crop).toEqual(flush)
  })
})

// Cropping is an edit like every other (D3): one intent, applied by the one pure function, so the
// editor's copy and the truth on the server cannot disagree about what the picture now shows.
describe('cropping a picture is one edit (#222)', () => {
  it('writes the window under the picture, where every card drawn from it will find it', () => {
    const doc = applyEdit(base(), { v: 'setCrop', hash: SKOG, crop: { x: 0.1, y: 0, w: 0.5, h: 1 } })

    expect(doc.pictures).toEqual({ [SKOG]: { crop: { x: 0.1, y: 0, w: 0.5, h: 1 } } })
  })

  it('takes a window cut back to the whole picture as no crop at all', () => {
    const cropped = applyEdit(base(), { v: 'setCrop', hash: SKOG, crop: { x: 0.1, y: 0, w: 0.5, h: 1 } })

    // The same thing said two ways — dragged back out to the edges, or asked for by name — and
    // the document says it once: a picture that shows all of itself is a picture nobody cropped,
    // and it goes on being trimmed of its own air like every other uncropped picture.
    expect(applyEdit(cropped, { v: 'setCrop', hash: SKOG, crop: { x: 0, y: 0, w: 1, h: 1 } })).toEqual(
      applyEdit(cropped, { v: 'setCrop', hash: SKOG, crop: null }),
    )
    expect(applyEdit(cropped, { v: 'setCrop', hash: SKOG, crop: null }).pictures).toEqual({ [SKOG]: {} })
  })
})

// The bytes of a picture, and the size the file says it is.
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])
const FILE = { w: 200, h: 100, trim: { left: 0, top: 0, right: 0, bottom: 0 } }

// Beslut 2, first half: the crop follows the picture. Ninety-six cards drawn from one file are
// cropped by one gesture, because there is one picture and the window is the picture's.
describe('one crop reaches every card drawn from the picture (#222, beslut 2)', () => {
  it('hands the whole deck the same window, cut once, without visiting a single card', async () => {
    const store = new MemoryAssetStore(new MemoryObjectStore())
    const hash = await store.put(PNG, 'image/png')
    await store.setMotif(hash, FILE)
    const crop = { x: 0.25, y: 0, w: 0.5, h: 1 }

    const { rows, motifs } = await resolveAssets(
      [
        { id: 'dragon', fields: { art: `asset:${hash}` } },
        { id: 'knight', fields: { art: `asset:${hash}` } },
      ],
      store,
      { [hash]: { crop } },
    )

    // The same bytes on both cards, so both cards are handed the same picture and the same window.
    const url = rows[0]?.fields['art']
    expect(rows[1]?.fields['art']).toBe(url)
    expect(motifs[String(url)]).toEqual(croppedMotif(FILE, crop))
  })

  it('leaves a picture nobody has cropped measured exactly as it was', async () => {
    const store = new MemoryAssetStore(new MemoryObjectStore())
    const hash = await store.put(PNG, 'image/png')
    await store.setMotif(hash, FILE)

    const { rows, motifs } = await resolveAssets([{ id: 'dragon', fields: { art: `asset:${hash}` } }], store, {})

    expect(motifs[String(rows[0]?.fields['art'])]).toEqual(FILE)
  })
})
