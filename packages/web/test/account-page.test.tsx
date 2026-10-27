// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { HomePage } from '../src/account/HomePage.js'
import { LoginCard } from '../src/account/LoginCard.js'
import { StatusLive } from '../src/status/StatusLive.js'
import { EditorPage } from '../src/editor/EditorPage.js'
import { NewProjectPage } from '../src/wizard/NewProjectPage.js'
import { throughTheDoor } from './wizard-door.js'
import { SurveyPage } from '../src/account/SurveyPage.js'
import { TableClient } from '../src/client.js'
import { projectDoc } from './project-doc.js'
import { faviconSvg } from '../src/brand/mark.js'
import { admit, asSeat, asTable, createSession, registerRoom, roomOf, startServer, type Running } from './fixture.js'
import { watchFontNet, type FontNet } from './font-net.js'
import { answerStart } from './start-answer.js'

// Accounts (G1, prototype A): the login card at `/login` until the link in the mail has been
// followed, and then "Mina spel" at `/`, where whoever is logged out finds the landing page (#1009). The cookie jar in test/setup.ts plays the browser.
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

describe('the login card and HomePage', () => {
  it('continues directly as the logged-in user when the server enables the test bypass', async () => {
    await run.stop()
    run = await startServer({ auth: true, authBypass: true })
    history.replaceState(null, '', `/?server=${encodeURIComponent(run.http)}`)
    const home = location.pathname + location.search
    const gone: string[] = []
    render(<LoginCard http={run.http} next={home} onNavigate={(u) => gone.push(u)} />)

    const email = await screen.findByLabelText('E-post')
    fireEvent.change(email, { target: { value: 'ada@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /Skicka inloggningslänk/ }))

    // A first login is asked what the others should call it first (#1254), and goes on home after.
    await waitFor(() => expect(gone.at(-1)).toBe(`/login?${new URLSearchParams({ step: 'name', next: home, server: run.http }).toString()}`))
    expect(screen.queryByText(/Kolla din mejl/)).toBeNull()
    expect(run.mail.sent).toHaveLength(0)

    cleanup()
    render(<HomePage onNavigate={(u) => gone.push(u)} />)
    expect(await screen.findByText('Mina spel')).toBeTruthy()
    expect(screen.getByText('ada@example.com', { exact: false })).toBeTruthy()
  })

  it('heads the card with the product\'s hand beside its name (#1082)', async () => {
    render(<LoginCard http={run.http} next="/" onNavigate={() => undefined} />)
    // The picture is not read out: the heading's name is the product's name alone.
    const heading = await screen.findByRole('heading', { level: 1, name: 'Deckster' })
    const mark = heading.querySelector('svg[aria-hidden="true"]') as SVGSVGElement
    const tab = new DOMParser().parseFromString(faviconSvg(), 'image/svg+xml').documentElement
    const drawn = (svg: Element) => [...svg.querySelectorAll('rect')].map((r) => r.getAttribute('fill'))
    expect(drawn(mark)).toEqual(drawn(tab))
  })

  it('asks for an address, says to check the mail, and after the link shows the account\'s games', async () => {
    history.replaceState(null, '', `/?server=${encodeURIComponent(run.http)}`)
    const gone: string[] = []
    render(<LoginCard http={run.http} next={location.pathname + location.search} onNavigate={(u) => gone.push(u)} />)
    const email = await screen.findByLabelText('E-post')
    // Named by a word that stays on the page while one types (#555 A-5, WCAG 3.3.2): the placeholder
    // goes the moment anything is written, so it cannot be the only thing saying what the field is.
    const said = screen.getByText('E-post', { selector: 'label span' })
    expect(said.closest('label')?.contains(email)).toBe(true)
    expect(email.hasAttribute('aria-label')).toBe(false)
    fireEvent.change(email, { target: { value: 'ada@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /Skicka inloggningslänk/ }))
    expect(await screen.findByText(/Kolla din mejl/)).toBeTruthy()
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
    // Both ways to a new game — the bar's and the dashed row's — lead to the guided start, once the
    // account has been asked whether it holds one more (#1198).
    const makes = screen.getAllByRole('link', { name: /Nytt spel/ })
    for (const [at, make] of makes.entries()) {
      fireEvent.click(make)
      await waitFor(() => expect(gone.filter((url) => /^\/new\?/.test(url))).toHaveLength(at + 1))
    }
    // Logged out, the same page is the landing page again (#1009), with its door back to the login.
    fireEvent.click(screen.getByText('Logga ut'))
    expect(await screen.findByRole('heading', { level: 1, name: 'Bygg ditt kortspel. Spela det i kväll.' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Mina spel' }).getAttribute('href')).toMatch(/^\/login\?next=/)
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
    throughTheDoor('Första försöket')
    fireEvent.click(screen.getByRole('button', { name: /skapa spelet/i }))
    // Back to the guide it was made from (L79), where the draft is sent on arrival.
    await waitFor(() => expect(gone.at(-1)).toMatch(/^\/login\?next=%2Fnew%2Fguided/))

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
    throughTheDoor()
    fireEvent.click(screen.getByRole('button', { name: /skapa spelet/i }))
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
    expect(await screen.findByText('Bord du har spelat vid')).toBeTruthy()
    const card = await waitFor(() => document.querySelector(`[data-played="${id}"]`)!)
    expect(card.textContent).toContain('du spelade som Ada')
    // Nobody has played at it yet (#1376): it is not said to be running.
    expect(card.textContent).toContain('startade, aldrig spelade')
    expect(card.textContent).not.toContain('pågår')
    expect(document.querySelector('.byd-home-claimed')?.textContent).toMatch(/Sparat.*som Ada/)
    // The banner is drawn with its text, so the page's live region says it (4.1.3, #555).
    await waitFor(() => expect(document.querySelector('[data-status-live="polite"]')?.textContent).toMatch(/^Sparat: du spelade .* som Ada\./))
    // Said once (#475): the address no longer carries it, so a reload does not say it again.
    expect(new URLSearchParams(location.search).get('claimed')).toBeNull()
    expect(new URLSearchParams(location.search).get('server')).toBe(run.http)
  })

  // «Öppna bordet» takes her to her own seat and hand (#690, beslut 2026-10-06): before, it
  // was the picker, where her seat stood taken under her own name and the name field was empty.
  it('takes the guest back to her own seat and hand, not to the picker', async () => {
    await run.stop()
    run = await startServer({ auth: true, authBypass: true })
    await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'bo@example.com' }) })
    const id = await createSession(run)
    const token = await admit(run, id, 'A', 'Ada')
    expect((await fetch(`${run.http}/guests/claim`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) })).status).toBe(200)

    history.replaceState(null, '', `/?server=${encodeURIComponent(run.http)}`)
    const gone: string[] = []
    render(<HomePage onNavigate={(u) => gone.push(u)} />)
    const back = await screen.findByRole('link', { name: 'Öppna bordet' })
    expect(back.closest(`[data-played="${id}"]`)).not.toBeNull()
    fireEvent.click(back)
    await waitFor(() => expect(gone).toHaveLength(1))
    const to = new URL(gone[0]!, 'http://app.invalid')
    expect(to.pathname).toBe('/play')
    expect(Object.fromEntries(to.searchParams)).toMatchObject({ session: id, seat: 'A', code: roomOf(id).code, server: run.http.replace(/^http/, 'ws') })
    // Her name in no address, and the token in the fragment (#1278).
    expect([...to.searchParams.keys()]).not.toContain('name')
    expect([...to.searchParams.keys()]).not.toContain('token')
    // A token of its own: the server keeps only a hash, so the seat is handed a new one.
    const handed = new URLSearchParams(to.hash.slice(1)).get('token')
    expect(handed).toBeTruthy()
    expect(handed).not.toBe(token)
  })

  // The survey from Mina spel (#1143, variant B): a table that is over has no way in, so the tile
  // offers its survey while it waits, the account answers it on a page of its own, and the tile
  // then says quietly that it is answered — nothing more to do there.
  it('offers the survey on a table that is over, answers it from the account, and then says it is answered', async () => {
    await run.stop()
    run = await startServer({ auth: true, authBypass: true })
    await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'bo@example.com' }) })
    const id = await createSession(run)
    const token = await admit(run, id, 'A', 'Ada')
    expect((await fetch(`${run.http}/guests/claim`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) })).status).toBe(200)
    const table = TableClient.connect(await asTable(run, id))
    await table.ready()
    await table.send({ v: 'session.end' })
    table.close()

    history.replaceState(null, '', `/?server=${encodeURIComponent(run.http)}`)
    const gone: string[] = []
    render(<HomePage onNavigate={(u) => gone.push(u)} />)
    // The tile, and not «Väntar på dig», which offers the same survey (#1225).
    const card = await waitFor(() => {
      const tile = document.querySelector<HTMLElement>(`[data-played="${id}"]`)
      expect(tile).not.toBeNull()
      return tile!
    })
    expect(card.textContent).toContain('avslutat')
    expect(card.textContent).not.toContain('enkät inte besvarad')
    fireEvent.click(within(card).getByRole('link', { name: 'Svara på enkäten' }))
    const to = new URL(gone[0]!, 'http://app.invalid')
    expect(to.pathname).toBe('/survey')
    expect(Object.fromEntries(to.searchParams)).toEqual({ session: id, server: run.http })
    cleanup()

    history.replaceState(null, '', `${to.pathname}${to.search}`)
    const after: string[] = []
    render(<SurveyPage onNavigate={(u) => after.push(u)} />)
    for (const n of ['4', '3', '2']) {
      fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^${n}$`) }))
      fireEvent.click(screen.getByRole('button', { name: 'Nästa' }))
    }
    fireEvent.click(screen.getByRole('button', { name: 'Skicka' }))
    expect(await screen.findByText('Tack, Ada.')).toBeTruthy()
    fireEvent.click(screen.getByRole('link', { name: 'Till Mina spel' }))
    expect(after).toEqual([`/?server=${encodeURIComponent(run.http)}`])
    cleanup()

    history.replaceState(null, '', `/?server=${encodeURIComponent(run.http)}`)
    render(<HomePage onNavigate={() => undefined} />)
    const done = (await screen.findByText('Du har svarat på enkäten')).closest(`[data-played="${id}"]`) as HTMLElement
    expect(within(done).queryByRole('link', { name: 'Svara på enkäten' })).toBeNull()
  })

  it('sends a reader without a login to the login page, which comes back to the survey', async () => {
    const id = await createSession(run)
    const here = `/survey?session=${id}&server=${encodeURIComponent(run.http)}`
    history.replaceState(null, '', here)
    const gone: string[] = []
    render(<SurveyPage onNavigate={(u) => gone.push(u)} />)
    await waitFor(() => expect(gone).toHaveLength(1))
    const to = new URL(gone[0]!, 'http://app.invalid')
    expect(to.pathname).toBe('/login')
    expect(Object.fromEntries(to.searchParams)).toEqual({ next: here, server: run.http })
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
    expect(await screen.findByText('Bord du har spelat vid')).toBeTruthy()
    const card = await waitFor(() => document.querySelector(`[data-played="${made.id}"]`)!)
    expect(card.textContent).toContain('Borttaget spel')
    expect(card.textContent).not.toContain('pågår')
    expect(within(card as HTMLElement).queryByRole('link', { name: 'Öppna bordet' })).toBeNull()
  })
})

describe('a game on the home page (G1)', () => {
  // A logged-in account with two games, listed on the home page: the one under test is a row, and
  // the one saved after it leads the page (#1204).
  async function home(): Promise<void> {
    await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'ada@example.com' }) })
    await followMailedLink()
    await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: run.projectId, ...projectDoc() }) })
    await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: run.otherProjectId, ...projectDoc(), name: 'Vinterspelet' }) })
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
    expect(place.textContent).toBe('inga kort ännu')
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
      expect(await screen.findByText('Laddar dina spel…')).toBeTruthy()
      expect(document.querySelector('.byd-home-game[data-new]')).toBeNull()
      land()
      await waitFor(() => expect(document.querySelector('.byd-home-game[data-new]')).toBeTruthy())
      expect(screen.queryByText('Laddar dina spel…')).toBeNull()
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
    expect(screen.getByRole('link', { name: /^Skogens herrar v1 · \d+ kort · \d+ spelare inte spelat Första kortet: Drake$/ })).toBe(open)
  })

  it('says it has never been played, and afterwards when it last was', async () => {
    await home()
    expect(card().textContent).toContain('inte spelat')

    await fetch(`${run.http}/projects/${run.projectId}/sessions`, { method: 'POST' })
    cleanup()
    render(<HomePage />)
    await screen.findByText('Skogens herrar')
    expect(card().textContent).toContain('1 bord')
  })

  // Arbetsbänken (#1204, beslut B): the game saved last leads the page, large, with what it is and
  // its two things to do on it rather than behind its ⋯, in front of a fan of its own cards.
  it('leads with the game saved last, its two things to do on it, in front of a fan of its cards (#1204)', async () => {
    await home()
    const hero = screen.getByRole('region', { name: 'Fortsätt där du slutade' })
    expect(within(hero).getByText('Vinterspelet')).toBeTruthy()
    expect(within(hero).queryByText('Skogens herrar')).toBeNull()
    // The seats it is set for stand in the line under its name, as in the prototype (#1225).
    expect(within(hero).getByText(/^Version 1 sparad i dag · \d+ spelare$/)).toBeTruthy()
    // Its numbers are the cards, the tables and — once what is waiting has been read — the players'
    // survey answers and the new flags (#1225).
    const stat = (name: string) => within(hero).getByText(name).closest('div')!.textContent
    expect(stat('kort')).toMatch(/^kort\d+$/)
    expect(stat('bord')).toBe('bord0')
    await waitFor(() => expect(stat('enkätsvar')).toBe('enkätsvar0'))
    expect(stat('nya flaggor')).toBe('nya flaggor0')
    expect(within(hero).getByRole('link', { name: 'Öppna editorn' }).getAttribute('href')).toBe(`/editor?project=${run.otherProjectId}&server=${encodeURIComponent(run.http)}`)
    // The fan lands after the page: the game's own first card in front, two more of its cards behind.
    await waitFor(() => expect(hero.querySelectorAll('.byd-home-fan-back')).toHaveLength(2))
    await waitFor(() => within(hero).getByRole('img', { name: 'Första kortet: Drake' }))

    fireEvent.click(within(hero).getByRole('button', { name: 'Starta bord' }))
    await answerStart()
    // Once a table of it runs, the hero opens that table instead of starting another.
    const open = await within(hero).findByRole('link', { name: /^Öppna bordet [A-Z2-9]{6} i Vinterspelet \(öppnas i bordets egen flik\)$/ })
    expect(open.getAttribute('target')).toMatch(/^byd-tv-/)
    expect(within(hero).queryByRole('button', { name: 'Starta bord' })).toBeNull()
  })

  // Lådan i heron (#1416, L91): C:s stilla form, lådan bakom lekens första kort, först när designern
  // själv har öppnat fliken «Låda». Tills dess är heron som i dag, med solfjädern.
  it('shows the box behind the first card only once the designer has opened it, neutral while undrawn (#1416)', async () => {
    await home()
    const hero = screen.getByRole('region', { name: 'Fortsätt där du slutade' })
    await waitFor(() => expect(hero.querySelectorAll('.byd-home-fan-back')).toHaveLength(2))
    expect(hero.querySelector('.byd-home-box')).toBeNull()

    expect((await fetch(`${run.http}/projects/${run.otherProjectId}/box/opened`, { method: 'POST' })).status).toBe(204)
    cleanup()
    render(<HomePage />)
    const again = await screen.findByRole('region', { name: 'Fortsätt där du slutade' })
    // The place is the box's from the first screen, before its faces have landed.
    const box = again.querySelector<HTMLElement>('.byd-home-box')!
    expect(box).not.toBeNull()
    expect(again.querySelector('.byd-home-fan-back')).toBeNull()
    // Its front and right side, each drawn by the one CardPreview, and the game's own first card in front.
    await waitFor(() => expect([...box.querySelectorAll<HTMLElement>('[data-box-face]')].map((f) => f.dataset['boxFace'])).toEqual(['front', 'right']))
    await waitFor(() => expect(box.querySelectorAll('[data-box-face] .byd-preview')).toHaveLength(2))
    within(again).getByRole('img', { name: 'Första kortet: Drake' })
    // Not drawn, so neutral: the game's name on the deck's colour, and nothing else.
    expect(box.querySelector('[data-box-face="front"] [data-element="title"]')?.textContent).toBe('Vinterspelet')
    expect([...box.querySelectorAll('[data-box-face="front"] [data-element]')].map((el) => el.getAttribute('data-element'))).toEqual(['ground', 'title'])
    expect(box.getAttribute('role')).toBe('img')
    expect(box.getAttribute('aria-label')).toBe('Lådan till Vinterspelet')
    // The game saved before it stands as a row, untouched (#1204).
    expect(card().querySelector('.byd-home-box')).toBeNull()
  })

  // The table started is the first of the band (#724, beslut C + B): the room's code and the way to
  // its screen, where they stay after a reload — the banner that said it went with the page. A table
  // just started has not been played, so it stands under «Startade, aldrig spelade» (#1376) and not
  // under «Pågår nu», in the same band's form.
  const running = () => screen.queryByRole('region', { name: 'Startade, aldrig spelade' })

  // Beställarens beslut i #1376, punkt 1: a table started and never played is not running. It has
  // the heading the Bord tab files it under, and the game's row says so instead of «Pågår».
  it('lists a table being played under «Pågår nu», and one never played under its own heading', async () => {
    await home()
    const start = async () => {
      const made = (await (await fetch(`${run.http}/projects/${run.projectId}/sessions`, { method: 'POST' })).json()) as { id: string; code: string; hostKey: string }
      registerRoom(made.id, made)
      return made
    }
    const played = await start()
    const seat = TableClient.connect(await asSeat(run, played.id, 'A', 'Ada'))
    await seat.ready()
    await seat.send({ v: 'seat.claim', seat: 'A', name: 'Ada' })
    await seat.send({ v: 'draw', from: 'draw', to: 'table', count: 1 })
    seat.close()
    const untouched = await start()
    cleanup()
    render(<HomePage />)
    await screen.findByText('Skogens herrar')
    const now = await screen.findByRole('region', { name: 'Pågår nu' })
    const never = await screen.findByRole('region', { name: 'Startade, aldrig spelade' })
    expect(now.textContent).toContain(played.code)
    expect(now.textContent).not.toContain(untouched.code)
    expect(never.textContent).toContain(untouched.code)
    expect(never.textContent).not.toContain(played.code)
    expect(within(never).getByRole('link', { name: new RegExp(`Öppna bordet ${untouched.code}`) })).toBeTruthy()
  })

  // Grupperat per spel (#1411, beslut B): a game's tables stand under its name, each a row that is
  // itself the way to the table, leading with how its people sit (L77) as a glyph the screen
  // reader has words for, then what the table is up to, when, on which version, and by its code.
  it('groups the tables under their game, says how each sits, and makes the row the way to the table (#1411)', async () => {
    await home()
    const start = async (seating: 'screen' | 'computer') => {
      const made = (await (await fetch(`${run.http}/projects/${run.projectId}/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ seating }) })).json()) as { id: string; code: string; hostKey: string }
      registerRoom(made.id, made)
      return made
    }
    const played = await start('screen')
    const seat = TableClient.connect(await asSeat(run, played.id, 'A', 'Ada'))
    await seat.ready()
    await seat.send({ v: 'seat.claim', seat: 'A', name: 'Ada' })
    await seat.send({ v: 'draw', from: 'draw', to: 'table', count: 1 })
    seat.close()
    const tv = await start('screen')
    const desks = await start('computer')
    cleanup()
    render(<HomePage />)
    await screen.findByText('Skogens herrar')
    const never = await screen.findByRole('region', { name: 'Startade, aldrig spelade' })
    // One card for the game: its name once, and the way to the editor once, for two tables.
    expect(within(never).getAllByText('Skogens herrar')).toHaveLength(1)
    expect(within(never).getAllByRole('link', { name: 'Öppna Skogens herrar i editorn' })).toHaveLength(1)
    const tvRow = within(never).getByRole('link', { name: new RegExp(`Öppna bordet ${tv.code}`) })
    const deskRow = within(never).getByRole('link', { name: new RegExp(`Öppna bordet ${desks.code}`) })
    expect(tvRow.getAttribute('data-seating')).toBe('screen')
    expect(deskRow.getAttribute('data-seating')).toBe('computer')
    expect(tvRow.querySelector('[data-glyph="screen"]')).not.toBeNull()
    expect(deskRow.querySelector('[data-glyph="computer"]')).not.toBeNull()
    expect(tvRow.textContent).toContain('Runt en skärm')
    expect(deskRow.textContent).toContain('Var och en vid sin dator')
    expect(tvRow.textContent).toContain('Aldrig spelat')
    expect(tvRow.textContent).toContain('startat i dag')
    expect(tvRow.textContent).toContain('v1')
    expect(tvRow.textContent).toContain(tv.code)
    // The one being played says so, and when it last moved.
    const now = await screen.findByRole('region', { name: 'Pågår nu' })
    const liveRow = within(now).getByRole('link', { name: new RegExp(`Öppna bordet ${played.code}`) })
    expect(liveRow.textContent).toContain('Pågår')
    expect(liveRow.textContent).toContain('senaste drag i dag')
    expect(liveRow.querySelector('[data-glyph="screen"]')).not.toBeNull()
  })

  it('says on the game’s row that its only table was started and never played, not that it runs', async () => {
    await home()
    const made = (await (await fetch(`${run.http}/projects/${run.projectId}/sessions`, { method: 'POST' })).json()) as { id: string; code: string }
    cleanup()
    render(<HomePage />)
    await screen.findByText('Skogens herrar')
    await waitFor(() => expect(card().textContent).toContain(`Startade, aldrig spelade · ${made.code}`))
    expect(card().textContent).not.toContain('Pågår')
    expect(screen.queryByRole('region', { name: 'Pågår nu' })).toBeNull()
  })
  it('starts a table from the card and hands over the room code', async () => {
    await home()
    fireEvent.click(within(card()).getByRole('button', { name: 'Fler val för Skogens herrar' }))
    fireEvent.click(within(await screen.findByRole('group', { name: 'Val för Skogens herrar' })).getByRole('button', { name: 'Starta bord' }))
    await answerStart()
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
    const offered = screen.getByRole('group', { name: 'Val för Skogens herrar' })
    expect(within(offered).getByRole('button', { name: 'Starta nytt bord' })).toBeTruthy()
    expect(within(offered).queryByRole('button', { name: 'Starta bord' })).toBeNull()
  })

  // «Starta nytt bord» stood one line under «Öppna bordet KOD», and a press that meant the one
  // started the other (#1145, beslut A): the press asks first, and the answer it opens on is the
  // table that runs.
  it('asks before starting a second table, opens on the running one, and starts another only when told to (#1145)', async () => {
    await home()
    const made = (await (await fetch(`${run.http}/projects/${run.projectId}/sessions`, { method: 'POST' })).json()) as { id: string; code: string }
    cleanup()
    render(<HomePage />)
    await screen.findByText('Skogens herrar')
    await waitFor(() => expect(running()).not.toBeNull())
    const listed = async () => ((await (await fetch(`${run.http}/projects/${run.projectId}/sessions`)).json()) as unknown[]).length
    const more = within(card()).getByRole('button', { name: 'Fler val för Skogens herrar' })

    fireEvent.click(more)
    fireEvent.click(await screen.findByRole('button', { name: 'Starta nytt bord' }))
    const asked = screen.getByRole('alertdialog', { name: 'Ett bord kör redan' })
    expect(asked.textContent).toContain(`Bordet ${made.code} kör redan.`)
    const open = within(asked).getByRole('button', { name: `Öppna ${made.code}` })
    expect(document.activeElement).toBe(open)
    expect(await listed()).toBe(1)

    // The safe answer opens the table's own screen, as «Öppna bordet» does, and starts nothing.
    const opened = vi.spyOn(window, 'open').mockReturnValue(null)
    fireEvent.click(open)
    const [href, target] = opened.mock.calls[0]!
    const url = new URL(String(href), 'http://x')
    expect([url.pathname, url.searchParams.get('session'), url.searchParams.get('owner'), target]).toEqual(['/table', made.id, '1', `byd-tv-${made.id}`])
    opened.mockRestore()
    expect(screen.queryByRole('alertdialog', { name: 'Ett bord kör redan' })).toBeNull()
    expect(await listed()).toBe(1)

    // Escape takes the question back and gives the focus to ⋯.
    fireEvent.click(more)
    fireEvent.click(await screen.findByRole('button', { name: 'Starta nytt bord' }))
    fireEvent.keyDown(screen.getByRole('alertdialog', { name: 'Ett bord kör redan' }), { key: 'Escape' })
    expect(screen.queryByRole('alertdialog', { name: 'Ett bord kör redan' })).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(more))
    expect(await listed()).toBe(1)

    // And «Starta ett nytt ändå» does what the button used to do on its own.
    fireEvent.click(more)
    fireEvent.click(await screen.findByRole('button', { name: 'Starta nytt bord' }))
    fireEvent.click(screen.getByRole('button', { name: 'Starta ett nytt ändå' }))
    await answerStart()
    await waitFor(async () => expect(await listed()).toBe(2))
  })

  it('asks before taking a game away, and takes it away when the answer is yes', async () => {
    await home()
    fireEvent.click(within(card()).getByRole('button', { name: 'Fler val för Skogens herrar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Ta bort spelet' }))
    expect(screen.getByRole('alertdialog', { name: 'Ta bort spelet' }).textContent).toContain('Skogens herrar')
    // The question can be taken back.
    fireEvent.click(screen.getByRole('button', { name: 'Avbryt' }))
    expect(card()).toBeTruthy()

    fireEvent.click(within(card()).getByRole('button', { name: 'Fler val för Skogens herrar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Ta bort spelet' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ta bort' }))
    await waitFor(() => expect(document.querySelector(`[data-project="${run.projectId}"]`)).toBeNull())
    expect((await (await fetch(`${run.http}/projects/${run.projectId}`)).status)).toBe(404)
  })
})

// The account the panel is read for: Ada owns Skogens herrar and Vinterspelet. Kim, a co-editor,
// saves version 2 of Skogens herrar; a table on version 2 raises two flags and is answered by its
// seat; and Ada sat at a table of no game herself, over and not answered. Returns that table.
async function waitingAccount(): Promise<{ sat: string; kim: { id: string } }> {
  await run.stop()
  run = await startServer({ auth: true, authBypass: true })
  const json = { 'content-type': 'application/json' }
  await fetch(`${run.http}/auth/login`, { method: 'POST', headers: json, body: JSON.stringify({ email: 'ada@example.com' }) })
  expect((await fetch(`${run.http}/projects`, { method: 'POST', headers: json, body: JSON.stringify({ id: run.projectId, ...projectDoc() }) })).status).toBe(201)
  expect((await fetch(`${run.http}/projects`, { method: 'POST', headers: json, body: JSON.stringify({ id: run.otherProjectId, ...projectDoc(), name: 'Vinterspelet' }) })).status).toBe(201)
  // Kim, a co-editor, saves version 2 of Skogens herrar, which makes it the game saved last.
  const kim = await run.auth!.ensureAccount('kim@example.com')
  await run.projects.share(run.projectId, kim.id, 'editor')
  expect(await run.projects.replace(run.projectId, 1, { ...projectDoc(), rows: [...projectDoc().rows, { id: 'uggla', fields: { title: 'Uggla', antal: 1 } }] }, 0, undefined, [], kim.id)).toMatchObject({ rev: 2 })
  // A table on version 2: two flags from a seat, and its answer once the table is over.
  const made = (await (await fetch(`${run.http}/projects/${run.projectId}/sessions`, { method: 'POST', headers: json, body: '{}' })).json()) as { id: string; code: string; hostKey: string }
  registerRoom(made.id, made)
  const token = await admit(run, made.id, 'A', 'Bo')
  const seat = TableClient.connect({ url: run.url, sessionId: made.id, seat: 'A', token })
  await seat.ready()
  await seat.send({ v: 'seat.claim', seat: 'A', name: 'Bo' })
  await seat.send({ v: 'flag', note: 'Draken är för stark' })
  await seat.send({ v: 'flag' })
  const host = TableClient.connect(await asTable(run, made.id))
  await host.ready()
  await host.send({ v: 'session.end' })
  seat.close()
  host.close()
  expect((await fetch(`${run.http}/sessions/${made.id}/survey`, { method: 'POST', headers: json, body: JSON.stringify({ token, seat: 'A', answers: { fun: 4, clarity: 3, balance: 4, change: '' } }) })).status).toBe(201)
  // A table Ada sat at herself, over and not answered.
  const sat = await createSession(run, 'satt')
  const mine = await admit(run, sat, 'A', 'Ada')
  expect((await fetch(`${run.http}/guests/claim`, { method: 'POST', headers: json, body: JSON.stringify({ token: mine }) })).status).toBe(200)
  const satHost = TableClient.connect(await asTable(run, sat))
  await satHost.ready()
  await satHost.send({ v: 'session.end' })
  satHost.close()
  return { sat, kim }
}

// «Väntar på dig» (#1225, #1204 beslut B): in the column of what is happening, under «Pågår nu»,
// the new flags on a game's newest version, the surveys the account has left to answer, and a
// newest version someone else saved. Each a row with its icon, what it is, where it is from and an
// arrow, leading where it is dealt with: Resultat on that version, the survey, the editor.
describe('what waits for the account on the home page (#1225)', () => {
  it('lists the new flags, the survey left to answer and a co-editor’s version, and leads to each', async () => {
    const { sat, kim } = await waitingAccount()

    history.replaceState(null, '', `/?server=${encodeURIComponent(run.http)}`)
    // Kim has given her account no name (#1254): she is somebody else, and never her address's word.
    const before = render(<HomePage />)
    const unnamed = await screen.findByRole('region', { name: 'Väntar på dig' })
    await waitFor(() => expect(within(unnamed).getAllByRole('link').at(-1)?.textContent).toBe('Någon annan sparade version 2Skogens herrar · i dag'))
    expect(document.body.textContent).not.toMatch(/Kim sparade/)
    before.unmount()
    await run.auth!.setName(kim.id, 'Kim')
    const gone: string[] = []
    render(<HomePage onNavigate={(u) => gone.push(u)} />)
    const panel = await screen.findByRole('region', { name: 'Väntar på dig' })
    await waitFor(() => expect(within(panel).getAllByRole('link').at(-1)?.textContent).toBe('Kim sparade version 2Skogens herrar · i dag'))
    const rows = within(panel).getAllByRole('link')
    expect(rows.map((row) => row.textContent)).toEqual(['2 nya flaggorSkogens herrar v2 · från bordet i dag', 'Svara på enkätenEtt bord · du spelade som Ada', 'Kim sparade version 2Skogens herrar · i dag'])
    const server = encodeURIComponent(run.http)
    expect(rows.map((row) => row.getAttribute('href'))).toEqual([`/editor?project=${run.projectId}&results=rev-2&server=${server}`, `/survey?session=${sat}&server=${server}`, `/editor?project=${run.projectId}&server=${server}`])
    fireEvent.click(rows[0]!)
    expect(gone).toEqual([`/editor?project=${run.projectId}&results=rev-2&server=${server}`])

    // The hero is the game Kim saved last, with the players' one answer and its two new flags.
    const hero = screen.getByRole('region', { name: 'Fortsätt där du slutade' })
    const stat = (name: string) => within(hero).getByText(name).closest('div')!.textContent
    expect(stat('enkätsvar')).toBe('enkätsvar1')
    expect(stat('nya flaggor')).toBe('nya flaggor2')
  })

  // The two sources answer in either order. Drawn on what waits alone, the panel stood with the
  // co-editor's version and the survey arrived under it a moment later, so the rows jumped and a
  // reader (or the test above, under load) took the first two for all of it.
  it('stands only once the tables the account sat at have answered too', async () => {
    await run.stop()
    run = await startServer({ auth: true, authBypass: true })
    const json = { 'content-type': 'application/json' }
    await fetch(`${run.http}/auth/login`, { method: 'POST', headers: json, body: JSON.stringify({ email: 'ada@example.com' }) })
    expect((await fetch(`${run.http}/projects`, { method: 'POST', headers: json, body: JSON.stringify({ id: run.projectId, ...projectDoc() }) })).status).toBe(201)
    const kim = await run.auth!.ensureAccount('kim@example.com')
    await run.auth!.setName(kim.id, 'Kim')
    await run.projects.share(run.projectId, kim.id, 'editor')
    expect(await run.projects.replace(run.projectId, 1, { ...projectDoc(), rows: [...projectDoc().rows, { id: 'uggla', fields: { title: 'Uggla', antal: 1 } }] }, 0, undefined, [], kim.id)).toMatchObject({ rev: 2 })
    const sat = await createSession(run, 'satt')
    const mine = await admit(run, sat, 'A', 'Ada')
    expect((await fetch(`${run.http}/guests/claim`, { method: 'POST', headers: json, body: JSON.stringify({ token: mine }) })).status).toBe(200)
    const satHost = TableClient.connect(await asTable(run, sat))
    await satHost.ready()
    expect(await satHost.send({ v: 'session.end' })).toMatchObject({ ok: true })
    satHost.close()

    // The tables the account sat at are held back until what waits has answered and been drawn.
    const realFetch = globalThis.fetch
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    let waited = false
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).pathname
      if (path === '/me/played') await held
      const res = await realFetch(input, init)
      if (path === '/me/waiting') waited = true
      return res
    }) as typeof fetch
    try {
      history.replaceState(null, '', `/?server=${encodeURIComponent(run.http)}`)
      render(<HomePage onNavigate={() => undefined} />)
      await screen.findByRole('region', { name: 'Fortsätt där du slutade' })
      await waitFor(() => expect(waited).toBe(true))
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(screen.queryByRole('region', { name: 'Väntar på dig' })).toBeNull()
      release()
      const panel = await screen.findByRole('region', { name: 'Väntar på dig' })
      expect(within(panel).getAllByRole('link').map((row) => row.textContent)).toEqual(['Svara på enkätenEtt bord · du spelade som Ada', 'Kim sparade version 2Skogens herrar · i dag'])
    } finally {
      release()
      globalThis.fetch = realFetch
    }
  })

  // The prototype's flag chip on a game's row (#1282), «⚑ 2 nya flaggor», counted as the panel counts
  // them (G1: raised on the game's newest version) and from the same answer. The hero says the same
  // in its numbers and wears no chip.
  it('marks a game’s row with its new flags, as the panel counts them', async () => {
    await waitingAccount()
    // Ada saves Vinterspelet after Kim's version, so it leads and Skogens herrar is a row.
    const json = { 'content-type': 'application/json' }
    expect((await fetch(`${run.http}/projects/${run.otherProjectId}`, { method: 'PUT', headers: json, body: JSON.stringify({ rev: 1, ...projectDoc(), name: 'Vinterspelet', rows: [...projectDoc().rows, { id: 'is', fields: { title: 'Is', antal: 1 } }] }) })).status).toBe(200)
    history.replaceState(null, '', `/?server=${encodeURIComponent(run.http)}`)
    render(<HomePage onNavigate={() => undefined} />)
    const panel = await screen.findByRole('region', { name: 'Väntar på dig' })
    expect(within(panel).getAllByRole('link')[0]!.textContent).toBe('2 nya flaggorSkogens herrar v2 · från bordet i dag')
    const hero = screen.getByRole('region', { name: 'Fortsätt där du slutade' })
    expect(within(hero).getByText('Vinterspelet')).toBeTruthy()
    const row = document.querySelector(`[data-project="${run.projectId}"]`) as HTMLElement
    const chip = await within(row).findByText('2 nya flaggor')
    expect(chip.closest('[data-new-flags]')).not.toBeNull()
    // Said with the game when the row is gone through, after its line and before its card.
    await waitFor(() => expect(within(row).getByRole('link', { name: /^Skogens herrar .* 2 nya flaggor Första kortet/ })).toBeTruthy())
    // One chip on the page: the game with no new flags has none, and the hero has its number.
    expect(document.querySelectorAll('.byd-home-chip[data-new-flags]').length).toBe(1)
    expect(within(hero).queryByText('2 nya flaggor')).toBeNull()
  })

  // Two tables of one game, both over and neither answered, were two rows that said the same thing
  // to the letter (#1282). The panel has one row of each kind per game, as the flags have had from
  // the start: the surveys are counted, and the row leads to the table sat at last. Each table is
  // still a tile of its own under «Bord du har spelat vid», with its own way to its survey.
  it('says two surveys left at one game in one row that counts them, and leads to the newest', async () => {
    await run.stop()
    run = await startServer({ auth: true, authBypass: true })
    const json = { 'content-type': 'application/json' }
    await fetch(`${run.http}/auth/login`, { method: 'POST', headers: json, body: JSON.stringify({ email: 'ada@example.com' }) })
    expect((await fetch(`${run.http}/projects`, { method: 'POST', headers: json, body: JSON.stringify({ id: run.projectId, ...projectDoc() }) })).status).toBe(201)
    const sessions: string[] = []
    for (let i = 0; i < 2; i++) {
      const made = (await (await fetch(`${run.http}/projects/${run.projectId}/sessions`, { method: 'POST', headers: json, body: '{}' })).json()) as { id: string; code: string; hostKey: string }
      registerRoom(made.id, made)
      // A millisecond apart at least, so which table was sat at last is a fact and not a tie.
      await new Promise((resolve) => setTimeout(resolve, 5))
      const token = await admit(run, made.id, 'A', 'Ada')
      expect((await fetch(`${run.http}/guests/claim`, { method: 'POST', headers: json, body: JSON.stringify({ token }) })).status).toBe(200)
      const host = TableClient.connect(await asTable(run, made.id))
      await host.ready()
      expect(await host.send({ v: 'session.end' })).toMatchObject({ ok: true })
      host.close()
      sessions.push(made.id)
    }

    history.replaceState(null, '', `/?server=${encodeURIComponent(run.http)}`)
    const gone: string[] = []
    render(<HomePage onNavigate={(u) => gone.push(u)} />)
    const panel = await screen.findByRole('region', { name: 'Väntar på dig' })
    const rows = within(panel).getAllByRole('link')
    expect(rows.map((row) => row.textContent)).toEqual(['Svara på 2 enkäterSkogens herrar · 2 bord, senast i dag'])
    const to = `/survey?session=${sessions[1]}&server=${encodeURIComponent(run.http)}`
    expect(rows[0]!.getAttribute('href')).toBe(to)
    fireEvent.click(rows[0]!)
    expect(gone).toEqual([to])
    // The tables themselves are still two tiles, each with its own way to its own survey.
    const sat = screen.getByRole('region', { name: 'Bord du har spelat vid' })
    expect(within(sat).getAllByRole('link', { name: 'Svara på enkäten' }).map((a) => a.getAttribute('href'))).toEqual(expect.arrayContaining(sessions.map((s) => `/survey?session=${s}&server=${encodeURIComponent(run.http)}`)))
  })

  it('stands nowhere when nothing waits', async () => {
    await run.stop()
    run = await startServer({ auth: true, authBypass: true })
    await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'ada@example.com' }) })
    await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: run.projectId, ...projectDoc() }) })
    history.replaceState(null, '', `/?server=${encodeURIComponent(run.http)}`)
    render(<HomePage onNavigate={() => undefined} />)
    const hero = await screen.findByRole('region', { name: 'Fortsätt där du slutade' })
    await waitFor(() => expect(within(hero).getByText('enkätsvar').closest('div')!.textContent).toBe('enkätsvar0'))
    expect(screen.queryByRole('region', { name: 'Väntar på dig' })).toBeNull()
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
    await waitFor(() => expect(document.activeElement).toBe(within(menu()!).getByRole('button', { name: 'Starta bord' })))
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
    const first = await waitFor(() => within(menu()!).getByRole('button', { name: 'Starta bord' }))
    fireEvent.blur(first, { relatedTarget: screen.getAllByRole('link', { name: /Nytt spel/ })[0]! })
    expect(menu()).toBeNull()
  })

  it('asks with the focus on the answer that keeps the game, and Escape takes the question back onto ⋯', async () => {
    await home()
    fireEvent.click(more())
    fireEvent.click(await screen.findByRole('button', { name: 'Ta bort spelet' }))
    const question = screen.getByRole('alertdialog', { name: 'Ta bort spelet' })
    await waitFor(() => expect(document.activeElement).toBe(within(question).getByRole('button', { name: 'Avbryt' })))
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.queryByRole('alertdialog')).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(more()))
  })

  it('keeps the focus on ⋯ after a table is started, and says the way to it opens in the table’s own tab', async () => {
    await home()
    fireEvent.click(more())
    fireEvent.click(await waitFor(() => within(menu()!).getByRole('button', { name: 'Starta bord' })))
    await answerStart()
    await waitFor(() => expect(document.activeElement).toBe(more()))
    // The way to it is the band in «Pågår nu» (#724), and says it opens in the table's own tab:
    // opened twice, the same tab (#1217).
    const band = await screen.findByRole('region', { name: 'Startade, aldrig spelade' })
    const open = await within(band).findByRole('link', { name: /^Öppna bordet [A-Z2-9]{6} i Skogens herrar \(öppnas i bordets egen flik\)$/ })
    expect(open.getAttribute('target')).toMatch(/^byd-tv-/)
    // And beside it the way to the game itself, in the editor (#1217).
    const game = within(band).getByRole('link', { name: 'Öppna Skogens herrar i editorn' })
    expect(game.textContent).toBe('Öppna spelet')
    expect(new URL(game.getAttribute('href')!, 'http://x').pathname).toBe('/editor')
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
    expect(saved.map((s) => s.name)).toEqual(['Skogens herrar v1.zip'])

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
    ['owner', ['Starta bord', 'Byt namn…', 'Duplicera', 'Exportera…', 'Tryckpaketet…', 'Ta bort spelet']],
    ['editor', ['Starta bord', 'Byt namn…', 'Duplicera', 'Exportera…', 'Tryckpaketet…']],
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
    const dialog = await screen.findByRole('dialog', { name: 'Byt namn på «Skogens herrar»' })
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
    fireEvent.click(await screen.findByRole('button', { name: 'Duplicera' }))
    await screen.findByText('Skogens herrar (kopia)', { selector: '.byd-home-game strong' })
    await waitFor(() => expect(document.body.textContent).toContain('«Skogens herrar (kopia)» finns nu i Mina spel.'))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Fler val för Skogens herrar' })))
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

  // A drawing in a zip is held to the upload gate (#1087), and the refusal is said in the reader's
  // words: the gate's reason is English for the log, so the window says what it means instead.
  it('says which drawing in the zip is not safe to draw', async () => {
    await run.stop()
    run = await startServer({ auth: true, authBypass: true })
    await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'ada@example.com' }) })
    history.replaceState(null, '', `/?server=${encodeURIComponent(run.http)}`)
    const real = globalThis.fetch
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.includes('/projects/import')) {
        const problems = [{ code: 'asset-unsafe', values: { hash: 'a'.repeat(64), file: 'assets/sköld.svg', reason: 'onload is an event handler' } }]
        return new Response(JSON.stringify({ error: 'not an export that can be read', problems }), { status: 422, headers: { 'content-type': 'application/json' } })
      }
      return real(input, init)
    })
    try {
      render(<HomePage onNavigate={() => undefined} />)
      fireEvent.click(await screen.findByRole('button', { name: 'Importera spel…' }))
      const dialog = await screen.findByRole('dialog')
      fireEvent.change(dialog.querySelector('input[type="file"]')!, { target: { files: [new File(['PK'], 'Skogens herrar rev-1.zip', { type: 'application/zip' })] } })
      const refusal = await within(dialog).findByRole('alert')
      expect(refusal.textContent).toMatch(/Filen assets\/sköld\.svg innehåller något som inte är säkert att visa\./)
      expect(refusal.textContent).not.toMatch(/onload/)
    } finally {
      spy.mockRestore()
    }
  })
})
