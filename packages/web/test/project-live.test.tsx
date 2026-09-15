// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectClient } from '../src/editor/ProjectClient.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { LIBRARY } from '../src/editor/symbols.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

const open = (id = 'p1') => ProjectClient.open({ http: run.http, id })

// What a thing that travels over a socket is given to arrive in. The same order as the four
// seconds a `waitFor` gets in `setup.ts`, with room on top for the client's 200-400-800 ms
// reconnection ladder, and far inside the twenty this suite is budgeted in `budget.ts`.
const PATIENCE = 5_000

// A thing that arrives over a socket is waited for, not slept for. Eighty milliseconds is enough
// for a frame to go round on an idle machine and is not always enough with the browser suites
// running beside this one — and a sleep that is usually long enough is a test that usually
// passes. This file already knew that about opening a connection; it kept sleeping on everything
// the connection then carried, which is the same bug one step further in (#92).
//
// So the assertion itself is what waits: it is read again until it holds. Nothing is weakened by
// it. A value that is simply wrong still fails, with the value it actually was, because the last
// failure is the one that is thrown.
async function eventually(check: () => void, ms = PATIENCE): Promise<void> {
  const stop = Date.now() + ms
  for (;;) {
    try {
      check()
      return
    } catch (err) {
      if (Date.now() >= stop) throw err
      await new Promise((r) => setTimeout(r, 10))
    }
  }
}

// The actor has greeted an editor when it has told it who it is. Before that the editor is alone
// with a document it read over HTTP, and nobody else has been told it is there.
const greeted = (...editors: ProjectClient[]) => eventually(() => expect(editors.map((e) => e.who)).not.toContain(null))

const here = (editor: ProjectClient) => editor.here.map((p) => p.name)
const title = (editor: ProjectClient) => editor.doc.rows.find((r) => r.id === 'dragon')?.fields['title']

// The bar in the editor's chrome that says the line is gone (D3). It stands in the flow above
// the work, so saying it moves everything under it down — and unsaying it moves it all back up.
// A break the client mends on its own first attempt would do both inside a third of a second,
// which is a page that jumps for reasons nobody is told.
describe('the line to the actor going and coming back', () => {
  it('says nothing at all about a break the client mends by itself', async () => {
    await run.projects.create('p1', projectDoc())
    const ada = await open()
    try {
      await greeted(ada)
      const said: boolean[] = []
      const watch = setInterval(() => said.push(ada.lineDown), 10)
      try {
        await run.restart()
        // Round the loop and back: the actor has greeted this editor a second time.
        ada.who = null
        await greeted(ada)
        await new Promise((r) => setTimeout(r, 200))
      } finally {
        clearInterval(watch)
      }
      expect([...new Set(said)]).toEqual([false])
    } finally {
      ada.close()
    }
  })

  it('says the line is gone once it has been gone longer than a mending would take', async () => {
    await run.projects.create('p1', projectDoc())
    const ada = await ProjectClient.open({ http: run.http, id: 'p1', dropAfterMs: 150 })
    try {
      await greeted(ada)
      await run.stop()
      await eventually(() => expect(ada.lineDown).toBe(true))
    } finally {
      ada.close()
    }
  })
})

describe('two editors on the same project (D3)', () => {
  it('sees the other one\'s edit without either of them saving', async () => {
    await run.projects.create('p1', projectDoc())
    const ada = await open()
    const bo = await open()
    await greeted(ada, bo)

    ada.setCell('dragon', 'title', 'Drakhona')
    // The one who typed it sees it at once.
    expect(title(ada)).toBe('Drakhona')
    await eventually(() => expect(title(bo)).toBe('Drakhona'))
    // Nothing was saved: the version is still the first. Asked once the edit is known to have gone
    // all the way round, so it is a version that stood still and not one that had yet to move.
    expect((await run.projects.load('p1'))?.rev).toBe(1)

    // And a save by one is a save for both.
    expect(await bo.save()).toEqual({ ok: true, rev: 2 })
    await eventually(() => expect(ada.rev).toBe(2))
    expect(ada.dirty).toBe(false)
    expect((await run.projects.load('p1'))?.rows.find((r) => r.id === 'dragon')?.fields['title']).toBe('Drakhona')
    ada.close()
    bo.close()
  })

  it('says who else has the project open, and stops saying so when they leave', async () => {
    await run.projects.create('p1', projectDoc())
    // Who is here is something the actor says over the socket, so it is waited for rather than
    // slept on. Each of the three readings below is a different list, and the one before it has
    // already held, so waiting for a list cannot pass by standing still.
    const ada = await open()
    await eventually(() => expect(here(ada)).toEqual(['Någon']))

    const bo = await ProjectClient.open({ http: run.http, id: 'p1', name: 'Bo' })
    await eventually(() => expect(here(ada)).toEqual(['Någon', 'Bo']))
    bo.close()
    await eventually(() => expect(here(ada)).toEqual(['Någon']))
    ada.close()
  })

  it('puts an editor back on the document the actor holds when its edit is refused', async () => {
    await run.projects.create('p1', projectDoc())
    const ada = await open()
    const bo = await open()
    await greeted(ada, bo)
    // Bo takes a card away; Ada, still holding it, writes to it.
    bo.removeRow('dragon')
    await eventually(() => expect(ada.doc.rows.some((r) => r.id === 'dragon')).toBe(false))
    expect(() => ada.setCell('dragon', 'title', 'Drakhona')).toThrow()
    expect(ada.doc.rows.some((r) => r.id === 'dragon')).toBe(false)
    ada.close()
    bo.close()
  })

  it('keeps working when the project is only read, so an editor without a socket still opens', async () => {
    await run.projects.create('p1', projectDoc())
    // Nothing is waited for: the document and its version came back over HTTP, before any socket.
    const ada = await open()
    expect(ada.doc.name).toBe('Skogens herrar')
    expect(ada.rev).toBe(1)
    ada.close()
    // A project that is not there is still an error, and it says which of the states it is (#12).
    await expect(open('nope')).rejects.toMatchObject({ fault: 'missing' })
  })
})

describe('who else is in the editor (D3)', () => {
  it('is the door to who has the game, and says how many are in when more than one is', async () => {
    const { render, screen, waitFor } = await import('@testing-library/react')
    const { EditorPage } = await import('../src/editor/EditorPage.js')
    await run.projects.create('p1', projectDoc())
    history.replaceState(null, '', `/editor?project=p1&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')

    // Alone, the door still stands there: it is how the game is shared at all (D3).
    const door = await screen.findByRole('button', { name: 'Vilka som har spelet' })
    await waitFor(() => expect(door.querySelectorAll('i')).toHaveLength(1))
    expect(door.textContent).not.toMatch(/inne/)

    const bo = await ProjectClient.open({ http: run.http, id: 'p1', name: 'Bo' })
    await waitFor(() => expect(door.querySelectorAll('i')).toHaveLength(2))
    expect(door.textContent).toContain('2 inne')
    bo.close()
    await waitFor(() => expect(door.querySelectorAll('i')).toHaveLength(1))
  })
})

describe('a socket that breaks (D3)', () => {
  it('comes back by itself and picks up what happened while it was gone', async () => {
    await run.projects.create('p1', projectDoc())
    const ada = await open()
    await eventually(() => expect(ada.connected).toBe(true))

    // The server goes away and comes back, as a laptop lid does.
    await run.restart()
    await eventually(() => expect(ada.connected).toBe(false))

    // Someone else edits while this editor is away.
    const bo = await open()
    await greeted(bo)
    bo.setCell('dragon', 'title', 'Drakhona')

    await eventually(() => expect(ada.connected).toBe(true))
    await eventually(() => expect(title(ada)).toBe('Drakhona'))
    ada.close()
    bo.close()
  })

  it('keeps what was written while it was gone and sends it when it is back', async () => {
    await run.projects.create('p1', projectDoc())
    const ada = await open()
    await eventually(() => expect(ada.connected).toBe(true))
    await run.restart()
    await eventually(() => expect(ada.connected).toBe(false))

    ada.setCell('dragon', 'title', 'Skrivet i mörkret')
    expect(title(ada)).toBe('Skrivet i mörkret')

    await eventually(() => expect(ada.connected).toBe(true))
    // The actor has it too, so anyone else opening the project sees it. Bo may open before what
    // Ada wrote in the dark has reached the actor, and then reads it off the socket rather than
    // out of the first response — which is the same project either way, a moment later.
    const bo = await open()
    await eventually(() => expect(title(bo)).toBe('Skrivet i mörkret'))
    ada.close()
    bo.close()
  })

  it('stays gone when the editor itself closed it', async () => {
    await run.projects.create('p1', projectDoc())
    const ada = await open()
    await eventually(() => expect(ada.connected).toBe(true))
    ada.close()
    // The one wait here that is a sleep on purpose: nothing is expected to arrive, and the only
    // way to see that nothing does is to give it the time in which it would have. Four hundred
    // milliseconds is twice the first rung of the client's reconnection ladder.
    await new Promise((r) => setTimeout(r, 400))
    expect(ada.connected).toBe(false)
  })
})

// Placing an icon is one intent carrying two things (#33), and until now only the editor's own
// copy of the document had been asked whether that worked. A service that dropped the `icon` half
// would leave the card looking right in the editor that placed it and wrong for everyone else,
// until the next reload told the designer so.
describe('an icon placed, through the actor (#33, E4, D3)', () => {
  it('reaches the other editor and the store with both halves', async () => {
    await run.projects.create('p1', projectDoc())
    const ada = await open()
    const bo = await open()
    await greeted(ada, bo)
    const svard = LIBRARY.find((s) => s.id === 'svard')!

    const id = await ada.placeIcon(svard, 'front', null)

    // The other editor was told, by the actor, about both halves of the one intent — the symbol in
    // the game's set and the element that shows it. Neither is worked out from the other, and both
    // are waited for together, so a half that never lands fails on the half it is.
    await eventually(() => {
      expect(bo.doc.icons['svärd']).toMatch(/^asset:[0-9a-f]{64}$/)
      expect(bo.doc.credits?.['svärd']?.source).toBe('svard')
      expect(bo.doc.template.faces['front']?.base.at(-1)).toMatchObject({ id, kind: 'icons', bind: { literal: 'svärd' } })
    })

    // And so was the store, once it was saved.
    expect(await bo.save()).toEqual({ ok: true, rev: 2 })
    const stored = await run.projects.load('p1')
    expect(stored?.icons['svärd']).toBe(bo.doc.icons['svärd'])
    expect(stored?.template.faces['front']?.base.some((e) => e.id === id)).toBe(true)
    ada.close()
    bo.close()
  })
})

describe('the editor when the line is gone (D3)', () => {
  // The bar stands above the work, so putting it up moves everything under it down and taking it
  // away moves it all back. For a break the client mends on its own first attempt that is a page
  // that jumps twice inside a third of a second, about something already over — which is what a
  // designer was actually seeing. So the bar waits out a mending, and only a break that outlasts
  // one is ever put on the screen.
  const editor = async (dropAfterMs: number) => {
    const { render, screen } = await import('@testing-library/react')
    const { EditorPage, DEFAULT_EDITOR_TIMING } = await import('../src/editor/EditorPage.js')
    await run.projects.create('p1', projectDoc())
    history.replaceState(null, '', `/editor?project=p1&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage timing={{ ...DEFAULT_EDITOR_TIMING, dropAfterMs }} />)
    await screen.findByText('Skogens herrar')
    await eventually(() => expect(document.querySelector('[data-offline]')).toBeNull())
  }

  it('never puts the bar up for a break the client mends by itself', async () => {
    await editor(2_000)
    const said: boolean[] = []
    const watch = setInterval(() => said.push(document.querySelector('[data-offline]') !== null), 10)
    try {
      await run.restart()
      await new Promise((r) => setTimeout(r, 400))
    } finally {
      clearInterval(watch)
    }
    expect([...new Set(said)]).toEqual([false])
  })

  it('says so once the line has been gone longer than a mending takes, and stops saying it when it is back', async () => {
    const { screen } = await import('@testing-library/react')
    await editor(60)
    await run.restart()
    await eventually(() => expect(document.querySelector('[data-offline]')).toBeTruthy())
    await eventually(() => expect(screen.queryByText(/Ingen förbindelse/)).toBeNull())
  })
})
