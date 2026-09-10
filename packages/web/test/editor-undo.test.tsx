// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { EditorPage } from '../src/editor/EditorPage.js'
import { StatusLive } from '../src/status/StatusLive.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'

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
  await run.projects.create('p1', projectDoc())
  history.replaceState(null, '', `/editor?project=p1&server=${encodeURIComponent(run.http)}`)
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
    await screen.findByText('Osparade ändringar')

    // Pressed from inside the field: saving is the editor's wherever it is asked for, and the
    // browser's own "save this page" must not be what happens instead.
    const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, cancelable: true, bubbles: true })
    cell.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    await waitFor(async () => expect((await run.projects.load('p1'))?.rev).toBe(2))
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
    await screen.findByText('Osparade ändringar')
  }

  it('is not a saving: the chord on an untouched document leaves the history where it was', async () => {
    await openEditor()
    // The control: a chord with something to save does make a version, so a green test here is
    // never a chord that quietly did nothing at all.
    await typeInTheDeck('Drakhona')
    fireEvent.keyDown(document, { key: 's', ctrlKey: true })
    await screen.findByText('Sparat')
    expect((await run.projects.load('p1'))?.rev).toBe(2)

    // Nothing has been typed since. However often it is asked for, there is nothing to keep.
    fireEvent.keyDown(document, { key: 's', ctrlKey: true })
    fireEvent.keyDown(document, { key: 's', ctrlKey: true })

    // The next real change is version three: proof that the presses in between never counted.
    await typeInTheDeck('Drakhöna')
    fireEvent.keyDown(document, { key: 's', ctrlKey: true })
    await waitFor(async () => expect((await run.projects.load('p1'))?.rev).toBe(3))
    expect(await run.projects.versions('p1')).toHaveLength(3)
  })
})
