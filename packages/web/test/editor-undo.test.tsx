// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { EditorPage } from '../src/editor/EditorPage.js'
import { StatusLive } from '../src/status/StatusLive.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { dragVia, laidOut, target } from './drag.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  vi.useRealTimers()
  await run.stop()
})

// `live` puts the editor under the app's two live regions, which is where it stands in `App`.
// Without them a test can read what is on the screen but not what is said out loud.
async function openEditor(opts: { live?: boolean } = {}) {
  await run.projects.create(run.projectId, projectDoc())
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  render(opts.live ? <StatusLive><EditorPage /></StatusLive> : <EditorPage />)
  await screen.findByText('Skogens herrar')
}

const saidIn = (live: 'polite' | 'assertive') => document.querySelector(`[data-status-live="${live}"]`)?.textContent ?? ''
const header = () => within(document.querySelector('.byd-editor > header') as HTMLElement)

// The editor had no modifier chord at all: arrows nudged an element and Delete removed one, and
// that was the whole keyboard. The way back was the version panel, which is a different thing —
// a whole saving, named and comparable (B4) — not the step just taken (#35).
describe('a step back in the editor (#35)', () => {
  it('takes the last change back on Ctrl+Z, puts it forward on Shift+Ctrl+Z, and says what it did', async () => {
    await openEditor()
    fireEvent.click(screen.getByRole('tab', { name: 'Tabell' }))
    const cell = await waitFor(() => {
      const el = document.querySelector('.byd-data tbody td:not(.byd-data-check) input') as HTMLInputElement | null
      if (!el) throw new Error('no cell yet')
      return el
    })
    await userEvent.clear(cell)
    await userEvent.type(cell, 'Drakhona')
    // The focus leaves the field, so the chord is the project's and not the field's.
    ;(document.activeElement as HTMLElement | null)?.blur()
    await waitFor(() => expect((document.querySelector('.byd-data tbody td:not(.byd-data-check) input') as HTMLInputElement).value).toBe('Drakhona'))

    fireEvent.keyDown(document, { key: 'z', ctrlKey: true })
    expect(await screen.findByText(/Tog tillbaka: en ändring i kortleken/)).toBeTruthy()

    fireEvent.keyDown(document, { key: 'z', ctrlKey: true, shiftKey: true })
    expect(await screen.findByText(/Gjorde om: en ändring i kortleken/)).toBeTruthy()
  })

  it('leaves the chord to a field being typed in, whose own step back the browser already does well', async () => {
    await openEditor()
    fireEvent.click(screen.getByRole('tab', { name: 'Tabell' }))
    const cell = await waitFor(() => {
      const el = document.querySelector('.byd-data tbody td:not(.byd-data-check) input') as HTMLInputElement | null
      if (!el) throw new Error('no cell yet')
      return el
    })
    await userEvent.clear(cell)
    await userEvent.type(cell, 'Drakhona')

    cell.focus()
    fireEvent.keyDown(cell, { key: 'z', ctrlKey: true })
    expect(screen.queryByText(/Tog tillbaka/)).toBeNull()
  })

  // A key held down does not become many presses just because the browser keeps saying so. The
  // repeats it sends are the same one press, and the editor answers a press.
  it('answers a held key once, however long the browser goes on repeating it', async () => {
    await openEditor()
    fireEvent.click(screen.getByRole('tab', { name: 'Tabell' }))
    const cell = await waitFor(() => {
      const el = document.querySelector('.byd-data tbody td:not(.byd-data-check) input') as HTMLInputElement | null
      if (!el) throw new Error('no cell yet')
      return el
    })
    await userEvent.clear(cell)
    await userEvent.type(cell, 'Drakhona')
    ;(document.activeElement as HTMLElement | null)?.blur()
    const value = () => (document.querySelector('.byd-data tbody td:not(.byd-data-check) input') as HTMLInputElement).value
    await waitFor(() => expect(value()).toBe('Drakhona'))

    fireEvent.keyDown(document, { key: 'z', ctrlKey: true, repeat: true })
    fireEvent.keyDown(document, { key: 'z', ctrlKey: true, repeat: true })
    expect(value()).toBe('Drakhona')
    expect(screen.queryByText(/Tog tillbaka/)).toBeNull()

    // The control: a press that is a press still takes the last change back, so a green test
    // here is never a chord that stopped working altogether.
    fireEvent.keyDown(document, { key: 'z', ctrlKey: true })
    await waitFor(() => expect(value()).not.toBe('Drakhona'))
  })

  it('saves on Ctrl+S rather than letting the browser save the page', async () => {
    await openEditor()
    fireEvent.click(screen.getByRole('tab', { name: 'Tabell' }))
    const cell = await waitFor(() => {
      const el = document.querySelector('.byd-data tbody td:not(.byd-data-check) input') as HTMLInputElement | null
      if (!el) throw new Error('no cell yet')
      return el
    })
    await userEvent.clear(cell)
    await userEvent.type(cell, 'Drakhona')
    await screen.findByText('Osparat')

    // Pressed from inside the field: saving is the editor's wherever it is asked for, and the
    // browser's own "save this page" must not be what happens instead.
    const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, cancelable: true, bubbles: true })
    cell.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    await waitFor(async () => expect((await run.projects.load(run.projectId))?.rev).toBe(2))
  })
})

// A step back is not a fault, and it went into the slot faults go into: the amber one in the
// header that says a save could not happen, spoken assertively and then left standing until the
// next save or the next error, whichever came first.
describe('what a step back is announced as (#35)', () => {
  it('is said politely, and takes itself back rather than standing in the header', async () => {
    await openEditor({ live: true })
    fireEvent.click(screen.getByRole('tab', { name: 'Tabell' }))
    fireEvent.change(await screen.findByLabelText('dragon title'), { target: { value: 'Drakhona' } })

    // The beat the confirmation is shown for is the editor's, so the clock is the test's.
    vi.useFakeTimers()
    fireEvent.keyDown(document, { key: 'z', ctrlKey: true })

    // What a reader hears: the polite channel, in her own time. Nothing cuts her off.
    expect(saidIn('polite')).toMatch(/Tog tillbaka: en ändring i kortleken/)
    expect(saidIn('assertive')).not.toMatch(/Tog tillbaka/)
    expect([...document.querySelectorAll('[role="alert"]')].map((el) => el.textContent).join('\n')).not.toMatch(/Tog tillbaka/)
    // And what she sees: it is still read where it happened.
    expect(header().getByText(/Tog tillbaka: en ändring i kortleken/)).toBeTruthy()

    act(() => vi.advanceTimersByTime(30_000))
    expect(header().queryByText(/Tog tillbaka/)).toBeNull()
  })
})

// The Save button has always been greyed out when there is nothing to save. The chord went
// straight past it, and every press made a version of a document nobody had touched — a history
// (B4) that is meant to be worth reading, filled with entries that changed nothing.
describe('a saving that changes nothing (B4)', () => {
  async function typeInTheDeck(what: string) {
    fireEvent.click(screen.getByRole('tab', { name: 'Tabell' }))
    const cell = await waitFor(() => {
      const el = document.querySelector('.byd-data tbody td:not(.byd-data-check) input') as HTMLInputElement | null
      if (!el) throw new Error('no cell yet')
      return el
    })
    await userEvent.clear(cell)
    await userEvent.type(cell, what)
    await screen.findByText('Osparat')
  }

  it('is not a saving: the chord on an untouched document leaves the history where it was', async () => {
    await openEditor()
    // The control: a chord with something to save does make a version, so a green test here is
    // never a chord that quietly did nothing at all.
    await typeInTheDeck('Drakhona')
    fireEvent.keyDown(document, { key: 's', ctrlKey: true })
    await screen.findByText('Sparat')
    expect((await run.projects.load(run.projectId))?.rev).toBe(2)

    // Nothing has been typed since. However often it is asked for, there is nothing to keep.
    fireEvent.keyDown(document, { key: 's', ctrlKey: true })
    fireEvent.keyDown(document, { key: 's', ctrlKey: true })

    // The next real change is version three: proof that the presses in between never counted.
    await typeInTheDeck('Drakhöna')
    fireEvent.keyDown(document, { key: 's', ctrlKey: true })
    await waitFor(async () => expect((await run.projects.load(run.projectId))?.rev).toBe(3))
    expect(await run.projects.versions(run.projectId)).toHaveLength(3)
  })
})

// A move is one thing a designer did, and the pointer reports it as thirty. Every frame was its
// own turn on the stack, so the way back from having moved a title was thirty presses of Ctrl+Z —
// and each one moved it a third of a millimetre, which reads as nothing happening at all.
describe('a move as one step back', () => {
  async function openTheTemplate(opts: { live?: boolean } = {}) {
    await openEditor(opts)
    fireEvent.click(screen.getByRole('tab', { name: 'Mall' }))
    const box = await waitFor(() => {
      const el = target('title')
      if (!el) throw new Error('no drag box yet')
      return el
    })
    laidOut()
    return box
  }

  it('takes a whole drag back in one press, however many frames the pointer took', async () => {
    const box = await openTheTemplate()
    expect(box.style.top).toBe('5mm')

    // Ten millimetres down, in five frames — a slow hand on a trackpad, which is the ordinary case.
    dragVia(box, [30, 30], [[30, 42], [30, 54], [30, 66], [30, 78], [30, 90]])
    await waitFor(() => expect(target('title')!.style.top).toBe('15mm'))

    fireEvent.keyDown(document, { key: 'z', ctrlKey: true })
    await waitFor(() => expect(target('title')!.style.top).toBe('5mm'))
    // And the drag was the only thing on the stack: what is behind it is the document as it loaded.
    expect(header().queryByText(/Osparat/)).toBeNull()
  })

  // A drag with a way out of it (#142). Escape is what a hand that has changed its mind reaches
  // for in every application there is, and the canvas answered it with nothing: the element stood
  // where the hand had dragged it, and the drag was a row in the history like any other. Measured
  // in Chromium at 1440 x 900, an element at x 513 dragged 60 px stood at 573 when Escape was
  // pressed and at 573 after the release.
  it('puts the element back where the grab began when the drag is taken back with Escape', async () => {
    const box = await openTheTemplate({ live: true })
    expect(box.style.top).toBe('5mm')

    // The hand is still down: a frame of the drag, and no release.
    fireEvent.pointerDown(box, { pointerId: 1, button: 0, clientX: 30, clientY: 30 })
    fireEvent.pointerMove(box, { pointerId: 1, clientX: 30, clientY: 54 })
    await waitFor(() => expect(target('title')!.style.top).toBe('9mm'))

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(target('title')!.style.top).toBe('5mm'))
    // And the release that follows is a release of nothing: the hand let go of a drag that was
    // already over.
    fireEvent.pointerUp(box, { pointerId: 1, clientX: 30, clientY: 54 })
    expect(target('title')!.style.top).toBe('5mm')

    // Nothing happened, so there is nothing to save and nothing to take back. That second half is
    // the whole difference between this and the Ctrl+Z the editor already had: an undone drag is
    // a row in the history, and a drag the hand took back is not one.
    expect(header().queryByText(/Osparat/)).toBeNull()
    fireEvent.keyDown(document, { key: 'z', ctrlKey: true })
    expect(screen.queryByText(/Tog tillbaka/)).toBeNull()
    expect(target('title')!.style.top).toBe('5mm')
    // And it is said where the table says the same thing about a pull of its own.
    expect(saidIn('polite')).toBe('Draget avbröts')
  })

  // What was waiting to come forward is waiting on the same principle (#142). The first patch of
  // a drag empties the way forward, because a new branch is a new branch — right for a drag that
  // is made, wrong for one that is taken back. So the designer took a change back, laid a hand on
  // an element, changed her mind before she had moved it anywhere worth keeping, and Shift+Ctrl+Z
  // had gone with the drag that never happened. A drag taken back is nothing that happened, and
  // an emptied way forward is something that happened.
  it('leaves what was waiting to come forward waiting, when the drag that emptied it is taken back', async () => {
    const box = await openTheTemplate()
    dragVia(box, [30, 30], [[30, 36], [30, 42]])
    await waitFor(() => expect(target('title')!.style.top).toBe('7mm'))

    fireEvent.keyDown(document, { key: 'z', ctrlKey: true })
    await waitFor(() => expect(target('title')!.style.top).toBe('5mm'))

    // A grab begun and taken back. Its first patch is what empties the way forward.
    const again = target('title')!
    fireEvent.pointerDown(again, { pointerId: 1, button: 0, clientX: 30, clientY: 30 })
    fireEvent.pointerMove(again, { pointerId: 1, clientX: 30, clientY: 54 })
    await waitFor(() => expect(target('title')!.style.top).toBe('9mm'))
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(target('title')!.style.top).toBe('5mm'))
    fireEvent.pointerUp(again, { pointerId: 1, clientX: 30, clientY: 54 })

    // And the step that was taken back is still there to be put forward, and puts forward the
    // very thing it always would have.
    fireEvent.keyDown(document, { key: 'z', ctrlKey: true, shiftKey: true })
    expect(await screen.findByText(/Gjorde om: en ändring i mallen/)).toBeTruthy()
    await waitFor(() => expect(target('title')!.style.top).toBe('7mm'))
  })

  it('keeps two drags two steps, and puts each back forward on its own', async () => {
    const box = await openTheTemplate()
    dragVia(box, [30, 30], [[30, 36], [30, 42]])
    await waitFor(() => expect(target('title')!.style.top).toBe('7mm'))
    dragVia(target('title')!, [30, 42], [[30, 48], [30, 54]])
    await waitFor(() => expect(target('title')!.style.top).toBe('9mm'))

    fireEvent.keyDown(document, { key: 'z', ctrlKey: true })
    await waitFor(() => expect(target('title')!.style.top).toBe('7mm'))
    fireEvent.keyDown(document, { key: 'z', ctrlKey: true })
    await waitFor(() => expect(target('title')!.style.top).toBe('5mm'))

    fireEvent.keyDown(document, { key: 'z', ctrlKey: true, shiftKey: true })
    await waitFor(() => expect(target('title')!.style.top).toBe('7mm'))
    fireEvent.keyDown(document, { key: 'z', ctrlKey: true, shiftKey: true })
    await waitFor(() => expect(target('title')!.style.top).toBe('9mm'))
  })
})

// The same defect one surface over: the table writes a cell per keystroke, so a word typed into
// one cell was a letter per press of Ctrl+Z — and the letters came back in a field the designer
// had already left, which reads as the editor typing by itself.
//
// `body` is a writing area since L39 (#324), and a writing area is not something `userEvent` can
// type into: jsdom has no editing engine behind `contenteditable`, so a press there changes
// nothing and a test written that way would be green without meaning anything. What a browser
// really does is change the nodes and say `input`, once per keystroke — so that is what is done
// here, letter by letter, and the cell answers the way it answers a hand. What is asked of it is
// what was asked before: a word typed without leaving is one step back, and the string is the
// string (D3).
const bodyCell = (cardRef: string) => screen.getByLabelText(`${cardRef} body`)
const bodyText = (cardRef: string) => bodyCell(cardRef).textContent
async function writeBody(cardRef: string, text: string) {
  const cell = bodyCell(cardRef)
  cell.focus()
  for (let n = 0; n <= text.length; n++) {
    // The browser writes into the paragraph the caret stands in, and the cell reads its own
    // elements back out — `tillStrang` is the only way out of them, here as in the editor.
    const p = cell.querySelector('p') ?? cell.appendChild(cell.ownerDocument.createElement('p'))
    p.textContent = text.slice(0, n)
    fireEvent.input(cell)
  }
}

describe('a cell typed into as one step back', () => {
  it('takes the whole word back in one press, and the cell beside it is its own step', async () => {
    await openEditor()
    fireEvent.click(screen.getByRole('tab', { name: 'Tabell' }))
    const title = (await screen.findByLabelText('dragon title')) as HTMLInputElement
    await userEvent.clear(title)
    await userEvent.type(title, 'Drakhona')
    await screen.findByLabelText('dragon body')
    await writeBody('dragon', 'Spyr eld.')
    await waitFor(() => expect(bodyText('dragon')).toBe('Spyr eld.'))
    ;(document.activeElement as HTMLElement | null)?.blur()

    fireEvent.keyDown(document, { key: 'z', ctrlKey: true })
    await waitFor(() => expect(bodyText('dragon')).toBe('Flygande.'))
    // The title is untouched by that press: the two cells are two things she did.
    expect((screen.getByLabelText('dragon title') as HTMLInputElement).value).toBe('Drakhona')

    fireEvent.keyDown(document, { key: 'z', ctrlKey: true })
    await waitFor(() => expect((screen.getByLabelText('dragon title') as HTMLInputElement).value).toBe('Drake'))
  })

  it('starts a new step when the same cell is come back to', async () => {
    await openEditor()
    fireEvent.click(screen.getByRole('tab', { name: 'Tabell' }))
    const title = (await screen.findByLabelText('dragon title')) as HTMLInputElement
    await userEvent.clear(title)
    await userEvent.type(title, 'Drakhona')
    ;(document.activeElement as HTMLElement | null)?.blur()

    await userEvent.click(screen.getByLabelText('dragon title'))
    await userEvent.type(screen.getByLabelText('dragon title'), 'x')
    ;(document.activeElement as HTMLElement | null)?.blur()

    fireEvent.keyDown(document, { key: 'z', ctrlKey: true })
    await waitFor(() => expect((screen.getByLabelText('dragon title') as HTMLInputElement).value).toBe('Drakhona'))
  })
})

// The felt in Bord is nothing but dragging, so the defect cost most there: a zone pulled across
// the table was a step back per frame of the pointer, and every press moved it five millimetres,
// which reads as a zone that will not go back where it was (L14).
describe('a zone on the felt as one step back', () => {
  async function openTheFelt() {
    await openEditor()
    fireEvent.click(screen.getByRole('tab', { name: 'Bord' }))
    fireEvent.click(await screen.findByRole('button', { name: '＋ Yta' }))
    return document.querySelector('[data-zone-handle="yta-1"]') as HTMLElement
  }
  const where = () => document.querySelector('[data-zone-where]')?.textContent ?? ''

  it('takes a whole drag back in one press, however many frames the pointer took', async () => {
    const area = await openTheFelt()
    const laid = where()

    // Twenty-five millimetres to the right, in five frames — a slow hand, which is the ordinary one.
    fireEvent.pointerDown(area, { button: 0, clientX: 100, clientY: 100, pointerId: 1 })
    for (const x of [105, 110, 115, 120, 125]) fireEvent.pointerMove(area, { clientX: x, clientY: 100, pointerId: 1 })
    fireEvent.pointerUp(area, { pointerId: 1 })
    expect(where()).not.toBe(laid)

    fireEvent.keyDown(document, { key: 'z', ctrlKey: true })
    await waitFor(() => expect(where()).toBe(laid))
    // And the zone is still there: what lies behind the drag is the zone being added, not the
    // felt as it was before it existed.
    expect(document.querySelector('[data-zone-handle="yta-1"]')).toBeTruthy()
  })
})

// The panel beside the felt writes a zone's name per keystroke, exactly as the deck's cells do:
// the name came back a letter at a time, in a field the designer had already left (L14).
describe('a zone\'s name typed into as one step back', () => {
  const fields = () => [...document.querySelectorAll('[data-zone-props] input')] as HTMLInputElement[]
  const named = () => fields()[0]!
  const shortcut = () => fields()[1]!

  it('takes the whole name back in one press, and the field beside it is its own step', async () => {
    await openEditor()
    fireEvent.click(screen.getByRole('tab', { name: 'Bord' }))
    fireEvent.click(await waitFor(() => document.querySelector('[data-zone-handle="discard"]') as HTMLElement))

    await userEvent.clear(named())
    await userEvent.type(named(), 'Slasken')
    await userEvent.clear(shortcut())
    await userEvent.type(shortcut(), 'Släng')
    ;(document.activeElement as HTMLElement | null)?.blur()
    await waitFor(() => expect(shortcut().value).toBe('Släng'))

    // The shortcut is the last thing she did, and the name she typed before it is untouched by
    // the press that takes it back: two fields are two things.
    fireEvent.keyDown(document, { key: 'z', ctrlKey: true })
    await waitFor(() => expect(shortcut().value).toBe('Kasta'))
    expect(named().value).toBe('Slasken')

    fireEvent.keyDown(document, { key: 'z', ctrlKey: true })
    await waitFor(() => expect(named().value).toBe('Kasthög'))
  })
})

// The recipe's counters are typed into too, and the whole recipe is written out on every
// keystroke: naming a counter cost one step back per letter, and the letters came back into a
// field the designer had left (L14).
describe('a counter named as one step back', () => {
  const counter = () => screen.getByLabelText('Namn för räknare 1') as HTMLInputElement

  it('takes the whole name back in one press, and leaves the counter standing', async () => {
    await openEditor()
    fireEvent.click(screen.getByRole('tab', { name: 'Bord' }))
    fireEvent.click(await screen.findByRole('button', { name: '＋ Räknare' }))
    expect(counter().value).toBe('Poäng')

    await userEvent.clear(counter())
    await userEvent.type(counter(), 'Mynt')
    ;(document.activeElement as HTMLElement | null)?.blur()
    await waitFor(() => expect(counter().value).toBe('Mynt'))

    fireEvent.keyDown(document, { key: 'z', ctrlKey: true })
    await waitFor(() => expect(counter().value).toBe('Poäng'))
  })
})

// The panel beside the card writes on every keystroke and on every step of a slider, so a
// measurement typed into it cost a step back per digit and a rotation pushed home cost one per
// degree (L14): the same defect as the drag, on the controls the drag was meant to be exact
// about.
describe('the template panel as one step back', () => {
  async function pickTheTitle() {
    await openEditor()
    fireEvent.click(screen.getByRole('tab', { name: 'Mall' }))
    const box = await waitFor(() => {
      const el = target('title')
      if (!el) throw new Error('no drag box yet')
      return el
    })
    laidOut()
    fireEvent.pointerDown(box, { pointerId: 1, button: 0, clientX: 30, clientY: 30 })
    fireEvent.pointerUp(box, { pointerId: 1, clientX: 30, clientY: 30 })
  }

  // A slider is the plainest case of one thing said many times: pushing it home writes a patch per
  // degree, so the way back from a turned triangle was a press per degree — and each press turned
  // it back by one, which reads as a slider that will not let go.
  it('takes a slider pushed home back in one press, and the next push of it is its own step', async () => {
    await openEditor()
    fireEvent.click(screen.getByRole('tab', { name: 'Mall' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Form' }))
    fireEvent.click(screen.getByRole('button', { name: 'Triangel' }))
    const turn = () => screen.getByLabelText('Vridning') as HTMLInputElement
    expect(turn().value).toBe('0')

    turn().focus()
    for (const deg of ['30', '60', '90']) fireEvent.change(turn(), { target: { value: deg } })
    await waitFor(() => expect(turn().value).toBe('90'))
    // Let go and take hold again: the second push is the second thing she did.
    turn().blur()
    turn().focus()
    fireEvent.change(turn(), { target: { value: '180' } })
    await waitFor(() => expect(turn().value).toBe('180'))
    ;(document.activeElement as HTMLElement | null)?.blur()

    fireEvent.keyDown(document, { key: 'z', ctrlKey: true })
    await waitFor(() => expect(turn().value).toBe('90'))
    fireEvent.keyDown(document, { key: 'z', ctrlKey: true })
    await waitFor(() => expect(turn().value).toBe('0'))
  })

  it('takes a measurement typed into it back in one press, digits and all', async () => {
    await pickTheTitle()
    const x = screen.getByLabelText('X (mm)') as HTMLInputElement
    expect(x.value).toBe('5')

    await userEvent.clear(x)
    await userEvent.type(x, '12.5')
    ;(document.activeElement as HTMLElement | null)?.blur()
    await waitFor(() => expect(target('title')!.style.left).toBe('12.5mm'))

    fireEvent.keyDown(document, { key: 'z', ctrlKey: true })
    await waitFor(() => expect(target('title')!.style.left).toBe('5mm'))
  })
})

// The rulebook is written into like any page of prose, and every keystroke wrote the whole
// rulebook out: a sentence typed into a paragraph was a press of Ctrl+Z per letter, into a block
// that had closed itself the moment the designer left it (L14).
describe('a rule written as one step back', () => {
  const book = () => document.querySelector('[data-rulebook]') as HTMLElement

  it('takes the whole sentence back in one press, and the paragraph before it is its own step', async () => {
    await openEditor()
    fireEvent.click(screen.getByRole('tab', { name: 'Regler' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Börja skriva reglerna' }))

    // A section begun this way carries a question until it is answered (#131), so the question is
    // both where the writing starts and what standing one step back has to bring back.
    const asked = 'Vad handlar spelet om, i två meningar? Hur många spelar, och hur länge?'
    fireEvent.click(await within(book()).findByText(asked))
    const field = await within(book()).findByLabelText('Text b2')
    await userEvent.type(field, 'Vinner gör den som först är av med sina kort.')
    fireEvent.blur(field)
    await waitFor(() => expect(within(book()).getByText(/Vinner gör den/)).toBeTruthy())

    fireEvent.keyDown(document, { key: 'z', ctrlKey: true })
    await waitFor(() => expect(within(book()).getByText(asked)).toBeTruthy())
    // The rulebook itself is still there: what lies behind the sentence is the book being begun.
    expect(within(book()).getByRole('heading', { name: 'Översikt' })).toBeTruthy()
  })
})
