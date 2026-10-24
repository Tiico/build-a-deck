// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ProfilePage } from '../src/account/ProfilePage.js'
import { HomePage } from '../src/account/HomePage.js'
import { StatusLive } from '../src/status/StatusLive.js'
import { Language } from '../src/i18n/index.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'

// The profile page (#999, #998 variant A): one column — the AI key, the language, the account — and
// the key box in every state the prototype drew, wired to the real server and a fake provider.
const KEY = 'sk-ant-api03-good-NotARealKey-0123456789abcdefx7Qd'
let run: Running
beforeEach(async () => {
  run = await startServer({ auth: true, authBypass: true, ai: true })
})
afterEach(async () => {
  await run.stop()
})

async function loggedIn(email = 'ada@example.com'): Promise<void> {
  await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
}

function open(query = ''): string[] {
  history.replaceState(null, '', `/profile?server=${encodeURIComponent(run.http)}${query}`)
  const gone: string[] = []
  render(
    <StatusLive>
      <ProfilePage onNavigate={(url) => gone.push(url)} />
    </StatusLive>,
  )
  return gone
}

const keyBox = () => screen.getByRole('region', { name: /AI-nyckel/ })
const paste = (key: string) => fireEvent.change(screen.getByLabelText('API-nyckel'), { target: { value: key } })
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Spara och testa' }))

describe('the profile page', () => {
  it('asks a reader who is not logged in to log in, and comes back here after', async () => {
    open()
    expect(await screen.findByLabelText('E-post')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Profil' })).toBeNull()
  })

  it('stands in one column: the name (#1254), the key, the language and the account, under the way back to Mina spel', async () => {
    await loggedIn()
    open()
    expect(await screen.findByRole('heading', { level: 1, name: 'Profil' })).toBeTruthy()
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings).toEqual(['Namn', 'AI-nyckel', 'Språk', 'Konto'])
    const back = screen.getByRole('link', { name: /Mina spel/ })
    expect(back.getAttribute('href')).toBe(`/?server=${encodeURIComponent(run.http)}`)
    expect(screen.getByRole('combobox', { name: /^Verktygets språk — Språk \/ Language$/ }).tagName).toBe('SELECT')
    expect(within(screen.getByRole('region', { name: 'Konto' })).getByText('ada@example.com')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Logga ut' })).toBeTruthy()
  })

  it('links to the chosen provider’s own page for making a key, in a new tab, and follows the choice', async () => {
    await loggedIn()
    open()
    await screen.findByRole('heading', { level: 1, name: 'Profil' })
    const link = () => within(keyBox()).getByRole('link', { name: /Skapa en/ })
    expect(link().getAttribute('href')).toBe('https://platform.claude.com/settings/keys')
    expect(link().getAttribute('target')).toBe('_blank')
    expect(link().getAttribute('rel')).toContain('noreferrer')
    expect(link().textContent).toMatch(/Anthropic/)
    expect(link().textContent).toMatch(/öppnas i en ny flik/)
    fireEvent.click(screen.getByRole('radio', { name: 'OpenAI' }))
    expect(link().getAttribute('href')).toBe('https://platform.openai.com/api-keys')
    expect(link().textContent).toMatch(/OpenAI/)
    // The plain words about what is sent where follow the choice too.
    expect(within(keyBox()).getByText(/skickas spelets innehåll/).textContent).toMatch(/till OpenAI/)
  })

  it('asks for a key before it asks the provider', async () => {
    await loggedIn()
    open()
    await screen.findByRole('heading', { level: 1, name: 'Profil' })
    save()
    expect(await screen.findByText('Klistra in en nyckel först')).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByLabelText('API-nyckel'))
    expect(run.ai!.fake.calls).toHaveLength(0)
  })

  it('says why the provider said no, keeps nothing and keeps the key in the field to correct', async () => {
    await loggedIn()
    open()
    await screen.findByRole('heading', { level: 1, name: 'Profil' })
    paste('sk-ant-bad-0000000000')
    save()
    const alert = await within(keyBox()).findByRole('alert')
    expect(alert.textContent).toContain('Anthropic godtog inte nyckeln')
    expect(alert.textContent).toContain('Inget sparades.')
    expect(screen.getByLabelText('API-nyckel').getAttribute('aria-invalid')).toBe('true')
    expect((screen.getByLabelText('API-nyckel') as HTMLInputElement).value).toBe('sk-ant-bad-0000000000')
    expect(screen.getByRole('button', { name: 'Spara och testa' })).toBeTruthy()
  })

  it.each([
    ['sk-ant-broke-000000000', 'Kontot hos Anthropic saknar kredit'],
    ['sk-ant-busy-0000000000', 'Anthropic tar inte emot fler anrop just nu'],
    ['sk-ant-swamped-0000000', 'Anthropic är överbelastad just nu'],
    ['sk-ant-hangup-00000000', 'Ingen kontakt med Anthropic'],
    ['sk ant has spaces', 'Det där ser inte ut som en nyckel'],
  ])('says %s in its own words', async (key, title) => {
    await loggedIn()
    open()
    await screen.findByRole('heading', { level: 1, name: 'Profil' })
    paste(key)
    save()
    expect((await within(keyBox()).findByRole('alert')).textContent).toContain(title)
  })

  it('proves the key, then shows it by its provider and last four, with the standard model chosen', async () => {
    await loggedIn()
    open()
    await screen.findByRole('heading', { level: 1, name: 'Profil' })
    paste(KEY)
    save()
    expect(screen.getByRole('button', { name: 'Testar nyckeln…' }).getAttribute('aria-busy')).toBe('true')
    const saved = await within(keyBox()).findByText(/nyckeln som slutar på/)
    expect(saved.textContent).toMatch(/^Anthropic · nyckeln som slutar på …x7Qd · testad i dag \d\d:\d\d$/)
    expect(document.body.textContent).not.toContain(KEY.slice(0, 20))
    const model = (await screen.findByLabelText('Modell')) as HTMLSelectElement
    await waitFor(() => expect(model.options.length).toBe(3))
    expect([...model.options].map((o) => o.textContent)).toEqual(['Claude Sonnet 5.5 (standard)', 'Claude Opus 5.5', 'Claude Haiku 4.5'])
    expect(model.value).toBe('')
    expect(screen.queryByLabelText('API-nyckel')).toBeNull()
    expect(screen.getByRole('button', { name: 'Byt nyckel' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ta bort' })).toBeTruthy()
    // Nothing filled is left on the page once the key is saved and there is nowhere to go back to.
    expect(document.querySelectorAll('.byd-primary')).toHaveLength(0)
  })

  it('keeps a chosen model, and describes a key saved before without asking for it again', async () => {
    await loggedIn()
    open()
    await screen.findByRole('heading', { level: 1, name: 'Profil' })
    paste(KEY)
    save()
    const model = (await screen.findByLabelText('Modell')) as HTMLSelectElement
    await waitFor(() => expect(model.options.length).toBe(3))
    fireEvent.change(model, { target: { value: 'claude-opus-5-5' } })
    await waitFor(async () => expect((await (await fetch(`${run.http}/me/ai-key`, { credentials: 'include' })).json()).key.model).toBe('claude-opus-5-5'))

    // Opened again: the key is described, never asked for, and its models are fetched anew.
    cleanup()
    open()
    expect((await within(await screen.findByRole('region', { name: /AI-nyckel/ })).findByText(/nyckeln som slutar på/)).textContent).toContain('…x7Qd')
    expect(screen.queryByLabelText('API-nyckel')).toBeNull()
    const again = (await screen.findByLabelText('Modell')) as HTMLSelectElement
    await waitFor(() => expect(again.options.length).toBe(3))
    expect(again.value).toBe('claude-opus-5-5')
  })

  it('changes the key, and goes back to the saved one on Avbryt', async () => {
    await loggedIn()
    open()
    await screen.findByRole('heading', { level: 1, name: 'Profil' })
    paste(KEY)
    save()
    fireEvent.click(await screen.findByRole('button', { name: 'Byt nyckel' }))
    expect(screen.getByRole('heading', { level: 2, name: 'Byt AI-nyckel' })).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByLabelText('API-nyckel'))
    fireEvent.click(screen.getByRole('button', { name: 'Avbryt' }))
    expect(await within(keyBox()).findByText(/…x7Qd/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Byt nyckel' }))
    fireEvent.click(screen.getByRole('radio', { name: 'OpenAI' }))
    paste('sk-proj-good-another-WxYz')
    save()
    expect((await within(keyBox()).findByText(/nyckeln som slutar på/)).textContent).toMatch(/^OpenAI · nyckeln som slutar på …WxYz/)
  })

  it('asks before it removes the key, opens the question on the answer that keeps it, and forgets it on yes', async () => {
    await loggedIn()
    open()
    await screen.findByRole('heading', { level: 1, name: 'Profil' })
    paste(KEY)
    save()
    fireEvent.click(await screen.findByRole('button', { name: 'Ta bort' }))
    const question = screen.getByRole('alertdialog', { name: /Ta bort nyckeln\?/ })
    expect(document.activeElement).toBe(within(question).getByRole('button', { name: 'Avbryt' }))
    fireEvent.click(within(question).getByRole('button', { name: 'Avbryt' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(within(keyBox()).getByText(/…x7Qd/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Ta bort' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Ja, ta bort' }))
    expect(await screen.findByLabelText('API-nyckel')).toBeTruthy()
    expect((await (await fetch(`${run.http}/me/ai-key`, { credentials: 'include' })).json()).key).toBeNull()
  })

  it('takes the game along from the editor: the way back names it, and is the one filled button once the key is saved', async () => {
    await loggedIn()
    await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: run.projectId, ...projectDoc() }) })
    const gone = open(`&from=${run.projectId}`)
    const back = await screen.findByRole('link', { name: /Tillbaka till Skogens herrar/ })
    expect(back.getAttribute('href')).toBe(`/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
    paste(KEY)
    save()
    const done = await screen.findByText('AI-hjälpen är på i editorn.')
    const filled = [...document.querySelectorAll('.byd-primary')]
    expect(filled).toHaveLength(1)
    expect(filled[0]!.textContent).toBe('Tillbaka till Skogens herrar')
    expect(done.closest('[role="status"]')).toBeTruthy()
    fireEvent.click(filled[0]!)
    expect(gone.at(-1)).toBe(`/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  })

  it('speaks English when the reader does, and the game’s name is never translated', async () => {
    await loggedIn()
    history.replaceState(null, '', `/profile?server=${encodeURIComponent(run.http)}`)
    render(
      <Language lang="en">
        <StatusLive>
          <ProfilePage />
        </StatusLive>
      </Language>,
    )
    expect(await screen.findByRole('heading', { level: 1, name: 'Profile' })).toBeTruthy()
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['AI key', 'Language', 'Account'])
    expect(screen.getByRole('button', { name: 'Save and test' })).toBeTruthy()
  })
})

describe('the way in from Mina spel', () => {
  it('is a word in the account line, «e-post · Profil · logga ut», and the language is no longer there', async () => {
    await loggedIn()
    history.replaceState(null, '', `/?server=${encodeURIComponent(run.http)}`)
    const gone: string[] = []
    render(
      <StatusLive>
        <HomePage onNavigate={(url) => gone.push(url)} />
      </StatusLive>,
    )
    await screen.findByText('Mina spel')
    const line = document.querySelector('.byd-who')!
    expect([...line.children].map((part) => part.textContent)).toEqual(['ada@example.com', 'Profil', 'Logga ut'])
    expect(within(line as HTMLElement).queryByRole('combobox')).toBeNull()
    const profile = within(line as HTMLElement).getByRole('link', { name: 'Profil' })
    expect(profile.getAttribute('href')).toBe(`/profile?server=${encodeURIComponent(run.http)}`)
    fireEvent.click(profile)
    expect(gone.at(-1)).toBe(`/profile?server=${encodeURIComponent(run.http)}`)
  })
})
