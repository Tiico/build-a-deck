// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { EditorPage } from '../src/editor/EditorPage.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// The game's own ⋯ in the editor, beside its name (#542, #529 beslut B): the same menu a game has in
// «Mina spel», with what is done to the whole game — today the export — for those who may take it.
let run: Running
beforeEach(async () => {
  run = await startServer({ auth: true })
})
afterEach(async () => {
  await run.stop()
})

async function signIn(email: string): Promise<void> {
  await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
  const link = /\/auth\/verify\?token=\S+/.exec(run.mail.sent.at(-1)?.text ?? '')?.[0] ?? ''
  await fetch(`${run.http}${link}`, { redirect: 'manual' })
}
async function openEditor(): Promise<void> {
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
}

describe('the game’s own ⋯ in the editor (#542)', () => {
  it('opens the export window from beside the game’s name, and gives the keys back to the ⋯', async () => {
    await signIn('ada@example.com')
    await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: run.projectId, ...projectDoc() }) })
    await openEditor()
    const more = screen.getByRole('button', { name: 'Fler val för Skogens herrar' })
    fireEvent.click(more)
    fireEvent.click(within(screen.getByRole('group', { name: 'Val för Skogens herrar' })).getByRole('button', { name: 'Exportera…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Exportera «Skogens herrar»' })
    expect(dialog.textContent).toMatch(/Bordens loggar och enkätsvar följer inte med/)
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /^Exportera/ })).toBeNull())
    expect(document.activeElement).toBe(more)
  })

  it('is not there for someone who may only look, since the server would refuse them', async () => {
    await signIn('ada@example.com')
    await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: run.projectId, ...projectDoc() }) })
    await fetch(`${run.http}/projects/${run.projectId}/invites`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'cee@example.com', role: 'viewer' }) })
    const token = /\/invites\/([A-Za-z0-9_-]+)/.exec(run.mail.sent.at(-1)?.text ?? '')?.[1] ?? ''
    await signIn('cee@example.com')
    await fetch(`${run.http}/invites/${token}`, { method: 'POST' })
    await openEditor()
    // Until the server has said who this is, the editor assumes the game is everyone's (D3); the
    // answer is the read-only mark, and after it the ⋯ is gone.
    await waitFor(() => expect(document.querySelector('[data-readonly]')).toBeTruthy())
    expect(screen.queryByRole('button', { name: 'Fler val för Skogens herrar' })).toBeNull()
  })
})
