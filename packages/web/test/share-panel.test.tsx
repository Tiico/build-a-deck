// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { EditorPage } from '../src/editor/EditorPage.js'
import { InvitePage } from '../src/account/InvitePage.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'

let run: Running
beforeEach(async () => {
  run = await startServer({ auth: true })
})
afterEach(async () => {
  await run.stop()
})

// Signs in as an address and answers with nothing: the cookie jar in test/setup.ts carries it.
async function signIn(email: string): Promise<void> {
  await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
  const link = /\/auth\/verify\?token=\S+/.exec(run.mail.sent.at(-1)?.text ?? '')?.[0] ?? ''
  await fetch(`${run.http}${link}`, { redirect: 'manual' })
}
const inviteLink = (): string => /\/invites\/([A-Za-z0-9_-]+)/.exec(run.mail.sent.at(-1)?.text ?? '')?.[1] ?? ''

async function openEditor(): Promise<void> {
  history.replaceState(null, '', `/editor?project=p1&server=${encodeURIComponent(run.http)}`)
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
}

describe('who has the game, from the editor (D3)', () => {
  it('opens from the people in the header, lists them with what each may do, and invites one more', async () => {
    await signIn('ada@example.com')
    await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'p1', ...projectDoc() }) })
    await openEditor()

    // Alone, the door is still there: it is how one shares the game.
    const door = await screen.findByRole('button', { name: 'Vilka som har spelet' })
    fireEvent.click(door)
    const panel = await screen.findByRole('dialog', { name: 'Vilka som har spelet' })
    expect((await within(panel).findAllByRole('listitem')).map((l) => l.textContent)).toEqual([expect.stringContaining('ada@example.com')])
    expect(within(panel).getByText(/ägare/)).toBeTruthy()

    fireEvent.change(within(panel).getByLabelText('Adress att bjuda in'), { target: { value: 'bo@example.com' } })
    fireEvent.change(within(panel).getByLabelText('Roll'), { target: { value: 'tester' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Bjud in' }))
    expect(await within(panel).findByText(/Inbjudan är skickad till bo@example.com/)).toBeTruthy()
    await waitFor(() => expect(run.mail.sent.at(-1)?.to).toBe('bo@example.com'))
    expect(run.mail.sent.at(-1)?.text).toContain('testledare')
  })

  it('shows what a shared game already is, and lets the owner take it back', async () => {
    await signIn('ada@example.com')
    await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'p1', ...projectDoc() }) })
    await fetch(`${run.http}/projects/p1/invites`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'bo@example.com', role: 'editor' }) })
    const token = inviteLink()
    // Bo follows the invitation, then Ada looks at the list again.
    await signIn('bo@example.com')
    await fetch(`${run.http}/invites/${token}`, { method: 'POST' })
    await signIn('ada@example.com')

    await openEditor()
    fireEvent.click(await screen.findByRole('button', { name: 'Vilka som har spelet' }))
    const panel = await screen.findByRole('dialog', { name: 'Vilka som har spelet' })
    await waitFor(() => expect(within(panel).getAllByRole('listitem')).toHaveLength(2))
    expect(panel.textContent).toContain('bo@example.com')
    expect(panel.textContent).toContain('medredigerare')

    fireEvent.click(within(panel).getByRole('button', { name: 'Ta bort bo@example.com' }))
    await waitFor(() => expect(within(panel).getAllByRole('listitem')).toHaveLength(1))
    // The owner is nobody's to remove.
    expect(within(panel).queryByRole('button', { name: /Ta bort ada@example.com/ })).toBeNull()
  })
})

describe('following an invitation (D3)', () => {
  it('joins the game and opens it', async () => {
    await signIn('ada@example.com')
    await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'p1', ...projectDoc() }) })
    await fetch(`${run.http}/projects/p1/invites`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'bo@example.com', role: 'editor' }) })
    const token = inviteLink()
    await signIn('bo@example.com')

    const gone: string[] = []
    history.replaceState(null, '', `/invites/${token}?server=${encodeURIComponent(run.http)}`)
    render(<InvitePage onNavigate={(u) => gone.push(u)} />)
    await waitFor(() => expect(gone.at(-1)).toMatch(/^\/editor\?project=p1/))
    expect((await fetch(`${run.http}/projects/p1`)).status).toBe(200)
  })

  it('says so when the invitation has already been used', async () => {
    await signIn('bo@example.com')
    history.replaceState(null, '', `/invites/spent?server=${encodeURIComponent(run.http)}`)
    render(<InvitePage onNavigate={() => undefined} />)
    expect((await screen.findByRole('alert')).textContent).toMatch(/använd eller har gått ut/)
  })
})

describe('a role that may not edit (D3)', () => {
  it('says so once instead of letting every change be refused', async () => {
    await signIn('ada@example.com')
    await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'p1', ...projectDoc() }) })
    await fetch(`${run.http}/projects/p1/invites`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'bo@example.com', role: 'tester' }) })
    const token = inviteLink()
    await signIn('bo@example.com')
    await fetch(`${run.http}/invites/${token}`, { method: 'POST' })

    await openEditor()
    await waitFor(() => expect(document.querySelector('[data-role-note]')).toBeTruthy())
    const said = document.querySelector('[data-role-note]')!
    expect(said.textContent).toContain('testledare')
    expect(said.textContent).toMatch(/inte ändra det/)
  })

  it('says nothing of the kind to the owner', async () => {
    await signIn('ada@example.com')
    await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'p1', ...projectDoc() }) })
    await openEditor()
    await screen.findByRole('button', { name: 'Vilka som har spelet' })
    await waitFor(() => expect(document.querySelector('[data-role-note]')).toBeNull())
  })
})
