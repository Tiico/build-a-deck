// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
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
    await screen.findByText(/renderar kort/i)
    await run.completeRenders()
    const link = (await screen.findByRole('link', { name: /öppna bordet/i })) as HTMLAnchorElement
    expect(link.href).toMatch(/\/table\?session=[0-9a-f-]{36}&mode=tv/)
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

  it('makes a bulk change on the table one unsaved change to the project, saved like any other (#17)', async () => {
    const user = userEvent.setup()
    await run.projects.create('p1', projectDoc())
    history.replaceState(null, '', `/editor?project=p1&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')
    fireEvent.click(screen.getByRole('tab', { name: /tabell/i }))

    await user.click(screen.getByLabelText('Markera alla synliga'))
    await user.selectOptions(screen.getByLabelText('Kolumn'), 'antal')
    await user.type(screen.getByLabelText('Värde'), '4')
    await user.click(screen.getByRole('button', { name: 'Sätt antal på 3 kort' }))

    await user.click(screen.getByRole('button', { name: 'Avmarkera alla' }))
    await user.click(screen.getByLabelText('markera wizard'))
    await user.click(screen.getByRole('button', { name: 'Ta bort 1 kort' }))
    await user.click(screen.getByRole('button', { name: 'Ja, ta bort' }))

    const save = screen.getByRole('button', { name: /spara/i }) as HTMLButtonElement
    expect(save.disabled).toBe(false)
    fireEvent.click(save)
    await screen.findByText('rev 2')
    expect((await run.projects.load('p1'))?.rows).toEqual([
      { id: 'dragon', fields: { title: 'Drake', body: 'Flygande.', antal: 4 } },
      { id: 'knight', fields: { title: 'Riddare', body: 'Sköld 1.', antal: 4 } },
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

  // The reason the switch waits for the renders is that the players must never meet a card
  // without a face. A render that failed for good is exactly that case, so it has to stop the
  // switch rather than count as "done" (#10).
  it('leaves the table on its old version when a card is lost for good, and switches only after a retry succeeds', async () => {
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

    expect(await screen.findByText('1 kort kunde inte renderas. Bordet står kvar på sin gamla version.')).toBeTruthy()
    // The row is a green "it worked" banner the rest of the time; a blocked update is not that.
    expect(document.querySelector('.byd-editor-table-link')!.hasAttribute('data-lost')).toBe(true)
    expect((await run.store.read(sessionId)).map((l) => l.intent.v)).toEqual([])

    fireEvent.click(screen.getByRole('button', { name: 'Försök igen' }))
    await screen.findByText(/renderar kort 3\/4/i)
    await run.completeRenders()
    await screen.findByText(/bordet uppdaterat på rev-2/i)
    expect(document.querySelector('.byd-editor-table-link')!.hasAttribute('data-lost')).toBe(false)
    expect((await run.store.read(sessionId)).map((l) => l.intent.v)).toEqual(['version.change'])
  }, 20_000)
})

describe('the editor by keyboard alone (UX-04)', () => {
  it('switches mode from the tablist, and every tab names the panel it controls', async () => {
    const user = userEvent.setup()
    await run.projects.create('p1', projectDoc())
    history.replaceState(null, '', `/editor?project=p1&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')

    for (const name of ['Kortvägg', 'Mall', 'Tabell']) {
      const tab = screen.getByRole('tab', { name })
      const panel = document.getElementById(tab.getAttribute('aria-controls')!)!
      expect(panel.getAttribute('role')).toBe('tabpanel')
      expect(panel.getAttribute('aria-labelledby')).toBe(tab.id)
    }
    expect(screen.getByRole('tabpanel', { name: 'Kortvägg' })).toBeTruthy()

    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Kortvägg' }))
    await user.keyboard('{ArrowRight}{Enter}')
    expect(document.querySelector('[data-mode]')!.getAttribute('data-mode')).toBe('template')
    expect(screen.getByRole('tabpanel', { name: 'Mall' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Mall' }).getAttribute('aria-selected')).toBe('true')

    // Only the open panel is on the tab path; the closed ones are not reachable at all.
    expect(document.querySelectorAll('[role="tabpanel"]:not([hidden])')).toHaveLength(1)
    const panel = screen.getByRole('tabpanel', { name: 'Mall' })
    for (let i = 0; i < 6 && !panel.contains(document.activeElement); i++) await user.tab()
    expect(panel.contains(document.activeElement)).toBe(true)
  })
})

describe('the layers of the template by keyboard (UX-04)', () => {
  it('reaches the layer list from the tablist and picks a layer, and the property panel follows', async () => {
    const user = userEvent.setup()
    await run.projects.create('p1', projectDoc())
    history.replaceState(null, '', `/editor?project=p1&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')

    await user.tab()
    await user.keyboard('{ArrowRight}{Enter}')
    const layers = screen.getAllByRole('option')
    expect(layers.map((l) => l.textContent)).toEqual(['text body', 'text title', 'shape frame'])
    for (let i = 0; i < 6 && !layers.includes(document.activeElement as HTMLElement); i++) await user.tab()
    expect(document.activeElement).toBe(layers[0])
    expect(screen.getByRole('heading', { name: /egenskaper · body/i })).toBeTruthy()

    await user.keyboard('{End}')
    expect(document.activeElement).toBe(layers[2])
    expect(layers[2]!.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('heading', { name: /egenskaper · frame/i })).toBeTruthy()
    // The property panel is a keyboard's next stop, and it edits the layer just picked: the
    // field is controlled by the document, so a new value there is a patch that landed on frame.
    await user.tab()
    await user.keyboard('9')
    expect((screen.getByLabelText(/^x/i) as HTMLInputElement).value).toBe('9')
  })
})
