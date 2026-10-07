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
import { TableClient, setWebSocketImplementation, type WebSocketCtor } from '../src/client.js'
import { projectDoc } from './project-doc.js'
import { asSeat, asTable, registerRoom, roomOf, startServer, type Running } from './fixture.js'
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
  setWebSocketImplementation(Dialling as unknown as WebSocketCtor)
  run = await startServer()
  await run.projects.create(run.projectId, projectDoc())
})
afterEach(async () => {
  setWebSocketImplementation(WsClient as unknown as WebSocketCtor)
  await run.stop()
})

// The rows' own connections. The header picks up the newest running table after a load (#477)
// and watches its seats through the lobby; that is the header's socket and not a cost of a row.
const dialledFor = (id: string) => dialled.filter((url) => url.includes(id) && !url.includes('role=lobby'))

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
    // Cards that are done: a group with a table still drawing them opens by itself (#939).
    await run.completeRenders()
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
    await run.completeRenders()
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
    const name = roomOf(id).code

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
    const name = roomOf(id).code
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
    // Called by its room code like any table (#706): the table's own connection still says it.
    // Until that connection has answered, the row goes by its version (rev-1): on a loaded machine
    // the list is drawn first, so the row is waited for under its code rather than read at once.
    const name = roomOf(id).code

    expect(await within(row).findByRole('link', { name: `Öppna TV-vyn för bordet ${name} (öppnas i ny flik)` })).toBeTruthy()
    expect(within(row).queryByRole('link', { name: /Spela härifrån/ })).toBeNull()
    // And its menu has neither of the two an ended table has no use for.
    await user.click(within(row).getByRole('button', { name: `Fler vägar in till bordet ${name}` }))
    expect(within(row).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Bordsläge', 'Titta på'])
  })
})

// «Starta nytt bord» sade förut bara «· 2 → · 3» i en hopfälld rad (#480 fynd 7). L31 lovar att
// bordet dyker upp i listan: det sägs, och dess grupp står öppen. Och ett bord som avslutas här
// byter grupp direkt, inte när listan hämtas om nästa gång.
describe('a table started or ended from the column (#480)', () => {
  it('says the new table has started and shows its row', async () => {
    const user = userEvent.setup()
    await openTables()
    await user.click(await screen.findByRole('button', { name: 'Starta nytt bord' }))
    const said = await screen.findByText(/Nytt bord startat:/)
    expect(said.closest('[role="status"]')).not.toBeNull()
    const { id, code } = await waitFor(async () => {
      const [only] = await (await fetch(`${run.http}/projects/${run.projectId}/sessions`)).json() as { id: string; code: string }[]
      expect(only).toBeTruthy()
      return only!
    })
    // The table is said by its room code, the name its row and the band give it (#706).
    expect(said.textContent).toBe(`Nytt bord startat: ${code}.`)
    await waitFor(() => expect(document.querySelector(`[data-table="${id}"]`)).not.toBeNull())
  })

  it('moves a table it ends to the ended group at once', async () => {
    const user = userEvent.setup()
    const id = await played()
    await openTables()
    const row = await playingRow()
    await within(row).findByRole('link', { name: /Spela härifrån/ })
    await user.click(within(row).getByRole('button', { name: `Fler vägar in till bordet ${roomOf(id).code}` }))
    await user.click(within(row).getByRole('menuitem', { name: `Avsluta bordet ${roomOf(id).code}` }))
    await user.click(await screen.findByRole('button', { name: 'Ja, avsluta' }))
    expect(await screen.findByRole('button', { name: 'Avslutade bord · 1' })).toBeTruthy()
    expect(screen.queryByRole('list', { name: 'Bord som spelas' })).toBeNull()
  })
})

// «Starta bord» i huvudet startade bordet, men kolumnen stod kvar på «Inget bord ännu» medan
// bandet räknade spelare — och efter ett flikbyte låg bordet hopfällt (#704). Kolumnen är serverns
// lista (L31): bordet huvudet startar visas där direkt, med sin grupp öppen, som när kolumnens egen
// knapp startar det.
describe('a table started from the header (#704)', () => {
  const onlyTable = (): Promise<string> =>
    waitFor(async () => {
      const [only] = (await (await fetch(`${run.http}/projects/${run.projectId}/sessions`)).json()) as { id: string }[]
      expect(only).toBeTruthy()
      return only!.id
    })

  it('shows its row in the open column at once, with its group open', async () => {
    const user = userEvent.setup()
    await openTables()
    await screen.findByText(/Inget bord ännu/)
    await user.click(screen.getByRole('button', { name: 'Starta bord' }))
    const id = await onlyTable()
    await waitFor(() => expect(document.querySelector(`[data-table="${id}"]`)).not.toBeNull())
    expect(screen.getByRole('button', { name: 'Startade, aldrig spelade · 1' }).getAttribute('aria-expanded')).toBe('true')
    expect(screen.queryByText(/Inget bord ännu/)).toBeNull()
  })

  it('shows it with its group open when the column is opened afterwards', async () => {
    const user = userEvent.setup()
    history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')
    await user.click(screen.getByRole('button', { name: 'Starta bord' }))
    const id = await onlyTable()
    await screen.findByText(/Nytt bord startat på/)
    await user.click(screen.getByRole('tab', { name: 'Bord' }))
    await waitFor(() => expect(document.querySelector(`[data-table="${id}"]`)).not.toBeNull())
    expect(screen.getByRole('button', { name: 'Startade, aldrig spelade · 1' }).getAttribute('aria-expanded')).toBe('true')
  })
})

// Gruppen «Startade, aldrig spelade» låg hopfälld också medan ett bord i den ritade sina kort, så
// radens «renderar kort n/m» (#765) syntes först efter ett klick (#939). Beställarens beslut
// 2026-10-07: gruppen fälls ut av sig själv medan något bord i den renderar, och ihop igen när
// korten är klara — utom om designern själv fällt ut den.
describe('the untouched group while a table in it renders its cards (#939)', () => {
  const untouchedFold = () => screen.findByRole('button', { name: /^Startade, aldrig spelade/ })

  // What the page has been told about the textures, answer by answer: a group that stays folded
  // is only proven folded once the page has heard what it would have opened on.
  const heard: { done: number; total: number }[] = []
  beforeEach(() => {
    heard.length = 0
    const real = globalThis.fetch
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const res = await real(input, init)
      if (String(input).endsWith('/textures') && res.ok) void res.clone().json().then((t: { done: number; total: number }) => heard.push(t))
      return res
    })
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })
  const hears = (done: number) => waitFor(() => expect(heard.some((t) => t.done === done)).toBe(true))

  it('opens by itself while the cards render, says the count without a click, and folds again when they are done', async () => {
    const id = await startTable()
    await openTables()
    const fold = await untouchedFold()
    await waitFor(() => expect(fold.getAttribute('aria-expanded')).toBe('true'))
    await waitFor(() => expect(document.querySelector(`[data-table="${id}"] .byd-tables-render`)?.textContent).toBe('renderar kort 0/4'))

    expect(await run.completeRenders()).toBe(4)
    await waitFor(() => expect(fold.getAttribute('aria-expanded')).toBe('false'))
    expect(document.querySelector(`[data-table="${id}"]`)).toBeNull()
  })

  it('stays folded for a table whose cards are already done', async () => {
    await startTable()
    await run.completeRenders()
    await openTables()
    const fold = await untouchedFold()
    await hears(4)
    // A frame for the answer to reach the group.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(fold.getAttribute('aria-expanded')).toBe('false')
  })

  it('stays open after the cards are done when the designer opened it herself', async () => {
    const user = userEvent.setup()
    const id = await startTable()
    await openTables()
    const fold = await untouchedFold()
    // Folded by the designer while it renders, then opened by her: from then on it is hers.
    await waitFor(() => expect(document.querySelector(`[data-table="${id}"] .byd-tables-render`)).not.toBeNull())
    await user.click(fold)
    expect(fold.getAttribute('aria-expanded')).toBe('false')
    await user.click(fold)
    expect(fold.getAttribute('aria-expanded')).toBe('true')

    await run.completeRenders()
    await waitFor(() => expect(document.querySelector(`[data-table="${id}"] .byd-tables-render`)).toBeNull())
    expect(fold.getAttribute('aria-expanded')).toBe('true')
    expect(document.querySelector(`[data-table="${id}"]`)).not.toBeNull()
  })

  it('stays folded when the designer folds it while the cards render, also as the count moves on', async () => {
    const user = userEvent.setup()
    const id = await startTable()
    await openTables()
    const fold = await untouchedFold()
    await waitFor(() => expect(document.querySelector(`[data-table="${id}"] .byd-tables-render`)).not.toBeNull())
    await user.click(fold)
    expect(fold.getAttribute('aria-expanded')).toBe('false')

    expect(await run.completeRenders(1)).toBe(1)
    await hears(1)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(fold.getAttribute('aria-expanded')).toBe('false')
  })
})
