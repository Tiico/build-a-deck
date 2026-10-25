// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { TERMS } from '@byd/server/terms'
import { WelcomePage } from '../src/account/WelcomePage.js'
import { HomePage } from '../src/account/HomePage.js'
import { TermsPage } from '../src/terms/TermsPage.js'
import { StatusLive } from '../src/status/StatusLive.js'
import { ProjectClient } from '../src/editor/ProjectClient.js'
import { TEXTS, textOf } from '../src/terms/beta.js'
import { OPERATOR } from '../src/terms/operator.js'
import { translate } from '../src/i18n/index.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'

// The beta's terms (#1272, beställarens beslut 2026-10-24, variant B), against the real server and its
// gate: the welcome card's second step after the name, «Inte nu», Mina spel as it always is with a
// quiet word and the band first in the queue, the dialog a press opens, the editor holding an edit
// until the terms are accepted, and /villkor with «Kort sagt» per section.
const BETA = [{ version: '2026-10-25', material: true }]
const START_TITLE = translate('sv', 'editor.start.title')
let run: Running
const opened: ProjectClient[] = []
beforeEach(async () => {
  localStorage.clear()
  sessionStorage.clear()
  run = await startServer({ auth: true, authBypass: true, appOrigin: location.origin, terms: BETA })
})
afterEach(async () => {
  cleanup()
  for (const client of opened.splice(0)) client.close()
  await run.stop()
})

const loggedIn = (email: string) => fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
const me = () => fetch(`${run.http}/auth/me`).then((r) => r.json() as Promise<{ email: string | null; name?: string | null; asked?: boolean; terms?: { due: boolean; accepted: string | null } }>)
const accepted = () => fetch(`${run.http}/me/terms`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ version: '2026-10-25' }) })
// A game of the account's own, written into the store: one that has not accepted cannot make one.
const ownGame = async (email: string) => run.projects.create(run.projectId, projectDoc(), (await run.auth!.accountByEmail(email))!.id)

function at(path: string, page: (gone: string[]) => ReactNode): string[] {
  history.replaceState(null, '', `${path}${path.includes('?') ? '&' : '?'}server=${encodeURIComponent(run.http)}`)
  const gone: string[] = []
  render(<StatusLive>{page(gone)}</StatusLive>)
  return gone
}

describe('the terms in the welcome card, after the name (#1272)', () => {
  it('asks the name as «Steg 1 av 2», then the terms as «Steg 2 av 2», and goes on once accepted', async () => {
    await loggedIn('nicklas.ockelberg@example.com')
    const gone = at(`/login?step=name&next=${encodeURIComponent('/new')}`, (g) => <WelcomePage onNavigate={(u) => g.push(u)} />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Välkommen till Deckster' })).toBeTruthy()
    expect(screen.getByText('Steg 1 av 2')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Fortsätt' }))

    const heading = await screen.findByRole('heading', { level: 1, name: 'Villkoren för betan' })
    // The second step is the same card's, its focus on its heading, its address the step's own.
    await waitFor(() => expect(document.activeElement).toBe(heading))
    expect(new URLSearchParams(location.search).get('step')).toBe('terms')
    expect(screen.getByText('Steg 2 av 2')).toBeTruthy()
    expect(screen.getByText('Version 2026-10-25, ett utkast som inte är juridiskt granskat. Kort sagt:')).toBeTruthy()
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(textOf('2026-10-25').summary.map((line) => line.replace(/\*\*/g, '')))
    expect(screen.getByRole('link', { name: 'Läs hela villkoren' }).getAttribute('href')).toBe(`/villkor?server=${encodeURIComponent(run.http)}`)
    expect(screen.getByRole('link', { name: 'Integritet' }).getAttribute('href')).toBe(`/villkor?server=${encodeURIComponent(run.http)}#integritet`)
    expect(screen.getByText('Genom att godkänna intygar du att du är 18 år eller äldre.')).toBeTruthy()

    // «← Namnet» goes back with the name that was given, and on again.
    fireEvent.click(screen.getByRole('button', { name: 'Namnet' }))
    expect(((await screen.findByLabelText('Vad ska andra kalla dig?')) as HTMLInputElement).value).toBe('Nicklas')
    fireEvent.click(screen.getByRole('button', { name: 'Fortsätt' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Godkänn och fortsätt' }))
    await waitFor(() => expect(gone).toEqual(['/new']))
    expect(await me()).toMatchObject({ name: 'Nicklas', asked: true, terms: { accepted: '2026-10-25', due: false } })
  })

  it('goes on unaccepted on «Inte nu», and asks no more this visit', async () => {
    await loggedIn('ada@example.com')
    const gone = at(`/login?step=name&next=${encodeURIComponent('/')}`, (g) => <WelcomePage onNavigate={(u) => g.push(u)} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Hoppa över' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Inte nu' }))
    await waitFor(() => expect(gone).toEqual(['/']))
    expect(await me()).toMatchObject({ asked: true, terms: { accepted: null, due: true } })
    expect(sessionStorage.getItem('byd.terms.later')).toBe('2026-10-25')
  })

  it('is no step for an account that has accepted, and the name stands alone', async () => {
    await loggedIn('bo@example.com')
    await accepted()
    at(`/login?step=name&next=${encodeURIComponent('/')}`, (g) => <WelcomePage onNavigate={(u) => g.push(u)} />)
    expect(await screen.findByLabelText('Vad ska andra kalla dig?')).toBeTruthy()
    expect(screen.queryByText('Steg 1 av 2')).toBeNull()
  })
})

describe('Mina spel for an account that has not accepted (#1272)', () => {
  const home = () => at('/', (g) => <HomePage onNavigate={(u) => g.push(u)} />)

  it('is the page as always, with the quiet word, and the terms\' band first in the queue', async () => {
    await loggedIn('ada@example.com')
    home()
    expect(await screen.findByText('Villkoren inte godkända')).toBeTruthy()
    const band = await screen.findByRole('region', { name: 'Villkor' })
    expect(band.textContent).toContain('Deckster har fått villkor. Läs dem och godkänn för att fortsätta skapa och ändra.')
    // One band at a time: the name's waits behind it (#1254).
    expect(screen.queryByRole('region', { name: 'Namn' })).toBeNull()
    // Nothing is drawn as locked: the page's own presses are all there.
    expect(screen.getByRole('button', { name: 'Importera spel…' })).toBeTruthy()

    // «Inte nu» puts it off for the visit, and the next band in the queue stands.
    fireEvent.click(within(band).getByRole('button', { name: 'Inte nu' }))
    expect(await screen.findByRole('region', { name: 'Namn' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Villkor' })).toBeNull()
    cleanup()
    home()
    expect(await screen.findByText('Villkoren inte godkända')).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Villkor' })).toBeNull()
  })

  it('opens the step as a dialog on a press that writes, and does the press once accepted', async () => {
    await loggedIn('ada@example.com')
    const gone = home()
    fireEvent.click((await screen.findAllByRole('link', { name: /Nytt spel/ }))[0]!)
    const dialog = await screen.findByRole('dialog', { name: 'Godkänn villkoren först' })
    expect(within(dialog).getByText('För att skapa och ändra spel behöver du godkänna villkoren för betan. Kort sagt:')).toBeTruthy()
    // «Inte nu» closes it, and nothing happened.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Inte nu' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(gone).toEqual([])

    fireEvent.click(screen.getAllByRole('link', { name: /Nytt spel/ })[0]!)
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Godkänn och fortsätt' }))
    await waitFor(() => expect(gone).toEqual([`/new?server=${encodeURIComponent(run.http)}`]))
    expect(await me()).toMatchObject({ terms: { accepted: '2026-10-25', due: false } })
    expect(screen.queryByText('Villkoren inte godkända')).toBeNull()
  })

  // Read mode is read, export and log out (F4 beslut 5): exporting asks for nothing.
  it('exports a game without asking for the terms', async () => {
    await loggedIn('ada@example.com')
    await ownGame('ada@example.com')
    home()
    fireEvent.click(await screen.findByRole('button', { name: 'Fler val för Skogens herrar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Exportera…' }))
    expect(await screen.findByRole('dialog', { name: 'Exportera «Skogens herrar»' })).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: 'Godkänn villkoren först' })).toBeNull()
  })

  it('goes on with the press it asked for once the dialog is accepted', async () => {
    await loggedIn('ada@example.com')
    await ownGame('ada@example.com')
    home()
    fireEvent.click(await screen.findByRole('button', { name: 'Starta bord' }))
    const dialog = await screen.findByRole('dialog', { name: 'Godkänn villkoren först' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Godkänn och fortsätt' }))
    // «Starta bord» asks how you sit next (#1286), as it does for anyone who has accepted.
    expect(await screen.findByRole('dialog', { name: START_TITLE })).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: 'Godkänn villkoren först' })).toBeNull()
  })
})

describe('the editor holds an edit until the terms are accepted (#1272)', () => {
  const t = (key: Parameters<typeof translate>[1]) => translate('sv', key)
  const open = async () => {
    const client = await ProjectClient.open({ http: run.http, id: run.projectId })
    opened.push(client)
    await waitFor(() => expect(client.role).toBe('owner'))
    return client
  }
  const saved = async () => (await run.projects.readEdits(run.projectId, 0)).length

  it('keeps the edit on the screen, asks, and sends it once accepted', async () => {
    await loggedIn('ada@example.com')
    await ownGame('ada@example.com')
    const client = await open()
    client.setCell('dragon', 'title', 'Drakhona')
    // The server refuses it for the terms, and the editor keeps it rather than taking it off.
    await waitFor(() => expect(client.termsAsked).toBe(true))
    expect(client.termsCurrent).toBe('2026-10-25')
    expect(client.doc.rows.find((r) => r.id === 'dragon')?.fields['title']).toBe('Drakhona')
    expect(client.refusedEdits).toBe(0)
    // Held from here on: the next edit is not sent at all.
    client.setCell('dragon', 'title', 'Drakhonan')
    expect(await saved()).toBe(0)

    await accepted()
    client.releaseTerms()
    await waitFor(async () => expect(await saved()).toBe(2))
    expect(client.termsAsked).toBe(false)
  })

  it('takes the held edit back on «Inte nu», and asks again on the next one', async () => {
    await loggedIn('ada@example.com')
    await ownGame('ada@example.com')
    const client = await open()
    client.holdForTerms('2026-10-25')
    const before = client.doc.rows.find((r) => r.id === 'dragon')?.fields['title']
    client.setCell('dragon', 'title', 'Drakhona')
    expect(client.termsAsked).toBe(true)
    client.dropHeld(t)
    expect(client.termsAsked).toBe(false)
    expect(client.doc.rows.find((r) => r.id === 'dragon')?.fields['title']).toBe(before)
    expect(client.canUndo).toBe(false)
    client.setCell('dragon', 'title', 'Drakhona')
    expect(client.termsAsked).toBe(true)
    expect(await saved()).toBe(0)
  })

  it('makes a save wait for the terms, and says it was not made when they are put off', async () => {
    await loggedIn('ada@example.com')
    await ownGame('ada@example.com')
    const client = await open()
    client.holdForTerms('2026-10-25')
    client.setCell('dragon', 'title', 'Drakhona')
    const save = client.save()
    client.dropHeld(t)
    expect(await save).toEqual({ ok: false, reason: 'terms' })
  })
})

describe('/villkor (#1272)', () => {
  it('says each section in one sentence, with the whole text behind an opening, terms and privacy on one page', async () => {
    at('/villkor', () => <TermsPage />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Villkor och integritet' })).toBeTruthy()
    expect(screen.getByText('Utkast, inte juridiskt granskat')).toBeTruthy()
    await screen.findByText('Version 2026-10-25 · gällande')
    const terms = screen.getByRole('region', { name: 'Villkor för Decksters beta' })
    const privacy = screen.getByRole('region', { name: 'Integritet i Decksters beta' })
    // Sixteen sections in #1268's numbering, 9 and 10 as headings with nothing more to open.
    expect(terms.querySelectorAll(':scope > ol > li')).toHaveLength(16)
    expect(terms.querySelectorAll('details')).toHaveLength(14)
    expect(privacy.querySelectorAll(':scope > ol > li')).toHaveLength(textOf('2026-10-25').privacy.sections.length)
    const first = terms.querySelector('details')!
    expect(first.open).toBe(false)
    expect(first.querySelector('summary')!.textContent).toContain('Deckster drivs i betan av en privatperson')
    // The operator's details are written in one place, and stand in brackets until they are filled in.
    expect(first.textContent).toContain(`Deckster drivs under betan av ${OPERATOR.name}, ${OPERATOR.address} («vi»).`)

    fireEvent.click(screen.getByRole('button', { name: 'Visa all text' }))
    await waitFor(() => expect([...document.querySelectorAll('details')].every((d) => d.open)).toBe(true))
    fireEvent.click(screen.getByRole('button', { name: 'Stäng all text' }))
    await waitFor(() => expect([...document.querySelectorAll('details')].some((d) => d.open)).toBe(false))
    expect(screen.getByRole('link', { name: 'Integritet' }).getAttribute('href')).toBe('#integritet')
    expect(document.getElementById('integritet')?.textContent).toBe('Integritet i Decksters beta')
  })

  it('has a text for every version the box can put in force', () => {
    for (const { version } of TERMS) expect(TEXTS[version]?.version).toBe(version)
  })

  // The privacy text says what is true today (beställarens beslut 3): the slices that bring deletion
  // after twelve months, from the phone and from Profil are not built, so it promises none of them.
  it('promises no way to erase that is not built yet', () => {
    const all = JSON.stringify(textOf('2026-10-25').privacy)
    expect(all).not.toMatch(/12 månader|tolv månader|Radera kontot|från telefonen|på din egen telefon/)
    expect(all).toContain('{contact}')
  })
})
