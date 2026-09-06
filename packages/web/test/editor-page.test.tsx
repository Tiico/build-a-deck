// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { EditorPage } from '../src/editor/EditorPage.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

describe('EditorPage', () => {
  it('opens the project on the wall, moves between modes, saves, and starts a table', async () => {
    await run.projects.create('p1', projectDoc())
    history.replaceState(null, '', `/editor?project=p1&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    expect(await screen.findByText('Skogens herrar')).toBeTruthy()
    expect(document.querySelectorAll('[data-card-ref]')).toHaveLength(3)
    expect(document.querySelector('[data-mode]')!.getAttribute('data-mode')).toBe('wall')

    // Clicking an element on any card opens template mode with it selected.
    fireEvent.click(document.querySelector('[data-card-ref="knight"] [data-element="title"]')!)
    expect(document.querySelector('[data-mode]')!.getAttribute('data-mode')).toBe('template')
    expect(document.querySelector('[data-layer="title"]')!.getAttribute('aria-selected')).toBe('true')
    fireEvent.change(screen.getByLabelText(/storlek/i), { target: { value: '18' } })

    // The table tab edits data; the save button reflects unsaved work.
    fireEvent.click(screen.getByRole('tab', { name: /tabell/i }))
    expect(document.querySelector('[data-mode]')!.getAttribute('data-mode')).toBe('table')
    fireEvent.change(screen.getByLabelText('dragon title'), { target: { value: 'Drakhona' } })
    const save = screen.getByRole('button', { name: /spara/i }) as HTMLButtonElement
    expect(save.disabled).toBe(false)
    fireEvent.click(save)
    await screen.findByText('rev 2')
    expect((screen.getByRole('button', { name: /spara/i }) as HTMLButtonElement).disabled).toBe(true)
    const stored = await run.projects.load('p1')
    expect(stored?.rev).toBe(2)
    expect(stored?.rows.find((r) => r.id === 'dragon')?.fields['title']).toBe('Drakhona')
    expect(stored?.template.faces['front']?.base.find((e) => e.id === 'title')).toMatchObject({ font: { sizePt: 18 } })

    // Back on the wall, the deck shows the edit; starting a table yields a link.
    fireEvent.click(screen.getByRole('tab', { name: /kortvägg/i }))
    expect(await screen.findByText('Drakhona')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /uppdatera bordet/i }))
    const link = (await screen.findByRole('link', { name: /öppna bordet/i })) as HTMLAnchorElement
    expect(link.href).toMatch(/\/table\?session=[0-9a-f-]{36}&mode=tv/)
    expect((await run.store.loadSession(new URL(link.href).searchParams.get('session')!))?.version).toBe('rev-2')
  }, 20_000)
})

describe('the table follows the editor (C7, L5)', () => {
  it('after a table is started, "Uppdatera bordet" refreshes it instead of starting another; "Nytt bord" starts one', async () => {
    await run.projects.create('p1', projectDoc())
    history.replaceState(null, '', `/editor?project=p1&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')
    fireEvent.click(screen.getByRole('button', { name: /uppdatera bordet/i }))
    const link = (await screen.findByRole('link', { name: /öppna bordet/i })) as HTMLAnchorElement
    const sessionId = new URL(link.href).searchParams.get('session')!

    fireEvent.click(screen.getByRole('tab', { name: /tabell/i }))
    fireEvent.change(screen.getByLabelText('dragon antal'), { target: { value: '4' } })
    fireEvent.click(screen.getByRole('button', { name: /uppdatera bordet/i }))
    await screen.findByText(/rev-2/)
    expect((await run.store.read(sessionId)).map((l) => l.intent.v)).toEqual(['version.change'])
    expect(screen.getAllByRole('link', { name: /öppna bordet/i })).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: /nytt bord/i }))
    await screen.findByText(/nytt bord startat/i)
    const second = (screen.getByRole('link', { name: /öppna bordet/i }) as HTMLAnchorElement).href
    expect(new URL(second).searchParams.get('session')).not.toBe(sessionId)
  }, 20_000)
})
