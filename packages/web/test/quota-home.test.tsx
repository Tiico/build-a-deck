// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { HomePage } from '../src/account/HomePage.js'
import { ProfilePage } from '../src/account/ProfilePage.js'
import { ImportDialog } from '../src/account/GameDialogs.js'
import { StatusLive } from '../src/status/StatusLive.js'
import { plansFromEnv, type Plans } from '../../server/src/quotas.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'

// A met ceiling where the press was, in Mina spel and the profile (#1198, variant A): the box under
// the heading for «＋ Nytt spel», «Duplicera» and «Starta bord», the import's own failure line, and
// the usage on the profile — and with every ceiling `null`, as in the beta, everything as today.
let run: Running
afterEach(async () => {
  vi.unstubAllGlobals()
  await run.stop()
})

const tiers = (free: Record<string, number>): Plans => plansFromEnv({ BYD_PLANS: JSON.stringify({ default: 'free', plans: { free } }) })
const login = async (email: string): Promise<string> => {
  await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
  return (await run.auth!.accountByEmail(email))!.id
}
const made = async (name = 'Skogens råd'): Promise<string> => {
  const res = await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...projectDoc(), name }) })
  expect(res.status).toBe(201)
  return ((await res.json()) as { id: string }).id
}
// The box under the heading; the page's own live region is an alert too.
const notice = async (): Promise<HTMLElement> => {
  await waitFor(() => expect(document.querySelector('.byd-home-notice')).not.toBeNull())
  return document.querySelector<HTMLElement>('.byd-home-notice')!
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

describe('Mina spel at a ceiling on games (#1198)', () => {
  it('asks before «＋ Nytt spel» opens the guide, and says it under the heading instead', async () => {
    run = await startServer({ auth: true, authBypass: true, plans: tiers({ projects: 1 }) })
    await login('ada@example.com')
    await made()
    const gone = home()
    await screen.findByText('Skogens råd')
    fireEvent.click(screen.getAllByRole('link', { name: '＋ Nytt spel' })[0]!)
    const said = await notice()
    expect(said.getAttribute('role')).toBe('alert')
    expect(said.textContent).toBe('Inget nytt spel skapades. Ditt konto rymmer 1 spel, och du har 1. Ta bort ett spel du inte behöver för att få plats. Exportera det först om du vill ha det kvar.')
    expect(said.querySelector('b')?.textContent).toBe('Inget nytt spel skapades.')
    await waitFor(() => expect(document.activeElement).toBe(said))
    expect(gone).toEqual([])
    // The dashed row is the same press.
    fireEvent.click(screen.getAllByRole('link', { name: '＋ Nytt spel' }).at(-1)!)
    await new Promise((r) => setTimeout(r, 50))
    expect(gone).toEqual([])
  })

  it('opens the guide as today when the account has room, and when nothing is limited', async () => {
    run = await startServer({ auth: true, authBypass: true, plans: tiers({ projects: 2 }) })
    await login('ada@example.com')
    await made()
    const gone = home()
    await screen.findByText('Skogens råd')
    fireEvent.click(screen.getAllByRole('link', { name: '＋ Nytt spel' })[0]!)
    await waitFor(() => expect(gone).toEqual([`/new?server=${encodeURIComponent(run.http)}`]))
    expect(document.querySelector('.byd-home-notice')).toBeNull()
  })

  it('says a copy that was not made under the heading, named', async () => {
    run = await startServer({ auth: true, authBypass: true, plans: tiers({ projects: 1 }) })
    await login('ada@example.com')
    await made()
    home()
    await screen.findByText('Skogens råd')
    fireEvent.click(screen.getByRole('button', { name: 'Fler val för Skogens råd' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Duplicera' }))
    expect((await notice()).textContent).toBe('Skogens råd duplicerades inte. Ditt konto rymmer 1 spel, och du har 1. Ta bort ett spel du inte behöver för att få plats. Exportera det först om du vill ha det kvar.')
  })

  it('says to a test leader, by the owner’s name, that the owner’s tables are all open', async () => {
    run = await startServer({ auth: true, authBypass: true, plans: tiers({ openTables: 1 }) })
    await login('ada@example.com')
    // The owner's own name (#1254); without one she is «spelets ägare».
    await fetch(`${run.http}/me/name`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Ada' }) })
    const first = await made('Hamnen')
    const second = await made('Skogens råd')
    expect((await fetch(`${run.http}/projects/${first}/sessions`, { method: 'POST' })).status).toBe(201)
    const bo = await login('bo@example.com')
    await run.projects.share(second, bo, 'tester')
    home()
    await screen.findByText('Skogens råd')
    fireEvent.click(screen.getByRole('button', { name: 'Starta bord' }))
    expect((await notice()).textContent).toBe('Bordet startades inte. Ada har 1 av 1 bord öppna, och bord i spelet räknas mot Adas konto. Be Ada avsluta ett bord.')
    expect(document.body.textContent).not.toContain('ada@example.com')
  })
})

describe('the import at a ceiling (#1198)', () => {
  it('says the ceiling in the import’s own failure line, and the way out', async () => {
    run = await startServer({ auth: true, authBypass: true })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'quota', quota: { measure: 'projects', limit: 3, used: 3, bearer: 'you' } }), { status: 402 })))
    render(<ImportDialog http={run.http} onClose={() => undefined} onImported={async () => undefined} onOpen={() => undefined} nameOf={() => undefined} />)
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!
    fireEvent.change(input, { target: { files: [new File([new Uint8Array([80, 75, 3, 4])], 'hamnen-export.zip', { type: 'application/zip' })] } })
    const said = await screen.findByRole('alert')
    expect(said.textContent).toBe('«hamnen-export» kunde inte importeras:Ditt konto rymmer 3 spel, och du har 3. Ta bort ett spel först, så går zippen att importera sedan.')
  })
})

describe('the usage on the profile (#1198)', () => {
  const open = () => {
    history.replaceState(null, '', `/profile?server=${encodeURIComponent(run.http)}`)
    render(
      <StatusLive>
        <ProfilePage onNavigate={() => undefined} />
      </StatusLive>,
    )
  }

  it('stands between the passkeys and the language when a ceiling is set, with every measure that has one', async () => {
    run = await startServer({ auth: true, authBypass: true, ai: true, plans: tiers({ projects: 3, cardRowsPerProject: 120, openTables: 3, tablesPer30Days: 30, storageBytes: 500_000_000 }) })
    await login('ada@example.com')
    await made('Skogens råd')
    open()
    const usage = await screen.findByRole('region', { name: 'Förbrukning' })
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Namn', 'AI-nyckel', 'Passkeys', 'Förbrukning', 'Språk', 'Konto'])
    const rows = [...usage.querySelectorAll('dt')].map((dt) => `${dt.textContent} = ${dt.parentElement?.querySelector(':scope > dd > .byd-usage-n')?.textContent ?? ''}`)
    expect(rows).toEqual([
      'Spel = 1 av 3',
      'Kort per spel (unika; exemplar räknas inte) = ',
      'Skogens råd = 3 av 120',
      'Bord öppna nu = 0 av 3',
      'Bord startadede senaste 30 dygnen = 0 av 30',
      'Lagringbilder och typsnitt i alla versioner av dina spel = 0 MB av 500 MB',
    ])
    expect(within(usage).getByText('Ingenting låses av ett tak: du kan fortfarande öppna, spela, ändra, exportera och ta bort.')).toBeTruthy()
  })

  it('says only the measures that have a ceiling', async () => {
    run = await startServer({ auth: true, authBypass: true, ai: true, plans: tiers({ openTables: 2 }) })
    await login('ada@example.com')
    open()
    const usage = await screen.findByRole('region', { name: 'Förbrukning' })
    expect([...usage.querySelectorAll('dt')].map((dt) => dt.textContent)).toEqual(['Bord öppna nu'])
  })

  it('is not there at all when nothing is limited, as in the beta', async () => {
    run = await startServer({ auth: true, authBypass: true, ai: true })
    await login('ada@example.com')
    await made()
    open()
    await screen.findByRole('heading', { level: 1, name: 'Profil' })
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByRole('region', { name: 'Förbrukning' })).toBeNull()
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Namn', 'AI-nyckel', 'Passkeys', 'Språk', 'Konto'])
  })
})
