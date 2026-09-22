// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { HomePage } from '../src/account/HomePage.js'
import { EditorPage } from '../src/editor/EditorPage.js'
import { NewProjectPage } from '../src/wizard/NewProjectPage.js'
import { projectDoc } from './project-doc.js'
import { admit, createSession, startServer, type Running } from './fixture.js'
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
    expect(await screen.findByLabelText('E-post')).toBeTruthy()
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
    const box = await screen.findByRole('dialog', { name: 'spel' })
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
    render(<HomePage onNavigate={() => undefined} />)
    expect(await screen.findByText('Bord du spelat vid')).toBeTruthy()
    const card = await waitFor(() => document.querySelector(`[data-played="${id}"]`)!)
    expect(card.textContent).toContain('du var Ada')
    expect(card.textContent).toContain('pågår')
    expect(screen.getByRole('status').textContent).toMatch(/Sparat.*som Ada/)
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

  it('says it has never been played, and afterwards when it last was', async () => {
    await home()
    expect(card().textContent).toContain('aldrig spelat')

    await fetch(`${run.http}/projects/${run.projectId}/sessions`, { method: 'POST' })
    cleanup()
    render(<HomePage />)
    await screen.findByText('Skogens herrar')
    expect(card().textContent).toContain('1 bord')
  })

  it('starts a table from the card and hands over the room code', async () => {
    await home()
    fireEvent.click(within(card()).getByRole('button', { name: 'Fler val för Skogens herrar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Starta bord' }))
    const said = await screen.findByRole('status')
    expect(said.textContent).toMatch(/[A-Z2-9]{6}/)
    // The table is the server's, not something the page made up.
    const tables = (await (await fetch(`${run.http}/projects/${run.projectId}/sessions`)).json()) as unknown[]
    expect(tables).toHaveLength(1)
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
