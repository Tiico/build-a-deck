// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { TemplateCanvas, type TemplateCanvasProps } from '../src/editor/TemplateCanvas.js'
import { projectDoc } from './project-doc.js'

// The canvas as the editor mounts it, with every edit it can make reported back.
function canvas(over: Partial<TemplateCanvasProps> = {}) {
  const props: TemplateCanvasProps = {
    doc: structuredClone(projectDoc()),
    face: 'front',
    onSelectFace: vi.fn(),
    group: null,
    onSelectGroup: vi.fn(),
    onGroupColumn: vi.fn(),
    onReset: vi.fn(),
    row: 'dragon',
    selectedElement: 'title',
    onSelectElement: vi.fn(),
    onPatch: vi.fn(),
    onRemove: vi.fn(),
    onAdd: vi.fn(),
    onReorder: vi.fn(),
    onFontFile: async () => 'Typsnitt',
    onFontLicence: vi.fn(),
    onRemoveFont: vi.fn(),
    ...over,
  }
  render(<TemplateCanvas {...props} />)
  return props
}

describe('nudging the selected element with the keyboard (#18)', () => {
  it('moves it 0,5 mm with an arrow key and 5 mm with shift', async () => {
    const user = userEvent.setup()
    const { onPatch } = canvas()

    // `title` sits at 5, 5 mm.
    await user.keyboard('{ArrowRight}')
    expect(onPatch).toHaveBeenCalledWith('title', { x: 5.5 })
    await user.keyboard('{ArrowUp}')
    expect(onPatch).toHaveBeenCalledWith('title', { y: 4.5 })
    await user.keyboard('{Shift>}{ArrowDown}{/Shift}')
    expect(onPatch).toHaveBeenCalledWith('title', { y: 10 })
    await user.keyboard('{Shift>}{ArrowLeft}{/Shift}')
    expect(onPatch).toHaveBeenCalledWith('title', { x: 0 })
  })
})

describe('the keyboard when it is not about the card (#18)', () => {
  it('leaves the arrows to a property field being typed in, and to the layer list', async () => {
    const user = userEvent.setup()
    const { onPatch } = canvas()

    await user.click(screen.getByLabelText(/^x/i))
    await user.keyboard('{ArrowRight}{ArrowLeft}')
    expect(onPatch).not.toHaveBeenCalled()

    // The layer list answers its own arrows: they move the focus, not the element (UX-04).
    const layers = within(screen.getByRole('listbox', { name: /lager/i })).getAllByRole('option')
    layers[1]!.focus()
    await user.keyboard('{ArrowDown}')
    expect(onPatch).not.toHaveBeenCalled()
  })

  it('takes the element away with Delete and with Backspace, but never from inside a field', async () => {
    const user = userEvent.setup()
    const { onRemove } = canvas()

    await user.keyboard('{Delete}')
    expect(onRemove).toHaveBeenCalledWith('title')
    await user.keyboard('{Backspace}')
    expect(onRemove).toHaveBeenCalledTimes(2)

    await user.click(screen.getByLabelText(/^x/i))
    await user.keyboard('{Backspace}{Delete}')
    expect(onRemove).toHaveBeenCalledTimes(2)
  })
})

describe('adding an element from the canvas (#18)', () => {
  it('has a tool for each kind, and a new element lands on the card, is bound to a field and is selected', async () => {
    const user = userEvent.setup()
    const { onAdd, onSelectElement } = canvas()
    const tools = within(screen.getByRole('toolbar', { name: /verktyg/i }))

    await user.click(tools.getByRole('button', { name: 'Text' }))
    // The card is 63 × 88 mm, so a centred 40 × 10 box starts at 11.5, 39.
    expect(onAdd).toHaveBeenLastCalledWith({
      kind: 'text',
      id: 'text-1',
      x: 11.5,
      y: 39,
      w: 40,
      h: 10,
      bind: { field: 'title' },
      font: { family: 'sans-serif', sizePt: 10 },
      color: '#111111',
    })
    expect(onSelectElement).toHaveBeenLastCalledWith('text-1')

    await user.click(tools.getByRole('button', { name: 'Bild' }))
    expect(onAdd).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'image', id: 'image-1', bind: { field: 'title' } }))
    await user.click(tools.getByRole('button', { name: 'Ikonrad' }))
    expect(onAdd).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'icons', id: 'icons-1', iconMm: 5 }))
    await user.click(tools.getByRole('button', { name: 'Form' }))
    expect(onAdd).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'shape', id: 'shape-1', shape: 'rect' }))
  })

  it('gives the new element a free id when one of that kind is already there', async () => {
    const user = userEvent.setup()
    const doc = structuredClone(projectDoc())
    doc.template.faces['front']!.base.push({ kind: 'shape', id: 'shape-1', x: 0, y: 0, w: 5, h: 5, shape: 'rect' })
    const { onAdd } = canvas({ doc })

    await user.click(within(screen.getByRole('toolbar', { name: /verktyg/i })).getByRole('button', { name: 'Form' }))
    expect(onAdd).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'shape-2' }))
  })
})

describe('the properties of an added element (#18)', () => {
  it('lets an image and an icon row be bound to a field, the way a text box already could', async () => {
    const doc = structuredClone(projectDoc())
    doc.template.faces['front']!.base.push({ kind: 'image', id: 'image-1', x: 10, y: 10, w: 20, h: 20, bind: { field: 'title' }, fit: 'contain' })
    const { onPatch } = canvas({ doc, selectedElement: 'image-1' })

    fireEvent.change(screen.getByLabelText(/fält/i), { target: { value: 'body' } })
    expect(onPatch).toHaveBeenCalledWith('image-1', { bind: { field: 'body' } })
  })
})

describe('the tool rail by keyboard (#18, UX-04)', () => {
  it('is one tab stop the arrows move inside, and the layer list is the next stop', async () => {
    const user = userEvent.setup()
    canvas()
    const tools = within(screen.getByRole('toolbar', { name: /verktyg/i })).getAllByRole('button')
    expect(tools.map((t) => t.textContent)).toEqual(['TText', '▣Bild', '●●Ikonrad', '◻Form'])
    expect(tools.map((t) => t.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1'])

    await user.tab()
    expect(document.activeElement).toBe(tools[0])
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(tools[1])
    await user.keyboard('{End}')
    expect(document.activeElement).toBe(tools[3])

    // Out of the rail in one Tab, and the layer list is where the next stop is.
    await user.tab()
    expect(document.activeElement).toBe(within(screen.getByRole('listbox', { name: /lager/i })).getAllByRole('option')[1])
  })
})

// jsdom lays nothing out, so the one thing it cannot know — how many pixels a millimetre is on
// screen — is given to it. The card is 63 × 88 mm at 6 px per mm; where the boxes really land is
// measured in a browser instead (see `template-canvas-css.test.ts`).
function laidOut(pxPerMm = 6) {
  const card = document.querySelector('[data-drag-layer]') as HTMLElement
  card.getBoundingClientRect = () =>
    ({ x: 0, y: 0, left: 0, top: 0, width: 63 * pxPerMm, height: 88 * pxPerMm, right: 63 * pxPerMm, bottom: 88 * pxPerMm, toJSON: () => ({}) }) as DOMRect
  return card
}
const target = (id: string) => document.querySelector(`[data-drag="${id}"]`) as HTMLElement

function drag(el: HTMLElement, from: [number, number], to: [number, number]) {
  fireEvent.pointerDown(el, { pointerId: 1, button: 0, clientX: from[0], clientY: from[1] })
  fireEvent.pointerMove(el, { pointerId: 1, clientX: to[0], clientY: to[1] })
  fireEvent.pointerUp(el, { pointerId: 1, clientX: to[0], clientY: to[1] })
}

describe('moving an element with the pointer (#18)', () => {
  it('turns the pixels dragged into millimetres in the template, and selects what is grabbed', () => {
    const { onPatch, onSelectElement } = canvas({ selectedElement: null })
    laidOut()

    // `title` sits at 5, 5 mm; 60 px right and 20 px down is 10 and 3,3 mm.
    drag(target('title'), [100, 100], [160, 120])
    expect(onSelectElement).toHaveBeenCalledWith('title')
    expect(onPatch).toHaveBeenLastCalledWith('title', { x: 15, y: 8.3 })
  })

  it('does not move an element that is only clicked', () => {
    const { onPatch, onSelectElement } = canvas({ selectedElement: null })
    laidOut()

    drag(target('body'), [100, 100], [100, 100])
    expect(onSelectElement).toHaveBeenCalledWith('body')
    expect(onPatch).not.toHaveBeenCalled()
  })
})

const handle = (corner: string) => document.querySelector(`[data-handle="${corner}"]`) as HTMLElement

describe('resizing an element with the handles (#18)', () => {
  it('gives the selected element four corner handles, and each corner moves the edges it holds', () => {
    const { onPatch } = canvas({ selectedElement: 'title' })
    laidOut()
    expect(document.querySelectorAll('[data-handle]')).toHaveLength(4)
    // Only what is selected carries handles.
    expect(target('title')!.querySelectorAll('[data-handle]')).toHaveLength(4)

    // `title` is 5, 5, 53 × 10 mm. The lower right corner moves the far edges only.
    drag(handle('se'), [100, 100], [112, 130])
    expect(onPatch).toHaveBeenLastCalledWith('title', { x: 5, y: 5, w: 55, h: 15 })

    // The upper left corner moves the near edges, so the far ones stay where they are.
    drag(handle('nw'), [100, 100], [112, 112])
    expect(onPatch).toHaveBeenLastCalledWith('title', { x: 7, y: 7, w: 51, h: 8 })

    // A corner never turns the box inside out.
    drag(handle('ne'), [100, 100], [-600, 600])
    expect(onPatch).toHaveBeenLastCalledWith('title', { x: 5, y: 13, w: 2, h: 2 })
  })
})

const guide = (axis: 'x' | 'y') => document.querySelector(`[data-guide="${axis}"]`) as HTMLElement | null

describe('guide lines while an element is dragged (#18)', () => {
  // A narrow element as well as the wide ones, so a centre is not already a centre.
  const withCost = () => {
    const doc = structuredClone(projectDoc())
    doc.template.faces['front']!.base.push({ kind: 'text', id: 'cost', x: 50, y: 4, w: 10, h: 10, bind: { field: 'antal' }, font: { family: 'sans-serif', sizePt: 12 }, color: '#111' })
    return doc
  }

  it('snaps an edge to another element’s edge and shows the line it snapped to', () => {
    const { onPatch } = canvas({ doc: withCost(), selectedElement: 'title' })
    laidOut()

    // `title` starts at 5, 5; dragged 152 px down its top edge lands at 30,33 mm — within a
    // millimetre of `body`, whose top edge is at 30, so it takes it.
    fireEvent.pointerDown(target('title'), { pointerId: 1, button: 0, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(target('title'), { pointerId: 1, clientX: 100, clientY: 252 })
    expect(onPatch).toHaveBeenLastCalledWith('title', { x: 5, y: 30 })
    expect(guide('y')!.style.top).toBe('30mm')
    // Its left edge never left `body`'s, so that line is drawn too.
    expect(guide('x')!.style.left).toBe('5mm')

    // The lines belong to the drag; they are gone when it is let go.
    fireEvent.pointerUp(target('title'), { pointerId: 1, clientX: 100, clientY: 252 })
    expect(guide('y')).toBeNull()
  })

  it('snaps the middle of an element to the middle of the card', () => {
    const { onPatch } = canvas({ doc: withCost(), selectedElement: 'cost' })
    laidOut()

    // `cost` is 10 mm wide at x 50; dragged 142 px left its middle lands at 31,33 mm, a third of
    // a millimetre from the card's own middle at 31,5.
    fireEvent.pointerDown(target('cost'), { pointerId: 1, button: 0, clientX: 300, clientY: 100 })
    fireEvent.pointerMove(target('cost'), { pointerId: 1, clientX: 158, clientY: 100 })
    expect(onPatch).toHaveBeenLastCalledWith('cost', { x: 26.5, y: 4 })
    expect(guide('x')!.style.left).toBe('31.5mm')
  })

  it('leaves an element alone when nothing is within a millimetre of it', () => {
    const { onPatch } = canvas({ doc: withCost(), selectedElement: 'cost' })
    laidOut()

    fireEvent.pointerDown(target('cost'), { pointerId: 1, button: 0, clientX: 300, clientY: 100 })
    fireEvent.pointerMove(target('cost'), { pointerId: 1, clientX: 240, clientY: 190 })
    expect(onPatch).toHaveBeenLastCalledWith('cost', { x: 40, y: 19 })
    expect(guide('x')).toBeNull()
    expect(guide('y')).toBeNull()
  })
})

describe('changing the layer order (#18)', () => {
  const layer = (id: string) => document.querySelector(`[data-layer="${id}"]`) as HTMLElement

  it('moves a layer by dragging it onto another, in the drawing order the template holds', () => {
    // The base is drawn back to front: frame, title, body. The list reads the other way.
    const { onReorder } = canvas()
    expect([...document.querySelectorAll('[data-layer]')].map((l) => l.getAttribute('data-layer'))).toEqual(['body', 'title', 'frame'])

    // `body` dropped on the bottom row is drawn first of all, which is index 0 of the base.
    fireEvent.dragStart(layer('body'))
    fireEvent.dragOver(layer('frame'))
    fireEvent.drop(layer('frame'))
    expect(onReorder).toHaveBeenLastCalledWith('body', 0)

    // `frame` dropped on the top row ends up drawn last, on top of everything.
    fireEvent.dragStart(layer('frame'))
    fireEvent.drop(layer('body'))
    expect(onReorder).toHaveBeenLastCalledWith('frame', 2)
  })

  it('moves a layer with the keyboard as well, so the order is not a drag away only', async () => {
    const user = userEvent.setup()
    const { onReorder } = canvas({ selectedElement: 'title' })
    layer('title').focus()

    // Up the list is towards the front of the card, which is up the base list too.
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}')
    expect(onReorder).toHaveBeenLastCalledWith('title', 2)
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}')
    expect(onReorder).toHaveBeenLastCalledWith('title', 0)
    // Moving a layer must not move the focus off it as an ordinary arrow would.
    expect(document.activeElement).toBe(layer('title'))
  })

  it('has nowhere to move the top layer up or the bottom layer down', async () => {
    const user = userEvent.setup()
    const { onReorder } = canvas({ selectedElement: 'body' })
    layer('body').focus()
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}')
    layer('frame').focus()
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}')
    expect(onReorder).not.toHaveBeenCalled()
  })
})

describe('how much of the card the stage shows (#18)', () => {
  // jsdom has no layout and no ResizeObserver; both are given to it, so the arithmetic the stage
  // does with real measurements can be checked here.
  function stageOf(space: { w: number; h: number }, drawn: { w: number; h: number }) {
    const observers: (() => void)[] = []
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private readonly run: () => void) {}
        observe() {
          observers.push(this.run)
        }
        disconnect() {
          observers.length = 0
        }
      },
    )
    const props = canvas()
    const rect = (el: Element, box: { w: number; h: number }) =>
      (el.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: box.w, height: box.h, right: box.w, bottom: box.h, toJSON: () => ({}) }) as DOMRect)
    rect(document.querySelector('.byd-canvas-stage')!, space)
    rect(document.querySelector('[data-card]')!, drawn)
    act(() => {
      for (const run of observers) run()
    })
    return { ...props, zoom: () => (document.getElementById('canvas') as HTMLElement).style.zoom }
  }

  it('brings a card that is taller than the stage down until all of it shows', () => {
    // A card drawn 660 × 920 px at the zoom it has, in a stage 900 × 690: it comes down by the
    // height, which is the tighter of the two.
    const stage = stageOf({ w: 900, h: 690 }, { w: 660, h: 920 })
    expect(Number(stage.zoom())).toBeCloseTo(2.6 * ((690 - 24) / 920), 3)
  })

  it('grows the card into a stage that has room to spare, instead of leaving it small', () => {
    const stage = stageOf({ w: 900, h: 1400 }, { w: 660, h: 920 })
    expect(Number(stage.zoom())).toBeCloseTo(2.6 * ((900 - 24) / 660), 3)
  })

  it('keeps the zoom it has when nothing can be measured', () => {
    canvas()
    expect((document.getElementById('canvas') as HTMLElement).style.zoom).toBe('2.6')
  })
})

describe('the grid as a layer of its own (#18)', () => {
  it('is off until it is asked for, and is a thing to see by rather than a thing that moves elements', async () => {
    const user = userEvent.setup()
    const { onPatch } = canvas({ selectedElement: 'title' })
    const grid = screen.getByRole('checkbox', { name: /rutnät/i }) as HTMLInputElement
    expect(grid.checked).toBe(false)
    expect(document.querySelector('[data-grid]')).toBeNull()

    await user.click(grid)
    expect(document.querySelector('[data-grid]')).toBeTruthy()

    // It draws a millimetre grid; it does not round anything to it. A nudge is still 0,5 mm.
    laidOut()
    await user.keyboard('{ArrowRight}')
    expect(onPatch).toHaveBeenLastCalledWith('title', { x: 5.5 })
  })
})
