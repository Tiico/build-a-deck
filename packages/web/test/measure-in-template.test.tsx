// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ProjectDoc } from '@byd/server'
import type { Motif } from '@byd/template'
import { TemplateCanvas, type TemplateCanvasProps } from '../src/editor/TemplateCanvas.js'
import { DeckWall } from '../src/editor/DeckWall.js'
import { projectDoc } from './project-doc.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// Half of «Bildernas mått» moves and half is retired (#221, L22, beslut 3). How large a drawing
// is drawn is a question about the frame, and the frame is the template's — so it stands in the
// image element, as a switch beside the other two. Where in its window the drawing stands was the
// template answering a question about the picture, and the picture answers that itself now.
//
// The wall kept the deck's side of it for a while — the files that could not answer and each
// card's own exception — until the picture carried its own crop and that side said nothing a
// designer needed (#607). The switch in the element is all there is of the measure now.

const HASH = 'a'.repeat(64)
const ART = `http://test.local/assets/${HASH}`
const roomy: Motif = { w: 200, h: 100, trim: { left: 60, top: 10, right: 60, bottom: 10 } }
const cropped: Motif = { w: 160, h: 120, trim: { left: 0, top: 0, right: 0, bottom: 0 } }

const deck = (frame?: { fill: number }): ProjectDoc => {
  const base = projectDoc()
  return {
    ...base,
    template: {
      faces: {
        ...base.template.faces,
        front: {
          base: [...base.template.faces['front']!.base, { kind: 'image', id: 'art', x: 5, y: 4, w: 40, h: 30, bind: { field: 'art' }, ...(frame ? { frame } : {}) }],
          variants: {},
        },
      },
    },
    rows: base.rows.map((r) => ({ ...r, fields: { ...r.fields, art: `asset:${HASH}` } })),
  }
}

function canvas(doc: ProjectDoc) {
  const props: TemplateCanvasProps = {
    doc,
    face: 'front',
    onSelectFace: vi.fn(),
    onReplaceFace: vi.fn(),
    group: null,
    onSelectGroup: vi.fn(),
    onGroupColumn: vi.fn(),
    onAddField: vi.fn(),
    onReset: vi.fn(),
    row: 'dragon',
    selectedElement: 'art',
    onSelectElement: vi.fn(),
    onPatch: vi.fn(),
    onCallOff: vi.fn(),
    onRemove: vi.fn(),
    onAdd: vi.fn(),
    onPlaceIcon: vi.fn(),
    onReorder: vi.fn(),
    onLock: vi.fn(),
    onRename: vi.fn(),
    onFontFile: async () => 'Typsnitt',
    onFontLicence: vi.fn(),
    onRemoveFont: vi.fn(),
    onCatalogFont: vi.fn(async () => undefined),
  }
  render(<TemplateCanvas {...props} />)
  return props
}

const wall = (doc: ProjectDoc, motifs: Record<string, Motif> = { [ART]: roomy }) =>
  render(<DeckWall doc={doc} face="front" selectedRow={null} onSelectRow={() => undefined} onSelectElement={() => undefined} assetBase="http://test.local" motifs={motifs} />)

describe('the measure, in the element that owns the frame (#221)', () => {
  it('switches it on for the picture area, and takes it off again', () => {
    const { onPatch } = canvas(deck())
    const box = screen.getByLabelText('Alla motiv lika stora i sin ruta') as HTMLInputElement

    expect(box.checked).toBe(false)
    fireEvent.click(box)
    expect(onPatch).toHaveBeenCalledWith('art', { frame: { fill: 0.8 } }, undefined)
  })

  it('reads on for a picture area that already carries one, and keeps what it says', () => {
    const { onPatch } = canvas(deck({ fill: 0.55 }))
    const box = screen.getByLabelText('Alla motiv lika stora i sin ruta') as HTMLInputElement

    expect(box.checked).toBe(true)
    fireEvent.click(box)
    expect(onPatch).toHaveBeenCalledWith('art', { frame: undefined }, undefined)
  })
})

describe('the wall says nothing about the measure (#607)', () => {
  it('draws no panel for it, even where every file is cropped too hard to answer it', () => {
    wall(deck({ fill: 0.8 }), { [ART]: cropped })

    expect(screen.queryByRole('group', { name: 'Bildernas mått' })).toBeNull()
    expect(screen.queryByRole('list', { name: 'Bilder som inte kan svara' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Öppna källan/ })).toBeNull()
  })
})
