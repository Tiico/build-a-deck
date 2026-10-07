// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { HomePage } from '../src/account/HomePage.js'
import { StatusLive } from '../src/status/StatusLive.js'
import { EditorPage } from '../src/editor/EditorPage.js'
import { NewProjectPage } from '../src/wizard/NewProjectPage.js'
import { projectDoc } from './project-doc.js'
import { admit, createSession, registerRoom, startServer, type Running } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'
import { watchFontNet, type FontNet } from './font-net.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// Accounts (G1, prototype A): the home page is the login card until the link in the mail has
// been followed; then it is "Mina spel". The cookie jar in test/setup.ts plays the browser.
let run: Running
// Den guidade starten hämtar startramens ansikte när spelet skapas (#420), och den trafiken går
// inte ut på riktigt här: `watchFontNet` svarar på katalogens två adresser och på filen bygget
// bär, och lämnar allt annat — bland annat den här sviten egen server — i fred.
let net: FontNet
beforeEach(async () => {
  run = await startServer({ auth: true })
  net = watchFontNet()
})
afterEach(async () => {
  net.undo()
  await run.stop()
})

async function followMailedLink(): Promise<void> {
  const link = /\/auth\/verify\?token=\S+/.exec(run.mail.sent.at(-1)?.text ?? '')?.[0]
  if (!link) throw new Error('no link mailed')
  const res = await fetch(`${run.http}${link}`, { redirect: 'manual' })
  expect(res.status).toBe(302)
}

describe('HomePage and the login card', () => {
  it('continues directly as the logged-in user when the server enables the test bypass', async () => {
    await run.stop()
    run = await startServer({ auth: true, authBypass: true })
    history.replaceState(null, '', `/?server=${encodeURIComponent(run.http)}`)
    const gone: string[] = []
    render(<HomePage onNavigate={(u) => gone.push(u)} />)

    const email = await screen.findByLabelText('E-post')
    fireEvent.change(email, { target: { value: 'ada@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /Skicka inloggningslänk/ }))

    await waitFor(() => expect(gone.at(-1)).toBe(location.pathname + location.search))
    expect(screen.queryByText(/Kolla mejlen/)).toBeNull()
    expect(run.mail.sent).toHaveLength(0)

    cleanup()
    render(<HomePage onNavigate={(u) => gone.push(u)} />)
    expect(await screen.findByText('Mina spel')).toBeTruthy()
    expect(screen.getByText('ada@example.com', { exact: false })).toBeTruthy()
  })

  it('asks for an address, says to check the mail, and after the link shows the account\'s games', async () => {
    history.replaceState(null, '', `/?server=${encodeURIComponent(run.http)}`)
    const gone: string[] = []
    render(<HomePage onNavigate={(u) => gone.push(u)} />)
    const email = await screen.findByLabelText('E-post')
    fireEvent.change(email, { target: { value: 'ada@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /Skicka inloggningslänk/ }))
    expect(await screen.findByText(/Kolla mejlen/)).toBeTruthy()
    expect(run.mail.sent.at(-1)?.to).toBe('ada@example.com')

    await followMailedLink()
    const created = await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: run.projectId, ...projectDoc() }) })
    expect(created.status).toBe(201)

    cleanup()
    render(<HomePage onNavigate={(u) => gone.push(u)} />)
    expect(await screen.findByText('Mina spel')).toBeTruthy()
    expect(screen.getByText('ada@example.com', { exact: false })).toBeTruthy()
    await waitFor(() => expect(document.querySelector(`[data-project="${run.projectId}"]`)).toBeTruthy())
    expect(document.querySelector(`[data-project="${run.projectId}"]`)!.textContent).toContain('Skogens herrar')
    // The card's face is the way into the editor; the menu beside it is not (G1).
    fireEvent.click(document.querySelector(`[data-project="${run.projectId}"] .byd-home-open`)!)
    expect(gone.at(-1)).toMatch(new RegExp(`^/editor\\?project=${run.projectId}`))
    fireEvent.click(screen.getByText(/Nytt spel/))
    expect(gone.at(-1)).toMatch(/^\/new\?/)
    fireEvent.click(screen.getByText('logga ut'))
    const field = await screen.findByLabelText('E-post')
    // Named by a word that stays on the page while one types (#555 A-5, WCAG 3.3.2): the placeholder
    // goes the moment anything is written, so it cannot be the only thing saying what the field is.
    const said = screen.getByText('E-post', { selector: 'label span' })
    expect(said.closest('label')?.contains(field)).toBe(true)
    expect(field.hasAttribute('aria-label')).toBe(false)
  })
})

describe('the first thing a new account sees (UX-16)', () => {
  it('says what a game is and what the new-game card does, until there is a game to look at instead', async () => {
    await run.stop()
    run = await startServer({ auth: true, authBypass: true })
    await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'ada@example.com' }) })
    history.replaceState(null, '', `/?server=${encodeURIComponent(run.http)}`)
    render(<HomePage onNavigate={() => undefined} />)

    expect(await screen.findByText('Mina spel')).toBeTruthy()
    const empty = await screen.findByText('Inget spel ännu.')
    expect(empty).toBeTruthy()
    // What a game is, and what the one thing on the screen will do when it is pressed, behind the
    // question mark beside the line (L36): the longest string in the catalogue was this one.
    expect(screen.queryByText(/kortlek med sin mall/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Hjälp om spel' }))
    const box = await screen.findByRole('dialog', { name: 'Hjälp om spel' })
    expect(box.textContent).toMatch(/Ett spel är en kortlek med sin mall, sina regler och sitt bord/)
    expect(box.textContent).toMatch(/frågar efter namn och antal spelare/)
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })

    // The moment there is a game, the sentence has nothing left to explain and goes.
    expect((await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: run.projectId, ...projectDoc() }) })).status).toBe(201)
    cleanup()
    render(<HomePage onNavigate={() => undefined} />)
    await waitFor(() => expect(document.querySelector(`[data-project="${run.projectId}"]`)).toBeTruthy())
    expect(screen.queryByText(/Inget spel ännu/)).toBeNull()
  })
})

describe('pages that need an account send you to log in and back', () => {
  it('resumes the filled wizard after first login and opens the editor without making the game again', async () => {
    await run.stop()
    run = await startServer({ auth: true, authBypass: true })
    sessionStorage.clear()
    history.replaceState(null, '', `/new?server=${encodeURIComponent(run.http)}`)
    const gone: string[] = []
    render(<NewProjectPage onNavigate={(u) => gone.push(u)} />)
    fireEvent.change(screen.getByLabelText('Spelets namn'), { target: { value: 'Första försöket' } })
    fireEvent.click(screen.getByRole('button', { name: /fortsätt i editorn/i }))
    await waitFor(() => expect(gone.at(-1)).toMatch(/^\/login\?next=%2Fnew/))

    const login = new URL(gone.at(-1)!, 'http://web.local')
    const next = login.searchParams.get('next')!
    const loggedIn = await fetch(`${run.http}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'ada@example.com', next }),
    })
    expect(await loggedIn.json()).toEqual({ ok: true, loggedIn: true })

    cleanup()
    gone.length = 0
    history.replaceState(null, '', next)
    render(<NewProjectPage onNavigate={(u) => gone.push(u)} />)

    await waitFor(() => expect(gone.at(-1)).toMatch(/^\/editor\?/))
    const projectId = new URL(gone.at(-1)!, 'http://web.local').searchParams.get('project')!
    expect((await run.projects.load(projectId))?.name).toBe('Första försöket')
  })

  it('the wizard, when creating, and the editor, when opening an owned project', async () => {
    history.replaceState(null, '', `/new?server=${encodeURIComponent(run.http)}`)
    const gone: string[] = []
    render(<NewProjectPage onNavigate={(u) => gone.push(u)} />)
    fireEvent.change(screen.getByLabelText('Spelets namn'), { target: { value: 'Skogens herrar' } })
    fireEvent.click(screen.getByRole('button', { name: /fortsätt i editorn/i }))
    await waitFor(() => expect(gone.at(-1)).toMatch(/^\/login\?next=%2Fnew/))
    cleanup()

    // Someone else's project: log in as its owner, create it, then look at it logged out.
    await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'bo@example.com' }) })
    await followMailedLink()
    expect((await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'bos', ...projectDoc() }) })).status).toBe(201)
    await fetch(`${run.http}/auth/logout`, { method: 'POST' })
    history.replaceState(null, '', `/editor?project=bos&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage onNavigate={(u) => gone.push(u)} />)
    await waitFor(() => expect(gone.at(-1)).toMatch(/^\/login\?next=%2Feditor%3Fproject%3Dbos/))
  })
})

describe('the tables the account sat at (G1)', () => {
  it('lists claimed sessions as a second grid with the seat, the name and what came of it, and says so after a claim', async () => {
    await run.stop()
    run = await startServer({ auth: true, authBypass: true })
    await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'bo@example.com' }) })
    const id = await createSession(run)
    const token = await admit(run, id, 'A', 'Ada')
    const claimed = await fetch(`${run.http}/guests/claim`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) })
    expect(claimed.status).toBe(200)

    history.replaceState(null, '', `/?claimed=${id}&server=${encodeURIComponent(run.http)}`)
    render(
      <StatusLive>
        <HomePage onNavigate={() => undefined} />
      </StatusLive>,
    )
    expect(await screen.findByText('Bord du spelat vid')).toBeTruthy()
    const card = await waitFor(() => document.querySelector(`[data-played="${id}"]`)!)
    expect(card.textContent).toContain('du var Ada')
    expect(card.textContent).toContain('pågår')
    expect(document.querySelector('.byd-home-claimed')?.textContent).toMatch(/Sparat.*som Ada/)
    // The banner is drawn with its text, so the page's live region says it (4.1.3, #555).
    await waitFor(() => expect(document.querySelector('[data-status-live="polite"]')?.textContent).toMatch(/^Sparat: du spelade .* som Ada\./))
    // Said once (#475): the address no longer carries it, so a reload does not say it again.
    expect(new URLSearchParams(location.search).get('claimed')).toBeNull()
    expect(new URLSearchParams(location.search).get('server')).toBe(run.http)
  })

  // A game taken away takes its tables with it (#676): the row says so, and offers no way back.
  it('says a table\'s game was deleted, and offers no way back to it', async () => {
    await run.stop()
    run = await startServer({ auth: true, authBypass: true })
    await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'bo@example.com' }) })
    const json = { 'content-type': 'application/json' }
    expect((await fetch(`${run.http}/projects`, { method: 'POST', headers: json, body: JSON.stringify({ id: run.projectId, ...projectDoc() }) })).status).toBe(201)
    const made = (await (await fetch(`${run.http}/projects/${run.projectId}/sessions`, { method: 'POST', headers: json, body: '{}' })).json()) as { id: string; code: string; hostKey: string }
    registerRoom(made.id, made)
    const token = await admit(run, made.id, 'A', 'Ada')
    expect((await fetch(`${run.http}/guests/claim`, { method: 'POST', headers: json, body: JSON.stringify({ token }) })).status).toBe(200)
    expect((await fetch(`${run.http}/projects/${run.projectId}`, { method: 'DELETE' })).status).toBe(200)

    history.replaceState(null, '', `/?server=${encodeURIComponent(run.http)}`)
    render(<HomePage onNavigate={() => undefined} />)
    expect(await screen.findByText('Bord du spelat vid')).toBeTruthy()
    const card = await waitFor(() => document.querySelector(`[data-played="${made.id}"]`)!)
    expect(card.textContent).toContain('Borttaget spel')
    expect(card.textContent).not.toContain('pågår')
    expect(within(card as HTMLElement).queryByRole('link', { name: 'Tillbaka till bordet' })).toBeNull()
  })
})

describe('a game on the home page (G1)', () => {
  // A logged-in account with one game, listed on the home page.
  async function home(): Promise<void> {
    await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'ada@example.com' }) })
    await followMailedLink()
    await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: run.projectId, ...projectDoc() }) })
    history.replaceState(null, '', `/?server=${encodeURIComponent(run.http)}`)
    render(<HomePage />)
    await screen.findByText('Skogens herrar')
  }
  const card = () => document.querySelector(`[data-project="${run.projectId}"]`) as HTMLElement

  it("draws the game's first card on its tile, through the one CardPreview that draws a card (G1, #231)", async () => {
    await home()
    // One card, named as one thing rather than as the fourteen loose words the template puts on
    // it: the deck's first row, which is the same card at every visit.
    const drawn = await waitFor(() => within(card()).getByRole('img', { name: 'Första kortet: Drake' }))
    // It is the compiled card and not a coloured rectangle standing for one: the preview's own
    // element, with the card's text in it.
    expect(drawn.querySelector('.byd-preview')).toBeTruthy()
    expect(drawn.textContent).toContain('Drake')
    // The deck's other rows stay in the deck. The list shows one card.
    expect(card().textContent).not.toContain('Riddare')
    expect(within(card()).queryAllByRole('img')).toHaveLength(1)
  })

  it('says a game has no cards yet, and keeps the card\'s place so the grid stands even', async () => {
    await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'ada@example.com' }) })
    await followMailedLink()
    await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: run.otherProjectId, ...projectDoc(), name: 'Tomt spel', rows: [] }) })
    history.replaceState(null, '', `/?server=${encodeURIComponent(run.http)}`)
    render(<HomePage />)
    await screen.findByText('Tomt spel')
    const place = document.querySelector(`[data-project="${run.otherProjectId}"] .byd-home-card`)!
    // The empty state is the card's own place, said deliberately — not a hole where a card failed.
    expect(place.hasAttribute('data-empty')).toBe(true)
    expect(place.textContent).toBe('inga kort än')
    expect(place.querySelector('.byd-preview')).toBeNull()
  })

  it('draws the list on the list\'s own answer, and lands the card afterwards in a place already reserved (#231)', async () => {
    const real = globalThis.fetch
    let land = (): void => undefined
    const held = new Promise<void>((resolve) => {
      land = resolve
    })
    // What it takes to draw the cards travels apart from the list, so the list has to be on
    // screen before that answer arrives — however slow a game's template, fonts and pictures are.
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input instanceof Request ? input.url : input).includes('/me/cards')) await held
      return real(input, init)
    })
    try {
      await home()
      const place = card().querySelector('.byd-home-card')!
      // The place the card will have is already there, and says it is waiting rather than empty.
      expect(place.hasAttribute('data-waiting')).toBe(true)
      expect(place.hasAttribute('data-empty')).toBe(false)
      expect(within(card()).queryByRole('img')).toBeNull()

      land()
      await waitFor(() => expect(within(card()).queryByRole('img', { name: 'Första kortet: Drake' })).toBeTruthy())
      // The card lands inside the place that was reserved for it, so nothing moves under it.
      expect(card().querySelector('.byd-home-card')).toBe(place)
      expect(place.hasAttribute('data-waiting')).toBe(false)
      // One answer for the whole list: a game in it does not cost a round trip of its own.
      expect(spy.mock.calls.filter(([u]) => String(u).includes('/me/cards'))).toHaveLength(1)
    } finally {
      spy.mockRestore()
    }
  })

  // While the list is on its way (#475): the page said nothing and showed «＋ Nytt spel» alone in
  // the first column, which then jumped to the third when the games arrived.
  it('says it is fetching the games, and draws no tile until it knows where the tiles go', async () => {
    const real = globalThis.fetch
    let land = (): void => undefined
    const held = new Promise<void>((resolve) => {
      land = resolve
    })
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (new URL(String(input instanceof Request ? input.url : input)).pathname === '/projects') await held
      return real(input, init)
    })
    try {
      await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'ada@example.com' }) })
      await followMailedLink()
      history.replaceState(null, '', `/?server=${encodeURIComponent(run.http)}`)
      render(<HomePage />)
      expect(await screen.findByText('Hämtar dina spel…')).toBeTruthy()
      expect(document.querySelector('.byd-home-game[data-new]')).toBeNull()
      land()
      await waitFor(() => expect(document.querySelector('.byd-home-game[data-new]')).toBeTruthy())
      expect(screen.queryByText('Hämtar dina spel…')).toBeNull()
    } finally {
      spy.mockRestore()
    }
  })

  // The cards are a second answer; when it never comes the places stop shimmering rather than
  // promising a card for ever (#475).
  it('stops waiting for the card when what it takes to draw it could not be had', async () => {
    const real = globalThis.fetch
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input instanceof Request ? input.url : input).includes('/me/cards')) return new Response('{}', { status: 500 })
      return real(input, init)
    })
    try {
      await home()
      await waitFor(() => expect(card().querySelector('.byd-home-card')!.hasAttribute('data-waiting')).toBe(false))
    } finally {
      spy.mockRestore()
    }
  })

  // Someone going through the page's links hears the game first (#555 A-16), not the title of a
  // card on its tile.
  it('names the link to a game by the game, then its line, and the card last', async () => {
    await home()
    await waitFor(() => within(card()).getByRole('img', { name: 'Första kortet: Drake' }))
    const open = within(card()).getAllByRole('link')[0]!
    expect(open.getAttribute('href')).toMatch(/^\/editor\?/)
    expect(screen.getByRole('link', { name: /^Skogens herrar rev 1 · aldrig spelat Första kortet: Drake$/ })).toBe(open)
  })

  it('says it has never been played, and afterwards when it last was', async () => {
    await home()
    expect(card().textContent).toContain('aldrig spelat')

    await fetch(`${run.http}/projects/${run.projectId}/sessions`, { method: 'POST' })
    cleanup()
    render(<HomePage />)
    await screen.findByText('Skogens herrar')
    expect(card().textContent).toContain('1 bord')
  })

  // The table started is the first of «Pågår nu» (#724, beslut C + B): the room's code and the way
  // to its screen, where they stay after a reload — the banner that said it went with the page.
  const running = () => screen.queryByRole('region', { name: 'Pågår nu' })
  it('starts a table from the card and hands over the room code', async () => {
    await home()
    fireEvent.click(within(card()).getByRole('button', { name: 'Fler val för Skogens herrar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Starta bord' }))
    const said = await waitFor(() => {
      expect(running()).not.toBeNull()
      return running()!
    })
    expect(said.textContent).toMatch(/[A-Z2-9]{6}/)
    // The table is the server's, not something the page made up.
    const tables = (await (await fetch(`${run.http}/projects/${run.projectId}/sessions`)).json()) as unknown[]
    expect(tables).toHaveLength(1)
  })

  it('shows the tables that are running after a reload, each by its code, and opens one as its owner', async () => {
    await home()
    const made = (await (await fetch(`${run.http}/projects/${run.projectId}/sessions`, { method: 'POST' })).json()) as { id: string; code: string }
    cleanup()
    render(<HomePage />)
    await screen.findByText('Skogens herrar')
    const now = await waitFor(() => {
      expect(running()).not.toBeNull()
      return running()!
    })
    expect(now.textContent).toContain('Skogens herrar')
    expect(now.textContent).toContain(made.code)
    const open = within(now).getByRole('link', { name: new RegExp(`Öppna bordet ${made.code}`) })
    const url = new URL(open.getAttribute('href')!, 'http://x')
    expect(url.pathname).toBe('/table')
    expect(url.searchParams.get('session')).toBe(made.id)
    expect(url.searchParams.get('owner')).toBe('1')
  })

  it('offers the running table before a new one, so a second press does not start a second table', async () => {
    await home()
    const made = (await (await fetch(`${run.http}/projects/${run.projectId}/sessions`, { method: 'POST' })).json()) as { id: string; code: string }
    cleanup()
    render(<HomePage />)
    await screen.findByText('Skogens herrar')
    await waitFor(() => expect(running()).not.toBeNull())
    fireEvent.click(within(card()).getByRole('button', { name: 'Fler val för Skogens herrar' }))
    const open = await screen.findByRole('link', { name: `Öppna bordet ${made.code}` })
    // The menu opens on its first choice, which is now the running table.
    await waitFor(() => expect(document.activeElement).toBe(open))
    expect(screen.getByRole('button', { name: 'Starta nytt bord' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Starta bord' })).toBeNull()
  })

  it('asks before taking a game away, and takes it away when the answer is yes', async () => {
    await home()
    fireEvent.click(within(card()).getByRole('button', { name: 'Fler val för Skogens herrar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Ta bort spelet' }))
    expect(screen.getByRole('alertdialog', { name: 'Ta bort spelet' }).textContent).toContain('Skogens herrar')
    // The question can be taken back.
    fireEvent.click(screen.getByRole('button', { name: 'Behåll' }))
    expect(card()).toBeTruthy()

    fireEvent.click(within(card()).getByRole('button', { name: 'Fler val för Skogens herrar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Ta bort spelet' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ta bort' }))
    await waitFor(() => expect(document.querySelector(`[data-project="${run.projectId}"]`)).toBeNull())
    expect((await (await fetch(`${run.http}/projects/${run.projectId}`)).status)).toBe(404)
  })
})

// The question and the menu answer the keyboard the way every other one in the product does
// (#475): the question takes the focus where it is read and Escape gives it back to ⋯, the menu
// closes on Escape, on a press outside it and on the focus walking out of it, and nothing that
// goes away leaves the focus standing on <body>.
describe('the game menu and the question on the home page (#475)', () => {
  async function home(): Promise<void> {
    await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'ada@example.com' }) })
    await followMailedLink()
    await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: run.projectId, ...projectDoc() }) })
    history.replaceState(null, '', `/?server=${encodeURIComponent(run.http)}`)
    render(
      <StatusLive>
        <HomePage />
      </StatusLive>,
    )
    await screen.findByText('Skogens herrar')
  }
  const more = () => screen.getByRole('button', { name: 'Fler val för Skogens herrar' })
  const menu = () => screen.queryByRole('group', { name: 'Val för Skogens herrar' })

  it('opens the menu with the focus on its first choice, and Escape closes it back onto ⋯', async () => {
    await home()
    fireEvent.click(more())
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Starta bord' })))
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(menu()).toBeNull()
    expect(document.activeElement).toBe(more())
  })

  it('closes the menu on a press outside it and when the focus walks out of it', async () => {
    await home()
    fireEvent.click(more())
    expect(menu()).toBeTruthy()
    fireEvent.pointerDown(screen.getByText('Mina spel'))
    expect(menu()).toBeNull()

    fireEvent.click(more())
    const first = await screen.findByRole('button', { name: 'Starta bord' })
    fireEvent.blur(first, { relatedTarget: screen.getByRole('link', { name: /Nytt spel/ }) })
    expect(menu()).toBeNull()
  })

  it('asks with the focus on the answer that keeps the game, and Escape takes the question back onto ⋯', async () => {
    await home()
    fireEvent.click(more())
    fireEvent.click(await screen.findByRole('button', { name: 'Ta bort spelet' }))
    const question = screen.getByRole('alertdialog', { name: 'Ta bort spelet' })
    await waitFor(() => expect(document.activeElement).toBe(within(question).getByRole('button', { name: 'Behåll' })))
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.queryByRole('alertdialog')).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(more()))
  })

  it('keeps the focus on ⋯ after a table is started, and says the way to it opens a new tab', async () => {
    await home()
    fireEvent.click(more())
    fireEvent.click(await screen.findByRole('button', { name: 'Starta bord' }))
    await waitFor(() => expect(document.activeElement).toBe(more()))
    // The way to it is the band in «Pågår nu» (#724), and says it opens a new tab.
    const open = await screen.findByRole('link', { name: /^Öppna bordet [A-Z2-9]{6} i Skogens herrar \(öppnas i ny flik\)$/ })
    expect(open.getAttribute('target')).toBe('_blank')
    // Said in the page's own live region rather than by a region born with the words in it, which
    // screen readers do not reliably read (#555 A-8, WCAG 4.1.3).
    await waitFor(() => expect(document.querySelector('[data-status-live="polite"]')?.textContent).toMatch(/^Bordet är igång\. Rumskoden är [A-Z0-9]{6}\.$/))
    expect(document.querySelector('.byd-home-running')?.getAttribute('role')).toBeNull()
  })

  it('says the game is gone once it is, and leaves the focus on the heading rather than on nothing', async () => {
    await home()
    fireEvent.click(more())
    fireEvent.click(await screen.findByRole('button', { name: 'Ta bort spelet' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ta bort' }))
    await waitFor(() => expect(document.querySelector(`[data-project="${run.projectId}"]`)).toBeNull())
    await waitFor(() => expect(document.querySelector('[data-status-live="polite"]')?.textContent).toBe('Skogens herrar är borttaget.'))
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Mina spel' }))
  })
})

describe('when something goes wrong on the home page (G1)', () => {
  it('says so without taking the games off the screen', async () => {
    await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'ada@example.com' }) })
    await followMailedLink()
    await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: run.projectId, ...projectDoc() }) })
    history.replaceState(null, '', `/?server=${encodeURIComponent(run.http)}`)
    render(<HomePage />)
    await screen.findByText('Skogens herrar')

    // The game is taken away behind the page's back; the page's own attempt then fails.
    await fetch(`${run.http}/projects/${run.projectId}`, { method: 'DELETE' })
    fireEvent.click(within(document.querySelector(`[data-project="${run.projectId}"]`) as HTMLElement).getByRole('button', { name: 'Fler val för Skogens herrar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Ta bort spelet' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ta bort' }))

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByText('Mina spel')).toBeTruthy()
    expect(document.querySelector(`[data-project="${run.projectId}"]`)).toBeTruthy()
  })
})

// Taking a game out and bringing it back (G5, #529, beslut B): «Exportera…» in the game's own ⋯
// opens a window that says what goes with it, prepares it and hands it over; «Importera spel…» in
// the header opens one that takes the zip and says why when it cannot.
describe('exporting and importing a game (G5, #529)', () => {
  async function home(): Promise<void> {
    await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'ada@example.com' }) })
    await followMailedLink()
    await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: run.projectId, ...projectDoc() }) })
    history.replaceState(null, '', `/?server=${encodeURIComponent(run.http)}`)
  }
  const saved: { name: string; blob: Blob }[] = []
  beforeEach(() => {
    saved.length = 0
    let n = 0
    // jsdom has no object URLs; the browser's are stood in for, and the download is caught.
    Object.assign(URL, { createObjectURL: () => `blob:saved-${n++}`, revokeObjectURL: () => undefined })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      saved.push({ name: this.download, blob: new Blob() })
    })
  })
  afterEach(() => vi.restoreAllMocks())

  it('says what goes with the game, prepares it, and hands over the zip', async () => {
    await home()
    render(<HomePage />)
    await screen.findByText('Skogens herrar')
    const more = screen.getByRole('button', { name: 'Fler val för Skogens herrar' })
    fireEvent.click(more)
    fireEvent.click(screen.getByRole('button', { name: 'Exportera…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Exportera «Skogens herrar»' })
    // The window's status region is there before anything is said in it (#555 A-8).
    expect(within(dialog).getByRole('status').textContent).toBe('')
    expect(dialog.textContent).toMatch(/varje version/)
    expect(dialog.textContent).toMatch(/Bordens loggar och enkätsvar följer inte med/)

    fireEvent.click(within(dialog).getByRole('button', { name: 'Förbered export' }))
    // The print files are made by the renderer; until they are, the window says how far it is —
    // in a live region, since the reader is waiting on it — and the keys stay in the window rather
    // than falling to the page behind it when the pressed button goes still.
    const bar = await within(dialog).findByRole('progressbar', { name: /tryckfiler/ })
    expect(bar.getAttribute('aria-valuemax')).not.toBe('0')
    expect(within(dialog).getByRole('status').textContent).toMatch(/Förbereder tryckfilerna/)
    expect(dialog.contains(document.activeElement)).toBe(true)
    await run.completeRenders()
    const download = await within(dialog).findByRole('button', { name: 'Ladda ner' }, { timeout: 5000 })
    // What the waiting was for is where the keys are.
    await waitFor(() => expect(document.activeElement).toBe(download))
    fireEvent.click(download)
    expect(saved.map((s) => s.name)).toEqual(['Skogens herrar rev-1.zip'])

    // Escape closes it and gives the keys back to the ⋯ it was opened from.
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(more)
  })

  it('brings an exported game back as a new game, and says why a file cannot be', async () => {
    await home()
    // An export of the game made through the server, the way the window makes one.
    await fetch(`${run.http}/projects/${run.projectId}/export`, { method: 'POST' })
    await run.completeRenders()
    const zip = await (await fetch(`${run.http}/projects/${run.projectId}/export`)).arrayBuffer()
    const gone: string[] = []
    render(<HomePage onNavigate={(u) => gone.push(u)} />)
    await screen.findByText('Skogens herrar')

    fireEvent.click(screen.getByRole('button', { name: 'Importera spel…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Importera spel' })
    const file = dialog.querySelector('input[type="file"]') as HTMLInputElement

    fireEvent.change(file, { target: { files: [new File(['inte en zip'], 'trasig.zip', { type: 'application/zip' })] } })
    const refusal = await within(dialog).findByRole('alert')
    expect(refusal.textContent).toMatch(/«trasig» kunde inte importeras/)
    expect(refusal.textContent).toMatch(/Filen är inte en zip/)
    // The next thing to do after a refusal is to choose another file, and the keys are there.
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Välj fil…' })))

    fireEvent.change(file, { target: { files: [new File([zip], 'Skogens herrar rev-1.zip', { type: 'application/zip' })] } })
    // The account already has the game, so the copy says it is one.
    await within(dialog).findByText(/«Skogens herrar \(importerad\)» är importerat/)
    await screen.findByText('Skogens herrar (importerad)', { selector: '.byd-home-game strong' })
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Öppna spelet' })))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Öppna spelet' }))
    expect(gone.at(-1)).toMatch(/^\/editor\?project=/)
  })
})

// What a game's ⋯ offers follows what the role may do (D3, #689): taking the game away is the
// owner's, taking it with you the owner's and the co-editors', and starting a table everyone's
// but a viewer's. A choice the server would refuse is not drawn, and a role with none gets no ⋯.
describe('the game menu follows the role (D3, #689)', () => {
  async function signIn(email: string): Promise<void> {
    await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
    await followMailedLink()
  }
  // Ada makes the game and shares it with Bo in `role`; the page is then Bo's.
  async function homeAs(role: 'owner' | 'editor' | 'tester' | 'viewer'): Promise<void> {
    await signIn('ada@example.com')
    await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: run.projectId, ...projectDoc() }) })
    if (role !== 'owner') {
      await fetch(`${run.http}/projects/${run.projectId}/invites`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'bo@example.com', role }) })
      const token = /\/invites\/([A-Za-z0-9_-]+)/.exec(run.mail.sent.at(-1)?.text ?? '')?.[1] ?? ''
      await signIn('bo@example.com')
      expect((await fetch(`${run.http}/invites/${token}`, { method: 'POST' })).status).toBe(200)
    }
    history.replaceState(null, '', `/?server=${encodeURIComponent(run.http)}`)
    render(<HomePage />)
    await screen.findByText('Skogens herrar')
  }
  const choices = (): string[] => {
    const more = screen.queryByRole('button', { name: 'Fler val för Skogens herrar' })
    if (!more) return []
    fireEvent.click(more)
    return within(screen.getByRole('group', { name: 'Val för Skogens herrar' }))
      .getAllByRole('button')
      .map((b) => b.textContent ?? '')
  }

  it.each([
    ['owner', ['Starta bord', 'Byt namn…', 'Dubblera', 'Exportera…', 'Ta bort spelet']],
    ['editor', ['Starta bord', 'Byt namn…', 'Dubblera', 'Exportera…']],
    ['tester', ['Starta bord']],
    ['viewer', []],
  ] as const)('offers the %s only what the role may do', async (role, offered) => {
    await homeAs(role)
    expect(choices()).toEqual(offered)
  })
})

// The start page's ⋯ carries the editor's four choices (#909, beställarens beslut C): a name changed
// here is an edit in the game's log, as in the editor, and the list reads the name from the live
// document — so the tile says it at once, and after a reload, without a version being made of it.
describe('renaming and duplicating from «Mina spel» (#909)', () => {
  async function home(): Promise<void> {
    await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'ada@example.com' }) })
    await followMailedLink()
    await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: run.projectId, ...projectDoc() }) })
    history.replaceState(null, '', `/?server=${encodeURIComponent(run.http)}`)
    render(
      <StatusLive>
        <HomePage />
      </StatusLive>,
    )
    await screen.findByText('Skogens herrar')
  }
  const tileName = (id: string) => document.querySelector(`#home-${id}-name`)?.textContent

  it('renames the game in its log, says the new name on the tile at once and after a reload, and makes no version', async () => {
    await home()
    fireEvent.click(screen.getByRole('button', { name: 'Fler val för Skogens herrar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Byt namn…' }))
    const dialog = screen.getByRole('dialog', { name: 'Byt namn på «Skogens herrar»' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Spelets namn' }), { target: { value: 'Skogens andar' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Byt namn' }))
    await waitFor(() => expect(tileName(run.projectId)).toBe('Skogens andar'))
    expect(screen.queryByRole('dialog')).toBeNull()
    // The keys go back to the game's ⋯, which now bears the new name.
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Fler val för Skogens andar' })))
    expect((await (await fetch(`${run.http}/projects/${run.projectId}/versions`)).json()) as unknown[]).toHaveLength(1)

    cleanup()
    render(<HomePage />)
    await waitFor(() => expect(tileName(run.projectId)).toBe('Skogens andar'))
  })

  it('duplicates the game into a tile of its own, named as a copy, and says so', async () => {
    await home()
    fireEvent.click(screen.getByRole('button', { name: 'Fler val för Skogens herrar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Dubblera' }))
    await screen.findByText('Skogens herrar (kopia)', { selector: '.byd-home-game strong' })
    await waitFor(() => expect(document.body.textContent).toContain('«Skogens herrar (kopia)» ligger nu i Mina spel.'))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Fler val för Skogens herrar' }))
  })
})

// An imported game stood with its card shimmering until the page was reloaded (#725): the import
// read the list again but not the cards. The import call is answered here by making the game the
// ordinary way, because jsdom sends a Blob body as "[object Blob]".
describe('a game imported from the start page', () => {
  it('draws its card at once, without a reload', async () => {
    await run.stop()
    run = await startServer({ auth: true, authBypass: true })
    await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'ada@example.com' }) })
    history.replaceState(null, '', `/?server=${encodeURIComponent(run.http)}`)
    const real = globalThis.fetch
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.includes('/projects/import')) {
        const made = await real(`${run.http}/projects`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'importerat', ...projectDoc() }) })
        return new Response(JSON.stringify({ id: 'importerat', rev: 1 }), { status: made.ok ? 201 : made.status, headers: { 'content-type': 'application/json' } })
      }
      return real(input, init)
    })
    try {
      render(<HomePage onNavigate={() => undefined} />)
      fireEvent.click(await screen.findByRole('button', { name: 'Importera spel…' }))
      const dialog = screen.getByRole('dialog')
      fireEvent.change(dialog.querySelector('input[type="file"]')!, { target: { files: [new File(['PK'], 'Skogens herrar rev-1.zip', { type: 'application/zip' })] } })
      expect(await within(dialog).findByText(/är importerat/)).toBeTruthy()
      await waitFor(() => expect(document.querySelector('#home-importerat-card[role="img"]')).not.toBeNull())
      expect(document.querySelector('#home-importerat-card[data-waiting]')).toBeNull()
    } finally {
      spy.mockRestore()
    }
  })
})
