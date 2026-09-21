// @vitest-environment jsdom
// The question a template element is given before it goes (#143, L9). A card asks before it is
// removed and a column asks before it is removed and says what it takes with it; an element is
// the largest of the three — it draws on every card that inherits it — and was the only one that
// went without a word, from a key that in every browser means back and in every field means one
// character. So it is asked here the way the other two are asked, in the whole editor and not in
// the canvas alone: the key is heard on the document, so the press comes from wherever the
// keyboard happened to be standing.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { EditorPage } from '../src/editor/EditorPage.js'
import { StatusLive } from '../src/status/StatusLive.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { laidOut, target } from './drag.js'
import { layerIds, layerPick } from './layers.js'
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
}

// A stop in the editor that is not a field and not the layer list: the press has to come from
// where the bug was found, which is anywhere at all.
const outsideTheList = () => within(screen.getByRole('toolbar', { name: /verktyg/i })).getByRole('button', { name: 'Text' })
const question = () => screen.queryByRole('alertdialog')
// The refusal a locked layer gives, asked for where it stands: the live regions the app mounts
// are alerts of their own, and a test about the card must not be answered by one of those.
const locked = () => document.querySelector('.byd-canvas-locked')?.textContent ?? ''
const politely = () => document.querySelector('[data-status-live="polite"]')?.textContent ?? ''

describe('taking a template element away with the keyboard (#143, L9)', () => {
  it('asks first, and says the layer, the side and how many cards draw it', async () => {
    await openTheTemplate()
    await userEvent.click(layerPick('title'))
    outsideTheList().focus()

    fireEvent.keyDown(document, { key: 'Backspace' })

    // Still there: nothing goes until the question is answered.
    expect(layerIds()).toEqual(['body', 'title', 'frame'])
    expect(target('title')).toBeTruthy()
    const asked = question()
    expect(asked).toBeTruthy()
    expect(asked?.textContent).toMatch(/title/)
    expect(asked?.textContent).toMatch(/framsida/i)
    expect(asked?.textContent).toMatch(/3 kort/)
  })

  it('asks the same question for Delete, which was never the key at fault', async () => {
    await openTheTemplate()
    await userEvent.click(layerPick('title'))
    outsideTheList().focus()

    fireEvent.keyDown(document, { key: 'Delete' })
    expect(question()).toBeTruthy()
    expect(layerIds()).toEqual(['body', 'title', 'frame'])
  })

  it('is dismissed with Escape, and hands the keyboard back where it was', async () => {
    await openTheTemplate()
    await userEvent.click(layerPick('title'))
    const from = outsideTheList()
    from.focus()
    fireEvent.keyDown(document, { key: 'Backspace' })

    // It opens on the answer that loses nothing, as every question in the editor does.
    expect(document.activeElement?.textContent).toBe('Avbryt')
    await userEvent.keyboard('{Escape}')

    expect(question()).toBeNull()
    expect(layerIds()).toEqual(['body', 'title', 'frame'])
    expect(document.activeElement).toBe(from)
  })

  it('is taken with Enter on the answer that removes, and says afterwards what went', async () => {
    await openTheTemplate()
    await userEvent.click(layerPick('title'))
    const from = outsideTheList()
    from.focus()
    fireEvent.keyDown(document, { key: 'Backspace' })

    // The answer that cannot be undone is one Tab away and is given with the keyboard like any
    // other: the question never opens on it.
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
    expect(document.activeElement?.textContent).toBe('Ja, ta bort')
    await userEvent.keyboard('{Enter}')

    await waitFor(() => expect(layerIds()).toEqual(['body', 'frame']))
    expect(target('title')).toBeFalsy()
    expect(politely()).toMatch(/title/)
    expect(politely()).toMatch(/framsida/i)
    expect(document.activeElement).toBe(from)
  })

  it('leaves a field with the caret in it alone: Backspace takes a character and no layer', async () => {
    await openTheTemplate()
    await userEvent.click(layerPick('title'))
    const x = screen.getByRole('spinbutton', { name: /^x/i }) as HTMLInputElement

    await userEvent.click(x)
    await userEvent.keyboard('{Backspace}{Delete}')

    expect(question()).toBeNull()
    expect(layerIds()).toEqual(['body', 'title', 'frame'])
  })

  it('still answers a locked layer with its own explanation rather than a question (L15)', async () => {
    await openTheTemplate()
    await userEvent.click(screen.getByRole('button', { name: 'Lås title' }))
    await userEvent.click(layerPick('title'))
    outsideTheList().focus()

    fireEvent.keyDown(document, { key: 'Backspace' })

    expect(question()).toBeNull()
    expect(locked()).toMatch(/title.*låst/i)
    expect(layerIds()).toEqual(['body', 'title', 'frame'])
  })
})
