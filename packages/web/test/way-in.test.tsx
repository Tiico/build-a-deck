// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { EditorPage } from '../src/editor/EditorPage.js'
import { HomePage } from '../src/account/HomePage.js'
import { projectDoc } from './project-doc.js'
import { registerRoom, startServer, type Running } from './fixture.js'

// Vägen in till ett bord (#1286, variant B). Det finns två sätt att sitta — runt en TV, eller var
// och en vid sin dator — och varje knapp som startar ett bord frågar vilket, öppnar det svaret
// säger och lämnar svaret åt bordet. Genvägarna där designern hoppade in själv är borta: ett bord
// har «Öppna bordet», som öppnar det bordet är, och i sin meny «Kopiera länk» och «Avsluta bordet».

let run: Running
afterEach(async () => {
  vi.restoreAllMocks()
  await run.stop()
})

// Fliken som öppnas i klicket, innan bordet finns, och får sin adress när starten har svarat.
type Tab = { location: { href: string }; name: string; opener: unknown; closed: boolean; close(): void }
function opening() {
  const tab: Tab = {
    location: { href: 'about:blank' },
    name: '',
    opener: window,
    closed: false,
    close() {
      this.closed = true
    },
  }
  const open = vi.spyOn(window, 'open').mockImplementation(() => tab as unknown as Window)
  return { tab, open }
}

// Svarar på «Hur sitter ni?» i fönstret som står öppet.
async function answer(how: 'screen' | 'computer', name = 'Vera'): Promise<void> {
  const user = userEvent.setup()
  const dialog = await screen.findByRole('dialog', { name: 'Starta ett bord' })
  if (how === 'computer') {
    await user.click(within(dialog).getByRole('radio', { name: 'Var och en vid sin dator' }))
    const field = within(dialog).getByRole('textbox', { name: 'Ditt namn vid bordet' })
    await user.clear(field)
    await user.type(field, name)
    await user.click(within(dialog).getByRole('button', { name: 'Starta och sätt dig' }))
  } else {
    await user.click(within(dialog).getByRole('radio', { name: 'Runt en skärm' }))
    await user.click(within(dialog).getByRole('button', { name: 'Starta' }))
  }
}

const listed = async (project: string): Promise<{ id: string; code?: string; seating?: string }[]> => (await (await fetch(`${run.http}/projects/${project}/sessions`)).json()) as { id: string; code?: string; seating?: string }[]

const seatingOf = async (code: string): Promise<string | undefined> => ((await (await fetch(`${run.http}/rooms/${code}`)).json()) as { seating?: string }).seating

const at = (href: string) => new URL(href, location.origin)

// En rad på Bord-fliken. Grupperna med bord som inte spelas ligger hopfällda (#176), och en
// hopfälld grupp ritar inga rader, så vecken fälls ut tills raden står där.
async function rowOf(id: string): Promise<HTMLElement> {
  const user = userEvent.setup()
  return waitFor(async () => {
    for (const fold of [...document.querySelectorAll<HTMLElement>('.byd-tables-fold[aria-expanded="false"]')]) await user.click(fold)
    const row = document.querySelector<HTMLElement>(`[data-session="${CSS.escape(id)}"]`)
    expect(row).not.toBeNull()
    return row!
  })
}

describe('every start in the editor asks how you sit, and the table keeps the answer (#1286)', () => {
  beforeEach(async () => {
    run = await startServer()
    localStorage.clear()
    await run.projects.create(run.projectId, projectDoc())
  })
  const header = () => document.querySelector('header')!
  async function openEditor(): Promise<void> {
    history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')
  }
  async function startFromApi(seating?: 'screen' | 'computer'): Promise<{ id: string; code: string }> {
    const res = await fetch(`${run.http}/projects/${run.projectId}/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(seating ? { seating } : {}) })
    const made = (await res.json()) as { id: string; code: string; hostKey: string }
    registerRoom(made.id, made)
    return made
  }

  it('sends the answer with the header’s «Starta bord»', async () => {
    const user = userEvent.setup()
    opening()
    await openEditor()
    await user.click(within(header()).getByRole('button', { name: 'Starta bord' }))
    await answer('computer')
    const code = (await screen.findByText((_, el) => el?.hasAttribute('data-room-code') ?? false)).textContent!
    expect(await seatingOf(code)).toBe('computer')
  })

  it('asks in the Bord tab’s «Starta nytt bord», and opens what the answer says', async () => {
    const user = userEvent.setup()
    const { tab } = opening()
    await openEditor()
    await user.click(screen.getByRole('tab', { name: 'Bord' }))
    await user.click(await screen.findByRole('button', { name: 'Starta nytt bord' }))
    await answer('computer', 'Vera')
    await waitFor(() => expect(tab.location.href).toMatch(/\/online\?/))
    const q = at(tab.location.href).searchParams
    expect([q.get('seat'), q.has('name'), q.get('owner')]).toEqual(['A', false, '1'])
    const [table] = await listed(run.projectId)
    expect(table?.seating).toBe('computer')
  })

  it('asks in the caret menu’s «Nytt bord», after saying a table runs', async () => {
    const user = userEvent.setup()
    const { tab } = opening()
    await startFromApi('screen')
    await openEditor()
    // Ett bord som kör är huvudets bord först när editorn har plockat upp det.
    await user.click(await within(header()).findByRole('button', { name: 'Fler sätt att öppna bordet' }))
    await user.click(await screen.findByRole('button', { name: 'Nytt bord' }))
    await user.click(screen.getByRole('button', { name: 'Starta ett nytt ändå' }))
    await answer('screen')
    await waitFor(() => expect(tab.location.href).toMatch(/\/table\?/))
    expect(at(tab.location.href).searchParams.get('mode')).toBe('tv')
    const tables = await listed(run.projectId)
    expect(tables.map((t) => t.seating).sort()).toEqual(['screen', 'screen'])
  })

  it('gives a table one way in, «Öppna bordet», and a menu of «Kopiera länk» and «Avsluta bordet»', async () => {
    const user = userEvent.setup()
    const made = await startFromApi('screen')
    await openEditor()
    await user.click(screen.getByRole('tab', { name: 'Bord' }))
    const row = await rowOf(made.id)
    const open = within(row).getByRole('link', { name: /^Öppna bordet/ })
    const href = at(open.getAttribute('href')!)
    expect([href.pathname, href.searchParams.get('mode'), href.searchParams.get('owner')]).toEqual(['/table', 'tv', '1'])
    expect(open.getAttribute('target')).toBe(`byd-tv-${made.id}`)
    await user.click(within(row).getByRole('button', { name: /^Fler val för bordet / }))
    const menu = within(row).getByRole('menu')
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent?.replace(made.code, '').trim())).toEqual(['Kopiera länk', 'Avsluta bordet'])
    // Ingen av genvägarna där designern hoppade in själv står kvar någonstans på raden.
    expect(row.textContent).not.toMatch(/Spela härifrån|Bordsläge|Titta på|QR för telefoner|TV-vyn/)
  })

  it('copies the room’s address, never the code alone', async () => {
    const user = userEvent.setup()
    const made = await startFromApi('computer')
    await openEditor()
    await user.click(screen.getByRole('tab', { name: 'Bord' }))
    const row = await rowOf(made.id)
    await user.click(within(row).getByRole('button', { name: /^Fler val för bordet / }))
    await user.click(within(row).getByRole('menuitem', { name: /^Kopiera länk/ }))
    // userEvent stands in for the clipboard, so what was copied is read back from it.
    expect(await screen.findByText('Länken är kopierad. Skicka den till dem som ska spela.')).toBeTruthy()
    expect(at(await navigator.clipboard.readText()).pathname).toBe(`/${made.code}`)
  })

  it('opens a table of computers at the host’s own seat, under her name, when she started it here', async () => {
    const user = userEvent.setup()
    opening()
    await openEditor()
    await user.click(within(header()).getByRole('button', { name: 'Starta bord' }))
    await answer('computer', 'Vera')
    const [table] = await waitFor(async () => {
      const tables = await listed(run.projectId)
      expect(tables).toHaveLength(1)
      return tables
    })
    await user.click(screen.getByRole('tab', { name: 'Bord' }))
    const row = await rowOf(table!.id)
    const href = at(within(row).getByRole('link', { name: /^Öppna bordet/ }).getAttribute('href')!)
    expect([href.pathname, href.searchParams.get('seat'), href.searchParams.has('name'), href.searchParams.get('owner')]).toEqual(['/online', 'A', false, '1'])
  })

  it('opens a table of computers it did not start here at the room’s own address, where a seat is chosen', async () => {
    const user = userEvent.setup()
    const made = await startFromApi('computer')
    await openEditor()
    await user.click(screen.getByRole('tab', { name: 'Bord' }))
    const row = await rowOf(made.id)
    expect(at(within(row).getByRole('link', { name: /^Öppna bordet/ }).getAttribute('href')!).pathname).toBe(`/${made.code}`)
  })

  it('has no «Spela härifrån» in the caret menu either', async () => {
    const user = userEvent.setup()
    await startFromApi('screen')
    await openEditor()
    await user.click(await within(header()).findByRole('button', { name: 'Fler sätt att öppna bordet' }))
    const ways = await screen.findByRole('group', { name: /bord/i })
    await waitFor(() => expect(within(ways).getByRole('link', { name: /^Öppna bordet/ })).toBeTruthy())
    expect(ways.textContent).not.toMatch(/Spela härifrån|Bordsläge|Titta på|QR för telefoner/)
  })
})

describe('Mina spel starts a table the same way (#1286)', () => {
  beforeEach(async () => {
    run = await startServer({ auth: true })
    localStorage.clear()
    await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'ada@example.com' }) })
    const link = /\/auth\/verify\?token=\S+/.exec(run.mail.sent.at(-1)?.text ?? '')?.[0] ?? ''
    await fetch(`${run.http}${link}`, { redirect: 'manual' })
    await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: run.projectId, ...projectDoc() }) })
  })
  async function home(): Promise<HTMLElement> {
    history.replaceState(null, '', `/?server=${encodeURIComponent(run.http)}`)
    render(<HomePage />)
    await screen.findByText('Skogens herrar')
    return screen.getByRole('region', { name: 'Fortsätt där du slutade' })
  }

  it('asks how you sit from the hero’s «Starta bord», opens the answer, and the table keeps it', async () => {
    const { tab } = opening()
    const hero = await home()
    fireEvent.click(within(hero).getByRole('button', { name: 'Starta bord' }))
    await answer('computer', 'Vera')
    await waitFor(() => expect(tab.location.href).toMatch(/\/online\?/))
    const q = at(tab.location.href).searchParams
    expect([q.get('seat'), q.has('name'), q.get('owner')]).toEqual(['A', false, '1'])
    const [table] = await listed(run.projectId)
    expect(table?.seating).toBe('computer')
    // Och «Öppna bordet» leder sedan tillbaka till samma plats.
    const back = await within(hero).findByRole('link', { name: /^Öppna bordet [A-Z2-9]{6} i Skogens herrar/ })
    expect(at(back.getAttribute('href')!).pathname).toBe('/online')
  })

  it('cancels without starting anything', async () => {
    opening()
    const hero = await home()
    fireEvent.click(within(hero).getByRole('button', { name: 'Starta bord' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Starta ett bord' })).getByRole('button', { name: 'Avbryt' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(await listed(run.projectId)).toHaveLength(0)
  })

  // A table just started has not been played, so its band is «Startade, aldrig spelade» (#1376),
  // in the form of «Pågår nu» and with the same way to its screen.
  it('opens a table around a TV at its screen from its band', async () => {
    const made = (await (await fetch(`${run.http}/projects/${run.projectId}/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ seating: 'screen' }) })).json()) as { id: string; code: string }
    await home()
    cleanup()
    render(<HomePage />)
    const now = await screen.findByRole('region', { name: 'Startade, aldrig spelade' })
    const open = await within(now).findByRole('link', { name: new RegExp(`Öppna bordet ${made.code}`) })
    expect(at(open.getAttribute('href')!).pathname).toBe('/table')
  })
})
