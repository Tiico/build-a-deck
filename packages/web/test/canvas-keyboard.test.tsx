// @vitest-environment jsdom
// The card's own elements under a keyboard (#144). Forty tab stops through the editor never
// reached one of them: the boxes over the card had no role, no name and no tab stop, and the one
// place a keyboard could pick a layer — the layer grid — is the one place its arrows are already
// spoken for. So the only way to nudge was to park the focus on something unrelated first.
//
// The whole editor and not the canvas alone, because that is where the bug was found and where
// the way back out of a move lives: Escape puts the element back through the same gesture a
// pointer drag is taken back with (#142), which only the real client can do.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { EditorPage } from '../src/editor/EditorPage.js'
import { StatusLive } from '../src/status/StatusLive.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { laidOut, target } from './drag.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

async function openTheTemplate() {
  const user = userEvent.setup()
  await run.projects.create(run.projectId, projectDoc())
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  render(
    <StatusLive>
      <EditorPage />
    </StatusLive>,
  )
  await screen.findByText('Skogens herrar')
  fireEvent.click(screen.getByRole('tab', { name: 'Mall' }))
  await waitFor(() => {
    if (!target('title')) throw new Error('no drag box yet')
  })
  laidOut()
  return user
}

// Tabs from the top of the page and writes down every stop that turns out to be an element on the
// card, in the order the keyboard meets them. The walk starts where a designer's does — the
// document, before anything has been focused — and stops when the tab order has come round to an
// element it has already been to, so a missing tab stop reads as an empty list and not as a hung
// test.
async function elementStopsByTab(user: ReturnType<typeof userEvent.setup>): Promise<string[]> {
  const found: string[] = []
  document.body.focus()
  for (let i = 0; i < 120; i++) {
    await user.tab()
    const at = document.activeElement
    if (!(at instanceof HTMLElement) || !at.hasAttribute('data-drag')) continue
    const name = at.getAttribute('aria-label') ?? ''
    if (found.includes(name)) break
    found.push(name)
  }
  return found
}

// Tabs until the named element on the card has the focus, the way a designer reaches it: from the
// top of the page, through the editor's own stops, and on into the card.
async function tabTo(user: ReturnType<typeof userEvent.setup>, id: string): Promise<HTMLElement> {
  document.body.focus()
  for (let i = 0; i < 120; i++) {
    await user.tab()
    if (document.activeElement === target(id)) return target(id)!
  }
  throw new Error(`the keyboard never reached ${id}`)
}

// What the editor said out loud without cutting anyone off. The app mounts exactly two live
// regions and no surface makes a third, so this is the one the canvas speaks through.
const politely = () => document.querySelector('[data-status-live="polite"]')?.textContent ?? ''

// How many Spaces the canvas handed on to the page. A box over the card is a div wearing the
// button role, and what the page does with a Space nobody answered is scroll — so a count above
// zero is the card sliding out from under the hand that pressed the key.
function spacesLeftToThePage() {
  let left = 0
  const watch = (event: KeyboardEvent) => {
    if (event.key === ' ' && !event.defaultPrevented) left++
  }
  document.addEventListener('keydown', watch)
  return { count: () => left, stop: () => document.removeEventListener('keydown', watch) }
}

// The layers as the panel reads them, top-most first.
const layerOrder = () => [...document.querySelectorAll('[data-layer]')].map((row) => row.getAttribute('data-layer'))

// Which layer the whole editor considers open, read off the list that says so.
const selectedLayer = () => document.querySelector('[data-layer][aria-selected="true"]')?.getAttribute('data-layer') ?? null

describe('the elements on the card as keyboard stops (#144)', () => {
  it('gives every element a stop of its own that says what it is and where it lies', async () => {
    const user = await openTheTemplate()

    // What the box is: a toggle, because pressing it is what opens and closes the move mode.
    expect(target('title')?.getAttribute('role')).toBe('button')
    expect(await elementStopsByTab(user)).toContain('title, text, x 5 mm, y 5 mm')
  })

  it('meets them in the order the layer list reads them, top-most first', async () => {
    const user = await openTheTemplate()

    // The list reads `body`, `title`, `frame`; the card is drawn the other way round. The keyboard
    // follows the list, because that is the order the designer already has in front of her.
    expect(await elementStopsByTab(user)).toEqual([
      'body, text, x 5 mm, y 30 mm',
      'title, text, x 5 mm, y 5 mm',
      'frame, form, x 1 mm, y 1 mm',
    ])
  })

  it('selects the element it arrives on, so the layer list and the properties are about it', async () => {
    const user = await openTheTemplate()
    // Past the layer grid, whose own selection follows focus (L15), and on to the last of the
    // card's three stops: arriving there has to be what decides which layer is open.
    await tabTo(user, 'frame')

    expect(selectedLayer()).toBe('frame')
    expect(screen.getByRole('heading', { name: /frame/ })).toBeTruthy()
  })
})

describe('the move mode on the card (#144)', () => {
  it('is entered and left with Enter, and says which it is to the eye and to the reader', async () => {
    const user = await openTheTemplate()
    const title = await tabTo(user, 'title')
    expect(title.getAttribute('aria-pressed')).toBe('false')

    await user.keyboard('{Enter}')
    expect(target('title')?.getAttribute('aria-pressed')).toBe('true')
    expect(target('title')?.getAttribute('aria-label')).toBe('title, text, x 5 mm, y 5 mm, flyttläge')
    // The mark the yellow frame hangs on, so the mode is a thing to see and not only to hear.
    expect(target('title')?.hasAttribute('data-moving')).toBe(true)

    await user.keyboard('{Enter}')
    expect(target('title')?.getAttribute('aria-pressed')).toBe('false')
    expect(target('title')?.getAttribute('aria-label')).toBe('title, text, x 5 mm, y 5 mm')
    expect(target('title')?.hasAttribute('data-moving')).toBe(false)
  })

  // The box says it is a button, and a button is answered with either key. A reader who does what
  // the role promises has to end up holding the element — the same holding, said the same way.
  it('is entered and left with Space as readily as with Enter', async () => {
    const user = await openTheTemplate()
    await tabTo(user, 'title')

    await user.keyboard(' ')
    expect(target('title')?.getAttribute('aria-pressed')).toBe('true')
    expect(target('title')?.getAttribute('aria-label')).toBe('title, text, x 5 mm, y 5 mm, flyttläge')
    expect(target('title')?.hasAttribute('data-moving')).toBe(true)

    // And it is a holding like any other while it stands: the arrows move the element.
    await user.keyboard('{ArrowRight}')
    expect(target('title')?.style.left).toBe('5.5mm')

    // Pressed again it lets go rather than takes back, which is what Enter does and what a toggle
    // that is already pressed must do.
    await user.keyboard(' ')
    expect(target('title')?.getAttribute('aria-pressed')).toBe('false')
    expect(target('title')?.style.left).toBe('5.5mm')
  })

  // Whatever the canvas decides to do about a Space, the page must not also get one: on a div an
  // unanswered Space scrolls, and a canvas that scrolls away under a reader is worse than a key
  // that does nothing at all. The refusal counts too — a locked layer is still an answer.
  it('never hands a Space on to the page, on the layer it holds or the one it refuses', async () => {
    const user = await openTheTemplate()
    await user.click(screen.getByRole('button', { name: 'Lås title' }))
    await tabTo(user, 'title')
    const page = spacesLeftToThePage()

    // The locked layer says no, and keeps the key while it says it.
    await user.keyboard(' ')
    expect(target('title')?.getAttribute('aria-pressed')).toBe('false')

    // And an unlocked one, all the way in, through a nudge, and out again.
    await tabTo(user, 'body')
    await user.keyboard(' {ArrowRight} ')
    page.stop()

    expect(page.count()).toBe(0)
  })

  it('nudges half a millimetre with an arrow and five with shift, and says where the element now lies', async () => {
    const user = await openTheTemplate()
    await tabTo(user, 'title')

    // `title` starts at 5, 5 mm.
    await user.keyboard('{Enter}{ArrowRight}')
    expect(target('title')?.style.left).toBe('5.5mm')
    await user.keyboard('{Shift>}{ArrowDown}{/Shift}')
    expect(target('title')?.style.top).toBe('10mm')
    expect(target('title')?.getAttribute('aria-label')).toBe('title, text, x 5.5 mm, y 10 mm, flyttläge')
  })

  it('moves nothing until the mode is entered, wherever the arrow is pressed from', async () => {
    const user = await openTheTemplate()
    // Standing on the element itself. An arrow here is a designer reading her way over the card,
    // and the mode is what turns the same key into a move.
    await tabTo(user, 'title')
    await user.keyboard('{ArrowRight}')
    expect(target('title')?.style.left).toBe('5mm')

    // And from a control that has nothing to do with the card, which is where the arrows used to
    // be answered from and where no press was ever meant for the template.
    screen.getByRole('button', { name: 'Text' }).focus()
    await user.keyboard('{ArrowRight}{ArrowDown}')
    expect([target('title')?.style.left, target('title')?.style.top]).toEqual(['5mm', '5mm'])
  })

  it('says every nudge in millimetres, in the editor’s own polite region', async () => {
    const user = await openTheTemplate()
    await tabTo(user, 'title')

    await user.keyboard('{Enter}{ArrowRight}')
    expect(politely()).toBe('title · x 5.5 mm, y 5 mm')
    await user.keyboard('{ArrowUp}')
    expect(politely()).toBe('title · x 5.5 mm, y 4.5 mm')
  })

  // The way out of a move that is already under way is the way out of a drag (#142): the element
  // goes back where the holding began, and the holding is nothing that ever happened — not a row
  // in the history and not a step to take back.
  it('leaves the mode with Escape, puts the element back, and leaves no step behind', async () => {
    const user = await openTheTemplate()
    await tabTo(user, 'title')

    await user.keyboard('{Enter}{ArrowRight}{Shift>}{ArrowDown}{/Shift}')
    expect([target('title')?.style.left, target('title')?.style.top]).toEqual(['5.5mm', '10mm'])

    await user.keyboard('{Escape}')
    await waitFor(() => expect(target('title')?.style.top).toBe('5mm'))
    expect([target('title')?.style.left, target('title')?.style.top]).toEqual(['5mm', '5mm'])
    expect(target('title')?.getAttribute('aria-pressed')).toBe('false')
    expect(politely()).toBe('Flyttningen avbröts. title ligger på x 5 mm, y 5 mm.')

    // Nothing happened, so there is nothing to save and nothing to take back.
    expect(screen.queryByText(/Osparat/)).toBeNull()
    await user.keyboard('{Control>}z{/Control}')
    expect(screen.queryByText(/Tog tillbaka/)).toBeNull()
    expect(target('title')?.style.top).toBe('5mm')
  })

  // Tabbing away is letting go, not changing your mind: what was moved stays moved, and the
  // element the keyboard has left stops wearing a frame that says the next arrow will move it.
  it('leaves the mode when the keyboard leaves the element, and keeps what was moved', async () => {
    const user = await openTheTemplate()
    await tabTo(user, 'title')
    await user.keyboard('{Enter}{ArrowRight}')

    await user.tab()
    expect(target('title')?.getAttribute('aria-pressed')).toBe('false')
    expect(target('title')?.hasAttribute('data-moving')).toBe(false)
    expect(target('title')?.style.left).toBe('5.5mm')

    // And Escape is no longer about a holding that is over.
    await user.keyboard('{Escape}')
    expect(target('title')?.style.left).toBe('5.5mm')
  })

  it('never takes hold of a locked layer, and says which one it was (L15)', async () => {
    const user = await openTheTemplate()
    await user.click(screen.getByRole('button', { name: 'Lås title' }))
    await tabTo(user, 'title')

    await user.keyboard('{Enter}{ArrowRight}')
    expect(target('title')?.getAttribute('aria-pressed')).toBe('false')
    expect(target('title')?.style.left).toBe('5mm')
    // Beside the card that did not move, which is where a lock has to answer for itself.
    expect(document.querySelector('.byd-canvas-locked')?.textContent).toMatch(/title.*låst/i)
  })
})

describe('what the move mode leaves exactly as it was (#144)', () => {
  it('leaves the layer grid its own arrows, and Alt and an arrow its own order (L15)', async () => {
    const user = await openTheTemplate()
    const pick = (id: string) => document.querySelector(`[data-layer="${id}"] .byd-layer-pick`) as HTMLElement
    pick('body').focus()

    // Down walks the rows of the grid and takes the selection with it; the card stands still.
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(pick('title'))
    expect([target('title')?.style.left, target('title')?.style.top]).toEqual(['5mm', '5mm'])

    // And Alt with an arrow is still the order, with the focus travelling with the layer.
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}')
    await waitFor(() => expect(layerOrder()).toEqual(['title', 'body', 'frame']))
    expect([target('title')?.style.left, target('title')?.style.top]).toEqual(['5mm', '5mm'])
  })

  it('hides the four handles from a reader, since a size is typed in millimetres instead', async () => {
    const user = await openTheTemplate()
    await tabTo(user, 'title')

    // They are drawn, and they are drawn for a pointer only: four named controls on each of five
    // elements would be twenty tab stops for a number the properties already take exactly.
    expect(document.querySelectorAll('[data-handle]')).toHaveLength(4)
    expect([...document.querySelectorAll('[data-handle]')].every((h) => h.getAttribute('aria-hidden') === 'true')).toBe(true)
    expect(screen.getByRole('spinbutton', { name: /^bredd/i })).toBeTruthy()
  })

  it('leaves the arrows to a property field that has the cursor', async () => {
    const user = await openTheTemplate()
    // The properties are about a layer, so one has to be open before there is a field to stand in.
    await tabTo(user, 'title')
    await user.click(screen.getByRole('spinbutton', { name: /^x/i }))
    await user.keyboard('{ArrowRight}')
    expect([target('title')?.style.left, target('title')?.style.top]).toEqual(['5mm', '5mm'])

    // Up and down are the field's own since L25: they write the number, by the same half
    // millimetre the grip beside it is pulled by. The card moves because the number moved it,
    // which is the opposite of the canvas having taken the key.
    await user.keyboard('{ArrowUp}')
    expect([target('title')?.style.left, target('title')?.style.top]).toEqual(['5.5mm', '5mm'])
  })

  // One holding is one step back (L14). The pointer's drag already works this way, and a move made
  // with the arrows is the same doing: thirty presses must not cost thirty presses to undo.
  it('puts the whole holding back with one step, however many nudges it took', async () => {
    const user = await openTheTemplate()
    await tabTo(user, 'title')

    await user.keyboard('{Enter}{ArrowRight}{ArrowRight}{ArrowRight}{Enter}')
    expect(target('title')?.style.left).toBe('6.5mm')

    await user.keyboard('{Control>}z{/Control}')
    await waitFor(() => expect(target('title')?.style.left).toBe('5mm'))
  })
})

describe('the help text under the layer list (#144)', () => {
  it('says how an element is moved, now that there is a way to move it', async () => {
    await openTheTemplate()

    // It used to name the order and the rename and stop there, which was the whole truth only for
    // as long as moving the element from the keyboard was impossible. The line under the list is
    // one sentence now and the keyboard stands behind its question mark (L32, #303) — but the
    // move is still said there, which is what #144 was about.
    expect(document.querySelector('.byd-canvas-hint')?.textContent).toContain('Dra för att ändra ordningen.')
    fireEvent.click(screen.getByRole('button', { name: 'Hjälp om lagerlistan' }))
    expect(screen.getByRole('dialog', { name: 'lagerlistan' }).textContent).toContain('Elementet flyttas från duken: Enter går in i flyttläge, pilarna nudgar.')
  })
})
