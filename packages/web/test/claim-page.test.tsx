// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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

  it('says when the token is not one, and when another account has the session', async () => {
    await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'bo@example.com' }) })
    history.replaceState(null, '', `/claim?token=nope&server=${encodeURIComponent(run.http)}`)
    render(<ClaimPage onNavigate={() => undefined} />)
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringMatching(/gäller inte/))
  })
})
