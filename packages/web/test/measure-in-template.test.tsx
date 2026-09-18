// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
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
// What stays on the wall is the deck's side of the measure: the files that cannot answer it, and
// each card's own exception. Those are about the whole deck at once, which is what a wall is.

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
  }
  render(<TemplateCanvas {...props} />)
  return props
}

const wall = (doc: ProjectDoc, motifs: Record<string, Motif> = { [ART]: roomy }) => {
  const onFraming = vi.fn()
  render(
    <DeckWall doc={doc} face="front" selectedRow={null} onSelectRow={() => undefined} onSelectElement={() => undefined} assetBase="http://test.local" motifs={motifs} onFraming={onFraming} />,
  )
  return { onFraming }
}

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

describe('what the wall keeps of the measure (#221)', () => {
  it('no longer sets the measure there, neither its size nor a ground line', () => {
    wall(deck({ fill: 0.8 }))
    const panel = screen.getByRole('group', { name: 'Bildernas mått' })

    expect(within(panel).queryByLabelText(/Motivets höjd/)).toBeNull()
    expect(within(panel).queryByRole('button', { name: 'På en gemensam marklinje' })).toBeNull()
    expect(within(panel).queryByRole('button', { name: 'Centrerat' })).toBeNull()
    expect(within(panel).queryByRole('button', { name: 'Jämna ut bilderna' })).toBeNull()
  })

  it('says nothing at all where the template has given no measure', () => {
    wall(deck())

    expect(screen.queryByRole('group', { name: 'Bildernas mått' })).toBeNull()
  })

  it('still lists the files that cannot answer, and still writes one card’s exception', () => {
    const { onFraming } = wall(deck({ fill: 0.8 }), { [ART]: cropped })
    const list = screen.getByRole('list', { name: 'Bilder som inte kan svara' })

    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
    fireEvent.click(within(list).getAllByRole('button', { name: /Rita motivet/ })[0]!)
    expect(onFraming).toHaveBeenCalledWith('dragon', 'art', { zoom: 1.25 })
  })
})
