// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { TemplateCanvas } from '../src/editor/TemplateCanvas.js'
import { projectDoc } from './project-doc.js'
import type { Element, ProjectDoc } from '../src/editor/types.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

type Shape = Extract<Element, { kind: 'shape' }>

// The fixture's front carries `frame`, a 61 × 86 rounded rectangle. Every test here selects it
// and reads the property panel, which is where a shape is given its outline (L17).
function open(over: Partial<Shape> = {}, opts: { face?: string } = {}) {
  const doc: ProjectDoc = projectDoc()
  const front = doc.template.faces['front']!
  doc.template.faces['front'] = { ...front, base: front.base.map((e) => (e.id === 'frame' ? ({ ...e, ...over } as Element) : e)) }
  const onPatch = vi.fn()
  const onReplaceFace = vi.fn()
  render(
    <TemplateCanvas
      doc={doc}
      face={opts.face ?? 'front'}
      row="dragon"
      selectedElement="frame"
      onSelectElement={vi.fn()}
      onPatch={onPatch} onCallOff={vi.fn()}
      onReplaceFace={onReplaceFace}
      onRemove={vi.fn()}
      onAdd={vi.fn()}
      onPlaceIcon={vi.fn()}
      onReorder={vi.fn()}
      onLock={vi.fn()}
      onRename={vi.fn()}
      onSelectFace={vi.fn()}
      group={null}
      onSelectGroup={vi.fn()}
      onGroupColumn={vi.fn()}
      onAddField={vi.fn()}
      onReset={vi.fn()}
      onFontFile={async () => 'Typsnitt'}
      onFontLicence={vi.fn()}
      onRemoveFont={vi.fn()}
    />,
  )
  return { onPatch, onReplaceFace }
}

const patched = (onPatch: ReturnType<typeof vi.fn>) => onPatch.mock.calls.at(-1)?.[1] as Partial<Shape>

describe('the shape gallery (L17)', () => {
  it('gives a shape its whole outline in one press, parameters and all', () => {
    const { onPatch } = open()
    fireEvent.click(screen.getByRole('button', { name: 'Sexhörning' }))
    expect(patched(onPatch)).toMatchObject({ shape: 'polygon', corners: 6, rotationDeg: 0 })

    fireEvent.click(screen.getByRole('button', { name: 'Stjärna' }))
    expect(patched(onPatch)).toMatchObject({ shape: 'star', corners: 5 })
    expect(patched(onPatch).innerRatio).toBeGreaterThan(0)
  })

  // Two entries that draw the same picture would be two buttons nobody can tell apart, so the
  // turned four-cornered polygon is its own entry and not a rediscovery the designer has to make.
  it('offers the same corner count at two turns as two entries', () => {
    const { onPatch } = open()
    fireEvent.click(screen.getByRole('button', { name: 'Romb' }))
    expect(patched(onPatch)).toMatchObject({ shape: 'polygon', corners: 4, rotationDeg: 0 })
    fireEvent.click(screen.getByRole('button', { name: 'Kvadrat' }))
    expect(patched(onPatch)).toMatchObject({ shape: 'polygon', corners: 4, rotationDeg: 45 })
  })

  // A rectangle that was rounded and is chosen again as a rectangle must come back square: the
  // gallery says what a shape is, and a leftover radius would make the entry a lie.
  it('squares the corners again when the plain rectangle is chosen', () => {
    const { onPatch } = open({ shape: 'rect', radiusMm: 4 })
    fireEvent.click(screen.getByRole('button', { name: 'Rektangel' }))
    expect(patched(onPatch)).toMatchObject({ shape: 'rect', radiusMm: 0 })
  })

  // A capsule is not a shape of its own: it is a radius bigger than the box, written out in the
  // box's own measurements so the document says a number rather than a magic word.
  it('writes a capsule as half the short side of the box it is in', () => {
    const { onPatch } = open()
    fireEvent.click(screen.getByRole('button', { name: 'Kapsel' }))
    expect(patched(onPatch)).toMatchObject({ shape: 'rect', radiusMm: 30.5 })
  })

  it('says which entry the shape already is', () => {
    open({ shape: 'polygon', corners: 6, rotationDeg: 30 })
    expect(screen.getByRole('button', { name: 'Sexhörning, platt' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Sexhörning' }).getAttribute('aria-pressed')).toBe('false')
  })
})

describe('the numbers a shape reads (L17)', () => {
  it('offers a rectangle its radius and nothing about corners', () => {
    open({ shape: 'rect', radiusMm: 3 })
    expect((screen.getByLabelText(/hörnradie/i) as HTMLInputElement).value).toBe('3')
    expect(screen.queryByLabelText(/^hörn$/i)).toBeNull()
    expect(screen.queryByLabelText(/vridning/i)).toBeNull()
  })

  it('offers a polygon its corner count and its turn, and a star its depth as well', () => {
    const { onPatch } = open({ shape: 'polygon', corners: 6, rotationDeg: 0 })
    expect((screen.getByLabelText(/^hörn$/i) as HTMLInputElement).value).toBe('6')
    expect(screen.queryByLabelText(/hörnradie/i)).toBeNull()
    expect(screen.queryByLabelText(/uddjup/i)).toBeNull()
    fireEvent.change(screen.getByLabelText(/^hörn$/i), { target: { value: '8' } })
    expect(patched(onPatch)).toEqual({ corners: 8 })
  })

  it('offers a star how deep its valleys cut', () => {
    const { onPatch } = open({ shape: 'star', corners: 5, innerRatio: 0.45 })
    const depth = screen.getByLabelText(/uddjup/i) as HTMLInputElement
    fireEvent.change(depth, { target: { value: '30' } })
    expect(patched(onPatch)).toEqual({ innerRatio: 0.3 })
  })

  // A line has no inside, so a fill on it is a colour the designer can neither see nor click.
  it('offers a line no fill at all', () => {
    open({ shape: 'line' })
    expect(screen.queryByLabelText(/^fyllning$/i)).toBeNull()
    expect(screen.getByLabelText(/linjefärg/i)).toBeTruthy()
  })
})

describe('a pattern over the fill (L17)', () => {
  it('is a switch, and starts from a tile the designer can see at once', () => {
    const { onPatch } = open({ shape: 'rect', fill: '#2f4068' })
    fireEvent.click(screen.getByLabelText(/mönster över/i))
    const pattern = patched(onPatch).pattern
    expect(pattern?.kind).toBeTruthy()
    expect(pattern?.scaleMm).toBeGreaterThan(0)
  })

  it('offers the five tiles, the ink, the size and the turn', () => {
    const { onPatch } = open({ shape: 'rect', fill: '#2f4068', pattern: { kind: 'diamonds', color: '#3a4d7a', scaleMm: 7 } })
    fireEvent.click(screen.getByRole('button', { name: 'Ränder' }))
    expect(patched(onPatch).pattern).toMatchObject({ kind: 'stripes', color: '#3a4d7a', scaleMm: 7 })
    fireEvent.change(screen.getByLabelText(/mönstrets storlek/i), { target: { value: '4' } })
    expect(patched(onPatch).pattern).toMatchObject({ kind: 'diamonds', scaleMm: 4 })
    fireEvent.change(screen.getByLabelText(/mönstrets vinkel/i), { target: { value: '45' } })
    expect(patched(onPatch).pattern).toMatchObject({ angleDeg: 45 })
  })

  // Taking the pattern away has to be sayable on the wire: `undefined` does not survive JSON,
  // so the patch has to carry the property with nothing in it (L15's rule, applied again).
  it('takes the pattern away by naming it with nothing in it', () => {
    const { onPatch } = open({ shape: 'rect', pattern: { kind: 'dots', color: '#fff', scaleMm: 4 } })
    fireEvent.click(screen.getByLabelText(/mönster över/i))
    expect(patched(onPatch)).toHaveProperty('pattern', undefined)
  })
})

describe('a shadow under a shape (L17)', () => {
  it('is four presets, and says which one the shape wears', () => {
    const { onPatch } = open({ shape: 'rect' })
    expect(screen.getByRole('button', { name: 'Ingen' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Mjuk' }))
    const shadow = patched(onPatch).shadow
    expect(shadow).toMatchObject({ color: expect.any(String) })
    expect(shadow?.blurMm).toBeGreaterThan(0)
  })

  it('has no sliders until there is a shadow to move, and then five', () => {
    open({ shape: 'rect' })
    expect(screen.queryByRole('button', { name: /anpassa/i })).toBeNull()
  })

  it('opens the five sliders behind Anpassa, and each one writes its own number', () => {
    const { onPatch } = open({ shape: 'rect', shadow: { dxMm: 0, dyMm: 0.6, blurMm: 1.2, color: '#000000', opacity: 0.35 } })
    fireEvent.click(screen.getByRole('button', { name: /anpassa/i }))
    fireEvent.change(screen.getByLabelText(/mjukhet/i), { target: { value: '3' } })
    expect(patched(onPatch).shadow).toMatchObject({ blurMm: 3, dyMm: 0.6 })
    fireEvent.change(screen.getByLabelText(/genomskinlighet/i), { target: { value: '80' } })
    expect(patched(onPatch).shadow).toMatchObject({ opacity: 0.8 })
  })

  // The triangle is a picture of the state, and `aria-expanded` is the state. Drawn with CSS
  // `content` it became part of the button's name, and the button was read out as "▸ Anpassa" —
  // a reader hearing a shape read aloud instead of being told whether the thing is open.
  it('is called Anpassa and nothing else, whatever picture the triangle draws', () => {
    open({ shape: 'rect', shadow: { dxMm: 0, dyMm: 0.6, blurMm: 1.2, color: '#000000', opacity: 0.35 } })
    const adjust = screen.getByRole('button', { name: 'Anpassa' })
    expect(adjust.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(adjust)
    expect(screen.getByRole('button', { name: 'Anpassa' }).getAttribute('aria-expanded')).toBe('true')
  })

  it('takes the shadow away by naming it with nothing in it', () => {
    const { onPatch } = open({ shape: 'rect', shadow: { dxMm: 0, dyMm: 0.6, blurMm: 1.2, color: '#000000', opacity: 0.35 } })
    fireEvent.click(screen.getByRole('button', { name: 'Ingen' }))
    expect(patched(onPatch)).toHaveProperty('shadow', undefined)
  })
})

// The gallery stands in the open on the back, not behind a button: whoever lands on an empty
// back should see the way on without hunting for it.
describe('the ready-made backs (L17)', () => {
  it('stands beside the layers while the back is open, and nowhere on the front', () => {
    open({}, { face: 'back' })
    expect(screen.getByRole('group', { name: /färdiga baksidor/i })).toBeTruthy()
  })

  it('is not offered on the front, which has a deck to show and not a pattern', () => {
    open()
    expect(screen.queryByRole('group', { name: /färdiga baksidor/i })).toBeNull()
  })

  it('lays the whole back down in one go, as elements that can be taken apart afterwards', () => {
    const { onReplaceFace } = open({}, { face: 'back' })
    const gallery = screen.getByRole('group', { name: /färdiga baksidor/i })
    fireEvent.click(within(gallery).getByRole('button', { name: 'Romber' }))
    const base = onReplaceFace.mock.calls.at(-1)?.[0] as Element[]
    expect(base.length).toBeGreaterThan(1)
    expect(base.every((e) => e.kind === 'shape')).toBe(true)
    const bottom = base[0] as Shape
    expect(bottom.pattern?.kind).toBe('diamonds')
    // The bottom reaches into the bleed, or the knife leaves a white edge (E5).
    expect(bottom.x).toBeLessThan(0)
    expect(bottom.y).toBeLessThan(0)
  })
})

// The language boundary (A4), applied to a back the tool laid down: the ids are the document's
// and never move, and the word on each layer is the tool's suggestion in the designer's own
// language — which then becomes theirs to rename, exactly as a new field's label is.
describe('what the ready-made backs are called (A4, L17)', () => {
  it('gives every layer an id nobody has to read and a name in the reader’s language', () => {
    const { onReplaceFace } = open({}, { face: 'back' })
    fireEvent.click(within(screen.getByRole('group', { name: /färdiga baksidor/i })).getByRole('button', { name: 'Medaljong' }))
    const base = onReplaceFace.mock.calls.at(-1)?.[0] as Element[]
    // Ids are the document's and are written in the same language every other id in this
    // codebase is written in.
    expect(base.map((e) => e.id)).toEqual(['bottom', 'edge', 'medallion', 'star'])
    for (const id of base.map((e) => e.id)) expect(id).toMatch(/^[a-z][a-z0-9-]*$/)
    // And every one carries the word the designer will actually read in the layer list.
    expect(base.map((e) => e.name)).toEqual(['Botten', 'Kant', 'Medaljong', 'Stjärna'])
  })

  it('shows those names in the layer list once the back is laid down', () => {
    const doc: ProjectDoc = projectDoc()
    doc.template.faces['back'] = { base: [{ kind: 'shape', id: 'bottom', name: 'Botten', x: -3, y: -3, w: 69, h: 94, shape: 'rect', fill: '#2f4068' }], variants: {} }
    render(
      <TemplateCanvas
        doc={doc}
        face="back"
        row="dragon"
        selectedElement={null}
        onSelectElement={vi.fn()}
        onPatch={vi.fn()} onCallOff={vi.fn()}
        onReplaceFace={vi.fn()}
        onRemove={vi.fn()}
        onAdd={vi.fn()}
        onPlaceIcon={vi.fn()}
        onReorder={vi.fn()}
        onLock={vi.fn()}
        onRename={vi.fn()}
        onSelectFace={vi.fn()}
        group={null}
        onSelectGroup={vi.fn()}
        onGroupColumn={vi.fn()}
        onAddField={vi.fn()}
        onReset={vi.fn()}
        onFontFile={async () => 'Typsnitt'}
        onFontLicence={vi.fn()}
        onRemoveFont={vi.fn()}
      />,
    )
    expect(screen.getByText('Botten')).toBeTruthy()
  })
})

// A pattern the designer cannot see is a switch that looks broken. The tile starts in whichever
// of black and white stands out against the fill it is laid over — white on the pale default
// fill was invisible, which is the one thing the first press must never be.
describe('the tile a pattern starts as (L17)', () => {
  // A mount each, because two panels in one document are two switches under one name.
  it.each([
    ['#d9d2c4', '#000000'],
    ['#f4ead8', '#000000'],
    ['#2f4068', '#ffffff'],
    ['#111111', '#ffffff'],
  ])('lays dark ink on %s and gets %s', (fill, ink) => {
    const { onPatch } = open({ shape: 'rect', fill })
    fireEvent.click(screen.getByLabelText(/mönster över/i))
    expect(patched(onPatch).pattern?.color).toBe(ink)
  })

  // A shape with no fill at all shows the card's paper, which is light far more often than not.
  it('starts dark on a shape that has no fill to judge', () => {
    const { onPatch } = open({ shape: 'rect', fill: undefined })
    fireEvent.click(screen.getByLabelText(/mönster över/i))
    expect(patched(onPatch).pattern?.color).toBe('#000000')
  })
})
