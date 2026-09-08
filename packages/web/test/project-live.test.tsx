// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProjectClient } from '../src/editor/ProjectClient.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'

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
    // A project that is not there is still an error, as before.
    await expect(open('nope')).rejects.toThrow(/nope/)
  })
})

describe('who else is in the editor (D3)', () => {
  it('names the others in the header, and says nothing at all when one is alone', async () => {
    const { render, screen, waitFor } = await import('@testing-library/react')
    const { EditorPage } = await import('../src/editor/EditorPage.js')
    await run.projects.create('p1', projectDoc())
    history.replaceState(null, '', `/editor?project=p1&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')
    // Alone with the project, there is nobody to name.
    await waitFor(() => expect(document.querySelector('[data-here]')).toBeNull())

    const bo = await ProjectClient.open({ http: run.http, id: 'p1', name: 'Bo' })
    const here = await screen.findByLabelText('Andra i spelet')
    expect(here.textContent).toContain('Bo')
    bo.close()
    await waitFor(() => expect(document.querySelector('[data-here]')).toBeNull())
  })
})
