// @vitest-environment jsdom
// A shape of the designer's own, under the hand and under the keyboard (L26, #309). Variant C:
// every point is a mark she can take hold of, every edge carries a hollow mid-dot that becomes a
// real point when it is dragged out, and the fill still moves the whole element — «ytan flyttar,
// punkten formar». The hit order is the part that is not negotiable: the point lies above the
// edge and above the fill, and the edge answers to a press up to 2,4 mm away.
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { TemplateCanvas } from '../src/editor/TemplateCanvas.js'
import { StatusLive } from '../src/status/StatusLive.js'
import { projectDoc } from './project-doc.js'
import type { Element, ProjectDoc } from '../src/editor/types.js'
import { drag, laidOut, target } from './drag.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

import type { Point } from '../src/editor/points.js'

type Shape = Extract<Element, { kind: 'shape' }>

// The fixture's `frame` is a 61 × 86 rectangle at 1, 1. Written out as its own points it is the
// four corners of its box, which is what the door «Anpassa punkterna» leaves behind.
const CORNERS: Point[] = [{ x: 0, y: 0 }, { x: 61, y: 0 }, { x: 61, y: 86 }, { x: 0, y: 86 }]
// jsdom lays nothing out, so the drag helper is told how many pixels a millimetre is.
const PX = 6

function open(points: Point[] = CORNERS) {
  const doc: ProjectDoc = projectDoc()
  const front = doc.template.faces['front']!
  doc.template.faces['front'] = { ...front, base: front.base.map((e) => (e.id === 'frame' ? ({ ...e, shape: 'rect', radiusMm: 0, points } as Element) : e)) }
  const onPatch = vi.fn()
  render(
    <StatusLive>
    <TemplateCanvas
      doc={doc}
      face="front"
      row="dragon"
      selectedElement="frame"
      onSelectElement={vi.fn()}
      onPatch={onPatch}
      onCallOff={vi.fn()}
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
    />
    </StatusLive>,
  )
  laidOut(PX)
  return { onPatch }
}

const pointMarks = () => [...document.querySelectorAll('[data-point]')] as HTMLElement[]
const midMarks = () => [...document.querySelectorAll('[data-mid]')] as HTMLElement[]
const lastPoints = (onPatch: ReturnType<typeof vi.fn>) => (onPatch.mock.calls.at(-1)?.[1] as Partial<Shape>).points
const tokens = (onPatch: ReturnType<typeof vi.fn>) => new Set(onPatch.mock.calls.map((c) => c[2]))

describe('the marks a shape of the designer own wears (L26)', () => {
  it('draws one mark per point and one hollow mid-dot per edge, the closing one included', () => {
    open()
    expect(pointMarks()).toHaveLength(4)
    expect(midMarks()).toHaveLength(4)
  })

  // Fourteen marks on a banner of 45 × 20 mm is the acknowledged price (L26), and the mid-dots
  // are drawn at half the strength of the points so they read as «here, but not a point».
  it('marks the mid-dots as the weaker of the two', () => {
    open()
    for (const mid of midMarks()) expect(mid.dataset['weak']).toBe('')
    for (const point of pointMarks()) expect(point.dataset['weak']).toBeUndefined()
  })
})

describe('the hand on the points (L26)', () => {
  it('moves the point it took hold of and leaves the others where they are', () => {
    const { onPatch } = open()
    drag(pointMarks()[1]!, [61 * PX, 1 * PX], [51 * PX, 11 * PX])
    expect(lastPoints(onPatch)).toEqual([{ x: 0, y: 0 }, { x: 51, y: 10 }, { x: 61, y: 86 }, { x: 0, y: 86 }])
  })

  // One gesture is one step back (L14): a pull is a patch per frame of the pointer, and every
  // one of them carries the token the grab began with.
  it('makes one history entry of a whole pull, and the next pull the next one', () => {
    const { onPatch } = open()
    const mark = pointMarks()[1]!
    fireEvent.pointerDown(mark, { pointerId: 1, button: 0, clientX: 61 * PX, clientY: 1 * PX })
    fireEvent.pointerMove(mark, { pointerId: 1, clientX: 57 * PX, clientY: 5 * PX })
    fireEvent.pointerMove(mark, { pointerId: 1, clientX: 51 * PX, clientY: 11 * PX })
    fireEvent.pointerUp(mark, { pointerId: 1 })
    expect(tokens(onPatch).size).toBe(1)
    drag(mark, [51 * PX, 11 * PX], [41 * PX, 21 * PX])
    expect(tokens(onPatch).size).toBe(2)
  })

  // Two gestures on one mark (L38): a drag from the mid-dot bends the side it lies on, and the
  // dot is neither moved nor taken away. The middle of the side follows the pointer, so the arms
  // are four thirds of how far it was pulled — and the outline still has the four points it had.
  it('bends the side when the mid-dot is dragged, and adds no point', () => {
    const { onPatch } = open()
    drag(midMarks()[0]!, [30.5 * PX, 1 * PX], [30.5 * PX, 6 * PX])
    const points = lastPoints(onPatch)
    expect(points).toHaveLength(4)
    expect(points?.[0]?.out).toEqual({ dx: 0, dy: 6.7 })
    expect(points?.[1]?.in).toEqual({ dx: 0, dy: 6.7 })
    expect(tokens(onPatch).size).toBe(1)
  })

  // Four device pixels, and nothing is decided until they are passed (L38): a hand resting on a
  // trackpad always moves some pixel, and the shaky press is the click it was meant to be.
  it('adds the point the click adds when the hand only shook three pixels', () => {
    const { onPatch } = open()
    const mid = midMarks()[0]!
    fireEvent.pointerDown(mid, { pointerId: 1, button: 0, clientX: 30.5 * PX, clientY: 1 * PX })
    fireEvent.pointerMove(mid, { pointerId: 1, clientX: 30.5 * PX + 3, clientY: 1 * PX })
    fireEvent.pointerUp(mid, { pointerId: 1 })
    fireEvent.click(mid)
    expect(onPatch).toHaveBeenCalledTimes(1)
    expect(lastPoints(onPatch)).toHaveLength(5)
  })

  // The browser fires a click of its own after a drag that began and ended on the same button,
  // and the mid-dot is a button — so a bend arrived as a drag *and* a click, and the outline got
  // a point where the designer drew a curve. The click is the way in for the hand without a
  // pointer (L24) and stays; what it must not do is fire on the tail of a drag.
  it('bends once and adds nothing when the browser own click follows the drag', () => {
    const { onPatch } = open()
    drag(midMarks()[0]!, [30.5 * PX, 1 * PX], [30.5 * PX, 6 * PX])
    fireEvent.click(midMarks()[0]!)
    expect(lastPoints(onPatch)).toHaveLength(4)
    expect(tokens(onPatch).size).toBe(1)
  })

  // A mid-dot pressed and let go without being pulled anywhere added a point on top of the edge
  // it already lay on: a click is a grab that went nowhere, here as everywhere else on the canvas.
  it('adds nothing when a mid-dot is pressed and let go where it stood', () => {
    const { onPatch } = open()
    drag(midMarks()[0]!, [30.5 * PX, 1 * PX], [30.5 * PX, 1 * PX])
    expect(onPatch).not.toHaveBeenCalled()
  })
})

describe('the surface moves and the point shapes (L26)', () => {
  // Dragging the fill drags the element, exactly as it does for every other element on the card.
  it('moves the whole element when the fill is dragged', () => {
    const { onPatch } = open()
    drag(target('frame')!, [30 * PX, 40 * PX], [35 * PX, 45 * PX])
    const patch = onPatch.mock.calls.at(-1)?.[1] as Partial<Shape>
    expect(patch).toMatchObject({ x: 6, y: 6 })
    expect(patch.points).toBeUndefined()
  })

  // The edge is a hit area wider than it looks: ±1,5 mm was measured in the prototype and a
  // click aimed at the middle of the edge missed it. A press within 2,4 mm of the edge is about
  // the edge — and since L38 what a pull on it does is bend it: «det man tar i är det som
  // ändras», and a curve is a property of the side and not of either point. The one way to add
  // a point is the mid-dot the side already carries.
  it('bends the edge from a press on it rather than moving the element', () => {
    const { onPatch } = open()
    // 2 mm inside the left edge, a third of the way down: within reach of the edge, and nowhere
    // near a point or a mid-dot.
    drag(target('frame')!, [(1 + 2) * PX, (1 + 30) * PX], [(1 + 8) * PX, (1 + 30) * PX])
    const points = lastPoints(onPatch)
    expect(points).toHaveLength(4)
    // The closing side, from the last point back to the first: pulled 6 mm sideways, so its two
    // arms are four thirds of that.
    expect(points?.[3]?.out).toEqual({ dx: 8, dy: 0 })
    expect(points?.[0]?.in).toEqual({ dx: 8, dy: 0 })
  })
})

describe('the keyboard on the points (L26)', () => {
  it('reaches every point and every mid-dot by name, in the order the outline walks', () => {
    open()
    expect(pointMarks().map((m) => m.getAttribute('aria-label'))).toEqual(['Punkt 1 av 4', 'Punkt 2 av 4', 'Punkt 3 av 4', 'Punkt 4 av 4'])
    expect(midMarks()[0]?.getAttribute('aria-label')).toBe('Lägg till en punkt på kant 1')
  })

  // Half a millimetre, and five with shift — the two steps every other nudge on the canvas has.
  it('nudges the point the keyboard stands on, and five millimetres with shift', () => {
    const { onPatch } = open()
    fireEvent.keyDown(pointMarks()[0]!, { key: 'ArrowRight' })
    expect(lastPoints(onPatch)?.[0]).toEqual({ x: 0.5, y: 0 })
    fireEvent.keyDown(pointMarks()[0]!, { key: 'ArrowDown', shiftKey: true })
    expect(lastPoints(onPatch)?.[0]).toEqual({ x: 0, y: 5 })
  })

  it('adds a point from the mid-dot the keyboard stands on', () => {
    const { onPatch } = open()
    fireEvent.click(midMarks()[0]!)
    expect(lastPoints(onPatch)).toEqual([{ x: 0, y: 0 }, { x: 30.5, y: 0 }, { x: 61, y: 0 }, { x: 61, y: 86 }, { x: 0, y: 86 }])
  })

  it('takes the point away with Delete and moves the focus to its neighbour', () => {
    const { onPatch } = open()
    pointMarks()[1]!.focus()
    fireEvent.keyDown(pointMarks()[1]!, { key: 'Delete' })
    expect(lastPoints(onPatch)).toEqual([{ x: 0, y: 0 }, { x: 61, y: 86 }, { x: 0, y: 86 }])
    expect(document.activeElement).toBe(pointMarks()[1])
  })

  // Two points are a line and not a shape (L26), so the third one cannot be given up — and the
  // refusal is said rather than swallowed.
  it('refuses to take a point away when three are all that is left', () => {
    const { onPatch } = open([{ x: 0, y: 0 }, { x: 61, y: 0 }, { x: 30, y: 86 }])
    fireEvent.keyDown(pointMarks()[1]!, { key: 'Delete' })
    expect(onPatch).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toMatch(/tre punkter/i)
  })
})

// The handles a curve hangs on (L38, #327). They exist for one point at a time — the one the
// designer is standing on — so the canvas carries two more marks and not two per point.
const BENT: Point[] = [
  { x: 0, y: 0 },
  { x: 61, y: 0 },
  { x: 61, y: 86 },
  { x: 0, y: 86 },
  { x: 12, y: 43, in: { dx: -6, dy: -4 }, out: { dx: 6, dy: 4 } },
]
// Standing on a point is what brings its handles out, under the keyboard as under the hand.
const stand = (index: number) => act(() => pointMarks()[index]!.focus())
const handleMarks = () => [...document.querySelectorAll('[data-arm]')] as HTMLElement[]
const handleMark = (arm: 'in' | 'out') => document.querySelector(`[data-arm="${arm}"]`) as HTMLElement

describe('the handles of the point the designer stands on (L38)', () => {
  // A handle appears once the curve exists, and for one point at a time: a point that is still
  // a corner shows nothing, so the canvas stays as quiet as L26 left it.
  it('shows the two handles of the chosen point and none of any other', () => {
    open(BENT)
    expect(handleMarks()).toHaveLength(0)
    stand(4)
    expect(handleMarks().map((m) => m.getAttribute('aria-label'))).toEqual(['Inhandtag för punkt 5', 'Uthandtag för punkt 5'])
    stand(0)
    expect(handleMarks()).toHaveLength(0)
  })

  // The hand on the handle: mirroring is the default, so the opposite arm follows equally far
  // the other way and the curve runs evenly through the point.
  it('pulls the handle and carries the opposite one with it', () => {
    const { onPatch } = open(BENT)
    stand(4)
    drag(handleMark('out'), [18 * PX, 47 * PX], [22 * PX, 47 * PX])
    expect(lastPoints(onPatch)?.[4]).toMatchObject({ out: { dx: 10, dy: 4 }, in: { dx: -10, dy: -4 } })
    expect(tokens(onPatch).size).toBe(1)
  })

  // Alt during the drag breaks the mirroring for that handle only.
  it('leaves the opposite handle where it was when Alt is held', () => {
    const { onPatch } = open(BENT)
    stand(4)
    const handle = handleMark('out')
    fireEvent.pointerDown(handle, { pointerId: 1, button: 0, clientX: 18 * PX, clientY: 47 * PX })
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 22 * PX, clientY: 47 * PX, altKey: true })
    fireEvent.pointerUp(handle, { pointerId: 1 })
    expect(lastPoints(onPatch)?.[4]).toMatchObject({ out: { dx: 10, dy: 4 }, in: { dx: -6, dy: -4 } })
  })

  // The keyboard on a handle: L26's own two steps, and the mirroring holds there too.
  it('nudges the handle half a millimetre, and five with shift', () => {
    const { onPatch } = open(BENT)
    stand(4)
    fireEvent.keyDown(handleMark('out'), { key: 'ArrowRight' })
    expect(lastPoints(onPatch)?.[4]).toMatchObject({ out: { dx: 6.5, dy: 4 }, in: { dx: -6.5, dy: -4 } })
    fireEvent.keyDown(handleMark('out'), { key: 'ArrowDown', shiftKey: true })
    expect(lastPoints(onPatch)?.[4]).toMatchObject({ out: { dx: 6, dy: 9 }, in: { dx: -6, dy: -9 } })
  })
})
