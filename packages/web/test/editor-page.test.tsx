// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { EditorPage } from '../src/editor/EditorPage.js'
import { TableClient } from '../src/client.js'
import { projectDoc } from './project-doc.js'
import { asSeat, registerRoom, startServer, type Running } from './fixture.js'

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

describe('EditorPage', () => {
  it('uses one tab stop and moves focus and selection with ArrowRight', async () => {
    await run.projects.create('p1', projectDoc())
    history.replaceState(null, '', `/editor?project=p1&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')

    const wall = screen.getByRole('tab', { name: 'Kortvägg' })
    const template = screen.getByRole('tab', { name: 'Mall' })
    const table = screen.getByRole('tab', { name: 'Tabell' })
    expect([wall, template, table].map((tab) => tab.getAttribute('tabindex'))).toEqual(['0', '-1', '-1'])

    wall.focus()
    fireEvent.keyDown(wall, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(template)
    expect(template.getAttribute('aria-selected')).toBe('true')
  })

  it('wraps with ArrowLeft and supports Home and End', async () => {
    await run.projects.create('p1', projectDoc())
    history.replaceState(null, '', `/editor?project=p1&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')

    const wall = screen.getByRole('tab', { name: 'Kortvägg' })
    wall.focus()
    fireEvent.keyDown(wall, { key: 'ArrowLeft' })
    const last = screen.getByRole('tab', { name: 'Bord' })
    expect(document.activeElement).toBe(last)

    fireEvent.keyDown(last, { key: 'Home' })
    expect(document.activeElement).toBe(wall)
    fireEvent.keyDown(wall, { key: 'End' })
    expect(document.activeElement).toBe(last)
    expect(last.getAttribute('aria-selected')).toBe('true')
  })

  it('connects each tab to an accessibly named tabpanel', async () => {
    await run.projects.create('p1', projectDoc())
    history.replaceState(null, '', `/editor?project=p1&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')

    expect(screen.getByRole('tablist', { name: 'Editorlägen' })).toBeTruthy()
    for (const [name, panelId] of [
      ['Kortvägg', 'editor-panel-wall'],
      ['Mall', 'editor-panel-template'],
      ['Tabell', 'editor-panel-table'],
    ] as const) {
      expect(screen.getByRole('tab', { name }).getAttribute('aria-controls')).toBe(panelId)
    }
    expect(screen.getByRole('tabpanel', { name: 'Kortvägg' }).id).toBe('editor-panel-wall')
  })

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
    expect(document.querySelector('[data-layer="title"] button')!.getAttribute('aria-pressed')).toBe('true')
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
    await screen.findByText(/renderar kort/i)
    await run.completeRenders()
    const link = (await screen.findByRole('link', { name: /öppna bordet/i })) as HTMLAnchorElement
    expect(link.href).toMatch(/\/table\?session=[0-9a-f-]{36}&host=[A-Za-z0-9_-]{20,}&mode=tv/)
    expect((await run.store.loadSession(new URL(link.href).searchParams.get('session')!))?.version).toBe('rev-2')
  }, 20_000)

  it('imports cards as an unsaved table edit and persists them on save', async () => {
    await run.projects.create('p1', projectDoc())
    history.replaceState(null, '', `/editor?project=p1&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')
    fireEvent.click(screen.getByRole('tab', { name: /tabell/i }))

    const file = new File(['id,title,body,antal\nphoenix,Fenix,Återföds,3'], 'kort.csv', { type: 'text/csv' })
    fireEvent.change(screen.getByLabelText('Importera CSV'), { target: { files: [file] } })
    expect(await screen.findByLabelText('phoenix title')).toBeTruthy()
    expect(document.querySelectorAll('[data-card-ref]')).toHaveLength(1)
    const save = screen.getByRole('button', { name: /spara/i }) as HTMLButtonElement
    expect(save.disabled).toBe(false)

    fireEvent.click(save)
    await screen.findByText('rev 2')
    expect((await run.projects.load('p1'))?.rows).toEqual([
      { id: 'phoenix', fields: { title: 'Fenix', body: 'Återföds', antal: 3 } },
    ])
  })
})

describe('the table follows the editor (C7, L5)', () => {
  it('after a table is started, "Uppdatera bordet" refreshes it instead of starting another; "Nytt bord" starts one', async () => {
    await run.projects.create('p1', projectDoc())
    history.replaceState(null, '', `/editor?project=p1&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')
    fireEvent.click(screen.getByRole('button', { name: /uppdatera bordet/i }))
    await screen.findByText(/renderar kort/i)
    await run.completeRenders()
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
    const second = ((await screen.findByRole('link', { name: /öppna bordet/i })) as HTMLAnchorElement).href
    expect(new URL(second).searchParams.get('session')).not.toBe(sessionId)
  }, 20_000)
})

describe('a table opens only once its cards can be seen (L5)', () => {
  it('shows how the rendering comes along and withholds the link until every texture is done', async () => {
    await run.projects.create('p1', projectDoc())
    history.replaceState(null, '', `/editor?project=p1&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')
    fireEvent.click(screen.getByRole('button', { name: /uppdatera bordet/i }))
    expect(await screen.findByText(/renderar kort 0\/4/i)).toBeTruthy()
    expect(screen.queryByRole('link', { name: /öppna bordet/i })).toBeNull()
    expect(await run.completeRenders()).toBe(4)
    expect(await screen.findByRole('link', { name: /öppna bordet/i })).toBeTruthy()
    expect(screen.queryByText(/renderar kort/i)).toBeNull()
  })
})

describe('"Uppdatera bordet" switches the table only when the new cards can be seen (L5)', () => {
  it('renders first, then sends the version change; the table never sees a card without its texture', async () => {
    await run.projects.create('p1', projectDoc())
    history.replaceState(null, '', `/editor?project=p1&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')
    fireEvent.click(screen.getByRole('button', { name: /uppdatera bordet/i }))
    await screen.findByText(/renderar kort/i)
    await run.completeRenders()
    const link = (await screen.findByRole('link', { name: /öppna bordet/i })) as HTMLAnchorElement
    const sessionId = new URL(link.href).searchParams.get('session')!

    fireEvent.click(screen.getByRole('tab', { name: /tabell/i }))
    fireEvent.change(screen.getByLabelText('dragon title'), { target: { value: 'Drakhona' } })
    fireEvent.click(screen.getByRole('button', { name: /uppdatera bordet/i }))
    expect(await screen.findByText(/renderar kort 3\/4/i)).toBeTruthy()
    expect((await run.store.read(sessionId)).map((l) => l.intent.v)).toEqual([])
    expect(await run.completeRenders()).toBe(1)
    await screen.findByText(/bordet uppdaterat på rev-2/i)
    expect((await run.store.read(sessionId)).map((l) => l.intent.v)).toEqual(['version.change'])
    expect(screen.getByRole('link', { name: /öppna bordet/i })).toBeTruthy()
  })

  it('keeps the old table revision on a terminal render error and retries only when asked', async () => {
    await run.projects.create('p1', projectDoc())
    history.replaceState(null, '', `/editor?project=p1&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')
    fireEvent.click(screen.getByRole('button', { name: /uppdatera bordet/i }))
    await screen.findByText(/renderar kort/i)
    await run.completeRenders()
    const link = (await screen.findByRole('link', { name: /öppna bordet/i })) as HTMLAnchorElement
    const sessionId = new URL(link.href).searchParams.get('session')!

    fireEvent.click(screen.getByRole('tab', { name: /tabell/i }))
    fireEvent.change(screen.getByLabelText('dragon title'), { target: { value: 'Drakhona' } })
    fireEvent.click(screen.getByRole('button', { name: /uppdatera bordet/i }))
    expect(await screen.findByText(/renderar kort 3\/4/i)).toBeTruthy()
    expect(await run.failRenders()).toBe(1)

    expect(await screen.findByText('1 textur kunde inte renderas. Bordet har inte uppdaterats.')).toBeTruthy()
    expect((await run.store.read(sessionId)).map((line) => line.intent.v)).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: 'Försök igen' }))
    await screen.findByText(/renderar kort 3\/4/i)
    await run.completeRenders()
    await screen.findByText(/bordet uppdaterat på rev-2/i)
    expect((await run.store.read(sessionId)).map((line) => line.intent.v)).toEqual(['version.change'])
  })
})

describe('the host\'s controls (DRIFT §9)', () => {
  it('shows the room code with "Ny kod", and each seated guest with a kick that frees the seat', async () => {
    await run.projects.create('p1', projectDoc())
    history.replaceState(null, '', `/editor?project=p1&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')
    fireEvent.click(screen.getByRole('button', { name: /uppdatera bordet/i }))
    const code = await screen.findByText(/^[A-Z2-9]{6}$/, { selector: '[data-room-code]' })
    const first = code.textContent ?? ''
    await run.completeRenders()
    const link = (await screen.findByRole('link', { name: /öppna bordet/i })) as HTMLAnchorElement
    const sessionId = new URL(link.href).searchParams.get('session') ?? ''
    registerRoom(sessionId, { code: first, hostKey: new URL(link.href).searchParams.get('host') ?? '' })

    const ada = TableClient.connect(await asSeat(run, sessionId, 'A', 'Ada'))
    await ada.ready()
    await ada.send({ v: 'seat.claim', seat: 'A', name: 'Ada' })
    fireEvent.click(await screen.findByRole('button', { name: 'Sparka Ada' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Sparka Ada' })).toBeNull())
    await waitFor(() => expect(ada.refused).toBe('kicked'))

    fireEvent.click(screen.getByRole('button', { name: 'Ny kod' }))
    await waitFor(() => expect(screen.getByText(/^[A-Z2-9]{6}$/, { selector: '[data-room-code]' }).textContent).not.toBe(first))
  })
})

describe('the table tab: zone names and the phone\'s verbs (C4)', () => {
  it('lists the zones with name and shortcut, previews the phone\'s sheet, and saves the edit', async () => {
    await run.projects.create('p1', projectDoc())
    history.replaceState(null, '', `/editor?project=p1&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')
    fireEvent.click(screen.getByRole('tab', { name: 'Bord' }))

    const label = screen.getByLabelText('Genväg för Kasthög') as HTMLInputElement
    expect(label.value).toBe('Kasta')
    expect(screen.getByText('Kasta', { selector: '[data-sheet-preview] span' })).toBeTruthy()
    // Without a shortcut the phone shows the name.
    fireEvent.change(label, { target: { value: '' } })
    expect(screen.getByText('Kasthög', { selector: '[data-sheet-preview] span' })).toBeTruthy()
    fireEvent.change(label, { target: { value: 'Kasta i påsen' } })
    expect(screen.getByText('Kasta i påsen', { selector: '[data-sheet-preview] span' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Placering för Kasthög'), { target: { value: 'bottom' } })
    fireEvent.change(screen.getByLabelText('Namn för Draghög'), { target: { value: 'Leken' } })
    expect(screen.getByText(/underst i Leken/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Spara' }))
    await waitFor(async () => expect((await run.projects.load('p1'))?.rev).toBe(2))
    const stored = await run.projects.load('p1')
    expect(stored?.setup.zones.find((z) => z.id === 'discard')).toMatchObject({ name: 'Kasthög', shortcut: { label: 'Kasta i påsen', at: 'bottom' } })
    expect(stored?.setup.zones.find((z) => z.id === 'draw')?.name).toBe('Leken')
    // The hands are not the phone's targets and are not listed.
    expect(screen.queryByLabelText(/Genväg för Hand/)).toBeNull()
  })
})
