// @vitest-environment jsdom
// The table list as a column somebody can read (#176). Every table was a card with six ways in
// stacked under each other, so five tables came to 2 350 px and the one table being played lay a
// screen below four that nobody had ever touched. The column is three groups now — what is being
// played, what was started and never touched, what is over (C9, G3) — and only the first stands
// open.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { WebSocket as WsClient } from 'ws'
import { EditorPage } from '../src/editor/EditorPage.js'
import { TableClient, useWebSocketImplementation, type WebSocketCtor } from '../src/client.js'
import { projectDoc } from './project-doc.js'
import { asSeat, asTable, registerRoom, startServer, type Running } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// Every table this list connects to, as it connects: the address carries the session, so what a
// row costs the server is readable from the outside rather than from inside the component.
const dialled: string[] = []
class Dialling extends WsClient {
  constructor(url: string, protocols?: string | string[]) {
    super(url, protocols)
    dialled.push(url)
  }
}

let run: Running
beforeEach(async () => {
  dialled.length = 0
  useWebSocketImplementation(Dialling as unknown as WebSocketCtor)
  run = await startServer()
  await run.projects.create(run.projectId, projectDoc())
})
afterEach(async () => {
  useWebSocketImplementation(WsClient as unknown as WebSocketCtor)
  await run.stop()
})

const dialledFor = (id: string) => dialled.filter((url) => url.includes(id))

async function startTable(): Promise<string> {
  const res = await fetch(`${run.http}/projects/${run.projectId}/sessions`, { method: 'POST' })
  if (!res.ok) throw new Error(`could not start a table: ${res.status}`)
  const made = (await res.json()) as { id: string; code: string; hostKey: string }
  registerRoom(made.id, made)
  return made.id
}

// A table somebody has sat down at and moved a card on: that is what "played" means to the list,
// and it is read off the log the server already answers with, never off a live connection.
async function played(): Promise<string> {
  const id = await startTable()
  const ada = TableClient.connect(await asSeat(run, id, 'A', 'Ada'))
  await ada.ready()
  await ada.send({ v: 'seat.claim', seat: 'A', name: 'Ada' })
  await ada.send({ v: 'draw', from: 'draw', to: 'table', count: 1 })
  await waitFor(async () => expect((await run.store.read(id)).length).toBeGreaterThan(1))
  ada.close()
  return id
}

// A table whose log is locked (C9). It is over, and it is where the survey answers live (G3), so
// it never belongs among the tables where nothing has happened.
async function ended(): Promise<string> {
  const id = await startTable()
  const table = TableClient.connect(await asTable(run, id))
  await table.ready()
  await table.send({ v: 'session.end' })
  await waitFor(async () => expect((await run.store.read(id)).map((l) => l.intent.v)).toContain('session.end'))
  table.close()
  return id
}

async function openTables(): Promise<void> {
  const user = userEvent.setup()
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
  await user.click(screen.getByRole('tab', { name: 'Bord' }))
}

describe('the three groups in the table column (#176, C9)', () => {
  it('leaves the played tables open and folds the untouched and the ended ones away, each saying how many it holds', async () => {
    const user = userEvent.setup()
    const playing = await played()
    await startTable()
    await startTable()
    await ended()
    await openTables()

    // What the designer came for stands in the open, and nothing else does.
    const open = within(await screen.findByRole('list', { name: 'Bord som spelas' }))
    expect(open.getAllByRole('listitem').map((li) => li.getAttribute('data-table'))).toEqual([playing])

    // The two folds say what they are and how many are behind them — in words, not in a colour.
    const untouched = screen.getByRole('button', { name: 'Startade, aldrig spelade · 2' })
    const over = screen.getByRole('button', { name: 'Avslutade bord · 1' })
    expect([untouched.getAttribute('aria-expanded'), over.getAttribute('aria-expanded')]).toEqual(['false', 'false'])
    expect(screen.queryByRole('list', { name: /Startade/ })).toBeNull()
    expect(screen.queryByRole('list', { name: /Avslutade/ })).toBeNull()

    await user.click(untouched)
    expect(untouched.getAttribute('aria-expanded')).toBe('true')
    expect(within(screen.getByRole('list', { name: 'Startade, aldrig spelade · 2' })).getAllByRole('listitem')).toHaveLength(2)
    // Opening one fold leaves the other where it was: they are two different facts.
    expect(over.getAttribute('aria-expanded')).toBe('false')
  })

  it('costs nothing for a table that is folded away: no connection, no thumbnail, until it is opened', async () => {
    const user = userEvent.setup()
    const playing = await played()
    const sleeping = await startTable()
    await openTables()

    // The row that is on the screen is live, as it always was: the thumbnail is the table itself.
    await waitFor(() => expect(dialledFor(playing).length).toBeGreaterThan(0))
    await waitFor(() => expect(document.querySelector(`[data-table="${playing}"] [data-zone="draw"]`)).not.toBeNull())
    // The four that are not on the screen are four sockets and four renderings nobody asked for.
    expect(dialledFor(sleeping)).toEqual([])
    expect(document.querySelector(`[data-table="${sleeping}"]`)).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Startade, aldrig spelade · 1' }))
    await waitFor(() => expect(dialledFor(sleeping).length).toBeGreaterThan(0))
  })
})

const playingRow = async (): Promise<HTMLElement> => within(await screen.findByRole('list', { name: 'Bord som spelas' })).getByRole('listitem')

describe('the one way that stands ready and the five in the row’s menu (#176)', () => {
  it('stands "Spela härifrån" ready in the row, because the designer playtesting alone is the one sitting down', async () => {
    const id = await played()
    await openTables()
    const row = await playingRow()
    const name = id.slice(0, 8)

    // The seat comes from the table itself (K12), so the ready way is complete once it answers.
    const ready = await within(row).findByRole('link', { name: `Spela härifrån för bordet ${name} (öppnas i ny flik)` })
    // And it is the only way standing in the row: everything else is one press away, not six.
    expect(within(row).getAllByRole('link')).toEqual([ready])
  })

  it('holds the other five — the TV view among them — in a menu that opens from the row', async () => {
    const user = userEvent.setup()
    const id = await played()
    await openTables()
    const row = await playingRow()
    const name = id.slice(0, 8)
    await within(row).findByRole('link', { name: /Spela härifrån/ })

    const more = within(row).getByRole('button', { name: `Fler vägar in till bordet ${name}` })
    expect(more.getAttribute('aria-haspopup')).toBe('menu')
    expect(more.getAttribute('aria-expanded')).toBe('false')
    expect(within(row).queryByRole('menu')).toBeNull()

    await user.click(more)
    expect(more.getAttribute('aria-expanded')).toBe('true')
    const menu = within(row).getByRole('menu', { name: `Vägar in till bordet ${name}` })
    // The three links say on the screen what they are; the two that act on the row carry the
    // table's name where a screen reader picks them out of a list of controls.
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Öppna TV-vyn', 'Bordsläge', 'Titta på', `QR för telefoner ${name}`, `Avsluta bordet ${name}`])
    // Ending a table cannot be taken back (C9), so it is not one of the ways in: it stands after
    // a line of its own, and says in words that it is something else.
    expect(within(menu).getAllByRole('separator')).toHaveLength(1)
  })

  it('closes on Escape and leaves the focus on the button that opened it', async () => {
    const user = userEvent.setup()
    await played()
    await openTables()
    const row = await playingRow()
    await within(row).findByRole('link', { name: /Spela härifrån/ })
    const more = within(row).getByRole('button', { name: /Fler vägar in till bordet/ })

    await user.click(more)
    // The keys land inside the menu the moment it opens, so the first arrow moves within it.
    const items = within(row).getAllByRole('menuitem')
    await waitFor(() => expect(document.activeElement).toBe(items[0]))
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(items[1])

    await user.keyboard('{Escape}')
    expect(within(row).queryByRole('menu')).toBeNull()
    expect(more.getAttribute('aria-expanded')).toBe('false')
    await waitFor(() => expect(document.activeElement).toBe(more))
  })

  it('shuts again when the button that opened it is pressed a second time', async () => {
    const user = userEvent.setup()
    await played()
    await openTables()
    const row = await playingRow()
    await within(row).findByRole('link', { name: /Spela härifrån/ })
    const more = within(row).getByRole('button', { name: /Fler vägar in till bordet/ })

    await user.click(more)
    expect(within(row).getByRole('menu')).toBeTruthy()
    // Pressing it again takes the focus out of the menu and back to the button in the same
    // gesture, and a menu that reads that as "the focus left, close" and then toggles itself is a
    // menu that never shuts.
    await user.click(more)
    expect(within(row).queryByRole('menu')).toBeNull()
    expect(more.getAttribute('aria-expanded')).toBe('false')
  })

  it('answers Space on a way in, and keeps the page from scrolling under it', async () => {
    const user = userEvent.setup()
    await played()
    await openTables()
    const row = await playingRow()
    await within(row).findByRole('link', { name: /Spela härifrån/ })
    await user.click(within(row).getByRole('button', { name: /Fler vägar in till bordet/ }))

    // A link in a menu is a menu item, and a menu item answers Enter and Space (APG). Space is
    // the one the browser would otherwise spend on scrolling the page out from under the menu.
    const tv = within(row).getAllByRole('menuitem')[0]!
    const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    tv.dispatchEvent(space)
    expect(space.defaultPrevented).toBe(true)
  })

  it('stands the TV view ready on a table that is over, because an ended table cannot be played', async () => {
    const user = userEvent.setup()
    const id = await ended()
    await openTables()
    await user.click(await screen.findByRole('button', { name: 'Avslutade bord · 1' }))
    const row = within(screen.getByRole('list', { name: 'Avslutade bord · 1' })).getByRole('listitem')
    const name = id.slice(0, 8)

    expect(within(row).getByRole('link', { name: `Öppna TV-vyn för bordet ${name} (öppnas i ny flik)` })).toBeTruthy()
    expect(within(row).queryByRole('link', { name: /Spela härifrån/ })).toBeNull()
    // And its menu has neither of the two an ended table has no use for.
    await user.click(within(row).getByRole('button', { name: `Fler vägar in till bordet ${name}` }))
    expect(within(row).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Bordsläge', 'Titta på', `QR för telefoner ${name}`])
  })
})
