// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { DEFAULT_EDITOR_TIMING, EditorPage } from '../src/editor/EditorPage.js'
import { TableClient } from '../src/client.js'
import { projectDoc } from './project-doc.js'
import { asObserver, asSeat, asTable, registerRoom, roomOf, startServer, type Running } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

// A table of this game, started the way the editor starts one.
async function startTable(project = run.projectId): Promise<string> {
  const res = await fetch(`${run.http}/projects/${project}/sessions`, { method: 'POST' })
  if (!res.ok) throw new Error(`could not start a table: ${res.status}`)
  const made = (await res.json()) as { id: string; code: string; hostKey: string }
  registerRoom(made.id, made)
  return made.id
}

// Bordsspalten är tre grupper sedan #176: det som spelas står öppet, det som startades och
// aldrig rördes och det som är avslutat ligger bakom var sin hopfällbar rad. Frågorna i den här
// filen gäller raderna, var de än är filade, så vecken fälls ut först och raderna hämtas på det
// som gör en rad till en rad — bordet den handlar om.
async function rows(): Promise<HTMLElement[]> {
  const user = userEvent.setup()
  // Listan är serverns svar, så den kommer efter fliken.
  await waitFor(() => expect(document.querySelectorAll('.byd-table-row, .byd-tables-fold').length).toBeGreaterThan(0))
  for (const fold of [...document.querySelectorAll<HTMLElement>('.byd-tables-fold')]) {
    if (fold.getAttribute('aria-expanded') === 'false') await user.click(fold)
  }
  return [...document.querySelectorAll<HTMLElement>('.byd-table-row')]
}

// Den enda raden på fliken, för de prov som startar ett enda bord.
async function onlyRow(): Promise<HTMLElement> {
  const all = await rows()
  expect(all).toHaveLength(1)
  return all[0]!
}

// Radens meny: de fem vägar som inte står framme (#176).
async function openMenu(row: HTMLElement): Promise<HTMLElement> {
  const user = userEvent.setup()
  await user.click(within(row).getByRole('button', { name: /Fler vägar in till bordet/ }))
  return within(row).getByRole('menu')
}

async function openTables(): Promise<void> {
  const user = userEvent.setup()
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
  await user.click(screen.getByRole('tab', { name: 'Bord' }))
}

describe('when the tables cannot be listed', () => {
  it('says so, rather than saying "loading" for ever', async () => {
    await run.projects.create(run.projectId, projectDoc())
    // The list is the server's; a server that cannot answer must not leave the tab pretending
    // to be busy, because nothing will ever arrive to end it.
    const { TablesTab } = await import('../src/editor/TablesTab.js')
    const client = { rev: 1, tables: () => Promise.reject(new Error('kunde inte hämta borden')), startTable: () => Promise.reject(new Error('nej')) }
    render(<TablesTab client={client as unknown as Parameters<typeof TablesTab>[0]['client']} server={run.http} />)
    expect((await screen.findByRole('alert')).textContent).toBe('kunde inte hämta borden')
    expect(screen.queryByText(/laddar bord/i)).toBeNull()
  })
})

describe('the Bord tab (#19)', () => {
  it('lists the tables this game has, with the version each runs and that nothing has happened yet', async () => {
    await run.projects.create(run.projectId, projectDoc())
    const id = await startTable()
    await openTables()

    const table = await onlyRow()
    expect(table.getAttribute('data-table')).toBe(id)
    expect(table.textContent).toContain('rev-1')
    expect(table.textContent).toContain('inga drag än')
  })

  it('says so when the game has no table at all', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openTables()
    expect(await screen.findByText(/Inget bord ännu/)).toBeTruthy()
    // Utan bord finns ingen lista alls, bara meningen om att det inte finns något.
    expect(document.querySelector('.byd-table-row, .byd-tables-fold')).toBeNull()
  })
})

describe('the ways into a table (#19)', () => {
  it('reaches the TV view, the table mode, playing from here and watching, each in a new tab and saying so', async () => {
    await run.projects.create(run.projectId, projectDoc())
    const id = await startTable()
    await openTables()
    const row = await onlyRow()
    const ws = run.http.replace(/^http/, 'ws')
    const name = id.slice(0, 8)

    // The seat to sit on comes from the table itself, so the ways are complete once it answers.
    await within(row).findByRole('link', { name: /Spela härifrån/ })
    // Sitting down stands ready in the row (#176); the other three are in its menu, in the order
    // the menu lists them.
    const menu = await openMenu(row)
    // The ready way is a link in the row; the three in the menu are menu items that happen to be
    // links, which is what a menu item made of an anchor is.
    const ways = [within(row).getByRole('link', { name: /Spela härifrån/ }), ...within(menu).getAllByRole('menuitem')].filter((el) => el.hasAttribute('href'))
    expect(ways.map((a) => a.getAttribute('href'))).toEqual([
      `/online?session=${id}&seat=A&name=Designern&owner=1&server=${encodeURIComponent(ws)}`,
      `/table?session=${id}&mode=tv&owner=1&server=${encodeURIComponent(ws)}`,
      `/table?session=${id}&mode=table&owner=1&server=${encodeURIComponent(ws)}`,
      `/observe?session=${id}&name=Designern&owner=1&server=${encodeURIComponent(ws)}`,
    ])
    // A link that leaves the editor behind says so, and says which table it is about: four
    // identical rows of links are otherwise four times the same word to a screen reader.
    for (const [i, label] of ['Spela härifrån', 'Öppna TV-vyn', 'Bordsläge', 'Titta på'].entries()) {
      const way = ways[i]!
      expect(way.getAttribute('target')).toBe('_blank')
      expect(way.getAttribute('rel')).toBe('noreferrer')
      expect(way.getAttribute('aria-label')).toBe(`${label} för bordet ${name} (öppnas i ny flik)`)
    }
  })
})

describe('what the Bord tab says about a running table (#19, C7)', () => {
  it('names who is seated and who is watching, and marks a table the project has left behind', async () => {
    await run.projects.create(run.projectId, projectDoc())
    const id = await startTable()
    const ada = TableClient.connect(await asSeat(run, id, 'A', 'Ada'))
    await ada.ready()
    await ada.send({ v: 'seat.claim', seat: 'A', name: 'Ada' })
    const eva = TableClient.connect(await asObserver(run, id, 'Eva'))
    await eva.ready()
    // The designer keeps working: the project is on rev 2, the table still plays rev-1 (C7). She
    // has to have actually changed something — a saving that changes nothing is not one (B4).
    const worked = projectDoc()
    await run.projects.replace(run.projectId, 1, { ...worked, rows: [...worked.rows, { id: 'älva', fields: { title: 'Älva', body: 'Flyger tyst.', antal: 1 } }] })

    await openTables()
    const row = await onlyRow()
    // Who sits comes in the snapshot and who watches in the roster — two frames, so two renders
    // are possible; both are waited for rather than read off whichever arrived first.
    expect(await within(row).findByText(/Ada spelar/)).toBeTruthy()
    expect(await within(row).findByText(/Eva tittar på/)).toBeTruthy()
    expect(row.textContent).toContain('rev-1')
    expect(within(row).getByText(/ligger efter rev-2/)).toBeTruthy()
    expect(row.getAttribute('data-stale')).toBe('true')

    ada.close()
    eva.close()
  })

  it('says nothing about lagging behind once the log is locked: an ended table can never be updated', async () => {
    await run.projects.create(run.projectId, projectDoc())
    const id = await startTable()
    await run.projects.replace(run.projectId, 1, { ...projectDoc(), name: 'Skogens herrar' })
    const table = TableClient.connect(await asTable(run, id))
    await table.ready()
    await table.send({ v: 'session.end' })
    table.close()

    await openTables()
    const row = await onlyRow()
    expect(await within(row).findByText(/avslutat/)).toBeTruthy()
    expect(row.textContent).not.toContain('ligger efter')
    expect(row.getAttribute('data-stale')).toBe('false')
  })

  it('says that nobody is seated yet, and marks nothing stale while the table runs the rev the project is on', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await startTable()
    await openTables()
    const row = await onlyRow()
    expect(await within(row).findByText(/ingen sitter än/)).toBeTruthy()
    expect(row.textContent).not.toContain('ligger efter')
    expect(row.getAttribute('data-stale')).toBe('false')
  })
})

describe('the thumbnail of a table (#19, K9)', () => {
  it('draws the table from the same snapshot the TV reads, and follows it while someone plays', async () => {
    await run.projects.create(run.projectId, projectDoc())
    const id = await startTable()
    await openTables()
    const row = await onlyRow()

    // Four cards in the deck: the dragon twice, the knight, the wizard.
    const draw = () => row.querySelector('[data-zone="draw"]')?.getAttribute('data-count')
    await waitFor(() => expect(draw()).toBe('4'))

    const ada = TableClient.connect(await asSeat(run, id, 'A', 'Ada'))
    await ada.ready()
    await ada.send({ v: 'draw', from: 'draw', to: 'table', count: 2 })
    await waitFor(() => expect(draw()).toBe('2'))
    expect(row.querySelectorAll('[data-component]')).toHaveLength(2)
    ada.close()
  })
})

describe('ending a table from the editor (#19, C9)', () => {
  it('asks first and names the table, gives the focus back on Escape, and locks the log on yes', async () => {
    const user = userEvent.setup()
    await run.projects.create(run.projectId, projectDoc())
    const id = await startTable()
    await openTables()
    const row = await onlyRow()
    const name = id.slice(0, 8)
    // Ending is not a way into the table and does not stand in the row: it is the last entry in
    // the row's menu, behind a line of its own (#176, C9).
    const more = within(row).getByRole('button', { name: `Fler vägar in till bordet ${name}` })
    await openMenu(row)
    const ask = within(row).getByRole('menuitem', { name: `Avsluta bordet ${name}` })

    // The question takes the focus, says which table it is about, and Escape leaves the table
    // alone and puts the focus back where it was asked — the menu is gone by then, so that is the
    // button the menu hangs from. It opens on the answer that loses nothing: ending a table
    // cannot be undone, so it is never what a stray Enter does.
    await user.click(ask)
    const question = within(row).getByRole('alertdialog', { name: `Avsluta bordet ${name}` })
    expect(document.activeElement).toBe(within(question).getByRole('button', { name: 'Avbryt' }))
    await user.keyboard('{Escape}')
    expect(within(row).queryByRole('alertdialog')).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(more))
    expect(await run.store.read(id)).toEqual([])

    await openMenu(row)
    await user.click(within(row).getByRole('menuitem', { name: `Avsluta bordet ${name}` }))
    await user.click(within(row).getByRole('button', { name: 'Ja, avsluta' }))
    await waitFor(async () => expect((await run.store.read(id)).map((l) => l.intent.v)).toEqual(['session.end']))

    // An ended table is not played any more; its log is locked and the ways in that would put
    // someone at it are gone.
    expect(await within(row).findByText(/avslutat/)).toBeTruthy()
    // A table that is over is quieter than a live one on the screen too, not only in words.
    expect(row.getAttribute('data-ended')).toBe('true')
    expect(within(row).queryByRole('link', { name: /Spela härifrån/ })).toBeNull()
    await openMenu(row)
    expect(within(row).queryByRole('menuitem', { name: /Avsluta bordet/ })).toBeNull()
  })
})

describe('the QR for the phones (#19, K12)', () => {
  it('shows the code the phones scan — the same address the TV puts on the wall — and takes it away again', async () => {
    const user = userEvent.setup()
    await run.projects.create(run.projectId, projectDoc())
    const id = await startTable()
    await openTables()
    const row = await onlyRow()
    const ws = run.http.replace(/^http/, 'ws')
    const join = `${location.origin}/join?code=${roomOf(id).code}&server=${encodeURIComponent(ws)}`

    await openMenu(row)
    const show = within(row).getByRole('menuitem', { name: `QR för telefoner ${id.slice(0, 8)}` })
    expect(show.getAttribute('aria-expanded')).toBe('false')
    await user.click(show)

    // The alt text is the address itself, so a phone without a camera can be typed at it.
    expect((await within(row).findByRole('img')).getAttribute('alt')).toBe(join)
    expect(within(row).getByRole('link', { name: /Anslutningssidan/ }).getAttribute('href')).toBe(join)

    // The menu closed behind the press, and the same entry takes the code away again.
    await openMenu(row)
    const hide = within(row).getByRole('menuitem', { name: `QR för telefoner ${id.slice(0, 8)}` })
    expect(hide.getAttribute('aria-expanded')).toBe('true')
    await user.click(hide)
    expect(within(row).queryByRole('img')).toBeNull()
  })
})

describe('starting a table from the Bord tab (#19, L5)', () => {
  it('starts one from the saved version and shows it in the list at once', async () => {
    const user = userEvent.setup()
    await run.projects.create(run.projectId, projectDoc())
    await openTables()
    await screen.findByText(/Inget bord ännu/)

    await user.click(screen.getByRole('button', { name: 'Nytt bord från rev 1' }))
    const row = await onlyRow()
    const started = (await (await fetch(`${run.http}/projects/${run.projectId}/sessions`, { method: 'GET' })).json()) as { id: string }[]
    expect(started.map((t) => t.id)).toEqual([row.getAttribute('data-table')])
    expect(row.textContent).toContain('rev-1')
  })
})

describe('the shortcut to the table from every other tab (#19, variant B)', () => {
  it('opens the newest table beside "Uppdatera bordet", takes you to the Bord tab, and closes on Escape', async () => {
    const user = userEvent.setup()
    await run.projects.create(run.projectId, projectDoc())
    await startTable()
    const newest = await startTable()
    history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')
    expect(document.querySelector('[data-mode]')!.getAttribute('data-mode')).toBe('wall')

    const more = screen.getByRole('button', { name: 'Fler vägar till bordet' })
    expect(more.getAttribute('aria-expanded')).toBe('false')
    await user.click(more)
    expect(more.getAttribute('aria-expanded')).toBe('true')

    // The shortcut is about the newest table — the one being played — and offers the same ways
    // as the Bord tab, because it is the same row. The menu opens before it knows its tables, so
    // the row is waited for, not read out of the frame the menu opened in.
    const shortcut = await screen.findByRole('group', { name: 'Bordet' })
    const row = await within(shortcut).findByRole('listitem')
    expect(row.getAttribute('data-table')).toBe(newest)
    expect(await within(row).findByRole('link', { name: `Spela härifrån för bordet ${newest.slice(0, 8)} (öppnas i ny flik)` })).toBeTruthy()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('group', { name: 'Bordet' })).toBeNull()
    expect(document.activeElement).toBe(more)

    await user.click(more)
    await user.click(await screen.findByRole('button', { name: 'Alla bord' }))
    expect(document.querySelector('[data-mode]')!.getAttribute('data-mode')).toBe('tables')
    expect(screen.getByRole('tab', { name: 'Bord' }).getAttribute('aria-selected')).toBe('true')
    // Two tables in the tab, newest first; the shortcut closed behind itself.
    expect(screen.queryByRole('group', { name: 'Bordet' })).toBeNull()
    const both = await rows()
    expect(both).toHaveLength(2)
    expect(both[0]!.getAttribute('data-table')).toBe(newest)
  })
})

describe('a rendering that stands still says so (#88, UX-43, L5)', () => {
  // The fixture runs no render worker, which is exactly the situation the issue describes: the
  // queue never moves. Seconds of patience become a few hundred milliseconds here.
  const timing = { ...DEFAULT_EDITOR_TIMING, renderStalledAfterMs: 300 }
  async function startFromEditor(): Promise<HTMLElement> {
    const user = userEvent.setup()
    await run.projects.create(run.projectId, projectDoc())
    history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage timing={timing} />)
    await screen.findByText('Skogens herrar')
    await user.click(screen.getByRole('button', { name: 'Uppdatera bordet' }))
    return (await screen.findByText(/renderar kort 0\/4/)).closest('[role="status"]') as HTMLElement
  }

  it('after a while without progress it says the rendering is not moving, that the table shows the fallback text, and offers "Försök igen"', async () => {
    const line = await startFromEditor()
    // Nothing has failed, so there is no failure to report; the queue has simply not moved. The
    // count stays on the line, because it is what will show the rendering moving again.
    expect(await within(line).findByText(/renderingen står stilla/)).toBeTruthy()
    expect(line.textContent).toContain('reservtext')
    expect(within(line).getByRole('button', { name: 'Försök igen' })).toBeTruthy()
    expect(within(line).getByText(/renderar kort 0\/4/)).toBeTruthy()
    expect(line.hasAttribute('data-stalled')).toBe(true)
  })

  it('"Försök igen" asks the server to render once more, with the retry that puts a dead render back in the queue', async () => {
    const user = userEvent.setup()
    const line = await startFromEditor()
    await within(line).findByText(/renderingen står stilla/)
    const real = globalThis.fetch
    const seen: string[] = []
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      seen.push(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      return real(input, init)
    })
    try {
      await user.click(within(line).getByRole('button', { name: 'Försök igen' }))
      await waitFor(() => expect(seen.some((url) => url.endsWith('/prepare?retry=1'))).toBe(true))
      // Asking again is a fresh wait: the line stops saying "still" and says it again only once the
      // new patience has run out too.
      expect(within(line).queryByText(/renderingen står stilla/)).toBeNull()
      expect(await within(line).findByText(/renderingen står stilla/)).toBeTruthy()
    } finally {
      spy.mockRestore()
    }
  })

  it('a count that moves takes the message away, and the message comes back only when the count stands still again', async () => {
    const line = await startFromEditor()
    await within(line).findByText(/renderingen står stilla/)
    // One card lands: the count goes on from where it was, and the line has nothing to warn about.
    expect(await run.completeRenders(1)).toBe(1)
    expect(await within(line).findByText(/renderar kort 1\/4/)).toBeTruthy()
    expect(within(line).queryByText(/renderingen står stilla/)).toBeNull()
    expect(line.hasAttribute('data-stalled')).toBe(false)
    // Then nothing more comes, and the line says so again.
    expect(await within(line).findByText(/renderingen står stilla/)).toBeTruthy()
    expect(within(line).getByText(/renderar kort 1\/4/)).toBeTruthy()
    // The rest lands: the link opens and the warning is gone for good.
    expect(await run.completeRenders()).toBe(3)
    expect(await within(line).findByRole('link', { name: 'öppna bordet' })).toBeTruthy()
    expect(within(line).queryByText(/renderingen står stilla/)).toBeNull()
  })

  it('says the same after "Uppdatera bordet" on a running table, whose count comes from the update itself', async () => {
    const user = userEvent.setup()
    const line = await startFromEditor()
    await run.completeRenders()
    await within(line).findByRole('link', { name: 'öppna bordet' })
    // A changed card is one more texture to render, and the update waits for it (L5).
    await user.click(screen.getByRole('tab', { name: 'Tabell' }))
    await user.clear(screen.getByLabelText('dragon title'))
    await user.type(screen.getByLabelText('dragon title'), 'Drakhona')
    await user.click(screen.getByRole('button', { name: 'Uppdatera bordet' }))
    await screen.findByText(/renderar kort 3\/4/)
    expect(await screen.findByText(/renderingen står stilla/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Försök igen' })).toBeTruthy()
    // The last one lands: the table switches and the warning goes with the count.
    expect(await run.completeRenders()).toBe(1)
    await screen.findByText(/Bordet uppdaterat på rev-2/)
    expect(screen.queryByText(/renderingen står stilla/)).toBeNull()
  })
})
