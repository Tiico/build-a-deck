// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { HomePage } from '../src/account/HomePage.js'
import { LoginPage } from '../src/account/LoginPage.js'
import { ProfilePage } from '../src/account/ProfilePage.js'
import { KeychainContext, type Keychain } from '../src/account/passkey.js'
import { StatusLive } from '../src/status/StatusLive.js'
import { SoftPasskey } from '../../../test-support/soft-passkey.js'
import { startServer, type Running } from './fixture.js'

// Passkeys (#1180, beslut: variant A, plus the suggestion in the field): the band on Mina spel after
// the link, «Logga in med passkey» on the login card, and the passkeys on the profile — against the
// real server, with a software keychain where the browser's own would be, on jsdom's page.
let run: Running
beforeEach(async () => {
  localStorage.clear()
  run = await startServer({ auth: true, authBypass: true, ai: true, appOrigin: location.origin })
})
afterEach(async () => {
  cleanup()
  await run.stop()
})

const loggedIn = (email = 'ada@example.com') => fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
const loggedOut = () => fetch(`${run.http}/auth/logout`, { method: 'POST' })

// The browser's keychain, as the pages ask it: one that can keep a passkey of its own, unless told.
function keychainOf(soft: SoftPasskey, { platform = true, autofill = false }: { platform?: boolean; autofill?: boolean } = {}): Keychain {
  return {
    supported: () => true,
    platform: async () => platform,
    autofill: async () => autofill,
    create: async (options) => soft.create(options as Parameters<SoftPasskey['create']>[0]),
    get: async (options) => soft.get(options as Parameters<SoftPasskey['get']>[0]),
  }
}

function at(path: string, page: ReactNode, keychain: Keychain): string[] {
  history.replaceState(null, '', `${path}${path.includes('?') ? '&' : '?'}server=${encodeURIComponent(run.http)}`)
  const gone: string[] = []
  render(
    <KeychainContext.Provider value={keychain}>
      <StatusLive>{page}</StatusLive>
    </KeychainContext.Provider>,
  )
  return gone
}
const home = (keychain: Keychain, gone: string[] = []) => at('/', <HomePage onNavigate={(u) => gone.push(u)} />, keychain)
const passkeys = () => fetch(`${run.http}/auth/passkeys`).then((r) => r.json() as Promise<{ passkeys: unknown[] }>)

describe('the offer on Mina spel', () => {
  it('saves a passkey in this browser, says so, and is not made again here', async () => {
    await loggedIn()
    home(keychainOf(new SoftPasskey(location.origin)))
    const band = await screen.findByRole('region', { name: 'Passkey' })
    expect(band.textContent).toContain('Logga in utan mejl nästa gång.')
    fireEvent.click(within(band).getByRole('button', { name: 'Spara passkey' }))

    expect(await within(screen.getByRole('main')).findByText(/Passkeyn är sparad/)).toBeTruthy()
    // Said once, in the page's live region.
    await waitFor(() => expect(screen.getAllByRole('status').map((s) => s.textContent)).toContain('Passkeyn är sparad, och nästa gång loggar du in med den. Du ser den under Profil.'))
    expect((await passkeys()).passkeys).toHaveLength(1)

    cleanup()
    home(keychainOf(new SoftPasskey(location.origin)))
    await screen.findByRole('heading', { name: 'Mina spel' })
    expect(screen.queryByRole('region', { name: 'Passkey' })).toBeNull()
  })

  it('goes away on «Inte nu», and stays away in this browser', async () => {
    await loggedIn()
    home(keychainOf(new SoftPasskey(location.origin)))
    fireEvent.click(within(await screen.findByRole('region', { name: 'Passkey' })).getByRole('button', { name: 'Inte nu' }))
    expect(screen.queryByRole('region', { name: 'Passkey' })).toBeNull()
    expect((await passkeys()).passkeys).toHaveLength(0)

    cleanup()
    home(keychainOf(new SoftPasskey(location.origin)))
    await screen.findByRole('heading', { name: 'Mina spel' })
    expect(screen.queryByRole('region', { name: 'Passkey' })).toBeNull()
  })

  it('is not made in a browser with no keychain of its own', async () => {
    await loggedIn()
    home(keychainOf(new SoftPasskey(location.origin), { platform: false }))
    await screen.findByRole('heading', { name: 'Mina spel' })
    // The answer about the keychain lands after the heading; give it the time it takes.
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByRole('region', { name: 'Passkey' })).toBeNull()
  })
})

describe('«Logga in med passkey» on the login card', () => {
  async function savedThenLoggedOut(soft: SoftPasskey): Promise<void> {
    await loggedIn()
    home(keychainOf(soft))
    fireEvent.click(within(await screen.findByRole('region', { name: 'Passkey' })).getByRole('button', { name: 'Spara passkey' }))
    await within(screen.getByRole('main')).findByText(/Passkeyn är sparad/)
    cleanup()
    await loggedOut()
  }

  it('logs in without a mail and goes on to where the reader was going', async () => {
    const soft = new SoftPasskey(location.origin)
    await savedThenLoggedOut(soft)
    const gone: string[] = []
    at(`/login?next=${encodeURIComponent('/new')}`, <LoginPage onNavigate={(u) => gone.push(u)} />, keychainOf(soft))
    const field = await screen.findByLabelText('E-post')
    // The browser may suggest the passkey in the address field too (B's part of the decision).
    expect(field.getAttribute('autocomplete')).toBe('email webauthn')
    fireEvent.click(screen.getByRole('button', { name: 'Logga in med passkey' }))
    await waitFor(() => expect(gone).toEqual(['/new']))
    expect(await (await fetch(`${run.http}/auth/me`)).json()).toEqual({ email: 'ada@example.com', terms: { current: null, accepted: null, due: false } })
  })

  it('sends the reader to the mail when the passkey is not known here any more', async () => {
    const soft = new SoftPasskey(location.origin)
    await savedThenLoggedOut(soft)
    // Taken away on the profile, from another browser.
    await loggedIn()
    const { id } = ((await passkeys()).passkeys as { id: string }[])[0]!
    await fetch(`${run.http}/auth/passkeys/${id}`, { method: 'DELETE' })
    await loggedOut()

    const gone: string[] = []
    at('/login', <LoginPage onNavigate={(u) => gone.push(u)} />, keychainOf(soft))
    fireEvent.click(await screen.findByRole('button', { name: 'Logga in med passkey' }))
    const said = await screen.findByText('Den passkeyn känns inte igen här. Logga in med e\u2011post.')
    expect(said.getAttribute('role')).toBe('alert')
    // The button it is about points at it.
    expect(screen.getByRole('button', { name: 'Logga in med passkey' }).getAttribute('aria-describedby')).toBe(said.id)
    expect(gone).toEqual([])
  })

  it('logs in with the passkey the browser suggests in the address field, without a press', async () => {
    const soft = new SoftPasskey(location.origin)
    await savedThenLoggedOut(soft)
    const gone: string[] = []
    at('/login', <LoginPage onNavigate={(u) => gone.push(u)} />, keychainOf(soft, { autofill: true }))
    await waitFor(() => expect(gone).toEqual(['/']))
  })

  it('is not on the card in a browser that cannot make a passkey', async () => {
    const none: Keychain = { ...keychainOf(new SoftPasskey(location.origin)), supported: () => false }
    at('/login', <LoginPage onNavigate={() => undefined} />, none)
    await screen.findByLabelText('E-post')
    expect(screen.queryByRole('button', { name: 'Logga in med passkey' })).toBeNull()
    expect(screen.queryByText('eller')).toBeNull()
  })
})

describe('the passkeys on the profile', () => {
  const profile = (keychain: Keychain) => at('/profile', <ProfilePage onNavigate={() => undefined} />, keychain)

  it('lists them by keychain, marks the one in this browser, and takes one away after asking', async () => {
    await loggedIn()
    profile(keychainOf(new SoftPasskey(location.origin)))
    const box = await screen.findByRole('region', { name: 'Passkeys' })
    expect(box.textContent).toContain('Inga passkeys än.')
    fireEvent.click(within(box).getByRole('button', { name: 'Spara passkey i den här webbläsaren' }))

    const row = await within(box).findByRole('listitem')
    expect(row.textContent).toContain('iCloud-nyckelring')
    expect(row.textContent).toContain('Den här webbläsaren')
    expect(within(box).queryByRole('button', { name: 'Spara passkey i den här webbläsaren' })).toBeNull()

    fireEvent.click(within(row).getByRole('button', { name: 'Ta bort iCloud-nyckelring' }))
    fireEvent.click(await within(box).findByRole('button', { name: 'Ja, ta bort' }))
    await waitFor(() => expect(within(box).queryByRole('listitem')).toBeNull())
    expect((await passkeys()).passkeys).toHaveLength(0)
    // This browser has none now, and may save one again.
    expect(within(box).getByRole('button', { name: 'Spara passkey i den här webbläsaren' })).toBeTruthy()
  })

  it('says the mail is always the way in', async () => {
    await loggedIn()
    profile(keychainOf(new SoftPasskey(location.origin)))
    const account = await screen.findByRole('region', { name: 'Konto' })
    expect(account.textContent).toContain('Du loggar alltid in med länken i mejlet, också om du tappar en passkey.')
  })
})
