// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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
      onRemoveFont={vi.fn()} onCatalogFont={vi.fn(async () => undefined)}
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
    expect((screen.getByRole('spinbutton', { name: /hörnradie/i }) as HTMLInputElement).value).toBe('3')
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
    const depth = screen.getByRole('spinbutton', { name: /uddjup/i }) as HTMLInputElement
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

// One transparency for the whole shape (#317), so a pane can be laid over a picture without the
// designer going round by rgba in the colour field. It stands with the other numbers a shape
// reads, in per cent, because that is the unit the value is thought in and 0.35 is not.
describe('how see-through a shape is (L17, #317)', () => {
  const opacity = () => screen.getByRole('spinbutton', { name: /opacitet/i }) as HTMLInputElement

  it('stands at whole on a shape that says nothing about it, and writes a share of one', () => {
    const { onPatch } = open({ shape: 'rect' })
    expect(opacity().value).toBe('100')
    fireEvent.change(opacity(), { target: { value: '50' } })
    expect(patched(onPatch)).toEqual({ opacity: 0.5 })
  })

  it('shows the share the shape already carries, in per cent', () => {
    open({ shape: 'rect', opacity: 0.35 })
    expect(opacity().value).toBe('35')
  })

  // Keyboard and drag both, which is what the panel's one number control is since L25: the same
  // field answers an arrow key, and the grip beside it answers a pulled pointer. It was a slider,
  // which took a row of its own in a 280 px column and could not be typed into at all.
  it('runs from none to whole, and the keyboard reaches it as the pointer does', () => {
    open({ shape: 'rect' })
    expect(opacity().type).toBe('number')
    expect(opacity().min).toBe('0')
    expect(opacity().max).toBe('100')
    expect(screen.getByRole('button', { name: 'Opacitet (%), dra för att ändra' })).toBeTruthy()
  })

  // A drag is one undo and not forty (L14). The gesture opens when the control is entered and
  // every step of that drag is pushed under the same token, so the history holds one entry.
  it('is one entry in the history per gesture, however many steps the drag has', () => {
    const { onPatch } = open({ shape: 'rect' })
    fireEvent.focus(opacity())
    fireEvent.change(opacity(), { target: { value: '80' } })
    fireEvent.change(opacity(), { target: { value: '60' } })
    const [first, second] = onPatch.mock.calls.slice(-2).map((call) => call[2] as string)
    expect(first).toBeTruthy()
    expect(second).toBe(first)
    // And a second visit is a second entry, or the whole drag would fold into the one before it.
    fireEvent.focus(opacity())
    fireEvent.change(opacity(), { target: { value: '40' } })
    expect(onPatch.mock.calls.at(-1)?.[2]).not.toBe(first)
  })

  // A line has no inside and is offered no fill, but it is ink all the same: a faint rule is
  // exactly what a designer reaches for, so the transparency is not taken away with the fill.
  it('is offered on a line too, which has ink even though it has no inside', () => {
    open({ shape: 'line' })
    expect(opacity()).toBeTruthy()
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
    fireEvent.change(screen.getByRole('spinbutton', { name: /mönstrets storlek/i }), { target: { value: '4' } })
    expect(patched(onPatch).pattern).toMatchObject({ kind: 'diamonds', scaleMm: 4 })
    fireEvent.change(screen.getByRole('spinbutton', { name: /mönstrets vinkel/i }), { target: { value: '45' } })
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

  it('has no numbers to move until there is a shadow to move them on', () => {
    open({ shape: 'rect' })
    expect(screen.queryByRole('button', { name: /anpassa/i })).toBeNull()
  })

  it('opens the five numbers behind Anpassa, and each one writes its own', () => {
    const { onPatch } = open({ shape: 'rect', shadow: { dxMm: 0, dyMm: 0.6, blurMm: 1.2, color: '#000000', opacity: 0.35 } })
    fireEvent.click(screen.getByRole('button', { name: /anpassa/i }))
    fireEvent.change(screen.getByRole('spinbutton', { name: /mjukhet/i }), { target: { value: '3' } })
    expect(patched(onPatch).shadow).toMatchObject({ blurMm: 3, dyMm: 0.6 })
    fireEvent.change(screen.getByRole('spinbutton', { name: /genomskinlighet/i }), { target: { value: '80' } })
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
        onRemoveFont={vi.fn()} onCatalogFont={vi.fn(async () => undefined)}
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

// The one-way door into a shape of the designer's own (L26, #309). The gallery is parametric —
// a corner count and a turn — and a banner she wants a longer tail on is neither, so the panel
// offers to write the outline out as the points it already consists of.
describe('«Anpassa punkterna» (L26)', () => {
  const door = () => screen.queryByRole('button', { name: 'Anpassa punkterna' })

  // Nothing about the card changes on the way through: the frame's own outline comes back as
  // the four corners it already had, and the designer has nothing to undo before she can shape it.
  it('writes the shape out as the points it already consists of', () => {
    const { onPatch } = open({ shape: 'rect', radiusMm: 0 })
    fireEvent.click(door()!)
    expect(patched(onPatch).points).toEqual([{ x: 0, y: 0 }, { x: 61, y: 0 }, { x: 61, y: 86 }, { x: 0, y: 86 }])
  })

  // An outline drawn with an arc or a curve does not consist of points, so the door is not there
  // at all rather than there and quietly redrawing the card.
  it('is not offered on an outline that is not a point list', () => {
    open({ shape: 'circle' })
    expect(door()).toBeNull()
  })

  // And it is a one-way door: once the shape is her own, there is nothing left to walk through.
  // The way back is the gallery, which stands where it always did.
  it('is gone once the shape is already her own', () => {
    open({ shape: 'rect', points: [{ x: 0, y: 0 }, { x: 61, y: 0 }, { x: 30, y: 86 }] })
    expect(door()).toBeNull()
  })
})

// The two ways back out of a curve (L38, #327). They are named commands and live where every
// other named command about a shape lives — in the panel, beside the door the point list came
// through — and «Räta ut punkten» is about the point the designer is standing on.
describe('«Räta ut punkten» och «Räta ut alla» (L38)', () => {
  const bent = [{ x: 0, y: 0 }, { x: 61, y: 0 }, { x: 30, y: 86, in: { dx: -6, dy: -4 }, out: { dx: 6, dy: 4 } }]
  const one = () => screen.queryByRole('button', { name: 'Räta ut punkten' })
  const all = () => screen.queryByRole('button', { name: 'Räta ut alla' })
  const stand = (index: number) => act(() => (document.querySelector(`[data-point="${index}"]`) as HTMLElement).focus())

  // A command that would change nothing reads as a control that is broken: an outline with no
  // curve in it is offered neither.
  it('is offered on a curved outline and on no other', () => {
    open({ shape: 'rect', points: [{ x: 0, y: 0 }, { x: 61, y: 0 }, { x: 30, y: 86 }] })
    expect(all()).toBeNull()
    cleanup()
    open({ shape: 'rect', points: bent })
    expect(all()).toBeTruthy()
  })

  // The point is the one the keyboard or the hand is standing on, and a corner has nothing to
  // straighten — so the command waits until the designer is on a point that does.
  it('straightens the point the designer stands on, and waits for one that carries a curve', () => {
    const { onPatch } = open({ shape: 'rect', points: bent })
    expect(one()).toBeNull()
    stand(0)
    expect(one()).toBeNull()
    stand(2)
    fireEvent.click(one()!)
    expect(patched(onPatch).points).toEqual([{ x: 0, y: 0 }, { x: 61, y: 0 }, { x: 30, y: 86 }])
  })

  // «Räta ut alla» gives the outline back as the polygon L26 wrote — which is exactly a point
  // list with no handle left in it.
  it('gives the whole shape back as a polygon', () => {
    const { onPatch } = open({ shape: 'rect', points: bent })
    fireEvent.click(all()!)
    expect(patched(onPatch).points).toEqual([{ x: 0, y: 0 }, { x: 61, y: 0 }, { x: 30, y: 86 }])
  })
})

// The numbers below the gallery are the parametric core (L17): a corner count, a turn, a valley
// depth. None of them describes an outline the designer drew herself, and a control that reads
// a property nothing draws any more is a control that looks broken.
describe('the parametric numbers step aside for a shape of the designer own (L26)', () => {
  it('shows the corner count on a polygon and hides it once the points are hers', () => {
    open({ shape: 'polygon', corners: 6 })
    expect(screen.queryByLabelText('Hörn')).toBeTruthy()
    cleanup()
    open({ shape: 'polygon', corners: 6, points: [{ x: 0, y: 0 }, { x: 61, y: 0 }, { x: 30, y: 86 }] })
    expect(screen.queryByLabelText('Hörn')).toBeNull()
    expect(screen.queryByLabelText('Vridning')).toBeNull()
  })

  // The line, the transparency, the fill, the pattern and the shadow are about ink and not about
  // the outline, so every one of them goes on meaning what it meant.
  it('keeps everything that is about ink rather than about the outline', () => {
    open({ shape: 'polygon', corners: 6, points: [{ x: 0, y: 0 }, { x: 61, y: 0 }, { x: 30, y: 86 }] })
    expect(screen.queryByLabelText('Linjebredd (mm)')).toBeTruthy()
    expect(screen.queryByLabelText(/mönster över/i)).toBeTruthy()
  })
})
