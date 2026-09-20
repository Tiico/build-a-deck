// @vitest-environment jsdom
// Vilken kortsida bilden ritas på (#295, L22, variant A). Förhandsvisningen bredvid beskärningen
// gissade första sidan i mallen, så en baksidesbild visades på en framsida som inte ritar den.
// Sidan räknas ut ur vad kortet faktiskt ritar — mallen med den variant raden ber om — och inte
// ur mallobjektens ordning; en bild som data pekar på men ingen sida ritar är ingen användning.
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { Motif } from '@byd/template'
import { MediaPanel } from '../src/editor/MediaPanel.js'
import type { ProjectDoc } from '@byd/server'
import { facesDrawing } from '../src/editor/media-faces.js'
import { projectDoc } from './project-doc.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

const SKOG = '1'.repeat(64)
const MOSSA = '2'.repeat(64)

function deck(): ProjectDoc {
  const doc = projectDoc()
  doc.rows[0]!.fields['art'] = `asset:${SKOG}`
  doc.rows[1]!.fields['art'] = `asset:${SKOG}`
  return doc
}
const art = (id = 'art', field = 'art') => ({ kind: 'image' as const, id, x: 4, y: 4, w: 55, h: 36, bind: { field } })

describe('the face a picture is drawn on (#295)', () => {
  it('is the back when only the back draws the column the picture sits in', () => {
    const doc = deck()
    doc.template.faces['back']!.base.push(art())
    expect(facesDrawing(doc, doc.rows[0]!, SKOG)).toEqual(['back'])
  })

  it('names the front first when both sides draw it, whatever order the template keeps its faces in', () => {
    const doc = deck()
    doc.template.faces['back']!.base.push(art())
    doc.template.faces['front']!.base.push(art())
    doc.template.faces = { back: doc.template.faces['back']!, front: doc.template.faces['front']! }
    expect(facesDrawing(doc, doc.rows[0]!, SKOG)).toEqual(['front', 'back'])
  })

  it('follows the variant the row asks for, so the same picture is on the back of one card and the front of another', () => {
    const doc = deck()
    doc.template.faces['front']!.base.push(art())
    doc.template.faces['front']!.variantBy = 'sort'
    doc.template.faces['front']!.variants['ryggsida'] = { remove: ['art'] }
    doc.template.faces['back']!.variantBy = 'sort'
    doc.template.faces['back']!.variants['ryggsida'] = { override: [art()] }
    doc.rows[0]!.fields['sort'] = 'ryggsida'
    expect(facesDrawing(doc, doc.rows[0]!, SKOG)).toEqual(['back'])
    expect(facesDrawing(doc, doc.rows[1]!, SKOG)).toEqual(['front'])
  })

  it('finds a picture drawn inside a condition, and one the template carries by itself', () => {
    const doc = deck()
    doc.template.faces['back']!.base.push({ kind: 'if', id: 'ifart', when: { field: 'art', nonEmpty: true }, children: [art()] })
    doc.template.faces['front']!.base.push({ kind: 'image', id: 'stamp', x: 50, y: 70, w: 10, h: 10, bind: { literal: `asset:${MOSSA}` } })
    expect(facesDrawing(doc, doc.rows[0]!, SKOG)).toEqual(['back'])
    expect(facesDrawing(doc, doc.rows[2]!, MOSSA)).toEqual(['front'])
  })

  it('draws nothing for a picture the data points at but no side draws, which is not a use', () => {
    const doc = deck()
    doc.template.faces['front']!.base.push(art('omslag', 'omslag'))
    expect(facesDrawing(doc, doc.rows[0]!, SKOG)).toEqual([])
  })
})

const BASE = 'http://api.local'
const FILE: Motif = { w: 400, h: 200, trim: { left: 0, top: 0, right: 0, bottom: 0 } }
const motifs = { [`${BASE}/assets/${SKOG}`]: FILE, [`${BASE}/assets/${MOSSA}`]: FILE }

// Which side the one renderer drew beside the crop: the fixture's front carries the title, its
// back the `bg` shape, and the compiled card names its elements.
const drawn = (id: string) => document.querySelector(`.byd-media-crop .byd-preview [data-element="${id}"]`)
const side = (): 'front' | 'back' | 'none' => (drawn('title') ? 'front' : drawn('bg') ? 'back' : 'none')
const faces = () => screen.getByRole('radiogroup', { name: 'Kortsida' })
const face = (name: 'Fram' | 'Bak') => within(faces()).getByRole('radio', { name })

describe('the preview opens on the side that draws the picture (#295)', () => {
  it('opens a back-only picture on the back, and says so without colour', () => {
    const doc = deck()
    doc.template.faces['back']!.base.push(art())
    render(<MediaPanel doc={doc} assetBase={BASE} motifs={motifs} onCrop={() => undefined} />)

    expect(side()).toBe('back')
    expect(face('Bak').getAttribute('aria-checked')).toBe('true')
    expect(face('Fram').getAttribute('aria-checked')).toBe('false')
  })

  it('opens on the front when both sides draw it, and a turn by hand holds while the crop is being cut', () => {
    const doc = deck()
    doc.template.faces['front']!.base.push(art())
    doc.template.faces['back']!.base.push(art())
    render(<MediaPanel doc={doc} assetBase={BASE} motifs={motifs} onCrop={() => undefined} />)
    expect(side()).toBe('front')

    fireEvent.click(face('Bak'))
    expect(side()).toBe('back')
    fireEvent.keyDown(screen.getByRole('button', { name: /Beskärning/ }), { key: 'ArrowLeft', shiftKey: true })
    expect(side()).toBe('back')
    expect(face('Bak').getAttribute('aria-checked')).toBe('true')
  })
})

const picker = () => screen.getByRole('group', { name: 'Kort som använder bilden' })
const card = (name: string) => within(picker()).getByRole('button', { name })

describe('the card the picture is judged on is chosen among the cards that use it (#295)', () => {
  it('lists only those cards with the first in deck order chosen, and a chosen card brings its own side', () => {
    const doc = deck()
    doc.rows[2]!.fields['art'] = `asset:${MOSSA}`
    doc.template.faces['front']!.base.push(art())
    doc.template.faces['front']!.variantBy = 'sort'
    doc.template.faces['front']!.variants['ryggsida'] = { remove: ['art'] }
    doc.template.faces['back']!.variantBy = 'sort'
    doc.template.faces['back']!.variants['ryggsida'] = { override: [art()] }
    doc.rows[1]!.fields['sort'] = 'ryggsida'
    render(<MediaPanel doc={doc} assetBase={BASE} motifs={motifs} onCrop={() => undefined} />)

    expect(within(picker()).getAllByRole('button').map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([
      ['Drake', 'true'],
      ['Riddare', 'false'],
    ])
    expect(side()).toBe('front')

    // Riddare's variant takes the picture off the front and puts it on the back, so choosing him
    // opens the back; turning him over shows his own front, and going back to Drake starts over
    // from where the picture is drawn on that card, not from the turn made on this one.
    fireEvent.click(card('Riddare'))
    expect(card('Riddare').getAttribute('aria-pressed')).toBe('true')
    expect(side()).toBe('back')
    fireEvent.click(face('Fram'))
    expect(side()).toBe('front')
    expect(drawn('title')?.textContent).toBe('Riddare')
    fireEvent.click(card('Drake'))
    expect(side()).toBe('front')
    expect(drawn('title')?.textContent).toBe('Drake')
    fireEvent.click(face('Bak'))
    fireEvent.click(card('Riddare'))
    expect(side()).toBe('back')
  })
})

describe('the picker is searched, not scrolled (#295)', () => {
  it('narrows by name, and says the id where two cards share one', () => {
    const doc = deck()
    doc.rows[2]!.fields['art'] = `asset:${SKOG}`
    doc.rows[2]!.fields['title'] = 'Drake'
    doc.template.faces['front']!.base.push(art())
    render(<MediaPanel doc={doc} assetBase={BASE} motifs={motifs} onCrop={() => undefined} />)

    expect(within(picker()).getAllByRole('button').map((b) => b.textContent)).toEqual(['Drakedragon', 'Riddare', 'Drakewizard'])
    fireEvent.change(within(picker()).getByRole('searchbox', { name: 'Sök kort' }), { target: { value: 'ridd' } })
    expect(within(picker()).getAllByRole('button').map((b) => b.textContent)).toEqual(['Riddare'])
    fireEvent.change(within(picker()).getByRole('searchbox', { name: 'Sök kort' }), { target: { value: 'wiz' } })
    expect(within(picker()).getAllByRole('button').map((b) => b.textContent)).toEqual(['Drakewizard'])
    fireEvent.change(within(picker()).getByRole('searchbox', { name: 'Sök kort' }), { target: { value: 'häst' } })
    expect(within(picker()).getByText('Inget kort matchar sökningen.')).toBeTruthy()
  })

  it('offers no choice for a picture one card uses, and names that card instead', () => {
    const doc = deck()
    delete doc.rows[1]!.fields['art']
    doc.template.faces['front']!.base.push(art())
    render(<MediaPanel doc={doc} assetBase={BASE} motifs={motifs} onCrop={() => undefined} />)

    expect(screen.queryByRole('group', { name: 'Kort som använder bilden' })).toBeNull()
    expect(document.querySelector('.byd-media-crop-on')?.textContent).toBe('Drake')
    expect(side()).toBe('front')
  })
})

describe('what is not a use is said, and never drawn (#295)', () => {
  it('shows an unused picture with its crop and «Används inte på något kort», and no card at all', () => {
    const onCrop = vi.fn()
    const doc = deck()
    doc.template.faces['front']!.base.push(art())
    doc.pictures = { [MOSSA]: { name: 'Mossa' } }
    render(<MediaPanel doc={doc} assetBase={BASE} motifs={motifs} onCrop={onCrop} />)
    fireEvent.click(screen.getByRole('button', { name: 'Mossa' }))

    expect(screen.getByText('Används inte på något kort')).toBeTruthy()
    expect(document.querySelector('.byd-media-crop .byd-preview')).toBeNull()
    expect(screen.queryByRole('radiogroup', { name: 'Kortsida' })).toBeNull()
    expect(screen.queryByText('Kortets mall visar inte bilden.')).toBeNull()
    fireEvent.keyDown(screen.getByRole('button', { name: /Beskärning/ }), { key: 'ArrowLeft', shiftKey: true })
    expect(onCrop).toHaveBeenCalledWith(MOSSA, { x: 0, y: 0, w: 0.98, h: 1 })
  })

  it('says that the template does not draw a picture the data points at, instead of inventing a use', () => {
    const doc = deck()
    doc.template.faces['front']!.base.push(art('omslag', 'omslag'))
    render(<MediaPanel doc={doc} assetBase={BASE} motifs={motifs} onCrop={() => undefined} />)

    expect(screen.getByText('Kortets mall visar inte bilden.')).toBeTruthy()
    expect(screen.queryByText('Används inte på något kort')).toBeNull()
    expect(document.querySelector('.byd-media-crop .byd-preview')).toBeNull()
    // The cards still stand to choose among: the fact is about this card's template.
    expect(picker()).toBeTruthy()
  })

  it('changes nothing but the preview: no crop, no cell, no document', () => {
    const onCrop = vi.fn()
    const doc = deck()
    doc.template.faces['front']!.base.push(art())
    doc.template.faces['back']!.base.push(art())
    const before = JSON.stringify(doc)
    render(<MediaPanel doc={doc} assetBase={BASE} motifs={motifs} onCrop={onCrop} />)

    fireEvent.click(card('Riddare'))
    fireEvent.click(face('Bak'))
    fireEvent.change(within(picker()).getByRole('searchbox', { name: 'Sök kort' }), { target: { value: 'dr' } })
    fireEvent.click(card('Drake'))

    expect(onCrop).not.toHaveBeenCalled()
    expect(JSON.stringify(doc)).toBe(before)
  })
})
