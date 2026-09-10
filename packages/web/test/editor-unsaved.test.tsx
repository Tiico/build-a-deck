// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { EditorPage } from '../src/editor/EditorPage.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { useEditSocketImplementation, type EditSocketCtor, type WebSocketLike } from '../src/editor/ProjectClient.js'
import { EditSocket } from './setup.js'

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  useEditSocketImplementation(EditSocket as unknown as EditSocketCtor)
  await run.stop()
})

// An actor that will not make a version of what it is holding, because someone else already made
// one from the same rev. Everything else about the socket is what a socket does.
const RefusesToSave = class implements WebSocketLike {
  readyState = 1
  onopen: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor() {
    queueMicrotask(() => this.onopen?.())
  }
  send(data: string): void {
    if ((JSON.parse(data) as { t: string }).t !== 'save') return
    queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ v: 'refused', why: 'conflict' }) }))
  }
  close(): void {
    this.readyState = 3
  }
} as unknown as EditSocketCtor

async function openEditor() {
  await run.projects.create('p1', projectDoc())
  history.replaceState(null, '', `/editor?project=p1&server=${encodeURIComponent(run.http)}`)
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
}

// What the browser asks before it closes the tab, as a page can see it: a cancelled
// `beforeunload` is the browser's own question, and an uncancelled one is the tab simply going.
function closingTheTab(): boolean {
  return !window.dispatchEvent(new Event('beforeunload', { cancelable: true }))
}

// Closing or reloading the tab has to stop for work that is really unsaved (#8) — and only for
// that. A question over a deck nobody changed teaches the designer to dismiss questions.
describe('closing the tab with unsaved work (#8)', () => {
  it('says nothing while the project is as it was saved, holds the tab once it is changed, and lets go again when it is saved', async () => {
    await openEditor()
    expect(closingTheTab()).toBe(false)

    fireEvent.click(screen.getByRole('tab', { name: /tabell/i }))
    fireEvent.change(screen.getByLabelText('dragon title'), { target: { value: 'Drakhona' } })
    expect(closingTheTab()).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: /spara/i }))
    await screen.findByText('rev 2')
    // The listener is taken off in an effect, and an effect runs after the commit that the new
    // version number is painted in — so the tab lets go a beat after the number appears rather
    // than with it. Waiting for the number and then asking the question in the same breath is
    // asking it one tick early, which is a test that passes on a quiet machine and fails in a
    // full suite. The question is asked until it is answered.
    await waitFor(() => expect(closingTheTab()).toBe(false))
  })

  it('lets go of the tab when the edit is taken back by hand, without anything being saved', async () => {
    await openEditor()
    fireEvent.click(screen.getByRole('tab', { name: /tabell/i }))
    fireEvent.change(screen.getByLabelText('dragon title'), { target: { value: 'Drakhona' } })
    expect(closingTheTab()).toBe(true)

    fireEvent.change(screen.getByLabelText('dragon title'), { target: { value: 'Drake' } })

    expect(closingTheTab()).toBe(false)
    expect((await run.projects.load('p1'))?.rev).toBe(1)
  })
})

// Whether the work is safe is a fact the designer must be able to read, not infer from a button
// being greyed out (#8) — and a screen reader has to be told the moment it changes.
describe('the editor says whether the work is saved (#8)', () => {
  it('says saved on the project as it was loaded, says unsaved as soon as it differs, and says saved again after saving', async () => {
    await openEditor()
    expect(screen.getByText('Sparat').closest('[role="status"]')).not.toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: /tabell/i }))
    fireEvent.change(screen.getByLabelText('dragon title'), { target: { value: 'Drakhona' } })

    expect(screen.getByText('Osparade ändringar').closest('[role="status"]')).not.toBeNull()
    expect(screen.queryByText('Sparat')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /spara/i }))
    await screen.findByText('rev 2')
    expect(screen.getByText('Sparat').closest('[role="status"]')).not.toBeNull()
  })
})

// The one way out of the editor that the page itself can ask about (#8). The question is the
// repo's confirmation strip: it takes the focus, answers Escape, and gives the focus back.
describe('leaving the editor with unsaved work (#8)', () => {
  it('leaves without a word when the project is as it was saved', async () => {
    const went: string[] = []
    await run.projects.create('p1', projectDoc())
    history.replaceState(null, '', `/editor?project=p1&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage onNavigate={(url) => went.push(url)} />)
    await screen.findByText('Skogens herrar')

    fireEvent.click(screen.getByRole('link', { name: 'Mina spel' }))

    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(went).toHaveLength(1)
    expect(went[0]).toMatch(/^\/\?server=/)
  })

  it('asks first when something is unsaved, and stays exactly where it was when the answer is no', async () => {
    const user = userEvent.setup()
    const went: string[] = []
    await run.projects.create('p1', projectDoc())
    history.replaceState(null, '', `/editor?project=p1&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage onNavigate={(url) => went.push(url)} />)
    await screen.findByText('Skogens herrar')
    fireEvent.click(screen.getByRole('tab', { name: /tabell/i }))
    fireEvent.change(screen.getByLabelText('dragon title'), { target: { value: 'Drakhona' } })

    await user.click(screen.getByRole('link', { name: 'Mina spel' }))

    expect(went).toEqual([])
    const question = screen.getByRole('alertdialog', { name: /osparade ändringar/i })
    expect(question).toBeDefined()
    // The question is answered where it is read.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Spara och lämna' }))

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(went).toEqual([])
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Mina spel' }))
    // Nothing was lost by asking: the edit is still there, still unsaved.
    expect((screen.getByLabelText('dragon title') as HTMLInputElement).value).toBe('Drakhona')
    expect(screen.getByText('Osparade ändringar')).toBeDefined()
  })

  it('saves and then leaves when that is the answer', async () => {
    const user = userEvent.setup()
    const went: string[] = []
    await run.projects.create('p1', projectDoc())
    history.replaceState(null, '', `/editor?project=p1&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage onNavigate={(url) => went.push(url)} />)
    await screen.findByText('Skogens herrar')
    fireEvent.click(screen.getByRole('tab', { name: /tabell/i }))
    fireEvent.change(screen.getByLabelText('dragon title'), { target: { value: 'Drakhona' } })

    await user.click(screen.getByRole('link', { name: 'Mina spel' }))
    await user.click(screen.getByRole('button', { name: 'Spara och lämna' }))

    // The save is a round trip; leaving waits for it to have landed.
    await waitFor(() => expect(went).toHaveLength(1))
    const stored = await run.projects.load('p1')
    expect(stored?.rev).toBe(2)
    expect(stored?.rows.find((r) => r.id === 'dragon')?.fields['title']).toBe('Drakhona')
  })

  it('leaves the work behind when that is the answer, and the server keeps the version it had', async () => {
    const user = userEvent.setup()
    const went: string[] = []
    await run.projects.create('p1', projectDoc())
    history.replaceState(null, '', `/editor?project=p1&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage onNavigate={(url) => went.push(url)} />)
    await screen.findByText('Skogens herrar')
    fireEvent.click(screen.getByRole('tab', { name: /tabell/i }))
    fireEvent.change(screen.getByLabelText('dragon title'), { target: { value: 'Drakhona' } })

    await user.click(screen.getByRole('link', { name: 'Mina spel' }))
    await user.click(screen.getByRole('button', { name: 'Lämna utan att spara' }))

    expect(went).toHaveLength(1)
    const stored = await run.projects.load('p1')
    expect(stored?.rev).toBe(1)
    expect(stored?.rows.find((r) => r.id === 'dragon')?.fields['title']).toBe('Drake')
  })

  it('holds the designer in the editor when the save it was asked for collides with someone else', async () => {
    // The refusal is the actor's own answer, given by a stand-in socket rather than by racing a
    // real one: with a live actor (D3) an editor is told about someone else's version as it
    // happens, so the collision is a moment too short to arrange from outside. What is under
    // test is what the editor does when a save it asked for did not happen.
    useEditSocketImplementation(RefusesToSave)
    const user = userEvent.setup()
    const went: string[] = []
    await run.projects.create('p1', projectDoc())
    history.replaceState(null, '', `/editor?project=p1&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage onNavigate={(url) => went.push(url)} />)
    await screen.findByText('Skogens herrar')
    fireEvent.click(screen.getByRole('tab', { name: /tabell/i }))
    fireEvent.change(screen.getByLabelText('dragon title'), { target: { value: 'Drakhona' } })

    await user.click(screen.getByRole('link', { name: 'Mina spel' }))
    await user.click(screen.getByRole('button', { name: 'Spara och lämna' }))

    expect(went).toEqual([])
    expect((await screen.findByRole('alert')).textContent).toMatch(/någon annan har sparat/i)
    expect(screen.getByText('Osparade ändringar')).toBeDefined()
    expect(closingTheTab()).toBe(true)
  })

  // The news that a save did not happen is the one thing on the screen that says the work is
  // still only in this tab. Routine confirmations shared the slot with it and simply wrote over
  // it, so a designer who pressed Ctrl+Z next never learned that her save had failed.
  it('keeps the news that a save failed when the designer takes a step back', async () => {
    useEditSocketImplementation(RefusesToSave)
    const user = userEvent.setup()
    await run.projects.create('p1', projectDoc())
    history.replaceState(null, '', `/editor?project=p1&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')
    fireEvent.click(screen.getByRole('tab', { name: /tabell/i }))
    fireEvent.change(screen.getByLabelText('dragon title'), { target: { value: 'Drakhona' } })

    await user.click(screen.getByRole('button', { name: /spara/i }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/någon annan har sparat/i)

    fireEvent.keyDown(document, { key: 'z', ctrlKey: true })

    // Both are true at once, so both are on the screen: what just happened, and what did not.
    expect(await screen.findByText(/Tog tillbaka: en ändring i kortleken/)).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toMatch(/någon annan har sparat/i)
  })
})

// Every way out of the editor is a page load: the browser's own question would otherwise land on
// top of the answer the designer just gave, asking her the same thing twice.
describe('the browser does not ask again after the designer has answered (#8)', () => {
  it('lets the tab go once "Lämna utan att spara" has been chosen, though the work is still unsaved', async () => {
    const user = userEvent.setup()
    const went: string[] = []
    await run.projects.create('p1', projectDoc())
    history.replaceState(null, '', `/editor?project=p1&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage onNavigate={(url) => went.push(url)} />)
    await screen.findByText('Skogens herrar')
    fireEvent.click(screen.getByRole('tab', { name: /tabell/i }))
    fireEvent.change(screen.getByLabelText('dragon title'), { target: { value: 'Drakhona' } })
    expect(closingTheTab()).toBe(true)

    await user.click(screen.getByRole('link', { name: 'Mina spel' }))
    await user.click(screen.getByRole('button', { name: 'Lämna utan att spara' }))

    expect(went).toHaveLength(1)
    expect(closingTheTab()).toBe(false)
  })
})
