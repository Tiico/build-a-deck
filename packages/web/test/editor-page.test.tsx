// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { EditorPage } from '../src/editor/EditorPage.js'
import { TableClient } from '../src/client.js'
import { projectDoc } from './project-doc.js'
import { buildBlankProject } from '../src/wizard/build.js'
import { asSeat, registerRoom, startServer, type Running } from './fixture.js'
import { layerNames, layerPick, layerRow, layerRows } from './layers.js'
import { JSDOM_TEST_BUDGET } from './budget.js'
import { openAllSections } from './sections.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// The panel folds (#478); this file is about the controls in it, so every section stands open.
beforeEach(openAllSections)

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

describe('EditorPage', () => {
  it('opens the project on the wall, moves between modes, saves, and starts a table', async () => {
    await run.projects.create(run.projectId, projectDoc())
    history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    expect(await screen.findByText('Skogens herrar')).toBeTruthy()
    expect(document.querySelectorAll('[data-card-ref]')).toHaveLength(3)
    expect(document.querySelector('[data-mode]')!.getAttribute('data-mode')).toBe('wall')

    // Clicking an element on any card opens template mode with it selected.
    fireEvent.click(document.querySelector('[data-card-ref="knight"] [data-element="title"]')!)
    expect(document.querySelector('[data-mode]')!.getAttribute('data-mode')).toBe('template')
    expect(document.querySelector('[data-layer="title"]')!.getAttribute('aria-selected')).toBe('true')
    fireEvent.change(screen.getByRole('spinbutton', { name: /storlek/i }), { target: { value: '18' } })
    // A typed number is written when the field is left (#478).
    fireEvent.blur(screen.getByRole('spinbutton', { name: /storlek/i }))

    // The table tab edits data; the save button reflects unsaved work.
    fireEvent.click(screen.getByRole('tab', { name: /tabell/i }))
    expect(document.querySelector('[data-mode]')!.getAttribute('data-mode')).toBe('table')
    fireEvent.change(screen.getByLabelText('dragon title'), { target: { value: 'Drakhona' } })
    const save = screen.getByRole('button', { name: /spara/i }) as HTMLButtonElement
    expect(save.getAttribute('aria-disabled')).toBe('false')
    fireEvent.click(save)
    await screen.findByText('rev 2')
    expect(screen.getByRole('button', { name: /spara/i }).getAttribute('aria-disabled')).toBe('true')
    const stored = await run.projects.load(run.projectId)
    expect(stored?.rev).toBe(2)
    expect(stored?.rows.find((r) => r.id === 'dragon')?.fields['title']).toBe('Drakhona')
    expect(stored?.template.faces['front']?.base.find((e) => e.id === 'title')).toMatchObject({ font: { sizePt: 18 } })

    // Back on the wall, the deck shows the edit; starting a table yields a link.
    fireEvent.click(screen.getByRole('tab', { name: /kortvägg/i }))
    expect(await screen.findByText('Drakhona')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /starta bord/i }))
    await screen.findByText(/renderar kort/i)
    await run.completeRenders()
    const link = (await screen.findByRole('link', { name: /öppna bordet/i })) as HTMLAnchorElement
    expect(link.href).toMatch(/\/table\?session=[0-9a-f-]{36}&host=[A-Za-z0-9_-]{20,}&mode=tv/)
    expect((await run.store.loadSession(new URL(link.href).searchParams.get('session')!))?.version).toBe('rev-2')
  }, 20_000)

  it('shows on the Bord tab the deck a started table would get, rows times antal (L4, #85)', async () => {
    await run.projects.create(run.projectId, projectDoc())
    history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')
    fireEvent.click(screen.getByRole('tab', { name: 'Bord' }))
    // dragon x2, knight x1, wizard x1 — the four cards the server deals, not a stand-in twenty.
    await waitFor(() => expect(document.querySelector('.byd-pile[data-zone="draw"] .byd-pile-n')?.textContent).toBe('4'))
  })

  it('imports cards as an unsaved table edit and persists them on save', async () => {
    await run.projects.create(run.projectId, projectDoc())
    history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')
    fireEvent.click(screen.getByRole('tab', { name: /tabell/i }))

    const file = new File(['id,title,body,antal\nphoenix,Fenix,Återföds,3'], 'kort.csv', { type: 'text/csv' })
    // The CSV pair is behind the box at the end of the table's crown (#130).
    fireEvent.click(screen.getByRole('button', { name: 'CSV' }))
    fireEvent.change(screen.getByLabelText('Importera CSV…'), { target: { files: [file] } })
    // The file leaves out cards the deck has, so the import asks before it removes them (#479).
    fireEvent.click(await screen.findByRole('button', { name: 'Ja, ersätt korten' }))
    expect(await screen.findByLabelText('phoenix title')).toBeTruthy()
    expect(document.querySelectorAll('[data-card-ref]')).toHaveLength(1)
    const save = screen.getByRole('button', { name: /spara/i }) as HTMLButtonElement
    expect(save.getAttribute('aria-disabled')).toBe('false')

    fireEvent.click(save)
    await screen.findByText('rev 2')
    expect((await run.projects.load(run.projectId))?.rows).toEqual([
      { id: 'phoenix', fields: { title: 'Fenix', body: 'Återföds', antal: 3 } },
    ])
  })

  it('makes a bulk change on the table one unsaved change to the project, saved like any other (#17)', async () => {
    const user = userEvent.setup()
    await run.projects.create(run.projectId, projectDoc())
    history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')
    fireEvent.click(screen.getByRole('tab', { name: /tabell/i }))

    await user.click(screen.getByLabelText('Markera alla synliga'))
    // The column and the value are behind «Sätt fält» in the foot (#618).
    await user.click(screen.getByRole('button', { name: 'Sätt fält' }))
    await user.selectOptions(screen.getByLabelText('Kolumn'), 'antal')
    await user.type(screen.getByLabelText('Värde'), '4')
    await user.click(screen.getByRole('button', { name: 'Sätt antal på 3 kort' }))

    await user.click(screen.getByRole('button', { name: 'Avmarkera alla' }))
    await user.click(screen.getByLabelText('markera wizard'))
    await user.click(screen.getByRole('button', { name: 'Ta bort 1 kort' }))
    await user.click(screen.getByRole('button', { name: 'Ja, ta bort' }))

    const save = screen.getByRole('button', { name: /spara/i }) as HTMLButtonElement
    expect(save.getAttribute('aria-disabled')).toBe('false')
    fireEvent.click(save)
    await screen.findByText('rev 2')
    expect((await run.projects.load(run.projectId))?.rows).toEqual([
      { id: 'dragon', fields: { title: 'Drake', body: 'Flygande.', antal: 4 } },
      { id: 'knight', fields: { title: 'Riddare', body: 'Sköld 1.', antal: 4 } },
    ])
  })
})

// The header's filled action is one button doing two jobs (L5), and until #417 it wore the name of
// the second of them on a game that had never had a table: «Uppdatera bordet» stood there, enabled,
// and started a session with a room code guests could join. A control is named for what it does, so
// the name follows the job it is about to do.
describe('the header says which of its two jobs the filled button will do (#417)', () => {
  it('names it «Starta bord» on a game that has no table', async () => {
    await run.projects.create(run.projectId, projectDoc())
    history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')
    expect(screen.getByRole('button', { name: 'Starta bord' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Uppdatera bordet' })).toBeNull()
  })

  it('names it «Uppdatera bordet» once the game has a table', async () => {
    await run.projects.create(run.projectId, projectDoc())
    history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')
    fireEvent.click(screen.getByRole('button', { name: 'Starta bord' }))
    await screen.findByText(/nytt bord startat/i)
    await run.completeRenders()
    expect(await screen.findByRole('button', { name: 'Uppdatera bordet' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Starta bord' })).toBeNull()
    // And the table one already has is not the only one a game may have: the second way, «Nytt
    // bord», is what starts another from here on — in the caret's menu (beslut 2026-09-27, #477).
    expect(screen.queryByRole('button', { name: 'Nytt bord' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Fler vägar till bordet' }))
    expect(await screen.findByRole('button', { name: 'Nytt bord' })).toBeTruthy()
  })

  // The press is answered before the table is (#315), and that answer is a name too: while the
  // first table is being started the button must not say it is updating one.
  it('says «Startar bordet…» while the start is on the wire', async () => {
    await run.projects.create(run.projectId, projectDoc())
    history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')

    // The start held still for as long as the test needs it: what the button says in between is
    // the whole question.
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    const real = globalThis.fetch
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (init?.method === 'POST' && url.endsWith('/sessions')) await held
      return real(input, init)
    })
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Starta bord' }))
      const busy = await screen.findByRole('button', { name: 'Startar bordet…' })
      expect(busy.getAttribute('aria-busy')).toBe('true')
      expect(busy.getAttribute('aria-disabled')).toBe('true')
      release()
      expect(await screen.findByRole('button', { name: 'Uppdatera bordet' })).toBeTruthy()
    } finally {
      spy.mockRestore()
    }
  })
})

describe('the table follows the editor (C7, L5)', () => {
  it('after a table is started, "Uppdatera bordet" refreshes it instead of starting another; "Nytt bord" starts one', async () => {
    await run.projects.create(run.projectId, projectDoc())
    history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')
    fireEvent.click(screen.getByRole('button', { name: /starta bord/i }))
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

    // «Nytt bord» is in the caret's menu (beslut 2026-09-27, #477 fynd 4).
    fireEvent.click(screen.getByRole('button', { name: 'Fler vägar till bordet' }))
    fireEvent.click(await screen.findByRole('button', { name: /nytt bord/i }))
    await screen.findByText(/nytt bord startat/i)
    const second = ((await screen.findByRole('link', { name: /öppna bordet/i })) as HTMLAnchorElement).href
    expect(new URL(second).searchParams.get('session')).not.toBe(sessionId)
  }, 20_000)
})

describe('a table opens only once its cards can be seen (L5)', () => {
  it('shows how the rendering comes along and withholds the link until every texture is done', async () => {
    await run.projects.create(run.projectId, projectDoc())
    history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')
    fireEvent.click(screen.getByRole('button', { name: /starta bord/i }))
    expect(await screen.findByText(/renderar kort 0\/4/i)).toBeTruthy()
    expect(screen.queryByRole('link', { name: /öppna bordet/i })).toBeNull()
    expect(await run.completeRenders()).toBe(4)
    expect(await screen.findByRole('link', { name: /öppna bordet/i })).toBeTruthy()
    expect(screen.queryByText(/renderar kort/i)).toBeNull()
  })
})

// Every hook of the page is called on every render, loading or loaded: a hook placed after the
// page's early returns (#534 put `useLang` there) is called only once the project has arrived,
// and React says so — and would lose the page's state the day it mattered.
describe('the editor page keeps the order of its hooks (Rules of Hooks)', () => {
  it('calls the same hooks while it loads as once it has loaded', async () => {
    const said = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      await run.projects.create(run.projectId, projectDoc())
      history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
      render(<EditorPage />)
      await screen.findByText('Skogens herrar')
      expect(said.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('order of Hooks'))).toEqual([])
    } finally {
      said.mockRestore()
    }
  })
})

// Efter start (#523, beställarens beslut C): när texturerna är renderade säger editorn vilka kort
// en telefon inte kan läsa, i E5:s form — en anmärkning som inte stoppar något — och visar dem på
// kortväggen med telefonens öga. Talet är måttstockens (`minPtIn`), aldrig ett eget.
describe('the cards a phone cannot read, said once the table is up (#523)', () => {
  const start = async () => {
    await run.projects.create(run.projectId, projectDoc())
    history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')
    fireEvent.click(screen.getByRole('button', { name: /starta bord/i }))
    await screen.findByText(/renderar kort/i)
  }

  it('counts the cards whose text a 320 px phone shows under the floor, and opens the wall at the phone’s eye', async () => {
    await start()
    await run.completeRenders(Infinity, 6.5)
    const said = await screen.findByText(/har text under/)
    expect(said.textContent).toBe('3 kort har text under 7,3 pt, som en telefon på 320 px visar under 12 px.')
    // The table is up all the same: a remark stops nothing.
    expect(await screen.findByRole('link', { name: /öppna bordet/i })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Visa på kortväggen' }))
    expect((await screen.findByRole('button', { name: /^Ögon/ })).textContent).toContain('Telefonens läsvy')
  })

  it('says nothing when every card reads', async () => {
    await start()
    await run.completeRenders(Infinity, 9)
    expect(await screen.findByRole('link', { name: /öppna bordet/i })).toBeTruthy()
    expect(screen.queryByText(/har text under/)).toBeNull()
  })
})

describe('"Uppdatera bordet" switches the table only when the new cards can be seen (L5)', () => {
  it('renders first, then sends the version change; the table never sees a card without its texture', async () => {
    await run.projects.create(run.projectId, projectDoc())
    history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')
    fireEvent.click(screen.getByRole('button', { name: /starta bord/i }))
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
    await run.projects.create(run.projectId, projectDoc())
    history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')
    fireEvent.click(screen.getByRole('button', { name: /starta bord/i }))
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

describe('the header steps (#566)', () => {
  // A character is drawn by whatever font the machine has, and ↶ ↷ are a hairline hook on a Mac
  // and something else on Linux. The steps are drawn by the editor, a mirrored pair of one hook.
  it('draws undo and redo as one hook, mirrored, rather than as characters', async () => {
    await run.projects.create(run.projectId, projectDoc())
    history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')

    const undo = screen.getByRole('button', { name: 'Ångra: inget att ta tillbaka' })
    const redo = screen.getByRole('button', { name: 'Gör om: inget att göra om' })
    for (const b of [undo, redo]) {
      expect(b.textContent).toBe('')
      expect(b.querySelector('svg[aria-hidden="true"]')).toBeTruthy()
    }
    expect(redo.querySelector('svg')!.innerHTML).toBe(undo.querySelector('svg')!.innerHTML)
    expect(redo.querySelector('svg')!.hasAttribute('data-mirrored')).toBe(true)
    expect(undo.querySelector('svg')!.hasAttribute('data-mirrored')).toBe(false)
  })
})

describe('the editor by keyboard alone (UX-04)', () => {
  it('switches mode from the tablist, and every tab names the panel it controls', async () => {
    const user = userEvent.setup()
    await run.projects.create(run.projectId, projectDoc())
    history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')

    for (const name of ['Kortvägg', 'Mall', 'Tabell']) {
      const tab = screen.getByRole('tab', { name })
      const panel = document.getElementById(tab.getAttribute('aria-controls')!)!
      expect(panel.getAttribute('role')).toBe('tabpanel')
      expect(panel.getAttribute('aria-labelledby')).toBe(tab.id)
    }
    expect(screen.getByRole('tabpanel', { name: 'Kortvägg' })).toBeTruthy()

    // "Mina spel" is the header's first stop (#8) — a way back belongs before what it leads away
    // from — then the game's own ⋯ beside its name (#542), and then the revision, which names the
    // version and opens the history (B4). The step back and forward follow the save status they
    // belong to (#566), and then the tablist, where the arrow keys move inside it as before.
    await user.tab()
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Fler val för Skogens herrar' }))
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /rev 1/ }))
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Ångra: inget att ta tillbaka' }))
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Gör om: inget att göra om' }))
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
    await run.projects.create(run.projectId, projectDoc())
    history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')
    // «Mina spel», the game's ⋯ (#542), the revision, the step back and forward (#566), and then
    // the tablist.
    for (let i = 0; i < 6; i++) await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Kortvägg' }))
    await user.keyboard('{ArrowRight}{Enter}')
    expect(layerNames()).toEqual(['body', 'title', 'frame'])
    const cells = layerRows().map((r) => r.querySelector('.byd-layer-pick') as HTMLElement)
    for (let i = 0; i < 10 && !cells.includes(document.activeElement as HTMLElement); i++) await user.tab()
    expect(document.activeElement).toBe(layerPick('body'))
    expect(screen.getByRole('heading', { name: /egenskaper · body/i })).toBeTruthy()

    await user.keyboard('{End}')
    expect(document.activeElement).toBe(layerPick('frame'))
    expect(layerRow('frame').getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('heading', { name: /egenskaper · frame/i })).toBeTruthy()
    // Past the grid, which is a layer of its own (#18), and past the rule to see by under it, the
    // property panel is the next stop — the crown over the desk is behind us, since #129 put it
    // over all four columns and not over the card alone — and it edits the layer just picked: the
    // field is controlled by the document, so a new value there is a patch that landed on frame.
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('checkbox', { name: /rutnät/i }))
    // Then the question mark at the column's foot, where the keyboard's own help lives (L32).
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Hjälp om lagerlistan' }))
    // Then the stage itself, which is a stop because it is a box that scrolls (#146): once the
    // card is zoomed bigger than the room it is in, panning it is a thing a keyboard has to be
    // able to do.
    await user.tab()
    expect(document.activeElement).toBe(document.querySelector('.byd-canvas-stage'))
    // Then the card itself: every element on it is a stop of its own since #144, met in the order
    // the layer list reads them, and the last of the three is the layer this test has open.
    for (const id of ['body', 'title', 'frame']) {
      await user.tab()
      expect(document.activeElement).toBe(document.querySelector(`[data-drag="${id}"]`))
    }
    // Then the zoom's own pill, in the canvas' lower corner: it is read after the card because it
    // is about the card (#146). Three stops since #619 — the percentage is the one that opens
    // «Passa in» and the rest.
    for (const name of ['Förstora mindre', /^Förstoring: /, 'Förstora mer']) {
      await user.tab()
      expect(document.activeElement).toBe(screen.getByRole('button', { name }))
    }
    // Then the row under the card that says which card it is (#478): the step back is locked on
    // the first card and is no stop, so the card's name and the step forward.
    const cardRow = within(screen.getByRole('group', { name: 'Kortet mallen visas på' }))
    await user.tab()
    expect(document.activeElement).toBe(cardRow.getByRole('button', { name: /Drake/ }))
    await user.tab()
    expect(document.activeElement).toBe(cardRow.getByRole('button', { name: 'Nästa kort' }))
    // And then the properties, where the first stop is the grip beside the first number and the
    // second is the number itself (L25): the icon is the field's name and the thing it is pulled
    // by, and a reader who never reaches the field still has to reach the grip.
    // The panel's first section head comes first, since the panel folds (#478).
    await user.tab()
    expect(document.activeElement?.closest('.byd-props-sec-head')).toBeTruthy()
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('slider', { name: 'X (mm), dra för att ändra' }))
    await user.tab()
    await user.keyboard('9')
    expect((screen.getByRole('spinbutton', { name: /^x/i }) as HTMLInputElement).value).toBe('9')
  })
})

describe('editing the template on the canvas (#18)', () => {
  it('adds an element from the tool rail and takes it away again, as unsaved changes to the project', async () => {
    const user = userEvent.setup()
    await run.projects.create(run.projectId, projectDoc())
    history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')
    fireEvent.click(screen.getByRole('tab', { name: /mall/i }))

    // The new element is on the card, on top, selected, and its properties are open.
    await user.click(screen.getByRole('button', { name: 'Text' }))
    const layers = () => layerNames()
    expect(layers()).toEqual(['text-1', 'body', 'title', 'frame'])
    expect(layerRow('text-1').getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('heading', { name: /egenskaper · text-1/i })).toBeTruthy()
    expect(document.querySelector('[data-element="text-1"]')).toBeTruthy()

    // It lands in the saved project through the same path every other editor change takes.
    fireEvent.click(screen.getByRole('button', { name: /spara/i }))
    await screen.findByText('rev 2')
    const stored = await run.projects.load(run.projectId)
    expect(stored?.template.faces['front']?.base.map((e) => e.id)).toEqual(['frame', 'title', 'body', 'text-1'])

    // Delete asks first (#143, L9), and the answer takes the selected element away with the
    // layer list following it.
    await user.keyboard('{Delete}')
    expect(layers()).toEqual(['text-1', 'body', 'title', 'frame'])
    await user.click(screen.getByRole('button', { name: 'Ja, ta bort' }))
    expect(layers()).toEqual(['body', 'title', 'frame'])
    expect(document.querySelector('[data-element="text-1"]')).toBeNull()
  }, 20_000)
})

describe('the order of the layers (#18)', () => {
  it('moves a layer with Alt and an arrow, and the card is drawn in the new order', async () => {
    const user = userEvent.setup()
    await run.projects.create(run.projectId, projectDoc())
    history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')
    fireEvent.click(screen.getByRole('tab', { name: /mall/i }))
    const drawn = () => [...document.querySelectorAll('#canvas [data-element]')].map((e) => e.getAttribute('data-element'))
    expect(drawn()).toEqual(['frame', 'title', 'body'])

    // Up the layer list is towards the front of the card, so `title` is drawn last.
    const title = layerPick('title')
    title.focus()
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}')
    expect([...document.querySelectorAll('[data-layer]')].map((l) => l.getAttribute('data-layer'))).toEqual(['title', 'body', 'frame'])
    expect(drawn()).toEqual(['frame', 'body', 'title'])

    fireEvent.click(screen.getByRole('button', { name: /spara/i }))
    await screen.findByText('rev 2')
    expect((await run.projects.load(run.projectId))?.template.faces['front']?.base.map((e) => e.id)).toEqual(['frame', 'body', 'title'])
  }, 20_000)
})

describe('the host\'s controls (DRIFT §9)', () => {
  it('shows the room code with "Ny kod", and each seated guest with a kick that frees the seat', async () => {
    await run.projects.create(run.projectId, projectDoc())
    history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')
    fireEvent.click(screen.getByRole('button', { name: /starta bord/i }))
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

// A game made without the guided start (L42) arrives here with nothing but its name and its
// table: no cards, no fields, two empty faces. The editor has to be a place such a game can be
// built in, or the door past the wizard leads nowhere — so the first element and the first card
// are made here, the way every other change is, and saved like any other.
describe('a game made without the guided start (L42)', () => {
  it('opens empty, and the first element and the first card are made in the editor', async () => {
    const user = userEvent.setup()
    await run.projects.create(run.projectId, buildBlankProject({ name: 'Kråkkriget', players: 3 }))
    history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Kråkkriget')
    expect(document.querySelectorAll('[data-card-ref]')).toHaveLength(0)

    fireEvent.click(screen.getByRole('tab', { name: /mall/i }))
    await user.click(screen.getByRole('button', { name: 'Text' }))
    expect(document.querySelector('[data-element="text-1"]')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: /tabell/i }))
    fireEvent.click(screen.getByRole('button', { name: '+ Nytt kort' }))

    fireEvent.click(screen.getByRole('button', { name: /spara/i }))
    await screen.findByText('rev 2')
    const stored = await run.projects.load(run.projectId)
    expect(stored?.template.faces['front']?.base.map((e) => e.id)).toEqual(['text-1'])
    expect(stored?.rows).toHaveLength(1)
  }, 20_000)
})

// The empty game on the wall (#476, beslut 2026-09-27, variant A): a black wall and «0 kort · Inga
// anmärkningar», which reads as an approval, and nothing about where the first card and the first
// element are made. The wall now says so and has the two doors on it.
describe('the wall of a game with nothing in it (#476)', () => {
  async function blank(): Promise<void> {
    await run.projects.create(run.projectId, buildBlankProject({ name: 'Kråkkriget', players: 3 }))
    history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Kråkkriget')
  }
  const wall = () => within(document.querySelector('.byd-wall-deck') as HTMLElement)

  it('says the game has no cards, where they are made, and does not call an empty deck checked', async () => {
    await blank()
    expect(wall().getByRole('heading', { name: 'Spelet har inga kort än' })).toBeTruthy()
    expect(wall().getByText('Ett kort är en rad i Tabell, och mallen i Mall ritar det. Börja var du vill.')).toBeTruthy()
    expect(screen.queryByText('Inga anmärkningar')).toBeNull()
  })

  it('makes the first card on the spot, and then points at the front that is still to be drawn', async () => {
    const user = userEvent.setup()
    await blank()
    await user.click(wall().getByRole('button', { name: '+ Nytt kort' }))
    await waitFor(() => expect(document.querySelectorAll('[data-card-ref]')).toHaveLength(1))
    expect(wall().getByText('Korten har ingen framsida än: mallen är tom.')).toBeTruthy()
    await user.click(wall().getByRole('button', { name: 'Rita framsidan i Mall →' }))
    expect(screen.getByRole('tab', { name: /mall/i }).getAttribute('aria-selected')).toBe('true')
  })
})

// The wall is a place the designer comes back to (#477): a tab switch threw away the search, the
// eye the deck was read with and where the wall stood, and a card chosen elsewhere stood far down
// the wall without being brought into view.
describe('the wall remembers where it was left (#477)', () => {
  it('keeps the search, the eye and the scroll across a tab switch, and brings the chosen card into view', async () => {
    await run.projects.create(run.projectId, projectDoc())
    history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
    const into = vi.fn()
    const had = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = into
    try {
      render(<EditorPage />)
      await screen.findByText('Skogens herrar')
      fireEvent.change(screen.getByRole('searchbox', { name: 'Sök i alla fält' }), { target: { value: 'Drake' } })
      fireEvent.click(screen.getByRole('button', { name: /^Ögon/ }))
      fireEvent.click(screen.getByRole('button', { name: 'Gråskala' }))
      const deck = document.querySelector('[data-wall]') as HTMLElement
      deck.scrollTop = 240
      fireEvent.scroll(deck)

      fireEvent.click(screen.getByRole('tab', { name: /tabell/i }))
      await waitFor(() => expect(document.querySelector('tr[data-card-ref="knight"]')).not.toBeNull())
      fireEvent.click(document.querySelector('tr[data-card-ref="knight"]')!)
      fireEvent.click(screen.getByRole('tab', { name: /kortvägg/i }))

      expect((screen.getByRole('searchbox', { name: 'Sök i alla fält' }) as HTMLInputElement).value).toBe('Drake')
      expect(document.querySelector('[data-wall]')!.getAttribute('data-eye')).toBe('gray')
      expect((document.querySelector('[data-wall]') as HTMLElement).scrollTop).toBe(240)
      // The search found only the dragon, so the knight chosen in Tabell is not on the wall to show.
      fireEvent.change(screen.getByRole('searchbox', { name: 'Sök i alla fält' }), { target: { value: '' } })
      fireEvent.click(screen.getByRole('tab', { name: /tabell/i }))
      fireEvent.click(screen.getByRole('tab', { name: /kortvägg/i }))
      await waitFor(() => expect(into.mock.contexts.some((el) => (el as Element).getAttribute('data-card-ref') === 'knight')).toBe(true))
    } finally {
      Element.prototype.scrollIntoView = had
    }
  })
})
