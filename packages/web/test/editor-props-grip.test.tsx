// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { TemplateCanvas } from '../src/editor/TemplateCanvas.js'
import { projectDoc } from './project-doc.js'
import type { Element, ProjectDoc } from '../src/editor/types.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// The property panel as L25 rebuilt it: every number is marked with an icon and carries a grip
// of its own, so the drag that changes it is visible without anyone having to find it by hovering.

function open(over: Partial<Element> = {}, id = 'frame') {
  const doc: ProjectDoc = projectDoc()
  const front = doc.template.faces['front']!
  doc.template.faces['front'] = { ...front, base: front.base.map((e) => (e.id === id ? ({ ...e, ...over } as Element) : e)) }
  const onPatch = vi.fn()
  render(
    <TemplateCanvas
      doc={doc}
      face="front"
      row="dragon"
      selectedElement={id}
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
      onRemoveFont={vi.fn()}
    />,
  )
  return { onPatch }
}

const grip = (name: string) => screen.getByRole('button', { name: `${name}, dra för att ändra` })
const pull = (name: string, from: number, to: number, opts: { shiftKey?: boolean } = {}) => {
  const el = grip(name)
  fireEvent.pointerDown(el, { pointerId: 1, button: 0, clientX: from, clientY: 0 })
  fireEvent.pointerMove(el, { pointerId: 1, clientX: to, clientY: 0, ...opts })
  fireEvent.pointerUp(el, { pointerId: 1, clientX: to, clientY: 0 })
  return el
}

describe('the grip beside every number (L25)', () => {
  // The icon is the field's name and its grip at once, and it says both out loud: the word is
  // not gone from the panel, it is only not drawn.
  it('gives every measurement a grip that says what it changes and that it is dragged', () => {
    open()
    for (const name of ['X (mm)', 'Y (mm)', 'Bredd (mm)', 'Höjd (mm)']) expect(grip(name)).toBeTruthy()
    // And the field beside it keeps its own name, so the number is still reachable by it.
    expect(screen.getByRole('spinbutton', { name: 'Bredd (mm)' })).toBeTruthy()
  })

  // Two pixels a step, all the way through the pull rather than at its end (L14): the designer
  // sees the card move under her hand, and so does anyone watching the same project.
  it('writes the number through as the grip is pulled', () => {
    const { onPatch } = open()
    pull('Bredd (mm)', 100, 106)
    expect(onPatch.mock.calls.at(-1)?.[1]).toEqual({ w: 62.5 })
  })

  it('counts a pull to the left downwards, and ten steps at a time under Shift', () => {
    const { onPatch } = open()
    pull('Bredd (mm)', 100, 96)
    expect(onPatch.mock.calls.at(-1)?.[1]).toEqual({ w: 60 })
    cleanup()
    const second = open()
    pull('Bredd (mm)', 100, 102, { shiftKey: true })
    expect(second.onPatch.mock.calls.at(-1)?.[1]).toEqual({ w: 66 })
  })

  // A pull is one thing the designer did, however many times the pointer reported it (L14).
  it('is one entry in the history per pull, and the next pull is its own', () => {
    const { onPatch } = open()
    const el = grip('Bredd (mm)')
    fireEvent.pointerDown(el, { pointerId: 1, button: 0, clientX: 100, clientY: 0 })
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 102, clientY: 0 })
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 104, clientY: 0 })
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 104, clientY: 0 })
    const [first, second] = onPatch.mock.calls.slice(-2).map((call) => call[2] as string)
    expect(first).toBeTruthy()
    expect(second).toBe(first)

    pull('Bredd (mm)', 100, 102)
    expect(onPatch.mock.calls.at(-1)?.[2]).not.toBe(first)
  })
})

// A panel where some numbers are dragged and others are not is a panel whose grip has to be
// learned twice. Every number a shape reads is one and the same control (L25) — including the
// three that used to be sliders, which took a whole row each in a 280 px column and were the
// reason the panel did not fit.
describe('every number in the panel is the same control (L25)', () => {
  it('gives the shape’s own numbers a grip each, and no sliders are left', () => {
    open({ kind: 'shape', shape: 'star', corners: 5, innerRatio: 0.45, rotationDeg: 0, strokeMm: 0.5 } as Partial<Element>)
    for (const name of ['Hörn', 'Vridning', 'Uddjup', 'Linjebredd (mm)', 'Opacitet (%)']) {
      expect(grip(name)).toBeTruthy()
      expect(screen.getByRole('spinbutton', { name })).toBeTruthy()
    }
    expect(within(document.querySelector('.byd-props') as HTMLElement).queryAllByRole('slider')).toEqual([])
  })

  it('pulls a turn by a degree a step and a line by a tenth of a millimetre', () => {
    const { onPatch } = open({ kind: 'shape', shape: 'polygon', corners: 6, rotationDeg: 10, strokeMm: 0.5 } as Partial<Element>)
    pull('Vridning', 100, 104)
    expect(onPatch.mock.calls.at(-1)?.[1]).toEqual({ rotationDeg: 12 })
    pull('Linjebredd (mm)', 100, 104)
    expect(onPatch.mock.calls.at(-1)?.[1]).toEqual({ strokeMm: 0.7 })
  })
})

// The panel is divided and nothing is hidden (L25): four sections plus the outline's own, all of
// them open, so a designer who changes what she has selected sees the same panel every time and
// the panel has no state to remember between two selections.
describe('the sections of the panel (L25)', () => {
  const panel = () => document.querySelector('.byd-props') as HTMLElement

  it('stands in named sections, in the order the shape is worked in', () => {
    open({ kind: 'shape', shape: 'rect' } as Partial<Element>)
    expect(within(panel())
      .getAllByRole('heading')
      .map((h) => h.textContent)).toEqual(['Layout', 'Form', 'Fyllning', 'Linje', 'Effekter'])
  })

  // A section head that can be pressed is a section that can be shut, and a shut section is a
  // state the panel would have to remember — or forget in front of the designer.
  it('gives no section a head to fold it by', () => {
    open({ kind: 'shape', shape: 'rect' } as Partial<Element>)
    for (const name of ['Layout', 'Form', 'Fyllning', 'Linje', 'Effekter']) {
      const section = within(panel()).getByRole('region', { name })
      // The head is a heading and nothing else: there is nothing to press, so there is no state.
      expect(within(section).getByRole('heading', { name })).toBeTruthy()
      expect(within(section).queryByRole('button', { name })).toBeNull()
    }
  })

  // The other elements are the same panel: a text has what a text is set in, a picture what a
  // picture is fitted by, and both have the box every element has.
  it('gives a text its own sections and the box every element has', () => {
    open({}, 'title')
    expect(within(panel())
      .getAllByRole('heading')
      .map((h) => h.textContent)).toEqual(['Layout', 'Innehåll', 'Text'])
  })
})

// The editor degrades on a small screen but never on the keyboard (L12): a number that can only
// be reached by dragging is a number a designer on a keyboard cannot set at all.
describe('the keyboard way to every number (L25, L12)', () => {
  it('nudges from the field with the arrows, the drag’s own step, and ten of them under Shift', () => {
    const { onPatch } = open()
    const field = screen.getByRole('spinbutton', { name: 'Bredd (mm)' })
    fireEvent.keyDown(field, { key: 'ArrowUp' })
    expect(onPatch.mock.calls.at(-1)?.[1]).toEqual({ w: 61.5 })
    fireEvent.keyDown(field, { key: 'ArrowDown', shiftKey: true })
    expect(onPatch.mock.calls.at(-1)?.[1]).toEqual({ w: 56 })
  })

  // The grip answers by itself, for the reader who never lands in the field beside it.
  it('nudges from the grip with left and right', () => {
    const { onPatch } = open()
    fireEvent.keyDown(grip('Bredd (mm)'), { key: 'ArrowRight' })
    expect(onPatch.mock.calls.at(-1)?.[1]).toEqual({ w: 61.5 })
    fireEvent.keyDown(grip('Bredd (mm)'), { key: 'ArrowLeft', shiftKey: true })
    expect(onPatch.mock.calls.at(-1)?.[1]).toEqual({ w: 56 })
  })

  // One press is one thing done, so it is a whole step back by itself (L14).
  it('is its own entry in the history per press', () => {
    const { onPatch } = open()
    const field = screen.getByRole('spinbutton', { name: 'Bredd (mm)' })
    fireEvent.keyDown(field, { key: 'ArrowUp' })
    fireEvent.keyDown(field, { key: 'ArrowUp' })
    expect(onPatch).toHaveBeenCalledTimes(2)
    // An edit that carries no token is a whole change by itself, which is what a single press is.
    expect(onPatch.mock.calls.map((call) => call[2])).toEqual([undefined, undefined])
  })

  // A locked layer's box is read and not changed (L15), by the pointer as by the keyboard.
  it('leaves a locked layer’s measurements where they are', () => {
    const { onPatch } = open({ locked: true })
    const field = screen.getByRole('spinbutton', { name: 'Bredd (mm)' })
    expect((field as HTMLInputElement).readOnly).toBe(true)
    fireEvent.keyDown(field, { key: 'ArrowUp' })
    expect(onPatch).not.toHaveBeenCalled()
  })
})
