// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { WelcomePage } from '../src/account/WelcomePage.js'
import { HomePage } from '../src/account/HomePage.js'
import { ProfilePage } from '../src/account/ProfilePage.js'
import { LoginPage } from '../src/account/LoginPage.js'
import { EditorPage } from '../src/editor/EditorPage.js'
import { KeychainContext, type Keychain } from '../src/account/passkey.js'
import { StatusLive } from '../src/status/StatusLive.js'
import { arrival } from '../src/account/api.js'
import { SoftPasskey } from '../../../test-support/soft-passkey.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'

// The account's own name (#1254, beställarens beslut 2026-10-24, variant C): the welcome step after
// the first login, the band on Mina spel for an account that was made before it, the card «Namn» on
// the profile, and the name where the others read it — against the real server.
let run: Running
beforeEach(async () => {
  localStorage.clear()
  run = await startServer({ auth: true, authBypass: true, ai: true, appOrigin: location.origin })
})
afterEach(async () => {
  cleanup()
  await run.stop()
})

const loggedIn = (email: string) => fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
const named = (name: string | null) => fetch(`${run.http}/me/name`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) })
const me = () => fetch(`${run.http}/auth/me`).then((r) => r.json() as Promise<{ email: string | null; name?: string | null; asked?: boolean }>)

const keychain = (): Keychain => {
  const soft = new SoftPasskey(location.origin)
  return {
    supported: () => true,
    platform: async () => true,
    autofill: async () => false,
    create: async (options) => soft.create(options as Parameters<SoftPasskey['create']>[0]),
    get: async (options) => soft.get(options as Parameters<SoftPasskey['get']>[0]),
  }
}
function at(path: string, page: (gone: string[]) => ReactNode): string[] {
  history.replaceState(null, '', `${path}${path.includes('?') ? '&' : '?'}server=${encodeURIComponent(run.http)}`)
  const gone: string[] = []
  render(
    <KeychainContext.Provider value={keychain()}>
      <StatusLive>{page(gone)}</StatusLive>
    </KeychainContext.Provider>,
  )
  return gone
}
const welcome = (next = '/editor?project=p1') => at(`/login?step=name&next=${encodeURIComponent(next)}`, (gone) => <WelcomePage onNavigate={(u) => gone.push(u)} />)

describe('the welcome step after the first login', () => {
  it('asks what the others should call her, with the name her address suggests, and goes on with it', async () => {
    await loggedIn('nicklas.ockelberg@example.com')
    const gone = welcome()
    expect(await screen.findByRole('heading', { level: 1, name: 'Välkommen till Deckster' })).toBeTruthy()
    expect(screen.getByText('Du är inloggad som nicklas.ockelberg@example.com.')).toBeTruthy()
    const field = screen.getByLabelText('Vad ska andra kalla dig?') as HTMLInputElement
    expect(field.value).toBe('Nicklas')
    expect(field.maxLength).toBe(40)
    expect(screen.getByText('Namnet står när du delar ett spel och när du är online i det. Förslaget kommer ur din adress. Du kan ändra det i Profil.')).toBeTruthy()
    fireEvent.change(field, { target: { value: 'Nicklas Ockelberg' } })
    fireEvent.click(screen.getByRole('button', { name: 'Fortsätt' }))
    await waitFor(() => expect(gone).toEqual(['/editor?project=p1']))
    expect(await me()).toMatchObject({ email: 'nicklas.ockelberg@example.com', name: 'Nicklas Ockelberg', asked: true })
  })

  it('keeps no name on «Hoppa över», and asks no more', async () => {
    await loggedIn('info@lekverkstan.se')
    const gone = welcome('/')
    expect(((await screen.findByLabelText('Vad ska andra kalla dig?')) as HTMLInputElement).value).toBe('Info')
    fireEvent.click(screen.getByRole('button', { name: 'Hoppa över' }))
    await waitFor(() => expect(gone).toEqual(['/']))
    expect(await me()).toMatchObject({ email: 'info@lekverkstan.se', name: null, asked: true })

    // Asked once: the step goes straight on.
    cleanup()
    const again = welcome('/profile')
    await waitFor(() => expect(again).toEqual(['/profile']))
  })

  it('suggests nothing an address does not have, and says nothing about a suggestion', async () => {
    await loggedIn('x92@example.com')
    welcome()
    const field = (await screen.findByLabelText('Vad ska andra kalla dig?')) as HTMLInputElement
    expect(field.value).toBe('')
    expect(field.placeholder).toBe('Till exempel Kim Larsson')
    expect(screen.getByText('Namnet står när du delar ett spel och när du är online i det. Du kan ändra det i Profil.')).toBeTruthy()
  })

  it('sends nobody signed in to log in, and back here after', async () => {
    const gone = welcome()
    await waitFor(() => expect(gone[0]).toMatch(/^\/login\?next=%2Feditor%3Fproject%3Dp1/))
  })

  // The step is the login page's own (`step=name`), not an address of its own: every address is a line
  // in the entry the phone fetches too (#760).
  it('is drawn by the login page for whoever is signed in, and the page goes on as before without the step', async () => {
    await loggedIn('nicklas.ockelberg@example.com')
    at('/login?step=name&next=%2Fprofile', (g) => <LoginPage onNavigate={(u) => g.push(u)} />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Välkommen till Deckster' })).toBeTruthy()
    cleanup()
    const gone = at('/login?next=%2Fprofile', (g) => <LoginPage onNavigate={(u) => g.push(u)} />)
    await waitFor(() => expect(gone).toEqual(['/profile']))
  })

  // A guest's token rides in the fragment and never in a query (#1278): the step keeps it after its
  // own address, and hands it on with `next`.
  it('carries a fragment past the step without ever putting it in a query', async () => {
    await loggedIn('ada@example.com')
    const way = await arrival(run.http, '/claim?next=%2Fplay#t=abc123')
    expect(way.split('#')[0]).not.toContain('abc123')
    expect(way.endsWith('#t=abc123')).toBe(true)
    expect(new URL(way, location.origin).searchParams.get('next')).toBe('/claim?next=%2Fplay')
    history.replaceState(null, '', `/login?step=name&next=${encodeURIComponent('/claim?next=%2Fplay')}&server=${encodeURIComponent(run.http)}#t=abc123`)
    const gone: string[] = []
    render(
      <StatusLive>
        <WelcomePage onNavigate={(u) => gone.push(u)} />
      </StatusLive>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Hoppa över' }))
    await waitFor(() => expect(gone).toEqual(['/claim?next=%2Fplay#t=abc123']))
  })

  it('comes after a login on the card itself, for an account that has not been asked', async () => {
    const gone = at('/login?next=%2Fnew', (g) => <LoginPage onNavigate={(u) => g.push(u)} />)
    fireEvent.change(await screen.findByLabelText('E-post'), { target: { value: 'ada@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Skicka inloggningslänk' }))
    await waitFor(() => expect(gone).toHaveLength(1))
    const url = new URL(gone[0]!, location.origin)
    expect(url.pathname).toBe('/login')
    expect(url.searchParams.get('step')).toBe('name')
    expect(url.searchParams.get('next')).toBe('/new')
    expect(url.searchParams.get('server')).toBe(run.http)
  })
})

describe('the band on Mina spel for an account from before the name', () => {
  it('asks in the band, with the suggestion, and the passkey band waits until it is answered', async () => {
    await loggedIn('nicklas.ockelberg@example.com')
    at('/', (gone) => <HomePage onNavigate={(u) => gone.push(u)} />)
    const band = await screen.findByRole('region', { name: 'Namn' })
    expect(band.textContent).toContain('Vad ska andra kalla dig? Namnet står när du delar ett spel och när du är online i det.')
    // One band at a time: the name comes first.
    expect(screen.queryByRole('region', { name: 'Passkey' })).toBeNull()
    const field = within(band).getByRole('textbox', { name: 'Ditt namn' }) as HTMLInputElement
    expect(field.value).toBe('Nicklas')
    fireEvent.change(field, { target: { value: 'Nicklas O.' } })
    fireEvent.click(within(band).getByRole('button', { name: 'Spara' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Namn' })).toBeNull())
    await waitFor(() => expect(screen.getAllByRole('status').map((s) => s.textContent)).toContain('Namnet är sparat.'))
    expect(await me()).toMatchObject({ name: 'Nicklas O.', asked: true })
    // Answered, and the passkey's offer has its turn.
    expect(await screen.findByRole('region', { name: 'Passkey' })).toBeTruthy()
  })

  it('goes away on «Inte nu» without a name, for good', async () => {
    await loggedIn('ada@example.com')
    at('/', (gone) => <HomePage onNavigate={(u) => gone.push(u)} />)
    fireEvent.click(within(await screen.findByRole('region', { name: 'Namn' })).getByRole('button', { name: 'Inte nu' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Namn' })).toBeNull())
    expect(await me()).toMatchObject({ name: null, asked: true })
    cleanup()
    at('/', (gone) => <HomePage onNavigate={(u) => gone.push(u)} />)
    await screen.findByRole('heading', { name: 'Mina spel' })
    expect(screen.queryByRole('region', { name: 'Namn' })).toBeNull()
  })

  it('is not there for an account that has answered', async () => {
    await loggedIn('ada@example.com')
    await named('Ada')
    at('/', (gone) => <HomePage onNavigate={(u) => gone.push(u)} />)
    await screen.findByRole('heading', { name: 'Mina spel' })
    expect(screen.queryByRole('region', { name: 'Namn' })).toBeNull()
  })
})

describe('«Namn» on the profile', () => {
  const profile = () => at('/profile', (gone) => <ProfilePage onNavigate={(u) => gone.push(u)} />)

  it('stands first, changes the name, and draws the row it makes in Dela', async () => {
    await loggedIn('nicklas.ockelberg@example.com')
    await named('Nicklas')
    profile()
    expect(await screen.findByRole('heading', { level: 1, name: 'Profil' })).toBeTruthy()
    expect(screen.getAllByRole('heading', { level: 2 })[0]?.textContent).toBe('Namn')
    const card = screen.getByRole('region', { name: 'Namn' })
    expect(card.textContent).toContain('Så står du för dem du delar spel med, och för dem som spelar vid dina bord när du tittar på. Din adress visas aldrig vid bordet.')
    const field = within(card).getByLabelText('Ditt namn') as HTMLInputElement
    expect(field.value).toBe('Nicklas')
    expect(card.textContent).toContain('Ändra det när du vill. Det som redan sagts, som en skickad inbjudan, ändras inte.')
    fireEvent.change(field, { target: { value: 'Nicklas Ockelberg' } })
    expect(within(card).getByText('Så här står du i Dela').previousElementSibling?.textContent).toBe('Nicklas Ockelberg')
    fireEvent.click(within(card).getByRole('button', { name: 'Spara namnet' }))
    expect(await within(card).findByText('Namnet är sparat.')).toBeTruthy()
    expect(await me()).toMatchObject({ name: 'Nicklas Ockelberg' })
  })

  it('says what standing without a name means, and clears one', async () => {
    await loggedIn('ada@example.com')
    await named('Ada')
    profile()
    const card = await screen.findByRole('region', { name: 'Namn' })
    const field = within(card).getByLabelText('Ditt namn') as HTMLInputElement
    fireEvent.change(field, { target: { value: '' } })
    expect(field.placeholder).toBe('Ada')
    expect(card.textContent).toContain('Utan namn står du som din adress i Dela och i inbjudningar, och som «spelets ägare» för den som når ditt kontos tak.')
    // Without a name the row is the address, as Dela draws it.
    expect(within(card).getByText('Så här står du i Dela').previousElementSibling?.textContent).toBe('ada@example.com')
    fireEvent.click(within(card).getByRole('button', { name: 'Spara namnet' }))
    await within(card).findByText('Namnet är sparat.')
    expect(await me()).toMatchObject({ name: null, asked: true })
  })

  it('counts the characters near the ceiling of forty', async () => {
    await loggedIn('ada@example.com')
    profile()
    const card = await screen.findByRole('region', { name: 'Namn' })
    const field = within(card).getByLabelText('Ditt namn')
    fireEvent.change(field, { target: { value: 'Maria-Josefina Wallenberg' } })
    expect(card.textContent).not.toMatch(/av 40 tecken/)
    fireEvent.change(field, { target: { value: 'Maria-Josefina Wallenberg af Söderström' } })
    expect(within(card).getByText('39 av 40 tecken')).toBeTruthy()
  })
})

describe('the name where the others read it', () => {
  async function shared(): Promise<void> {
    await loggedIn('nicklas.ockelberg@example.com')
    await named('Nicklas Ockelberg')
    await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: run.projectId, ...projectDoc() }) })
  }

  it('draws the face in the editor’s header with the name’s letter and the whole name on the pointer', async () => {
    await shared()
    at(`/editor?project=${run.projectId}`, () => <EditorPage />)
    const door = await screen.findByRole('button', { name: 'Dela · vilka som har spelet' })
    await waitFor(() => expect(door.querySelector('i')?.getAttribute('title')).toBe('Nicklas Ockelberg'))
    expect(door.querySelector('i')?.textContent).toBe('N')
  })

  it('lists the owner in Dela by her name, with her address under it', async () => {
    await shared()
    at(`/editor?project=${run.projectId}`, () => <EditorPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Dela · vilka som har spelet' }))
    const panel = await screen.findByRole('dialog', { name: 'Vilka som har spelet' })
    const row = (await within(panel).findAllByRole('listitem'))[0]!
    expect(row.querySelector('b')?.textContent).toBe('Nicklas Ockelberg')
    expect([...row.querySelectorAll('small')].map((s) => s.textContent)).toEqual(['nicklas.ockelberg@example.com', expect.stringMatching(/^ägare/)])
  })
})
