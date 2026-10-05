// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { EditorPage } from '../src/editor/EditorPage.js'
import { InvitePage } from '../src/account/InvitePage.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

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
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
}

describe('who has the game, from the editor (D3)', () => {
  it('opens from the people in the header, lists them with what each may do, and invites one more', async () => {
    await signIn('ada@example.com')
    await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: run.projectId, ...projectDoc() }) })
    await openEditor()

    // Alone, the door is still there: it is how one shares the game.
    const door = await screen.findByRole('button', { name: 'Dela · vilka som har spelet' })
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
    await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: run.projectId, ...projectDoc() }) })
    await fetch(`${run.http}/projects/${run.projectId}/invites`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'bo@example.com', role: 'editor' }) })
    const token = inviteLink()
    // Bo follows the invitation, then Ada looks at the list again.
    await signIn('bo@example.com')
    await fetch(`${run.http}/invites/${token}`, { method: 'POST' })
    await signIn('ada@example.com')

    await openEditor()
    fireEvent.click(await screen.findByRole('button', { name: 'Dela · vilka som har spelet' }))
    const panel = await screen.findByRole('dialog', { name: 'Vilka som har spelet' })
    await waitFor(() => expect(within(panel).getAllByRole('listitem')).toHaveLength(2))
    expect(panel.textContent).toContain('bo@example.com')
    expect(panel.textContent).toContain('medredigerare')

    fireEvent.click(within(panel).getByRole('button', { name: 'Ta bort bo@example.com' }))
    fireEvent.click(await within(panel).findByRole('button', { name: 'Ja, ta bort' }))
    await waitFor(() => expect(within(panel).getAllByRole('listitem')).toHaveLength(1))
    // The owner is nobody's to remove.
    expect(within(panel).queryByRole('button', { name: /Ta bort ada@example.com/ })).toBeNull()
  })
})

// Sharing as something that answers in words and asks before it takes (#477).
// A way in that can be found without knowing the pattern (#727, beslut A + C, 2026-10-05): the
// door to who has the game says «Dela» beside the faces, and the game's own ⋯ offers the same.
describe('the way to sharing is in words (#727)', () => {
  it('says «Dela» beside the faces, and offers «Dela spelet…» in the game s ⋯', async () => {
    await signIn('ada@example.com')
    await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: run.projectId, ...projectDoc() }) })
    await openEditor()
    const door = await screen.findByRole('button', { name: /^Dela/ })
    expect(door.textContent).toContain('Dela')

    fireEvent.click(screen.getByRole('button', { name: /^Fler val för/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Dela spelet…' }))
    expect(await screen.findByRole('dialog', { name: 'Vilka som har spelet' })).toBeTruthy()
  })
})

describe('the share panel says what happened (#477)', () => {
  const owning = async () => {
    await signIn('ada@example.com')
    await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: run.projectId, ...projectDoc() }) })
    await openEditor()
    fireEvent.click(await screen.findByRole('button', { name: 'Dela · vilka som har spelet' }))
    return screen.findByRole('dialog', { name: 'Vilka som har spelet' })
  }
  const invite = (panel: HTMLElement, email: string) => {
    fireEvent.change(within(panel).getByLabelText('Adress att bjuda in'), { target: { value: email } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Bjud in' }))
  }

  it('takes the focus when it opens', async () => {
    const panel = await owning()
    await waitFor(() => expect(panel.contains(document.activeElement)).toBe(true))
  })

  it('refuses the owner herself, a second invitation and an address that is not one, in words', async () => {
    const panel = await owning()
    invite(panel, 'ada@example.com')
    expect((await within(panel).findByRole('alert')).textContent).toBe('ada@example.com har redan spelet.')

    invite(panel, 'bo@example.com')
    expect(await within(panel).findByText(/Inbjudan är skickad till bo@example.com/)).toBeTruthy()
    invite(panel, 'bo@example.com')
    await waitFor(() => expect(within(panel).getByRole('alert').textContent).toBe('bo@example.com har redan en inbjudan som väntar.'))

    const asked = run.mail.sent.length
    invite(panel, 'bo')
    await waitFor(() => expect(within(panel).getByRole('alert').textContent).toBe('Det där är ingen e-postadress.'))
    expect(run.mail.sent.length).toBe(asked)
  })

  it('asks before taking the game back from someone, and keeps the keyboard in the panel', async () => {
    await signIn('ada@example.com')
    await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: run.projectId, ...projectDoc() }) })
    await fetch(`${run.http}/projects/${run.projectId}/invites`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'bo@example.com', role: 'editor' }) })
    const token = inviteLink()
    await signIn('bo@example.com')
    await fetch(`${run.http}/invites/${token}`, { method: 'POST' })
    await signIn('ada@example.com')
    await openEditor()
    fireEvent.click(await screen.findByRole('button', { name: 'Dela · vilka som har spelet' }))
    const panel = await screen.findByRole('dialog', { name: 'Vilka som har spelet' })
    await waitFor(() => expect(within(panel).getAllByRole('listitem')).toHaveLength(2))

    fireEvent.click(within(panel).getByRole('button', { name: 'Ta bort bo@example.com' }))
    const question = await within(panel).findByRole('alertdialog')
    expect(question.textContent).toContain('bo@example.com')
    // Nothing is taken until the question is answered.
    expect(within(panel).getAllByRole('listitem')).toHaveLength(2)
    fireEvent.click(within(question).getByRole('button', { name: 'Ja, ta bort' }))
    await waitFor(() => expect(within(panel).getAllByRole('listitem')).toHaveLength(1))
    await waitFor(() => expect(panel.contains(document.activeElement)).toBe(true))
  })

  it('closes the game in front of someone it is taken back from, without a reload', async () => {
    await signIn('ada@example.com')
    await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: run.projectId, ...projectDoc() }) })
    await fetch(`${run.http}/projects/${run.projectId}/invites`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'bo@example.com', role: 'editor' }) })
    const token = inviteLink()
    await signIn('bo@example.com')
    await fetch(`${run.http}/invites/${token}`, { method: 'POST' })
    await openEditor()
    await screen.findByRole('button', { name: 'Dela · vilka som har spelet' })

    // Ada takes it back. The jar is shared, so Bo's editor would reconnect as Ada if it tried:
    // what is asserted is that it does not try.
    await signIn('ada@example.com')
    expect((await fetch(`${run.http}/projects/${run.projectId}/members/bo@example.com`, { method: 'DELETE' })).status).toBe(200)
    await waitFor(() => expect(document.querySelector('[data-status-notice="forbidden"]')).toBeTruthy())
    expect(screen.queryByText('Skogens herrar')).toBeNull()
  })

  // What is waiting (beslut 2026-09-27, #477 fynd 10, variant C): a line by the form says how many
  // invitations nobody has followed yet, and opens them; each can be taken back.
  it('says what is waiting by the form, opens it, and takes an invitation back', async () => {
    await signIn('ada@example.com')
    await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: run.projectId, ...projectDoc() }) })
    await fetch(`${run.http}/projects/${run.projectId}/invites`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'bo@example.com', role: 'tester' }) })
    await fetch(`${run.http}/projects/${run.projectId}/invites`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'cee@example.com', role: 'viewer' }) })
    await openEditor()
    fireEvent.click(await screen.findByRole('button', { name: 'Dela · vilka som har spelet' }))
    const panel = await screen.findByRole('dialog', { name: 'Vilka som har spelet' })

    const waiting = await within(panel).findByRole('button', { name: /2 inbjudningar väntar/ })
    expect(waiting.getAttribute('aria-expanded')).toBe('false')
    // The members' list is still only the members.
    expect(within(panel).queryByText('bo@example.com')).toBeNull()
    fireEvent.click(waiting)
    expect(waiting.getAttribute('aria-expanded')).toBe('true')
    expect(within(panel).getByText('bo@example.com')).toBeTruthy()
    expect(within(panel).getByText(/inbjuden som testledare/)).toBeTruthy()

    fireEvent.click(within(panel).getByRole('button', { name: 'Dra tillbaka inbjudan till bo@example.com' }))
    expect(await within(panel).findByRole('button', { name: /1 inbjudan väntar/ })).toBeTruthy()
    await waitFor(() => expect(panel.contains(document.activeElement)).toBe(true))

    fireEvent.change(within(panel).getByLabelText('Adress att bjuda in'), { target: { value: 'dan@example.com' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Bjud in' }))
    expect(await within(panel).findByRole('button', { name: /2 inbjudningar väntar/ })).toBeTruthy()
  })

  it('keeps an address that was being written when Escape closes the panel', async () => {
    const panel = await owning()
    const field = within(panel).getByLabelText('Adress att bjuda in')
    fireEvent.change(field, { target: { value: 'cilla@exa' } })
    field.focus()
    fireEvent.keyDown(field, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Vilka som har spelet' })).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Dela · vilka som har spelet' }))
    const again = await screen.findByRole('dialog', { name: 'Vilka som har spelet' })
    expect((within(again).getByLabelText('Adress att bjuda in') as HTMLInputElement).value).toBe('cilla@exa')
  })
})

describe('following an invitation (D3)', () => {
  it('joins the game and opens it', async () => {
    await signIn('ada@example.com')
    await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: run.projectId, ...projectDoc() }) })
    await fetch(`${run.http}/projects/${run.projectId}/invites`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'bo@example.com', role: 'editor' }) })
    const token = inviteLink()
    await signIn('bo@example.com')

    const gone: string[] = []
    history.replaceState(null, '', `/invites/${token}?server=${encodeURIComponent(run.http)}`)
    render(<InvitePage onNavigate={(u) => gone.push(u)} />)
    await waitFor(() => expect(gone.at(-1)).toMatch(new RegExp(`^/editor\\?project=${run.projectId}`)))
    expect((await fetch(`${run.http}/projects/${run.projectId}`)).status).toBe(200)
  })

  it('says so when the invitation has already been used', async () => {
    await signIn('bo@example.com')
    history.replaceState(null, '', `/invites/spent?server=${encodeURIComponent(run.http)}`)
    // Mounted the way the app mounts it, with no `onNavigate` of its own: the default must not be
    // a reason to follow the invitation again on every render (#475), which flipped the page
    // between «Öppnar spelet…» and the answer for as long as it stood open.
    const asked = vi.spyOn(globalThis, 'fetch')
    render(<InvitePage />)
    // In the status family (D5, #475), with the focus on its heading and a way on, rather than a
    // line of red with nothing to press and the focus on <body>.
    await waitFor(() => expect(document.querySelector('[data-status-notice="missing"]')?.textContent).toMatch(/använd eller har gått ut/))
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }))
    expect(screen.getByRole('link', { name: 'Till mina spel' }).getAttribute('href')).toBe(`/?server=${encodeURIComponent(run.http)}`)
    await new Promise((r) => setTimeout(r, 200))
    expect(document.querySelector('[data-status-notice="missing"]')).toBeTruthy()
    expect(asked.mock.calls.filter(([u]) => String(u).includes('/invites/spent'))).toHaveLength(1)
    asked.mockRestore()
  })
})

describe('a role that may not edit (D3)', () => {
  it('says so once instead of letting every change be refused', async () => {
    await signIn('ada@example.com')
    await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: run.projectId, ...projectDoc() }) })
    await fetch(`${run.http}/projects/${run.projectId}/invites`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'bo@example.com', role: 'tester' }) })
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
    await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: run.projectId, ...projectDoc() }) })
    await openEditor()
    await screen.findByRole('button', { name: 'Dela · vilka som har spelet' })
    await waitFor(() => expect(document.querySelector('[data-role-note]')).toBeNull())
  })
})

// Sharing a game and taking it back are the owner's alone (D3, #689): anyone else sees who has
// the game, and is told in words who can share it, instead of a form the server refuses.
describe('the share panel follows the role (D3, #689)', () => {
  it.each(['editor', 'tester', 'viewer'] as const)('shows the %s who has the game, with no invitation and no removal to try', async (role) => {
    await signIn('ada@example.com')
    await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: run.projectId, ...projectDoc() }) })
    await fetch(`${run.http}/projects/${run.projectId}/invites`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'bo@example.com', role }) })
    const token = inviteLink()
    await signIn('bo@example.com')
    expect((await fetch(`${run.http}/invites/${token}`, { method: 'POST' })).status).toBe(200)

    await openEditor()
    fireEvent.click(await screen.findByRole('button', { name: 'Dela · vilka som har spelet' }))
    const panel = await screen.findByRole('dialog', { name: 'Vilka som har spelet' })
    await waitFor(() => expect(within(panel).getAllByRole('listitem')).toHaveLength(2))
    expect(within(panel).queryByRole('button', { name: /^Ta bort/ })).toBeNull()
    expect(within(panel).queryByLabelText('Adress att bjuda in')).toBeNull()
    expect(within(panel).queryByRole('button', { name: 'Bjud in' })).toBeNull()
    expect(panel.textContent).toContain('Bara ägaren kan bjuda in fler eller ta bort någon.')
    // The keys still have somewhere to stand in the panel.
    await waitFor(() => expect(panel.contains(document.activeElement)).toBe(true))
  })

  it('keeps the form and the removals for the owner, without the line meant for the others', async () => {
    await signIn('ada@example.com')
    await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: run.projectId, ...projectDoc() }) })
    await openEditor()
    fireEvent.click(await screen.findByRole('button', { name: 'Dela · vilka som har spelet' }))
    const panel = await screen.findByRole('dialog', { name: 'Vilka som har spelet' })
    expect(within(panel).getByRole('button', { name: 'Bjud in' })).toBeTruthy()
    expect(panel.textContent).not.toContain('Bara ägaren')
  })
})

// What a server that cannot be reached says is the network's English, and the panel says it in a
// whole sentence of its own instead, one for each thing that was tried (#812, A4).
describe('the share panel says its failures in the reader’s language (#812)', () => {
  it('says the list and the invitation did not work, without the network’s own words', async () => {
    const { SharePanel } = await import('../src/editor/SharePanel.js')
    render(<SharePanel http="http://127.0.0.1:1" project="nowhere" here={[]} onClose={() => undefined} />)
    const panel = await screen.findByRole('dialog', { name: 'Vilka som har spelet' })
    await waitFor(() => expect(within(panel).getByRole('alert').textContent).toBe('Listan över vilka som har spelet kunde inte läsas. Försök igen om en stund.'))

    fireEvent.change(within(panel).getByLabelText('Adress att bjuda in'), { target: { value: 'bo@example.com' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Bjud in' }))
    await waitFor(() => expect(within(panel).getByRole('alert').textContent).toBe('Inbjudan kunde inte skickas. Försök igen om en stund.'))
    expect(panel.textContent).not.toMatch(/fetch|failed|ECONNREFUSED/i)
  })
})
