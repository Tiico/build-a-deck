// @vitest-environment jsdom
// Betans minsta förtroendeyta (#757, beställarens beslut, prototyp A): en tyst rad sist i
// inloggningskortet och sist på Mina spel med «Kontakt» och versionen ur `/health`, och en mening
// där en gäst ansluter eller sparar om vad som lagras. Kontakten är lådans inställning
// (`BYD_CONTACT`); utan den står bara versionen, och utan svar från `/health` ingenting.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { LoginCard } from '../src/account/LoginCard.js'
import { Survey } from '../src/player/Survey.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

const health = (body: unknown, ok = true) =>
  vi.stubGlobal('fetch', vi.fn(async (url: string) => (String(url).endsWith('/health') ? new Response(JSON.stringify(body), { status: ok ? 200 : 503 }) : new Response('{}', { status: 404 }))))

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

const card = () => render(<LoginCard http="http://server.local" next="/" onNavigate={() => undefined} />)

describe('the foot of the login card (#757)', () => {
  it('says the contact and the version last in the card', async () => {
    health({ ok: true, release: 'v0.9.3', contact: 'beta@example.com', tables: 0 })
    card()
    const foot = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-about]')
      if (!el) throw new Error('no foot yet')
      return el
    })
    expect(foot.textContent).toBe('Kontakt · build-your-deck v0.9.3')
    expect(screen.getByRole('link', { name: 'Kontakt' }).getAttribute('href')).toBe('mailto:beta@example.com')
    expect(document.querySelector('.byd-login')!.lastElementChild).toBe(foot)
  })

  it('leaves «Kontakt» out when the box was given no contact', async () => {
    health({ ok: true, release: 'v0.9.3', tables: 0 })
    card()
    await waitFor(() => expect(document.querySelector('[data-about]')?.textContent).toBe('build-your-deck v0.9.3'))
    expect(screen.queryByRole('link', { name: 'Kontakt' })).toBeNull()
  })

  it('takes a contact that is an address on the web as it is', async () => {
    health({ ok: true, release: 'v0.9.3', contact: 'https://example.com/beta', tables: 0 })
    card()
    expect((await screen.findByRole('link', { name: 'Kontakt' })).getAttribute('href')).toBe('https://example.com/beta')
  })

  it('says nothing when the server says neither', async () => {
    health({ ok: true, tables: 0 })
    card()
    await new Promise((r) => setTimeout(r, 50))
    expect(document.querySelector('[data-about]')).toBeNull()
  })
})

describe('what a guest leaves behind, said where she saves (#757)', () => {
  it('says what is kept, tied to the table and not to her, beside «Spara till ditt konto»', () => {
    render(<Survey who="Ada" version="rev-1" saveUrl="/save" onSubmit={async () => undefined} />)
    expect(screen.getAllByText('Vi sparar ditt namn, platsens drag och dina enkätsvar — knutna till bordet, inte till dig.').length).toBeGreaterThan(0)
  })
})
