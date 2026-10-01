// @vitest-environment jsdom
// The zoom on the canvas (#146). The card used to be fitted into the stage's height and nothing
// else decided how big it was drawn: a millimetre was 7,07 px at 1024 and the only way to see a
// detail measure bigger was a taller window. So the zoom becomes its own thing, in the canvas'
// own lower corner — and since #619 it is one pill there, `[−][164 % ▾][+]`, with **Passa in**,
// **100 %**, **50 %** and **200 %** behind the percentage, and `Ctrl` with the wheel.
//
// Everything here is asked of the control a designer actually uses, never of a state: what the
// card is drawn at is read off the card, and what the zoom is is read off the percentage the
// control shows.
import { describe, expect, it, vi } from 'vitest'
import { act, createEvent, fireEvent, render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { TemplateCanvas, type TemplateCanvasProps } from '../src/editor/TemplateCanvas.js'
import { STAGE_SCALE } from '../src/editor/canvas.js'
import { projectDoc } from './project-doc.js'
import { target } from './drag.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// The canvas as the editor mounts it. Nothing here is about an edit, so every hand-back is a spy
// that is never looked at.
function canvas(over: Partial<TemplateCanvasProps> = {}) {
  const props: TemplateCanvasProps = {
    doc: projectDoc(),
    face: 'front',
    onSelectFace: vi.fn(),
    onReplaceFace: vi.fn(),
    group: null,
    onSelectGroup: vi.fn(),
    onGroupColumn: vi.fn(),
    onAddField: vi.fn(),
    onReset: vi.fn(),
    row: 'dragon',
    selectedElement: 'title',
    onSelectElement: vi.fn(),
    onPatch: vi.fn(),
    onCallOff: vi.fn(),
    onRemove: vi.fn(),
    onAdd: vi.fn(),
    onPlaceIcon: vi.fn(),
    onReorder: vi.fn(),
    onLock: vi.fn(),
    onRename: vi.fn(),
    ...over,
  }
  return { ...render(<TemplateCanvas {...props} />), props }
}

// How big the card is drawn, read off the card itself. `zoom` is the one number the whole stage
// hangs on: every millimetre on the card, every handle and every grid line is drawn through it.
const drawnAt = () => Number((document.getElementById('canvas') as HTMLElement).style.zoom)

// What the control says the zoom is, in the reader's own words: the percentage is the button
// that opens the choices, and its name carries the measure and whether the card is fitted.
const percentButton = () => screen.getByRole('button', { name: /^Förstoring: / })
const percent = () => percentButton().getAttribute('aria-label')
// The choices behind the percentage, opened by it; «Passa in» and «100 %» are two of them.
const choose = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
  await user.click(percentButton())
  await user.click(screen.getByRole('menuitemradio', { name }))
}
// Whether the fit is the choice the card stands on, read off the choice with the menu opened and
// closed again around it.
const fitChoice = () => {
  fireEvent.click(percentButton())
  const checked = screen.getByRole('menuitemradio', { name: 'Passa in' }).getAttribute('aria-checked')
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
  return checked
}

describe('the zoom control on the canvas (#146, #619)', () => {
  it('is one pill beside the card: a step down, the percentage, a step up — and the choices behind the percentage', async () => {
    const user = userEvent.setup()
    canvas()

    const band = screen.getByRole('group', { name: 'Förstoring' })
    // Six controls in a stack were 94 × 269 px (#619); the pill is three, and the slider is gone.
    expect(band.querySelector('[role="slider"], input[type="range"]')).toBeNull()
    expect([...band.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'))).toEqual(['Förstora mindre', 'Förstoring: 260 %, inpassad', 'Förstora mer'])

    await user.click(percentButton())
    const menu = within(screen.getByRole('menu', { name: 'Välj förstoring' }))
    // Four choices in this order, heard by their names; the fit is the one the card stands on.
    const choices = ['Passa in', '100 %', '50 %', '200 %'].map((name) => menu.getByRole('menuitemradio', { name }))
    expect(menu.getAllByRole('menuitemradio')).toEqual(choices)
    expect(choices.map((b) => b.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false', 'false'])
  })

  // A card is drawn in millimetres, so there is one zoom that means the same thing in every
  // window: the one where a millimetre is a millimetre. That is what the choice says it is.
  it('draws the card at its own measure on 100 %, whatever the window is', async () => {
    const user = userEvent.setup()
    canvas()

    await choose(user, '100 %')

    expect(drawnAt()).toBe(1)
    expect(percent()).toBe('Förstoring: 100 %')
    // The choice made, the menu is gone and the hand is back on the percentage it opened from.
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(percentButton())
  })
})

// The slider is gone (#619), and what it gave the keyboard — a step on every arrow — is kept on
// the percentage, which is the one control the slider stood for.
describe('the keyboard on the pill (#619)', () => {
  it('steps the zoom with the arrows on the percentage, up and right for more', async () => {
    const user = userEvent.setup()
    canvas()

    percentButton().focus()
    await user.keyboard('{ArrowUp}')
    expect(percent()).toBe('Förstoring: 285 %')
    await user.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(percent()).toBe('Förstoring: 235 %')
    await user.keyboard('{ArrowRight}{ArrowDown}')
    expect(percent()).toBe('Förstoring: 235 %')
  })

  it('opens the choices on the one the card stands on, and Escape closes them back onto the percentage', async () => {
    const user = userEvent.setup()
    canvas()

    await user.click(percentButton())
    expect(document.activeElement).toBe(screen.getByRole('menuitemradio', { name: 'Passa in' }))
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(screen.getByRole('menuitemradio', { name: '100 %' }))

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(percentButton())
    expect(percent()).toBe('Förstoring: 260 %, inpassad')
  })

  it('reaches every step and every choice by Tab and Enter alone', async () => {
    const user = userEvent.setup()
    canvas()

    screen.getByRole('button', { name: 'Förstora mindre' }).focus()
    await user.keyboard('{Enter}')
    expect(percent()).toBe('Förstoring: 235 %')
    await user.tab()
    await user.keyboard('{Enter}')
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{Enter}')
    expect(percent()).toBe('Förstoring: 200 %')
    expect(drawnAt()).toBe(2)
    await user.tab()
    await user.keyboard('{Enter}')
    expect(percent()).toBe('Förstoring: 225 %')
  })
})

// The hand that is already on the card: `Ctrl` with the wheel is the gesture every drawing tool
// answers, and the one a designer reaches for without looking for a control.
describe('Ctrl with the wheel over the canvas (#146)', () => {
  const stage = () => document.querySelector('.byd-canvas-stage') as HTMLElement

  it('zooms towards the card, a notch at a time, and keeps the key from the page', () => {
    canvas()
    const wheel = createEvent.wheel(stage(), { ctrlKey: true, deltaY: -100 })

    fireEvent(stage(), wheel)

    expect(percent()).toBe('Förstoring: 270 %')
    // Without this the browser zooms the whole page instead, which is the one thing a canvas
    // that has just taken the gesture must not let happen.
    expect(wheel.defaultPrevented).toBe(true)
  })

  it('zooms away from it the other way, and stops at the floor', () => {
    canvas()
    for (let i = 0; i < 40; i++) fireEvent.wheel(stage(), { ctrlKey: true, deltaY: 100 })

    expect(percent()).toBe('Förstoring: 50 %')
  })

  // A wheel on its own is how the card is panned once it is bigger than the stage, so the canvas
  // has to leave it exactly where it found it.
  it('leaves a wheel without Ctrl to the scrolling it belongs to', () => {
    canvas()
    const wheel = createEvent.wheel(stage(), { deltaY: -100 })

    fireEvent(stage(), wheel)

    expect(percent()).toBe('Förstoring: 260 %, inpassad')
    expect(wheel.defaultPrevented).toBe(false)
  })
})

// Fitting the card into the stage is exactly what the canvas did before there was a zoom at all.
// It stays, as one choice among others rather than as the only mode — which is the difference
// between a canvas that can be looked at closely and one that can only be looked at.
describe('fitting the card into the stage (#146)', () => {
  // A stage with real measurements, since jsdom has none. The card is measured as it is drawn, so
  // the stub answers for the zoom the card currently has — which is the whole reason the fit is a
  // factor on the zoom and not a number on its own.
  function stageOf(space: { w: number; h: number }, atStart: { w: number; h: number }) {
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
    const made = canvas()
    const rect = (el: Element, box: () => { w: number; h: number }) =>
      (el.getBoundingClientRect = () => {
        const { w, h } = box()
        return { x: 0, y: 0, left: 0, top: 0, width: w, height: h, right: w, bottom: h, toJSON: () => ({}) } as DOMRect
      })
    let room = space
    rect(document.querySelector('.byd-canvas-stage')!, () => room)
    rect(document.querySelector('[data-card]')!, () => ({ w: (atStart.w * drawnAt()) / STAGE_SCALE, h: (atStart.h * drawnAt()) / STAGE_SCALE }))
    const resize = (to: { w: number; h: number }) => {
      room = to
      act(() => {
        for (const run of observers) run()
      })
    }
    resize(space)
    return { ...made, resize }
  }

  // The card drawn 660 × 920 at the zoom the stage starts on, in a stage 900 × 690: the height is
  // the tighter of the two, and 24 px of air is kept round it.
  const FITS = (STAGE_SCALE * (690 - 24)) / 920

  it('starts there, and says so on the choice that put it there', () => {
    stageOf({ w: 900, h: 690 }, { w: 660, h: 920 })

    expect(drawnAt()).toBeCloseTo(FITS, 3)
    // Said on the percentage itself, which is the one thing of the pill always on the screen, and
    // again on the choice that put it there.
    expect(percent()).toMatch(/, inpassad$/)
    expect(fitChoice()).toBe('true')
  })

  it('goes back to it from a zoom the designer chose, and stops saying the fit is on meanwhile', async () => {
    const user = userEvent.setup()
    stageOf({ w: 900, h: 690 }, { w: 660, h: 920 })

    await choose(user, '100 %')
    expect(drawnAt()).toBe(1)
    expect(percent()).toBe('Förstoring: 100 %')
    expect(fitChoice()).toBe('false')

    await choose(user, 'Passa in')
    expect(drawnAt()).toBeCloseTo(FITS, 3)
    expect(percent()).toMatch(/, inpassad$/)
    expect(fitChoice()).toBe('true')
  })

  // The complaint the whole issue is about: the window was the only thing that decided how big a
  // card was drawn. Once a designer has said a zoom, the window has nothing more to say about it.
  it('leaves a chosen zoom alone when the window changes, and follows the window while fitting', async () => {
    const user = userEvent.setup()
    const stage = stageOf({ w: 900, h: 690 }, { w: 660, h: 920 })

    stage.resize({ w: 900, h: 1400 })
    expect(drawnAt()).toBeCloseTo((STAGE_SCALE * (900 - 24)) / 660, 3)

    await choose(user, '100 %')
    stage.resize({ w: 900, h: 690 })
    expect(drawnAt()).toBe(1)
  })
})

// The zoom is how big the card is drawn and nothing else. A millimetre in the document is a
// millimetre at every one of them — which is the whole promise the property panel and the arrow
// keys make, and the one a zoom could quietly break.
describe('what the zoom never changes (#146, L18)', () => {
  it('nudges the same half millimetre at every zoom, however many pixels that is', async () => {
    const user = userEvent.setup()
    const { props } = canvas()
    // The move mode #144 put on the element itself: the box on the card is the stop, Enter goes
    // in, and the arrows belong to the mode.
    target('title')!.focus()
    await user.keyboard('{Enter}{ArrowRight}')
    expect(props.onPatch).toHaveBeenCalledWith('title', { x: 5.5 }, expect.any(String))

    // 600 % is eleven pixels to the half millimetre where 260 % was five, and 50 % is one. The
    // element still starts at 5 mm — the canvas is handed its document, and this one never
    // changes — so the same nudge at three zooms is the same patch three times, which is exactly
    // the promise: the pixels move, the millimetre does not.
    for (const to of ['Förstora mer', 'Förstora mindre']) {
      for (let i = 0; i < 25; i++) await user.click(screen.getByRole('button', { name: to }))
      target('title')!.focus()
      await user.keyboard('{Enter}{ArrowRight}')
      expect({ [percent()!]: vi.mocked(props.onPatch).mock.lastCall?.[1] }).toEqual({ [percent()!]: { x: 5.5 } })
    }
    expect(percent()).toBe('Förstoring: 50 %')
  })
})

// A deliberate departure from L4's pattern that a view remembers itself in the browser, written
// down as L19: the column widths and the folded properties are remembered, and the zoom is not.
// Nobody should open a card and be met by a crop they do not remember choosing.
describe('what the zoom does not remember (#146, L19)', () => {
  it('starts every opening of the canvas on the fit, however the last one was left', async () => {
    const user = userEvent.setup()
    const first = canvas()
    await choose(user, '100 %')
    expect(drawnAt()).toBe(1)

    first.unmount()
    canvas()

    expect(drawnAt()).toBe(STAGE_SCALE)
    expect(percent()).toBe('Förstoring: 260 %, inpassad')
  })

  it('writes nothing about itself into the browser, the way a width and a fold do', async () => {
    const user = userEvent.setup()
    const wrote = vi.spyOn(Storage.prototype, 'setItem')
    canvas()

    await choose(user, '100 %')
    await user.click(screen.getByRole('button', { name: 'Förstora mer' }))
    await choose(user, 'Passa in')

    expect(wrote).not.toHaveBeenCalled()
    wrote.mockRestore()
  })
})

// The measure over the card is always the card's own millimetre — a square means the same thing
// at every zoom, which is the whole reason for having it. What changes is how many of them are
// drawn: a millimetre that lands under about four pixels is not a rule any more, it is a grey
// chequerboard over the work.
describe('the grid under the zoom (#146)', () => {
  // The grid a designer switched on, and the millimetre it is drawn in.
  const gridStepMm = () => (document.querySelector('[data-grid]') as HTMLElement | null)?.style.getPropertyValue('--byd-grid-step') ?? null

  async function withGrid() {
    const user = userEvent.setup()
    canvas()
    await user.click(screen.getByLabelText('Rutnät 1 mm'))
    return user
  }

  it('draws every millimetre while the card is big enough to hold them', async () => {
    await withGrid()

    // 260 % is 9,8 px to the millimetre, and the fit on a 1024 window is 7,07: neither is near
    // the floor, so the canvas a designer meets is never the chequerboard.
    expect(gridStepMm()).toBe('1mm')
  })

  it('thins out to five millimetres when a millimetre falls under four pixels', async () => {
    const user = await withGrid()

    // 100 % is 3,78 px to the millimetre — under the floor, and five of them are 18,9.
    await choose(user, '100 %')

    expect(gridStepMm()).toBe('5mm')
  })
})
