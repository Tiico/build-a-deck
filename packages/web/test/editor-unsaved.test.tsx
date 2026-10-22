// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { EditorPage } from '../src/editor/EditorPage.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { setEditSocketImplementation, type EditSocketCtor, type WebSocketLike } from '../src/editor/ProjectClient.js'
import { requestLink } from '../src/account/session.js'
import { EditSocket, RefusesToSave } from './setup.js'

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  setEditSocketImplementation(EditSocket as unknown as EditSocketCtor)
  // A network stood in for by a test is the next test's network too, unless it is given back.
  vi.restoreAllMocks()
  await run.stop()
})

async function openEditor() {
  await run.projects.create(run.projectId, projectDoc())
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
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
    await screen.findByText('v2')
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
    expect((await run.projects.load(run.projectId))?.rev).toBe(1)
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

    expect(screen.getByText('Osparat').closest('[role="status"]')).not.toBeNull()
    expect(screen.queryByText('Sparat')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /spara/i }))
    await screen.findByText('v2')
    expect(screen.getByText('Sparat').closest('[role="status"]')).not.toBeNull()
  })
})

// «Starta bord» over unsaved work saves first and starts the table on what was saved (L5, #764) —
// and says so (#737): the band said only «Nytt bord startat på rev-2», and a version the designer
// never asked for had been written without a word.
describe('starting a table over unsaved work (#737)', () => {
  it('says the version it saved as well as the table it started', async () => {
    await openEditor()
    fireEvent.click(screen.getByRole('tab', { name: /tabell/i }))
    fireEvent.change(screen.getByLabelText('dragon title'), { target: { value: 'Drakhona' } })
    fireEvent.click(screen.getByRole('button', { name: 'Starta bord' }))
    await screen.findByText(/Sparade version 2 och startade ett nytt bord/)
    expect((await run.projects.load(run.projectId))?.rev).toBe(2)
  })

  it('says only that a table started when there was nothing to save', async () => {
    await openEditor()
    fireEvent.click(screen.getByRole('button', { name: 'Starta bord' }))
    await screen.findByText(/Nytt bord startat på version 1/)
    expect(screen.queryByText(/Sparade/)).toBeNull()
  })
})

// Below 1440 the status draws a tick or an amber dot instead of its word (#668, A1), and the mark
// is drawing only: what the live region says is the word, in both states, and nothing else.
function heard(status: Element): string {
  const copy = status.cloneNode(true) as Element
  for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) hidden.remove()
  return copy.textContent ?? ''
}

describe('the save status is a word to a reader whatever it draws (#668)', () => {
  it('says «Sparat» and «Osparat» and nothing more, with the mark hidden from the reader', async () => {
    await openEditor()
    const status = document.querySelector('.byd-editor > header > [role="status"]')!
    expect(heard(status)).toBe('Sparat')
    expect(status.querySelector('[aria-hidden="true"]')).not.toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: /tabell/i }))
    fireEvent.change(screen.getByLabelText('dragon title'), { target: { value: 'Drakhona' } })
    expect(heard(status)).toBe('Osparat')
    expect(status.querySelector('[aria-hidden="true"]')).not.toBeNull()
  })
})

// An edit made while a save is travelling belongs to the next save and not to that one (#380).
// The actor saves the document it holds when the save reaches it; an edit written a moment later
// is not in that version, so counting it as saved is telling the designer her work is safe when
// it is only in this tab. It was found as a flake: the editor stood at "Sparat" with a change
// still in front of the designer, and "Spara" could not be pressed again.
describe('an edit made while the save is travelling (#380)', () => {
  it('stays unsaved, and is what the next save writes', async () => {
    await openEditor()
    fireEvent.click(screen.getByRole('tab', { name: /tabell/i }))
    fireEvent.change(screen.getByLabelText('dragon title'), { target: { value: 'Drakhona' } })

    // The save is posted while the click is dispatched, so an edit written in the same breath is
    // certain to be later than it — and certain to be earlier than the answer, which is a round
    // trip away. That is the whole race, arranged rather than waited for.
    fireEvent.click(screen.getByRole('button', { name: /spara/i }))
    fireEvent.change(screen.getByLabelText('dragon title'), { target: { value: 'Drakfrun' } })

    await screen.findByText('v2')
    expect((await run.projects.load(run.projectId))?.rows.find((r) => r.id === 'dragon')?.fields['title']).toBe('Drakhona')

    // The version that was made is not the document on the screen, so the work is unsaved and
    // «Spara» can be pressed again.
    expect(screen.getByText('Osparat')).toBeDefined()
    expect(closingTheTab()).toBe(true)
    const again = screen.getByRole('button', { name: /spara/i }) as HTMLButtonElement
    expect(again.getAttribute('aria-disabled')).toBe('false')

    fireEvent.click(again)
    await screen.findByText('v3')
    expect((await run.projects.load(run.projectId))?.rows.find((r) => r.id === 'dragon')?.fields['title']).toBe('Drakfrun')
  })
})

// The one way out of the editor that the page itself can ask about (#8). The question is the
// repo's confirmation strip: it takes the focus, answers Escape, and gives the focus back.
describe('leaving the editor with unsaved work (#8)', () => {
  it('leaves without a word when the project is as it was saved', async () => {
    const went: string[] = []
    await run.projects.create(run.projectId, projectDoc())
    history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
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
    await run.projects.create(run.projectId, projectDoc())
    history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
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
    expect(screen.getByText('Osparat')).toBeDefined()
  })

  it('saves and then leaves when that is the answer', async () => {
    const user = userEvent.setup()
    const went: string[] = []
    await run.projects.create(run.projectId, projectDoc())
    history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage onNavigate={(url) => went.push(url)} />)
    await screen.findByText('Skogens herrar')
    fireEvent.click(screen.getByRole('tab', { name: /tabell/i }))
    fireEvent.change(screen.getByLabelText('dragon title'), { target: { value: 'Drakhona' } })

    await user.click(screen.getByRole('link', { name: 'Mina spel' }))
    await user.click(screen.getByRole('button', { name: 'Spara och lämna' }))

    // The save is a round trip; leaving waits for it to have landed.
    await waitFor(() => expect(went).toHaveLength(1))
    const stored = await run.projects.load(run.projectId)
    expect(stored?.rev).toBe(2)
    expect(stored?.rows.find((r) => r.id === 'dragon')?.fields['title']).toBe('Drakhona')
  })

  it('leaves the work behind when that is the answer, and the server keeps the version it had', async () => {
    const user = userEvent.setup()
    const went: string[] = []
    await run.projects.create(run.projectId, projectDoc())
    history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage onNavigate={(url) => went.push(url)} />)
    await screen.findByText('Skogens herrar')
    fireEvent.click(screen.getByRole('tab', { name: /tabell/i }))
    fireEvent.change(screen.getByLabelText('dragon title'), { target: { value: 'Drakhona' } })

    await user.click(screen.getByRole('link', { name: 'Mina spel' }))
    await user.click(screen.getByRole('button', { name: 'Lämna utan att spara' }))

    expect(went).toHaveLength(1)
    const stored = await run.projects.load(run.projectId)
    expect(stored?.rev).toBe(1)
    expect(stored?.rows.find((r) => r.id === 'dragon')?.fields['title']).toBe('Drake')
  })

  it('holds the designer in the editor when the save it was asked for collides with someone else', async () => {
    // The refusal is the actor's own answer, given by a stand-in socket rather than by racing a
    // real one: with a live actor (D3) an editor is told about someone else's version as it
    // happens, so the collision is a moment too short to arrange from outside. What is under
    // test is what the editor does when a save it asked for did not happen.
    setEditSocketImplementation(RefusesToSave)
    const user = userEvent.setup()
    const went: string[] = []
    await run.projects.create(run.projectId, projectDoc())
    history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage onNavigate={(url) => went.push(url)} />)
    await screen.findByText('Skogens herrar')
    fireEvent.click(screen.getByRole('tab', { name: /tabell/i }))
    fireEvent.change(screen.getByLabelText('dragon title'), { target: { value: 'Drakhona' } })

    await user.click(screen.getByRole('link', { name: 'Mina spel' }))
    await user.click(screen.getByRole('button', { name: 'Spara och lämna' }))

    expect(went).toEqual([])
    expect((await screen.findByRole('alert')).textContent).toMatch(/någon annan har sparat/i)
    expect(screen.getByText('Osparat')).toBeDefined()
    expect(closingTheTab()).toBe(true)
  })

  // The news that a save did not happen is the one thing on the screen that says the work is
  // still only in this tab. Routine confirmations shared the slot with it and simply wrote over
  // it, so a designer who pressed Ctrl+Z next never learned that her save had failed.
  it('keeps the news that a save failed when the designer takes a step back', async () => {
    setEditSocketImplementation(RefusesToSave)
    const user = userEvent.setup()
    await run.projects.create(run.projectId, projectDoc())
    history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
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

// A save puts away only what stood when it was pressed (#996), and the news that the last save
// failed is exactly that: once a save goes through, the work is no longer only in this tab.
describe('a save that goes through after one that did not (#996)', () => {
  // The store fails the first write the way a database that drops its connection does, and takes
  // the second.
  it('takes the news that a save failed away once a later save goes through', async () => {
    const user = userEvent.setup()
    await openEditor()
    fireEvent.click(screen.getByRole('tab', { name: /tabell/i }))
    fireEvent.change(screen.getByLabelText('dragon title'), { target: { value: 'Drakhona' } })
    vi.spyOn(run.projects, 'replace').mockRejectedValueOnce(new Error('connection terminated'))

    await user.click(screen.getByRole('button', { name: 'Spara' }))
    const failed = await screen.findByRole('alert')
    expect(failed.textContent).not.toBe('')
    expect(screen.getByText('Osparat')).toBeDefined()

    await user.click(await screen.findByRole('button', { name: 'Spara' }))
    await screen.findByText('v2')
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(screen.getByText('Sparat')).toBeDefined()
  })
})

// A save that did not go through says so in the editor's words, and never in the table's (#1018).
// «Bordet tog inte emot draget» is the felt's sentence about a move: under the save button it told
// the designer nothing about her work, and nothing about whether «Spara» was safe to press again.
describe('a save that does not go through says it in the editor’s words (#1018)', () => {
  const said = async () => (await screen.findByRole('alert')).textContent ?? ''
  const changeSomething = () => {
    fireEvent.click(screen.getByRole('tab', { name: /tabell/i }))
    fireEvent.change(screen.getByLabelText('dragon title'), { target: { value: 'Drakhona' } })
  }

  // The database drops its connection in the middle of the write: the actor refuses with the
  // store's own message, which nothing in the editor knows.
  it('says the save did not go through when the store fails under it', async () => {
    const user = userEvent.setup()
    await openEditor()
    changeSomething()
    vi.spyOn(run.projects, 'replace').mockRejectedValueOnce(new Error('connection terminated'))

    await user.click(screen.getByRole('button', { name: 'Spara' }))

    expect(await said()).toBe('Det gick inte att spara. Dina ändringar finns kvar här, så försök igen.')
    expect(screen.getByRole('alert').textContent).not.toMatch(/bordet|draget/i)
    expect(screen.getByText('Osparat')).toBeDefined()
  })

  // The line goes while the save is on it: the save is answered over that line or not at all.
  it('says the save got no answer when the line goes with the save on it', async () => {
    setEditSocketImplementation(DropsOnSave)
    const user = userEvent.setup()
    await openEditor()
    changeSomething()

    await user.click(screen.getByRole('button', { name: 'Spara' }))

    expect(await said()).toBe('Servern svarade inte, så det gick inte att spara. Dina ändringar finns kvar här, så försök igen.')
    expect(screen.getByText('Osparat')).toBeDefined()
  })

  // With the line down a save goes over HTTP, and on a network that is gone the request never gets
  // an answer at all. It threw past the editor's save, which then said «Sparar…» for good.
  it('says the save got no answer when its request never reaches the server, and lets it be asked again', async () => {
    setEditSocketImplementation(NeverConnects)
    const user = userEvent.setup()
    await openEditor()
    changeSomething()
    const real = globalThis.fetch
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => (init?.method === 'PUT' ? Promise.reject(new TypeError('Failed to fetch')) : real(input, init)))

    await user.click(screen.getByRole('button', { name: 'Spara' }))

    expect(await said()).toBe('Servern svarade inte, så det gick inte att spara. Dina ändringar finns kvar här, så försök igen.')
    expect(screen.getByRole('button', { name: 'Spara' }).getAttribute('aria-disabled')).toBe('false')
    expect(screen.getByText('Osparat')).toBeDefined()
  })

  // Signed out in another tab while the line was down: the save over HTTP is told to log in.
  it('says the save did not go through because the designer is no longer signed in', async () => {
    const owned = await startServer({ auth: true, authBypass: true })
    try {
      setEditSocketImplementation(NeverConnects)
      const user = userEvent.setup()
      await requestLink(owned.http, 'ada@example.test', '/')
      await owned.projects.create(owned.projectId, projectDoc(), await accountOf(owned))
      await openEditorOn(owned)
      changeSomething()
      expect((await fetch(`${owned.http}/auth/logout`, { method: 'POST' })).status).toBe(200)

      await user.click(screen.getByRole('button', { name: 'Spara' }))

      expect(await said()).toBe('Du är utloggad, så det gick inte att spara. Dina ändringar finns kvar här.')
      expect(screen.getByText('Osparat')).toBeDefined()
    } finally {
      await owned.stop()
    }
  })

  // The owner took the game back while the line was down: the save over HTTP is shut.
  it('says the save did not go through because the designer may no longer change the game', async () => {
    const owned = await startServer({ auth: true, authBypass: true })
    try {
      setEditSocketImplementation(NeverConnects)
      const user = userEvent.setup()
      await requestLink(owned.http, 'ada@example.test', '/')
      const ada = await accountOf(owned)
      await owned.projects.create(owned.projectId, projectDoc(), 'någon-annan')
      await owned.projects.share(owned.projectId, ada, 'editor')
      await openEditorOn(owned)
      changeSomething()
      await owned.projects.unshare(owned.projectId, ada)

      await user.click(screen.getByRole('button', { name: 'Spara' }))

      expect(await said()).toBe('Du har inte längre rätt att ändra spelet, så det gick inte att spara. Dina ändringar finns kvar här.')
      expect(screen.getByText('Osparat')).toBeDefined()
    } finally {
      await owned.stop()
    }
  })

  // The game was deleted under the save: the actor's own word for it, said as it was before.
  it('says the game is gone when the store no longer has it', async () => {
    const user = userEvent.setup()
    await openEditor()
    changeSomething()
    vi.spyOn(run.projects, 'replace').mockResolvedValueOnce('missing')

    await user.click(screen.getByRole('button', { name: 'Spara' }))

    expect(await said()).toBe('Spelet finns inte längre. Dina ändringar finns kvar här.')
  })
})

async function openEditorOn(server: Running) {
  history.replaceState(null, '', `/editor?project=${server.projectId}&server=${encodeURIComponent(server.http)}`)
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
}

// The id of the account the page is signed in as, which the store needs to share a game with it:
// the one game the account makes for itself is the account's own.
async function accountOf(server: Running): Promise<string> {
  const res = await fetch(`${server.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...projectDoc(), id: server.otherProjectId }) })
  expect(res.status).toBe(201)
  const owner = (await server.projects.load(server.otherProjectId))?.owner
  if (!owner) throw new Error('the game made by the account names no owner')
  return owner
}

// A line that is never there: every attempt closes before it opens, the way it does with the wifi
// gone. The editor carries on with the document it read over HTTP, and saves over HTTP.
const NeverConnects = class implements WebSocketLike {
  readyState = 0
  onopen: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onclose: ((event?: { code?: number }) => void) | null = null
  onerror: (() => void) | null = null
  constructor() {
    queueMicrotask(() => {
      this.readyState = 3
      this.onclose?.({ code: 1006 })
    })
  }
  send(): void {
    // Nothing to send on: the line was never there.
  }
  close(): void {
    this.readyState = 3
  }
} as unknown as EditSocketCtor

// A socket that is a socket in every way, until the editor asks it for a version: then the line is
// gone, the way a wifi that drops is gone, with no close frame and no answer.
const DropsOnSave = class extends EditSocket {
  override send(data: string): void {
    if ((JSON.parse(data) as { t: string }).t === 'save') return this.terminate()
    super.send(data)
  }
} as unknown as EditSocketCtor

// Every way out of the editor is a page load: the browser's own question would otherwise land on
// top of the answer the designer just gave, asking her the same thing twice.
describe('the browser does not ask again after the designer has answered (#8)', () => {
  it('lets the tab go once "Lämna utan att spara" has been chosen, though the work is still unsaved', async () => {
    const user = userEvent.setup()
    const went: string[] = []
    await run.projects.create(run.projectId, projectDoc())
    history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
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
