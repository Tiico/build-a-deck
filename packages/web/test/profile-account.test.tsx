// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ProfilePage } from '../src/account/ProfilePage.js'
import { ownersWord } from '../src/account/AccountCard.js'
import { StatusLive } from '../src/status/StatusLive.js'
import { Language } from '../src/i18n/index.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'

// The Konto card's two rights (#1280, beställarens beslut A): «Ladda ner mina uppgifter» hands the
// extract over as a file straight away, and «Radera kontot…» asks L9's one question in a strip where
// it was asked, naming every game that goes, before the account is gone. Against the real server.
let run: Running
let saved: { name: string; size: number }[]
beforeEach(async () => {
  run = await startServer({ auth: true, authBypass: true, ai: true })
  saved = []
  // jsdom has no object URLs and saves nothing; the anchor's click is where a browser saves.
  URL.createObjectURL = vi.fn(() => 'blob:extract')
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    saved.push({ name: this.download, size: 0 })
  })
})
afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  await run.stop()
})

const json = { 'content-type': 'application/json' }
async function loggedIn(email = 'nicklas@example.com'): Promise<void> {
  await fetch(`${run.http}/auth/login`, { method: 'POST', headers: json, body: JSON.stringify({ email }) })
}
function open(lang: 'sv' | 'en' = 'sv') {
  history.replaceState(null, '', `/profile?server=${encodeURIComponent(run.http)}`)
  render(
    <Language lang={lang}>
      <StatusLive>
        <ProfilePage onNavigate={() => undefined} />
      </StatusLive>
    </Language>,
  )
}
const account = () => screen.getByRole('region', { name: 'Konto' })

describe('the account and its two rights, in the Konto card (#1280)', () => {
  it('stands under the address and the way out: the extract, then the deletion, each under its own heading', async () => {
    await loggedIn()
    open()
    await screen.findByRole('heading', { level: 1, name: 'Profil' })
    expect(within(account()).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Dina uppgifter', 'Radera kontot'])
    expect(within(account()).getByText(/^En fil med det Deckster har om dig/)).toBeTruthy()
    expect(within(account()).getByText('Kontot och dina spel försvinner direkt. Du får ett mejl som bekräftar det.')).toBeTruthy()
    expect(within(account()).getAllByRole('button').map((b) => b.textContent)).toEqual(['Logga ut', 'Ladda ner mina uppgifter', 'Radera kontot…'])
  })

  it('downloads the extract as a file at once, and says which file it was', async () => {
    await loggedIn()
    open()
    fireEvent.click(await screen.findByRole('button', { name: 'Ladda ner mina uppgifter' }))
    const done = await within(account()).findByRole('status')
    expect(done.textContent).toMatch(/^deckster-uppgifter-\d{4}-\d{2}-\d{2}\.zip är nedladdad\. Den innehåller det som står ovan, och en LASMIG\.md som förklarar filen\.$/)
    expect(saved.map((s) => s.name)).toEqual([done.querySelector('b')!.textContent])
  })

  it('asks first, naming every game, who else loses it and what ends, on the answer that keeps the account', async () => {
    await loggedIn('kim@example.com')
    await fetch(`${run.http}/auth/logout`, { method: 'POST' })
    await loggedIn()
    await fetch(`${run.http}/projects`, { method: 'POST', headers: json, body: JSON.stringify({ id: 'star', ...projectDoc(), name: 'Stjärnhandel' }) })
    await fetch(`${run.http}/projects`, { method: 'POST', headers: json, body: JSON.stringify({ id: 'forest', ...projectDoc(), name: 'Skogens råd' }) })
    await fetch(`${run.http}/projects/forest/invites`, { method: 'POST', headers: json, body: JSON.stringify({ email: 'kim@example.com', role: 'editor' }) })
    const link = /\/invites\/([A-Za-z0-9_-]+)/.exec(run.mail.sent.at(-1)?.text ?? '')?.[1] ?? ''
    await fetch(`${run.http}/auth/logout`, { method: 'POST' })
    await loggedIn('kim@example.com')
    expect((await fetch(`${run.http}/invites/${link}`, { method: 'POST' })).status).toBe(200)
    await fetch(`${run.http}/auth/logout`, { method: 'POST' })
    await loggedIn()
    // A table started at Stjärnhandel and never played (#1376): it is not «playing», and is said by
    // the name the Bord tab files it under.
    expect((await fetch(`${run.http}/projects/star/sessions`, { method: 'POST' })).status).toBeLessThan(300)
    open()
    const opener = await screen.findByRole('button', { name: 'Radera kontot…' })
    fireEvent.click(opener)
    const strip = await screen.findByRole('alertdialog', { name: 'Radera kontot? Det går inte att ångra.' })
    expect(within(strip).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Stjärnhandel och Skogens råd tas bort med alla versioner och bord, som när du tar bort dem ett och ett.',
      'kim@example.com förlorar Skogens råd. Vill hen ha det kvar, exportera det först och ge hen zippen.',
      'Startade, aldrig spelade i Stjärnhandel: 1 bord, som avslutas.',
      'Du loggas ut överallt.',
    ])
    expect([...strip.querySelectorAll('li b')].map((b) => b.textContent)).toEqual(['Stjärnhandel', 'Skogens råd'])
    await waitFor(() => expect(document.activeElement?.textContent).toBe('Avbryt'))
    fireEvent.keyDown(strip, { key: 'Escape' })
    expect(screen.queryByRole('alertdialog')).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Radera kontot…' })))
    expect((await (await fetch(`${run.http}/auth/me`)).json()) as { email: string | null }).toMatchObject({ email: 'nicklas@example.com' })
  })

  it('deletes the account on yes, and lands at the door told so, with the address the letter went to', async () => {
    await loggedIn()
    open()
    fireEvent.click(await screen.findByRole('button', { name: 'Radera kontot…' }))
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Ja, radera kontot' }))
    await screen.findByLabelText('E-post')
    const told = document.querySelector('.byd-login-done')
    expect(told?.textContent).toBe('Ditt konto är raderat. Du är utloggad på alla enheter, och ett mejl till nicklas@example.com bekräftar det.')
    expect(screen.getByLabelText('E-post')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Profil' })).toBeNull()
    expect((await (await fetch(`${run.http}/auth/me`)).json()) as { email: string | null }).toMatchObject({ email: null })
    expect(run.mail.sent.at(-1)).toMatchObject({ to: 'nicklas@example.com', subject: 'Ditt konto hos Deckster är raderat' })
  })

  it('speaks English when the reader does, and the games keep their own names', async () => {
    await loggedIn()
    await fetch(`${run.http}/projects`, { method: 'POST', headers: json, body: JSON.stringify({ id: 'star', ...projectDoc(), name: 'Stjärnhandel' }) })
    open('en')
    fireEvent.click(await screen.findByRole('button', { name: 'Delete the account…' }))
    const strip = await screen.findByRole('alertdialog', { name: 'Delete the account? It cannot be undone.' })
    expect(within(strip).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Stjärnhandel is deleted with every version and table, as when you delete a game in My games.', 'You are logged out everywhere.'])
  })

  it('says whose a game is the way each language does', () => {
    expect(['Sara', 'Lars', 'Max', 'Inez'].map((n) => ownersWord(n, 'sv'))).toEqual(['Saras', 'Lars', 'Max', 'Inez'])
    expect(ownersWord('Sara', 'en')).toBe('Sara’s')
  })
})
