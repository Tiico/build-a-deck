// @vitest-environment jsdom
// The media library (#222, beslut 1 och 4): the game's pictures in a tab of their own, so that
// finding one and tidying one are the same errand. The card table's own strip says which pictures
// are in use; a library that only listed those would have nothing to tidy.
import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { ProjectDoc } from '@byd/server'
import { MediaPanel } from '../src/editor/MediaPanel.js'
import { projectDoc } from './project-doc.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

const SKOG = '1'.repeat(64)
const BORG = '2'.repeat(64)
const KARTA = '3'.repeat(64)

// A deck whose template draws a picture, with one picture on two cards and another on one.
function deckWithArt(): ProjectDoc {
  const doc = projectDoc()
  doc.template.faces['front']!.base.push({ kind: 'image', id: 'art', x: 4, y: 4, w: 55, h: 36, bind: { field: 'art' } })
  doc.rows[0]!.fields['art'] = `asset:${SKOG}`
  doc.rows[1]!.fields['art'] = `asset:${SKOG}`
  doc.rows[2]!.fields['art'] = `asset:${BORG}`
  return doc
}

const tiles = () => screen.getAllByRole('listitem')

describe('the media library lists the game’s pictures (#222)', () => {
  it('holds each picture once however many cards use it, and says how many', () => {
    render(<MediaPanel doc={deckWithArt()} assetBase="http://api.local" />)

    expect(tiles().map((li) => li.getAttribute('data-asset'))).toEqual([SKOG, BORG])
    expect(tiles().map((li) => within(li).getByRole('img').getAttribute('src'))).toEqual([
      `http://api.local/assets/${SKOG}`,
      `http://api.local/assets/${BORG}`,
    ])
    expect(tiles().map((li) => within(li).getByText(/kort|använder/).textContent)).toEqual(['2 kort', '1 kort'])
  })
})

// Beslut 4: unused media is marked and never purged. The bytes are content-addressed and an older
// version of the deck may still point at them, so the library's answer to "nobody uses this" is a
// word beside it and never a picture quietly gone.
describe('the media library marks what no card uses (#222, beslut 4)', () => {
  it('keeps a picture no card is drawn from, and says so beside it', () => {
    const doc = deckWithArt()
    doc.rules = { title: 'Regler', blocks: [{ kind: 'image', id: 'karta', asset: `asset:${KARTA}`, alt: 'Kartan', px: { w: 800, h: 600 } }] }
    render(<MediaPanel doc={doc} assetBase="http://api.local" />)

    expect(tiles().map((li) => li.getAttribute('data-asset'))).toEqual([SKOG, BORG, KARTA])
    const unused = tiles().at(-1)!
    expect(unused.getAttribute('data-unused')).toBe('true')
    expect(within(unused).getByText('inget kort använder den')).toBeTruthy()
    // Marked, not purged: the picture is still in the library, with its bytes where they were.
    expect(within(unused).getByRole('img').getAttribute('src')).toBe(`http://api.local/assets/${KARTA}`)
  })
})

// Ett spel av verklig storlek (308 kort, inte fixturens tre) är just det biblioteket är till för,
// och det är den yta i editorn som håller flest bilder av alla. Hämtas de allihop på en gång blir
// öppnandet av fliken hundratals förfrågningar i samma andetag — bilderna nedanför vikningen får
// vänta tills de ska synas.
describe('the media library at a real game’s size (#222)', () => {
  it('leaves the pictures below the fold to the browser instead of fetching them all at once', () => {
    const doc = deckWithArt()
    doc.rows = Array.from({ length: 308 }, (_, i) => ({
      ...doc.rows[0]!,
      id: `r${i}`,
      fields: { ...doc.rows[0]!.fields, art: `asset:${i.toString(16).padStart(64, '0')}` },
    }))
    render(<MediaPanel doc={doc} assetBase="http://api.local" />)

    expect(tiles()).toHaveLength(308)
    expect(tiles().map((li) => within(li).getByRole('img').getAttribute('loading'))).toEqual(Array(308).fill('lazy'))
  })
})

// The way from a picture to the cards left Media (#296, L22 reviderat 2026-09-20): it stands in
// Data now, as a window over the table, where the cards are and where they are marked. What is
// left here is the library, the upload, the crop and the preview — and no control that only works
// once the designer has walked to another tab and back.
describe('the media library no longer puts a picture on the marked cards (#296)', () => {
  it('offers neither the put button nor the column it wrote into', () => {
    render(<MediaPanel doc={deckWithArt()} assetBase="http://api.local" onCrop={() => undefined} />)
    expect(screen.queryByRole('button', { name: /Lägg bilden på/ })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Lägg på kort' })).toBeNull()
    expect(screen.queryByLabelText('Kolumn')).toBeNull()
    // The control: the library and the crop are still there.
    expect(tiles()).toHaveLength(2)
    expect(screen.getByRole('heading', { name: 'Beskärning' })).toBeTruthy()
  })
})
