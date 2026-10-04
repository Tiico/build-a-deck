// @vitest-environment jsdom
// The placeholder on the template canvas (#802, beställarens beslut variant A, «rutan säger det»).
// A layer that draws nothing on the card shown was invisible until it was selected: a picture
// with none chosen, a row of icons with no names, and a picture bound to a column of words, which
// drew the browser's broken-image glyph. Each now wears a dashed frame on the canvas with a short
// word in a dark tag, and the tag carries the whole sentence as its title and its name.
//
// The tag is the canvas's and never the card's: it lies on the layer that takes the pointer, and
// the one compiler draws exactly what it drew before — which is what makes print and the table
// sure never to meet it.
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useState } from 'react'
import type { ProjectDoc } from '@byd/server'
import type { Element } from '@byd/template'
import { TemplateCanvas, type TemplateCanvasProps } from '../src/editor/TemplateCanvas.js'
import { projectDoc } from './project-doc.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

const SKOG = '1'.repeat(64)
const BASE = 'http://api.local'

// The play test's deck: every card has a «typ» in words, and «bild» holds a picture on the dragon
// and nothing on the knight.
function deck(...layers: Element[]): ProjectDoc {
  const doc = projectDoc()
  for (const row of doc.rows) row.fields['typ'] = 'Playcard'
  doc.rows[0]!.fields['bild'] = `asset:${SKOG}`
  doc.rows[1]!.fields['bild'] = ''
  doc.rows[1]!.fields['symboler'] = ''
  doc.pictures = { [SKOG]: { name: 'skog' } }
  doc.template.faces['front']!.base.push(...layers)
  return doc
}

const picture = (id: string, bind: { field: string } | { literal: string }, at: { x?: number; w?: number; h?: number } = {}): Element => ({ kind: 'image', id, x: 5, y: 30, w: 25, h: 25, ...at, bind, fit: 'cover' })
const row = (id: string, bind: { field: string } | { literal: string }): Element => ({ kind: 'icons', id, x: 5, y: 60, w: 24, h: 6, bind, iconMm: 5, gapMm: 1 })

function Desk({ doc, card = 'dragon' }: { doc: ProjectDoc; card?: string }) {
  const [selected, setSelected] = useState<string | null>(null)
  const props: TemplateCanvasProps = {
    doc,
    assetBase: BASE,
    face: 'front',
    onSelectFace: vi.fn(),
    onReplaceFace: vi.fn(),
    group: null,
    onSelectGroup: vi.fn(),
    onGroupColumn: vi.fn(),
    onAddField: vi.fn(),
    onReset: vi.fn(),
    row: card,
    selectedElement: selected,
    onSelectElement: setSelected,
    onPatch: vi.fn(),
    onCallOff: vi.fn(),
    onRemove: vi.fn(),
    onAdd: vi.fn(),
    onPlaceIcon: vi.fn(),
    onReorder: vi.fn(),
    onLock: vi.fn(),
    onRename: vi.fn(),
  }
  return <TemplateCanvas {...props} />
}

// The tag on a layer, and the layer it stands on, as the reader meets them.
const box = (id: string) => document.querySelector<HTMLElement>(`[data-drag="${id}"]`)!
const tagOn = (id: string) => box(id).querySelector<HTMLElement>('.byd-placeholder-tag')
// The word drawn in the tag, without the kind's glyph in front of it.
const wordOn = (id: string) => tagOn(id)!.lastElementChild!.textContent
const card = () => document.querySelector<HTMLElement>('#canvas [data-card]')!

describe('the placeholder on the template canvas (#802)', () => {
  it('says a picture with none chosen has none, in a word on the canvas and the whole sentence in its name', () => {
    render(<Desk doc={deck(picture('image-1', { literal: '' }))} />)
    const tag = tagOn('image-1')!
    expect(tag.lastElementChild!.textContent).toBe('Ingen bild vald')
    expect(tag.title).toBe('Ingen bild vald — välj en i spelets bilder.')
    expect(screen.getByRole('img', { name: 'Ingen bild vald — välj en i spelets bilder.' })).toBe(tag)
    // The layer says it too, to whoever meets the layer rather than the tag.
    expect(box('image-1').getAttribute('aria-describedby')).toBe(tag.id)
  })

  it('says a row of icons with no names has none, in its short form on a row too thin for the long one', () => {
    render(<Desk doc={deck(row('icons-1', { literal: '' }))} />)
    const tag = tagOn('icons-1')!
    expect(tag.lastElementChild!.textContent).toBe('Inga ikoner')
    expect(tag.title).toBe('Inga ikoner ännu — välj en ikon, eller ett fält där korten skriver {namn}.')
    expect(box('icons-1').closest('[data-drag-layer]')).not.toBeNull()
  })

  it('says a picture bound to a column of words that the column is words, and the card draws the cell empty', () => {
    render(<Desk doc={deck(picture('image-2', { field: 'typ' }, { w: 40, h: 30 }))} />)
    expect(wordOn('image-2')).toBe('«typ» är text, inte bilder')
    expect(tagOn('image-2')!.title).toBe('«typ» är text, inte bilder — välj en bildkolumn eller en fast bild.')
    // No broken picture: the one compiler draws a cell of words as an empty cell.
    expect(card().querySelector('[data-element="image-2"]')!.innerHTML).toBe('')
  })

  it('says a column that is empty on the card shown is empty there, and nothing on a card where it holds a picture', () => {
    const doc = deck(picture('art', { field: 'bild' }), row('marks', { field: 'symboler' }))
    const { unmount } = render(<Desk doc={doc} card="knight" />)
    expect(wordOn('art')).toBe('«bild» är tom på det här kortet')
    expect(wordOn('marks')).toBe('«symboler» tom')
    expect(tagOn('marks')!.title).toBe('«symboler» är tom på det här kortet — skriv {namn} i kolumnen.')
    unmount()

    render(<Desk doc={doc} card="dragon" />)
    expect(tagOn('art')).toBeNull()
    expect(box('art').hasAttribute('aria-describedby')).toBe(false)
    expect(card().querySelector('[data-element="art"] img')?.getAttribute('src')).toBe(`${BASE}/assets/${SKOG}`)
  })

  it('never reaches the card the compiler draws', () => {
    render(<Desk doc={deck(picture('image-1', { literal: '' }), picture('image-2', { field: 'typ' }, { x: 33 }), row('icons-1', { literal: '' }))} />)
    expect(document.querySelectorAll('.byd-placeholder')).toHaveLength(3)
    expect(card().querySelector('.byd-placeholder')).toBeNull()
    expect(card().textContent).not.toMatch(/bild vald|ikoner|är text/)
  })
})
