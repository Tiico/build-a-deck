// @vitest-environment jsdom
// Betans minsta förtroendeyta (#757, beställarens beslut, prototyp A): en tyst rad sist i
// inloggningskortet och sist på Mina spel med «Kontakt» och versionen ur `/health`, och en mening
// där en gäst ansluter eller sparar om vad som lagras. Kontakten är lådans inställning
// (`BYD_CONTACT`); utan den står bara versionen, och utan svar från `/health` ingenting av dem.
// «Villkor · Integritet» står först på raden sedan #1272, och alltid: sidan är appens egen.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { LoginCard } from '../src/account/LoginCard.js'
import { Survey } from '../src/player/Survey.js'

const health = (body: unknown, ok = true) =>
  vi.stubGlobal('fetch', vi.fn(async (url: string) => (String(url).endsWith('/health') ? new Response(JSON.stringify(body), { status: ok ? 200 : 503 }) : new Response('{}', { status: 404 }))))

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
  sessionStorage.clear()
})

const card = () => render(<LoginCard http="http://server.local" next="/" onNavigate={() => undefined} />)

describe('the foot of the login card (#757)', () => {
  it('says the terms, the contact and the version last in the card', async () => {
    health({ ok: true, release: 'v0.9.3', contact: 'beta@example.com', tables: 0 })
    card()
    const foot = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-about]')
      if (!el) throw new Error('no foot yet')
      return el
    })
    await waitFor(() => expect(foot.textContent).toBe('Villkor · Integritet · Anmäl · Kontakt · Deckster v0.9.3'))
    expect(screen.getByRole('link', { name: 'Villkor' }).getAttribute('href')).toBe('/villkor')
    expect(screen.getByRole('link', { name: 'Integritet' }).getAttribute('href')).toBe('/villkor#integritet')
    // A report of a picture (#1274) has a page of its own.
    expect(screen.getByRole('link', { name: 'Anmäl' }).getAttribute('href')).toBe('/villkor/anmal')
    expect(screen.getByRole('link', { name: 'Kontakt' }).getAttribute('href')).toBe('mailto:beta@example.com')
    expect(document.querySelector('.byd-login')!.lastElementChild).toBe(foot)
  })

  it('leaves «Kontakt» out when the box was given no contact', async () => {
    health({ ok: true, release: 'v0.9.3', tables: 0 })
    card()
    await waitFor(() => expect(document.querySelector('[data-about]')?.textContent).toBe('Villkor · Integritet · Anmäl · Deckster v0.9.3'))
    expect(screen.queryByRole('link', { name: 'Kontakt' })).toBeNull()
  })

  it('takes a contact that is an address on the web as it is', async () => {
    health({ ok: true, release: 'v0.9.3', contact: 'https://example.com/beta', tables: 0 })
    card()
    expect((await screen.findByRole('link', { name: 'Kontakt' })).getAttribute('href')).toBe('https://example.com/beta')
  })

  it('says only the terms when the server says neither', async () => {
    health({ ok: true, tables: 0 })
    card()
    await new Promise((r) => setTimeout(r, 50))
    expect(document.querySelector('[data-about]')?.textContent).toBe('Villkor · Integritet · Anmäl')
  })
})

describe('what a guest leaves behind, said where she saves (#757, #1281)', () => {
  // Saving is offered once the answers are sent (#690), so the sentence stands there, and goes with
  // the offer once the answers are saved. What it says is what saving changes (G6): the account's
  // time instead of a year.
  const KEPT = 'Sparar du bordet till ett konto står ditt namn och dina svar kvar så länge kontot finns, i stället för ett år.'
  it('says what saving keeps and for how long, beside «Spara till ditt konto»', () => {
    sessionStorage.setItem('byd.survey.sent.t1', '1')
    render(<Survey who="Ada" version="rev-1" saveUrl="/save" remember="t1" onSubmit={async () => undefined} />)
    expect(screen.getByRole('link', { name: 'Spara till ditt konto' })).toBeTruthy()
    expect(screen.getByText(KEPT)).toBeTruthy()
    // The row's first two beside it (#1272), to the page of their own.
    expect(screen.getByRole('link', { name: 'Villkor' }).getAttribute('href')).toBe('/villkor')
    expect(screen.getByRole('link', { name: 'Integritet' }).getAttribute('href')).toBe('/villkor#integritet')
    // A report of a picture (#1274) has a page of its own.
    expect(screen.getByRole('link', { name: 'Anmäl' }).getAttribute('href')).toBe('/villkor/anmal')
  })

  it('says nothing more once the answers are saved', () => {
    render(<Survey who="Ada" version="rev-1" saveUrl="/save" saved onSubmit={async () => undefined} />)
    expect(screen.queryByText(KEPT)).toBeNull()
  })
})
