// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { EditorPage } from '../src/editor/EditorPage.js'
import { TableClient } from '../src/client.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

// A table of this game, started the way the editor starts one.
async function startTable(project = 'p1'): Promise<string> {
  const res = await fetch(`${run.http}/projects/${project}/sessions`, { method: 'POST' })
  if (!res.ok) throw new Error(`could not start a table: ${res.status}`)
  return ((await res.json()) as { id: string }).id
}

async function openTables(): Promise<void> {
  const user = userEvent.setup()
  history.replaceState(null, '', `/editor?project=p1&server=${encodeURIComponent(run.http)}`)
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
  await user.click(screen.getByRole('tab', { name: 'Bord' }))
}

describe('the Bord tab (#19)', () => {
  it('lists the tables this game has, with the version each runs and that nothing has happened yet', async () => {
    await run.projects.create('p1', projectDoc())
    const id = await startTable()
    await openTables()

    const table = await screen.findByRole('listitem')
    expect(table.getAttribute('data-table')).toBe(id)
    expect(table.textContent).toContain('rev-1')
    expect(table.textContent).toContain('inga drag än')
  })

  it('says so when the game has no table at all', async () => {
    await run.projects.create('p1', projectDoc())
    await openTables()
    expect(await screen.findByText(/Inget bord ännu/)).toBeTruthy()
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })
})

describe('the ways into a table (#19)', () => {
  it('reaches the TV view, the table mode, playing from here and watching, each in a new tab and saying so', async () => {
    await run.projects.create('p1', projectDoc())
    const id = await startTable()
    await openTables()
    const row = await screen.findByRole('listitem')
    const ws = run.http.replace(/^http/, 'ws')
    const name = id.slice(0, 8)

    // The seat to sit on comes from the table itself, so the ways are complete once it answers.
    await within(row).findByRole('link', { name: /Spela härifrån/ })
    const ways = within(row).getAllByRole('link')
    expect(ways.map((a) => a.getAttribute('href'))).toEqual([
      `/table?session=${id}&mode=tv&server=${encodeURIComponent(ws)}`,
      `/table?session=${id}&mode=table&server=${encodeURIComponent(ws)}`,
      `/online?session=${id}&seat=A&name=Designern&server=${encodeURIComponent(ws)}`,
      `/observe?session=${id}&name=Designern&server=${encodeURIComponent(ws)}`,
    ])
    // A link that leaves the editor behind says so, and says which table it is about: four
    // identical rows of links are otherwise four times the same word to a screen reader.
    for (const [i, label] of ['Öppna TV-vyn', 'Bordsläge', 'Spela härifrån', 'Titta på'].entries()) {
      const way = ways[i]!
      expect(way.getAttribute('target')).toBe('_blank')
      expect(way.getAttribute('rel')).toBe('noreferrer')
      expect(within(row).getByRole('link', { name: `${label} för bordet ${name} (öppnas i ny flik)` })).toBe(way)
    }
  })
})

describe('what the Bord tab says about a running table (#19, C7)', () => {
  it('names who is seated and who is watching, and marks a table the project has left behind', async () => {
    await run.projects.create('p1', projectDoc())
    const id = await startTable()
    const ada = TableClient.connect({ url: run.url, sessionId: id, seat: 'A' })
    await ada.ready()
    await ada.send({ v: 'seat.claim', seat: 'A', name: 'Ada' })
    const eva = TableClient.connect({ url: run.url, sessionId: id, seat: null, observer: 'Eva' })
    await eva.ready()
    // The designer keeps working: the project is on rev 2, the table still plays rev-1 (C7).
    await run.projects.replace('p1', 1, { ...projectDoc(), name: 'Skogens herrar' })

    await openTables()
    const row = await screen.findByRole('listitem')
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
    await run.projects.create('p1', projectDoc())
    const id = await startTable()
    await run.projects.replace('p1', 1, { ...projectDoc(), name: 'Skogens herrar' })
    const table = TableClient.connect({ url: run.url, sessionId: id, seat: null })
    await table.ready()
    await table.send({ v: 'session.end' })
    table.close()

    await openTables()
    const row = await screen.findByRole('listitem')
    expect(await within(row).findByText(/avslutat/)).toBeTruthy()
    expect(row.textContent).not.toContain('ligger efter')
    expect(row.getAttribute('data-stale')).toBe('false')
  })

  it('says that nobody is seated yet, and marks nothing stale while the table runs the rev the project is on', async () => {
    await run.projects.create('p1', projectDoc())
    await startTable()
    await openTables()
    const row = await screen.findByRole('listitem')
    expect(await within(row).findByText(/ingen sitter än/)).toBeTruthy()
    expect(row.textContent).not.toContain('ligger efter')
    expect(row.getAttribute('data-stale')).toBe('false')
  })
})

describe('the thumbnail of a table (#19, K9)', () => {
  it('draws the table from the same snapshot the TV reads, and follows it while someone plays', async () => {
    await run.projects.create('p1', projectDoc())
    const id = await startTable()
    await openTables()
    const row = await screen.findByRole('listitem')

    // Four cards in the deck: the dragon twice, the knight, the wizard.
    const draw = () => row.querySelector('[data-zone="draw"]')?.getAttribute('data-count')
    await waitFor(() => expect(draw()).toBe('4'))

    const ada = TableClient.connect({ url: run.url, sessionId: id, seat: 'A' })
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
    await run.projects.create('p1', projectDoc())
    const id = await startTable()
    await openTables()
    const row = await screen.findByRole('listitem')
    const name = id.slice(0, 8)
    const ask = within(row).getByRole('button', { name: `Avsluta bordet ${name}` })

    // The question takes the focus, says which table it is about, and Escape leaves the table
    // alone and puts the focus back where it was asked.
    await user.click(ask)
    const question = within(row).getByRole('alertdialog', { name: `Avsluta bordet ${name}` })
    expect(document.activeElement).toBe(within(question).getByRole('button', { name: 'Ja, avsluta' }))
    await user.keyboard('{Escape}')
    expect(within(row).queryByRole('alertdialog')).toBeNull()
    expect(document.activeElement).toBe(ask)
    expect(await run.store.read(id)).toEqual([])

    await user.click(ask)
    await user.click(within(row).getByRole('button', { name: 'Ja, avsluta' }))
    await waitFor(async () => expect((await run.store.read(id)).map((l) => l.intent.v)).toEqual(['session.end']))

    // An ended table is not played any more; its log is locked and the ways in that would put
    // someone at it are gone.
    expect(await within(row).findByText(/avslutat/)).toBeTruthy()
    // A table that is over is quieter than a live one on the screen too, not only in words.
    expect(row.getAttribute('data-ended')).toBe('true')
    expect(within(row).queryByRole('link', { name: /Spela härifrån/ })).toBeNull()
    expect(within(row).queryByRole('button', { name: /Avsluta bordet/ })).toBeNull()
  })
})

describe('the QR for the phones (#19, K12)', () => {
  it('shows the code the phones scan — the same address the TV puts on the wall — and takes it away again', async () => {
    const user = userEvent.setup()
    await run.projects.create('p1', projectDoc())
    const id = await startTable()
    await openTables()
    const row = await screen.findByRole('listitem')
    const ws = run.http.replace(/^http/, 'ws')
    const join = `${location.origin}/join?session=${id}&server=${encodeURIComponent(ws)}`

    const show = within(row).getByRole('button', { name: `QR för telefoner ${id.slice(0, 8)}` })
    expect(show.getAttribute('aria-expanded')).toBe('false')
    await user.click(show)
    expect(show.getAttribute('aria-expanded')).toBe('true')

    // The alt text is the address itself, so a phone without a camera can be typed at it.
    expect((await within(row).findByRole('img')).getAttribute('alt')).toBe(join)
    expect(within(row).getByRole('link', { name: /Anslutningssidan/ }).getAttribute('href')).toBe(join)

    await user.click(show)
    expect(within(row).queryByRole('img')).toBeNull()
  })
})

describe('starting a table from the Bord tab (#19, L5)', () => {
  it('starts one from the saved version and shows it in the list at once', async () => {
    const user = userEvent.setup()
    await run.projects.create('p1', projectDoc())
    await openTables()
    await screen.findByText(/Inget bord ännu/)

    await user.click(screen.getByRole('button', { name: 'Nytt bord från rev 1' }))
    const row = await screen.findByRole('listitem')
    const started = (await (await fetch(`${run.http}/projects/p1/sessions`, { method: 'GET' })).json()) as { id: string }[]
    expect(started.map((t) => t.id)).toEqual([row.getAttribute('data-table')])
    expect(row.textContent).toContain('rev-1')
  })
})

describe('the shortcut to the table from every other tab (#19, variant B)', () => {
  it('opens the newest table beside "Uppdatera bordet", takes you to the Bord tab, and closes on Escape', async () => {
    const user = userEvent.setup()
    await run.projects.create('p1', projectDoc())
    await startTable()
    const newest = await startTable()
    history.replaceState(null, '', `/editor?project=p1&server=${encodeURIComponent(run.http)}`)
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
    expect(within(row).getByRole('link', { name: `Öppna TV-vyn för bordet ${newest.slice(0, 8)} (öppnas i ny flik)` })).toBeTruthy()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('group', { name: 'Bordet' })).toBeNull()
    expect(document.activeElement).toBe(more)

    await user.click(more)
    await user.click(await screen.findByRole('button', { name: 'Alla bord' }))
    expect(document.querySelector('[data-mode]')!.getAttribute('data-mode')).toBe('tables')
    expect(screen.getByRole('tab', { name: 'Bord' }).getAttribute('aria-selected')).toBe('true')
    // Two tables in the tab, newest first; the shortcut closed behind itself.
    expect(screen.queryByRole('group', { name: 'Bordet' })).toBeNull()
    const rows = await screen.findAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.getAttribute('data-table')).toBe(newest)
  })
})
