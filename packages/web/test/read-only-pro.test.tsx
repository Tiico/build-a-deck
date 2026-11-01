// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { HomePage } from '../src/account/HomePage.js'
import { EditorPage } from '../src/editor/EditorPage.js'
import { StatusLive } from '../src/status/StatusLive.js'
import { plansFromEnv } from '../../server/src/quotas.js'
import { lapseAccount } from '../../server/src/account-plans.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'

// The read-only band offers the owner Pro again, with its price (#1532, beställarens beslut
// 2026-11-01, after #1492 and #1494): «Förnya Pro» and the monthly price in Mina spel's band and in
// the editor's reading band, leading to Profil's card. A co-editor sees only whose game it is, and
// with payments off no price is said.
let run: Running
afterEach(async () => {
  vi.restoreAllMocks()
  localStorage.clear()
  await run.stop()
})

const tiers = plansFromEnv({ BYD_PLANS: JSON.stringify({ default: 'free', plans: { free: { projects: 2, cardRowsPerProject: 3 }, pro: {} } }) })
const login = async (email: string): Promise<string> => {
  await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
  return (await run.auth!.accountByEmail(email))!.id
}
// Ada had Pro and a game of four cards, over Gratis's three; Pro lapses.
const lapsed = async (payments: boolean): Promise<{ ada: string; game: string }> => {
  run = await startServer({ auth: true, authBypass: true, plans: tiers, payments })
  const ada = await login('ada@example.com')
  await run.accountPlans!.setPlan(ada, 'pro', 'stripe')
  const doc = projectDoc()
  const res = await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...doc, rows: [...doc.rows, { id: 'extra', fields: { title: 'Extra', body: '', antal: 1 } }] }) })
  expect(res.status).toBe(201)
  const game = ((await res.json()) as { id: string }).id
  await lapseAccount({ projects: run.projects, accountPlans: run.accountPlans! }, tiers, ada)
  return { ada, game }
}
const home = (): string[] => {
  history.replaceState(null, '', `/?server=${encodeURIComponent(run.http)}`)
  const gone: string[] = []
  render(
    <StatusLive>
      <HomePage onNavigate={(url) => gone.push(url)} />
    </StatusLive>,
  )
  return gone
}
const editor = async (project: string): Promise<string[]> => {
  history.replaceState(null, '', `/editor?project=${project}&server=${encodeURIComponent(run.http)}`)
  const gone: string[] = []
  render(
    <StatusLive>
      <EditorPage onNavigate={(url) => gone.push(url)} />
    </StatusLive>,
  )
  fireEvent.click(await screen.findByRole('tab', { name: 'Tabell' }))
  await waitFor(() => expect(document.querySelector('#byd-editor-reading')).not.toBeNull())
  return gone
}
const card = () => `/profile?server=${encodeURIComponent(run.http)}#abonnemang`

describe('Pro in the read-only band (#1532)', () => {
  it('offers the owner «Förnya Pro» with the monthly price in Mina spel, to Profil’s card', async () => {
    await lapsed(true)
    const gone = home()
    const band = await screen.findByRole('region', { name: 'Läsläge' })
    await waitFor(() => expect(band.textContent).toContain('Förnya Pro för 99 kr i månaden, så gäller Pros tak igen.'))
    fireEvent.click(within(band).getByRole('link', { name: 'Förnya Pro' }))
    expect(gone).toEqual([card()])
  })

  it('offers it in the editor’s reading band to the owner', async () => {
    const { game } = await lapsed(true)
    const gone = await editor(game)
    const band = document.querySelector<HTMLElement>('#byd-editor-reading')!
    await waitFor(() => expect(band.textContent).toContain('Förnya Pro för 99 kr i månaden, så gäller Pros tak igen.'))
    fireEvent.click(within(band).getByRole('link', { name: 'Förnya Pro' }))
    expect(gone).toEqual([card()])
  })

  it('says no tier and no price to a co-editor meeting the owner’s read-only mode', async () => {
    const { game } = await lapsed(true)
    const bo = await login('bo@example.com')
    await run.projects.share(game, bo, 'editor')
    await editor(game)
    const band = document.querySelector<HTMLElement>('#byd-editor-reading')!
    await waitFor(() => expect(band.textContent).toContain('ligger över det'))
    await new Promise((r) => setTimeout(r, 200))
    expect(band.textContent).not.toMatch(/Pro|kr/)
    expect(within(band).queryByRole('link')).toBeNull()
  })

  it('says no price when the box takes no payments', async () => {
    const { game } = await lapsed(false)
    home()
    const band = await screen.findByRole('region', { name: 'Läsläge' })
    await new Promise((r) => setTimeout(r, 200))
    expect(band.textContent).not.toMatch(/Pro|kr/)
    document.body.innerHTML = ''
    await editor(game)
    await new Promise((r) => setTimeout(r, 200))
    expect(document.querySelector('#byd-editor-reading')?.textContent).not.toMatch(/Pro|kr/)
  })
})
