// @vitest-environment jsdom
// The crop, where the library is (#222, L22, beslut 2). A picture is cropped once and every card
// drawn from it shows that window: the whole reason for having a library rather than a hundred
// and fifty-four drags. What is asked here is the surface — that a crop can be cut without a
// pointer, that it says what it is doing, and that the card beside it is the card the printer
// will get, drawn by the one renderer and not by a second drawing of a card.
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ProjectDoc } from '@byd/server'
import type { Motif } from '@byd/template'
import { MediaPanel } from '../src/editor/MediaPanel.js'
import { projectDoc } from './project-doc.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

const SKOG = '1'.repeat(64)
const BASE = 'http://api.local'
// Twice as wide as it is tall, with no air around anything, so that what moves in the card below
// is the window and never a measurement.
const FILE: Motif = { w: 400, h: 200, trim: { left: 0, top: 0, right: 0, bottom: 0 } }
const motifs = { [`${BASE}/assets/${SKOG}`]: FILE }

function deckWithArt(): ProjectDoc {
  const doc = projectDoc()
  doc.template.faces['front']!.base.push({ kind: 'image', id: 'art', x: 4, y: 4, w: 55, h: 36, bind: { field: 'art' } })
  doc.rows[0]!.fields['art'] = `asset:${SKOG}`
  doc.rows[1]!.fields['art'] = `asset:${SKOG}`
  return doc
}

const window_ = () => screen.getByRole('button', { name: /Beskärning/ })

describe('a picture is cropped in the library (#222)', () => {
  it('cuts the window with the keyboard alone, and says where the window now stands', () => {
    const onCrop = vi.fn()
    render(<MediaPanel doc={deckWithArt()} assetBase={BASE} motifs={motifs} onReplaceRows={() => undefined} onCrop={onCrop} />)

    // A picture nobody has cropped is the whole picture, so the first thing there is room for is
    // to make the window narrower; then it can be moved into the picture.
    fireEvent.keyDown(window_(), { key: 'ArrowLeft', shiftKey: true })
    fireEvent.keyDown(window_(), { key: 'ArrowRight' })

    expect(onCrop).toHaveBeenLastCalledWith(SKOG, { x: 0.02, y: 0, w: 0.98, h: 1 })
    expect(window_().getAttribute('aria-label')).toBe('Beskärning: visar 2–100 % i sidled och 0–100 % i höjdled')
  })

  // Beslut 2, first half: the crop follows the picture. The gesture names the picture and no card
  // at all, which is what lets one window reach the ninety-six cards drawn from the file.
  it('names the picture and never a card, so every card drawn from it is reached at once', () => {
    const onCrop = vi.fn()
    const doc = deckWithArt()
    render(<MediaPanel doc={doc} assetBase={BASE} motifs={motifs} onReplaceRows={() => undefined} onCrop={onCrop} />)

    fireEvent.keyDown(window_(), { key: 'ArrowDown', shiftKey: true })

    expect(doc.rows.filter((row) => row.fields['art'] === `asset:${SKOG}`)).toHaveLength(2)
    expect(onCrop.mock.calls).toEqual([[SKOG, { x: 0, y: 0, w: 1, h: 1 }]])
  })

  it('puts a cropped picture back to whole, which is the way out that remembers no numbers', () => {
    const onCrop = vi.fn()
    const doc = deckWithArt()
    doc.pictures = { [SKOG]: { crop: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 } } }
    render(<MediaPanel doc={doc} assetBase={BASE} motifs={motifs} onReplaceRows={() => undefined} onCrop={onCrop} />)

    fireEvent.click(screen.getByRole('button', { name: 'Hela bilden' }))

    expect(onCrop.mock.calls).toEqual([[SKOG, null]])
  })
})

// A library is a place to look things over, so what it says about a picture has to include what
// has been done to it. A cropped picture that looked exactly like an uncropped one would leave
// the one fact the tab exists to carry readable only by opening every picture in turn.
describe('the library says which pictures are cropped (#222)', () => {
  it('lights the window on the picture’s own tile, and leaves an uncropped one plain', () => {
    const doc = deckWithArt()
    doc.rows[2]!.fields['art'] = 'asset:' + '2'.repeat(64)
    doc.pictures = { [SKOG]: { crop: { x: 0.25, y: 0.1, w: 0.5, h: 0.8 } } }
    render(<MediaPanel doc={doc} assetBase={BASE} motifs={motifs} onReplaceRows={() => undefined} onCrop={() => undefined} />)

    const [cropped, plain] = screen.getAllByRole('listitem')
    const lit = cropped!.querySelector('[data-window]')
    expect(lit?.getAttribute('style')).toContain('left: 25%')
    expect(lit?.getAttribute('style')).toContain('width: 50%')
    expect(plain!.querySelector('[data-window]')).toBeNull()
  })
})

// The prototype's own point: the crop is judged against the card, not against the file. So the
// card stands beside the window and is a real compile — the same one the table's textures and the
// print PDF come out of — rather than a second drawing of a card that could disagree with it.
describe('the card beside the crop is the card the printer gets (#222, E2)', () => {
  // The compiled rule for the picture on the card, as the one renderer wrote it.
  const artRule = (): string => {
    const css = document.querySelector('.byd-media-crop .byd-preview style')?.textContent ?? ''
    return /\[data-element="art"\] \.byd-art\{([^}]*)\}/.exec(css)?.[1] ?? ''
  }

  it('draws the picture through the window being cut, and redraws it as the window moves', () => {
    render(<MediaPanel doc={deckWithArt()} assetBase={BASE} motifs={motifs} onReplaceRows={() => undefined} onCrop={() => undefined} />)

    // A picture nobody has cropped is the whole picture, and the whole picture meets its frame
    // the way every uncropped picture always has.
    expect(artRule()).toBe('width:100%;height:100%;object-fit:cover;')

    fireEvent.keyDown(window_(), { key: 'ArrowLeft', shiftKey: true })
    fireEvent.keyDown(window_(), { key: 'ArrowRight' })

    // Now the file is hung inside its frame, so that exactly the window fills it.
    expect(artRule()).toMatch(/^left:-?[\d.]+mm;top:-?[\d.]+mm;width:[\d.]+mm;height:[\d.]+mm;$/)
    const narrow = artRule()
    fireEvent.keyDown(window_(), { key: 'ArrowLeft', shiftKey: true })
    expect(artRule()).not.toBe(narrow)
  })

  it('shows the very picture being cropped, from the place the deck’s pictures are served', () => {
    render(<MediaPanel doc={deckWithArt()} assetBase={BASE} motifs={motifs} onReplaceRows={() => undefined} onCrop={() => undefined} />)

    const art = document.querySelector('.byd-media-crop .byd-preview img.byd-art')
    expect(art?.getAttribute('src')).toBe(`${BASE}/assets/${SKOG}`)
  })
})
