// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { EditorPage } from '../src/editor/EditorPage.js'
import { DocumentTitle } from '../src/status/DocumentTitle.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// The editor's ⋯ carries the same choices as the game's ⋯ in «Mina spel» (#738, beställarens beslut
// 2026-10-06): rename, duplicate, export and delete, each where the role allows it (#689).
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
async function ownGame(): Promise<void> {
  await signIn('ada@example.com')
  await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: run.projectId, ...projectDoc() }) })
}
async function openEditor(onNavigate: (url: string) => void = () => undefined): Promise<void> {
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  render(
    <DocumentTitle route="editor">
      <EditorPage onNavigate={onNavigate} />
    </DocumentTitle>,
  )
  await screen.findByText('Skogens herrar')
}
const openMenu = (name = 'Skogens herrar'): HTMLElement => {
  fireEvent.click(screen.getByRole('button', { name: `Fler val för ${name}` }))
  return screen.getByRole('group', { name: `Val för ${name}` })
}
const choices = (menu: HTMLElement): string[] => within(menu).getAllByRole('button').map((b) => b.textContent ?? '')

describe('the editor’s ⋯ (#738)', () => {
  it('offers the owner every choice the game has', async () => {
    await ownGame()
    await openEditor()
    const menu = openMenu()
    await waitFor(() => expect(choices(menu)).toEqual(['Dela spelet…', 'Byt namn…', 'Dubblera', 'Exportera…', 'Ta bort spelet']))
  })

  it('renames the game, and the heading and the tab follow', async () => {
    await ownGame()
    await openEditor()
    fireEvent.click(within(openMenu()).getByRole('button', { name: 'Byt namn…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Byt namn på «Skogens herrar»' })
    const field = within(dialog).getByRole('textbox', { name: 'Spelets namn' })
    expect((field as HTMLInputElement).value).toBe('Skogens herrar')
    // The focus is moved by an effect after the dialog is drawn, so it is waited for and not read in
    // the same breath: CI's slower runner read it before the effect ran (#945).
    await waitFor(() => expect(document.activeElement).toBe(field))
    fireEvent.change(field, { target: { value: '   ' } })
    expect((within(dialog).getByRole('button', { name: 'Byt namn' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(field, { target: { value: '  Skogens drottningar ' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Byt namn' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Skogens drottningar')
    await waitFor(() => expect(document.title).toMatch(/^Skogens drottningar · /))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Fler val för Skogens drottningar' })))
  })

  it('leaves the name as it was when the window is closed', async () => {
    await ownGame()
    await openEditor()
    fireEvent.click(within(openMenu()).getByRole('button', { name: 'Byt namn…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Byt namn på «Skogens herrar»' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Spelets namn' }), { target: { value: 'Något annat' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Avbryt' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Skogens herrar')
  })

  it('duplicates the game into «Mina spel» and says so', async () => {
    await ownGame()
    await openEditor()
    fireEvent.click(within(openMenu()).getByRole('button', { name: 'Dubblera' }))
    await screen.findByText('«Skogens herrar (kopia)» ligger nu i Mina spel.')
    const mine = (await (await fetch(`${run.http}/projects`, { credentials: 'include' })).json()) as { name: string }[]
    expect(mine.map((p) => p.name).sort()).toEqual(['Skogens herrar', 'Skogens herrar (kopia)'])
  })

  it('deletes the game after asking, and lands in «Mina spel»', async () => {
    await ownGame()
    const went = vi.fn()
    await openEditor(went)
    fireEvent.click(within(openMenu()).getByRole('button', { name: 'Ta bort spelet' }))
    const question = await screen.findByRole('alertdialog', { name: 'Ta bort spelet' })
    expect(question.textContent).toMatch(/Ta bort Skogens herrar\? Hela historien följer med/)
    // The question opens on the answer that loses nothing.
    await waitFor(() => expect(document.activeElement).toBe(within(question).getByRole('button', { name: 'Behåll' })))
    fireEvent.click(within(question).getByRole('button', { name: 'Ta bort' }))
    await waitFor(() => expect(went).toHaveBeenCalledWith(`/?server=${encodeURIComponent(run.http)}`))
    expect((await fetch(`${run.http}/projects/${run.projectId}`, { credentials: 'include' })).status).toBe(404)
    // The server tells every open editor the game is gone; this one took it away and is leaving,
    // so it is not told over the top of the page that its game was lost.
    await new Promise((r) => setTimeout(r, 100))
    expect(document.querySelector('[data-status-notice]')).toBeNull()
  })

  it('keeps the game when the question is answered «Behåll»', async () => {
    await ownGame()
    const went = vi.fn()
    await openEditor(went)
    fireEvent.click(within(openMenu()).getByRole('button', { name: 'Ta bort spelet' }))
    const question = await screen.findByRole('alertdialog', { name: 'Ta bort spelet' })
    fireEvent.click(within(question).getByRole('button', { name: 'Behåll' }))
    expect(screen.queryByRole('alertdialog', { name: 'Ta bort spelet' })).toBeNull()
    expect(went).not.toHaveBeenCalled()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Fler val för Skogens herrar' })))
  })

  it('offers a co-editor everything but taking the game away, which is the owner’s alone', async () => {
    await ownGame()
    await fetch(`${run.http}/projects/${run.projectId}/invites`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'bo@example.com', role: 'editor' }) })
    const token = /\/invites\/([A-Za-z0-9_-]+)/.exec(run.mail.sent.at(-1)?.text ?? '')?.[1] ?? ''
    await signIn('bo@example.com')
    await fetch(`${run.http}/invites/${token}`, { method: 'POST' })
    await openEditor()
    // Until the server has said who this is, the editor assumes the game is everyone's (D3); the
    // menu that is open follows the answer.
    const menu = openMenu()
    await waitFor(() => expect(choices(menu)).toEqual(['Dela spelet…', 'Byt namn…', 'Dubblera', 'Exportera…']))
  })
})
