// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ClaimPage } from '../src/account/ClaimPage.js'
import { admit, createSession, startServer, type Running } from './fixture.js'

// Claiming a guest session to an account (G1): the link from the phone lands here; without a
// login it is the login card with this page as the way back; with one, the claim is made and
// the start page says so.
let run: Running
beforeEach(async () => {
  run = await startServer({ auth: true, authBypass: true })
})
afterEach(async () => {
  await run.stop()
})

describe('ClaimPage', () => {
  it('asks to log in first, and once logged in claims the session and goes to the start page', async () => {
    const id = await createSession(run)
    const token = await admit(run, id, 'A', 'Ada')
    history.replaceState(null, '', `/claim?token=${token}&server=${encodeURIComponent(run.http)}`)
    const gone: string[] = []
    const { unmount } = render(<ClaimPage onNavigate={(u) => gone.push(u)} />)
    expect(await screen.findByLabelText('E-post')).toBeTruthy()
    expect(screen.getByText(/spara bordet/i)).toBeTruthy()
    unmount()

    await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'bo@example.com' }) })
    render(<ClaimPage onNavigate={(u) => gone.push(u)} />)
    await waitFor(() => expect(gone.at(-1)).toBe(`/?claimed=${id}&server=${encodeURIComponent(run.http)}`))
  })

  // The claim goes back where the guest came from (#690, beslut 2026-10-06): the phone's thanks,
  // which then say it is saved — rather than a start page with no way back to the table.
  it('goes back to the page the link came from once the claim is made, saying it is saved', async () => {
    const id = await createSession(run)
    const token = await admit(run, id, 'A', 'Ada')
    await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'bo@example.com' }) })
    // The token is in the claim's fragment (#1278), and goes back to the phone in its fragment too.
    const play = `/play?session=${id}&seat=A`
    history.replaceState(null, '', `/claim?${new URLSearchParams({ next: play, server: run.http }).toString()}#token=${token}`)
    const gone: string[] = []
    render(<ClaimPage onNavigate={(u) => gone.push(u)} />)
    await waitFor(() => expect(gone.at(-1)).toBe(`${play}&saved=1#token=${token}`))
  })

  // The login card's way back is this very page (#1278). With the token in the fragment, that is
  // the address the page already stands on, and a browser that is sent there does not load it again:
  // the page has to ask who is here itself, and claim.
  it('claims once the card on the page has logged in, without leaving the page', async () => {
    const id = await createSession(run)
    const token = await admit(run, id, 'A', 'Ada')
    const play = `/play?session=${id}&seat=A`
    history.replaceState(null, '', `/claim?${new URLSearchParams({ next: play, server: run.http }).toString()}#token=${token}`)
    const here = location.pathname + location.search + location.hash
    // An account that has answered the welcome step (#1254); a first login is asked its name first.
    await run.auth!.setName((await run.auth!.ensureAccount('bo@example.com')).id, 'Bo')
    const gone: string[] = []
    render(<ClaimPage onNavigate={(u) => gone.push(u)} />)
    fireEvent.change(await screen.findByLabelText('E-post'), { target: { value: 'bo@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Skicka inloggningslänk' }))
    await waitFor(() => expect(gone.at(-1)).toBe(`${play}&saved=1#token=${token}`))
    expect(gone).not.toContain(here)
  })

  // A first login on the claim's card is asked its name first (#1254): the step stands between, with
  // the claim as where it goes on to and the token still in the fragment, never in a query (#1278).
  it('goes by the welcome step on a first login, with the token kept in the fragment', async () => {
    const id = await createSession(run)
    const token = await admit(run, id, 'A', 'Ada')
    const claim = `/claim?${new URLSearchParams({ next: `/play?session=${id}&seat=A`, server: run.http }).toString()}`
    history.replaceState(null, '', `${claim}#token=${token}`)
    const gone: string[] = []
    render(<ClaimPage onNavigate={(u) => gone.push(u)} />)
    fireEvent.change(await screen.findByLabelText('E-post'), { target: { value: 'cy@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Skicka inloggningslänk' }))
    await waitFor(() => expect(gone).toHaveLength(1))
    const [address, fragment] = gone[0]!.split('#')
    expect(fragment).toBe(`token=${token}`)
    expect(address).not.toContain(token)
    const step = new URL(address!, location.origin)
    expect([step.pathname, step.searchParams.get('step'), step.searchParams.get('next')]).toEqual(['/login', 'name', claim])
  })

  // A claim link handed out before #1278 carried the token in its query twice: its own, and the
  // phone's in `next`. It still claims, and goes back to the phone in the new form.
  it('still claims from an old link, and goes back with the token in the fragment', async () => {
    const id = await createSession(run)
    const token = await admit(run, id, 'A', 'Ada')
    await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'bo@example.com' }) })
    const play = `/play?session=${id}&seat=A&name=Ada&token=${token}`
    history.replaceState(null, '', `/claim?${new URLSearchParams({ token, next: play, server: run.http }).toString()}`)
    const gone: string[] = []
    render(<ClaimPage onNavigate={(u) => gone.push(u)} />)
    expect(location.search).not.toContain(token)
    await waitFor(() => expect(gone.at(-1)).toBe(`/play?session=${id}&seat=A&saved=1#token=${token}`))
  })

  it('never goes back to another site', async () => {
    const id = await createSession(run)
    const token = await admit(run, id, 'A', 'Ada')
    await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'bo@example.com' }) })
    history.replaceState(null, '', `/claim?${new URLSearchParams({ token, next: '//evil.invalid/x', server: run.http }).toString()}`)
    const gone: string[] = []
    render(<ClaimPage onNavigate={(u) => gone.push(u)} />)
    await waitFor(() => expect(gone.at(-1)).toBe(`/?claimed=${id}&server=${encodeURIComponent(run.http)}`))
  })

  // Every state the page can stand in is one of the status family's (D5, #475): the waits, the
  // missing link and the refusals were bare lines on a white page, and the errors had nothing to
  // press and left the focus on <body>.
  it('says when the token is not one in the status family, with the focus on its heading and a way to the games', async () => {
    await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'bo@example.com' }) })
    history.replaceState(null, '', `/claim?token=nope&server=${encodeURIComponent(run.http)}`)
    render(<ClaimPage onNavigate={() => undefined} />)
    await waitFor(() => expect(document.querySelector('[data-status-notice="missing"]')?.textContent).toMatch(/gäller inte/))
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }))
    expect(screen.getByRole('link', { name: 'Mina spel' }).getAttribute('href')).toBe(`/?server=${encodeURIComponent(run.http)}`)
  })

  it('says a link without a token is not one, with a way to the start page for whoever is reading', async () => {
    history.replaceState(null, '', '/claim')
    render(<ClaimPage onNavigate={() => undefined} />)
    expect(document.querySelector('[data-status-notice="missing"]')).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }))
    expect(screen.getByRole('link', { name: 'Till startsidan' }).getAttribute('href')).toBe('/')
  })

  it('waits in the status family rather than on a bare line', () => {
    history.replaceState(null, '', `/claim?token=nope&server=${encodeURIComponent(run.http)}`)
    render(<ClaimPage onNavigate={() => undefined} />)
    expect(document.querySelector('[data-status-notice="loading"]')).toBeTruthy()
  })
})
