// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProjectClient } from '../src/editor/ProjectClient.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { LIBRARY } from '../src/editor/symbols.js'

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

const open = (id = 'p1') => ProjectClient.open({ http: run.http, id })
const settle = () => new Promise((r) => setTimeout(r, 80))

describe('two editors on the same project (D3)', () => {
  it('sees the other one\'s edit without either of them saving', async () => {
    await run.projects.create('p1', projectDoc())
    const ada = await open()
    const bo = await open()
    await settle()

    ada.setCell('dragon', 'title', 'Drakhona')
    // The one who typed it sees it at once.
    expect(ada.doc.rows.find((r) => r.id === 'dragon')?.fields['title']).toBe('Drakhona')
    await settle()
    expect(bo.doc.rows.find((r) => r.id === 'dragon')?.fields['title']).toBe('Drakhona')
    // Nothing was saved: the version is still the first.
    expect((await run.projects.load('p1'))?.rev).toBe(1)

    // And a save by one is a save for both.
    expect(await bo.save()).toEqual({ ok: true, rev: 2 })
    await settle()
    expect(ada.rev).toBe(2)
    expect(ada.dirty).toBe(false)
    expect((await run.projects.load('p1'))?.rows.find((r) => r.id === 'dragon')?.fields['title']).toBe('Drakhona')
    ada.close()
    bo.close()
  })

  it('says who else has the project open, and stops saying so when they leave', async () => {
    await run.projects.create('p1', projectDoc())
    const ada = await open()
    await settle()
    expect(ada.here.map((p) => p.name)).toEqual(['Någon'])

    const bo = await ProjectClient.open({ http: run.http, id: 'p1', name: 'Bo' })
    await settle()
    expect(ada.here.map((p) => p.name)).toEqual(['Någon', 'Bo'])
    bo.close()
    await settle()
    expect(ada.here.map((p) => p.name)).toEqual(['Någon'])
    ada.close()
  })

  it('puts an editor back on the document the actor holds when its edit is refused', async () => {
    await run.projects.create('p1', projectDoc())
    const ada = await open()
    const bo = await open()
    await settle()
    // Bo takes a card away; Ada, still holding it, writes to it.
    bo.removeRow('dragon')
    await settle()
    expect(() => ada.setCell('dragon', 'title', 'Drakhona')).toThrow()
    await settle()
    expect(ada.doc.rows.some((r) => r.id === 'dragon')).toBe(false)
    ada.close()
    bo.close()
  })

  it('keeps working when the project is only read, so an editor without a socket still opens', async () => {
    await run.projects.create('p1', projectDoc())
    const ada = await open()
    await settle()
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
    await settle()
    expect(ada.connected).toBe(true)

    // The server goes away and comes back, as a laptop lid does.
    await run.restart()
    await settle()
    expect(ada.connected).toBe(false)

    // Someone else edits while this editor is away.
    const bo = await open()
    await settle()
    bo.setCell('dragon', 'title', 'Drakhona')
    await settle()

    for (let i = 0; i < 60 && !ada.connected; i++) await new Promise((r) => setTimeout(r, 50))
    expect(ada.connected).toBe(true)
    expect(ada.doc.rows.find((r) => r.id === 'dragon')?.fields['title']).toBe('Drakhona')
    ada.close()
    bo.close()
  })

  it('keeps what was written while it was gone and sends it when it is back', async () => {
    await run.projects.create('p1', projectDoc())
    const ada = await open()
    await settle()
    await run.restart()
    await settle()

    ada.setCell('dragon', 'title', 'Skrivet i mörkret')
    expect(ada.doc.rows.find((r) => r.id === 'dragon')?.fields['title']).toBe('Skrivet i mörkret')

    for (let i = 0; i < 60 && !ada.connected; i++) await new Promise((r) => setTimeout(r, 50))
    await settle()
    // The actor has it too, so anyone else opening the project sees it.
    const bo = await open()
    await settle()
    expect(bo.doc.rows.find((r) => r.id === 'dragon')?.fields['title']).toBe('Skrivet i mörkret')
    ada.close()
    bo.close()
  })

  it('stays gone when the editor itself closed it', async () => {
    await run.projects.create('p1', projectDoc())
    const ada = await open()
    await settle()
    ada.close()
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
    await settle()
    const svard = LIBRARY.find((s) => s.id === 'svard')!

    const id = await ada.placeIcon(svard, 'front', null)
    await settle()

    // The other editor was told, by the actor, about both halves of the one intent — the symbol in
    // the game's set and the element that shows it. Neither is worked out from the other.
    expect(bo.doc.icons['svärd']).toMatch(/^asset:[0-9a-f]{64}$/)
    expect(bo.doc.credits?.['svärd']?.source).toBe('svard')
    expect(bo.doc.template.faces['front']?.base.at(-1)).toMatchObject({ id, kind: 'icons', bind: { literal: 'svärd' } })

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
  it('says so while it is away, and stops saying it when it is back', async () => {
    const { render, screen, waitFor } = await import('@testing-library/react')
    const { EditorPage } = await import('../src/editor/EditorPage.js')
    await run.projects.create('p1', projectDoc())
    history.replaceState(null, '', `/editor?project=p1&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')
    await waitFor(() => expect(document.querySelector('[data-offline]')).toBeNull())

    await run.restart()
    await waitFor(() => expect(document.querySelector('[data-offline]')).toBeTruthy())
    await waitFor(() => expect(screen.queryByText(/Ingen förbindelse/)).toBeNull(), { timeout: 4000 })
  })
})
