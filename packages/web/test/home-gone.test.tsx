// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { HomePage } from '../src/account/HomePage.js'
import { Language } from '../src/i18n/index.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'

// The band on a co-editor's Mina spel (#1334, beställarens beslut 2026-10-25, the approved prototype's
// «Efteråt»): a game she worked on that went, by its name and why, standing under the heading until
// she closes it; and closed, it is gone from the server too, so it never comes back.
let run: Running
beforeEach(async () => {
  run = await startServer({ auth: true, authBypass: true })
  await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'kim@example.com' }) })
  history.replaceState(null, '', `/?server=${encodeURIComponent(run.http)}`)
})
afterEach(async () => {
  cleanup()
  await run.stop()
})

// A game of Sara's that Kim is in, and then not: Sara took it away, or deleted her account with it.
async function lost(name: string, how: 'removed' | 'account'): Promise<void> {
  const kim = (await run.auth!.accountByEmail('kim@example.com'))!.id
  const sara = (await run.auth!.ensureAccount(`sara-${name.length}@example.com`)).id
  const id = `${run.projectId}-${name.length}`
  await run.projects.create(id, { ...projectDoc(), name }, sara)
  await run.projects.share(id, kim, 'editor')
  if (how === 'removed') await run.projects.remove(id)
  else run.projects.forgetAccount(sara, `sara-${name.length}@example.com`)
}

describe('a game gone from Mina spel (#1334)', () => {
  it('says which game went and why, one band each, under the heading', async () => {
    await lost('Skogens råd', 'account')
    await lost('Fyrtornet', 'removed')
    render(<HomePage onNavigate={() => undefined} />)
    const bands = await screen.findAllByRole('group', { name: /är borttaget/ })
    expect(bands.map((b) => b.textContent)).toEqual([expect.stringContaining('Skogens råd är borttaget. Ägaren raderade sitt konto.'), expect.stringContaining('Fyrtornet är borttaget. Ägaren tog bort spelet.')])
    // The name is the band's bold lead, as in the prototype.
    expect(within(bands[0]!).getByText('Skogens råd är borttaget.').tagName).toBe('B')
    // Under the heading, before the games.
    const heading = screen.getByRole('heading', { level: 1, name: 'Mina spel' })
    expect(heading.compareDocumentPosition(bands[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('stands until she closes it, and once closed it is gone for good', async () => {
    await lost('Skogens råd', 'removed')
    render(<HomePage onNavigate={() => undefined} />)
    const band = await screen.findByRole('group', { name: 'Skogens råd är borttaget.' })
    // A reload is not a closing.
    cleanup()
    render(<HomePage onNavigate={() => undefined} />)
    expect(await screen.findByRole('group', { name: 'Skogens råd är borttaget.' })).toBeTruthy()
    expect(band.isConnected).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Stäng beskedet om Skogens råd' }))
    await waitFor(() => expect(screen.queryByRole('group', { name: /är borttaget/ })).toBeNull())
    // The focus goes to the heading, not to the top of the page.
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Mina spel' }))
    await waitFor(async () => expect(await run.projects.goneFor((await run.auth!.accountByEmail('kim@example.com'))!.id)).toEqual([]))
    cleanup()
    render(<HomePage onNavigate={() => undefined} />)
    expect(await screen.findByText('Mina spel')).toBeTruthy()
    await waitFor(() => expect(document.querySelector('[data-projects], .byd-home-empty')).toBeTruthy())
    expect(screen.queryByRole('group', { name: /är borttaget/ })).toBeNull()
  })

  it('speaks English to an English reader', async () => {
    await lost('Skogens råd', 'account')
    render(
      <Language lang="en">
        <HomePage onNavigate={() => undefined} />
      </Language>,
    )
    const band = await screen.findByRole('group', { name: 'Skogens råd has been removed.' })
    expect(band.textContent).toContain('The owner deleted their account.')
    expect(within(band).getByRole('button', { name: 'Close the notice about Skogens råd' })).toBeTruthy()
  })
})
