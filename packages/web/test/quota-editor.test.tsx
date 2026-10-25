// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { EditorPage } from '../src/editor/EditorPage.js'
import { StatusLive } from '../src/status/StatusLive.js'
import { plansFromEnv, type Plans } from '../../server/src/quotas.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { answerStart } from './start-answer.js'

// A met ceiling where the press was, in the editor (#1198, variant A): the band under the header for
// an edit or a save, the line under «Starta nytt bord» in the Bord tab (L31), and the upload's own
// line in Media — for the owner, and for a co-editor or a test leader, who hears the owner's name.
let run: Running
afterEach(async () => {
  vi.restoreAllMocks()
  await run.stop()
})

const tiers = (free: Record<string, number>): Plans => plansFromEnv({ BYD_PLANS: JSON.stringify({ default: 'free', plans: { free } }) })
const login = async (email: string): Promise<string> => {
  await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
  return (await run.auth!.accountByEmail(email))!.id
}
const made = async (doc: object = projectDoc()): Promise<string> => {
  const res = await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(doc) })
  expect(res.status).toBe(201)
  return ((await res.json()) as { id: string }).id
}
const editor = async (project: string, tab: string): Promise<void> => {
  history.replaceState(null, '', `/editor?project=${project}&server=${encodeURIComponent(run.http)}`)
  render(
    <StatusLive>
      <EditorPage onNavigate={() => undefined} />
    </StatusLive>,
  )
  await screen.findByText('Skogens herrar')
  fireEvent.click(await screen.findByRole('tab', { name: tab }))
}
const band = async (): Promise<HTMLElement> => {
  await waitFor(() => expect(document.querySelector('.byd-editor-notice')).not.toBeNull())
  return document.querySelector<HTMLElement>('.byd-editor-notice')!
}

describe('a card over the ceiling, in the band (#1198)', () => {
  it('says to the owner that the card was not added, how many the game has, and the way out', async () => {
    run = await startServer({ auth: true, authBypass: true, plans: tiers({ cardRowsPerProject: 3 }) })
    await login('ada@example.com')
    const id = await made()
    await editor(id, 'Tabell')
    fireEvent.click(await screen.findByRole('button', { name: '+ Nytt kort' }))
    const said = await band()
    expect(said.getAttribute('role')).toBe('alert')
    expect(said.textContent).toBe('Kortet lades inte till. Skogens herrar har 3 av 3 kort, så många som ett spel rymmer på ditt konto. Ta bort eller slå ihop kort för att få plats. Fler exemplar av ett kort går alltid: ändra Antal.')
    expect(said.querySelector('b')?.textContent).toBe('Kortet lades inte till.')
  })

  it('names the owner to a co-editor by the name she gave her account, and never her address', async () => {
    run = await startServer({ auth: true, authBypass: true, plans: tiers({ cardRowsPerProject: 3 }) })
    await login('ada@example.com')
    // The name is the account's own (#1254); an owner without one is «spelets ägare».
    await fetch(`${run.http}/me/name`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Ada' }) })
    const id = await made()
    const bo = await login('bo@example.com')
    await run.projects.share(id, bo, 'editor')
    await editor(id, 'Tabell')
    fireEvent.click(await screen.findByRole('button', { name: '+ Nytt kort' }))
    expect((await band()).textContent).toBe('Kortet lades inte till. Skogens herrar har 3 av 3 kort, så många som Adas konto rymmer per spel. Ta bort eller slå ihop kort, eller fråga Ada. Fler exemplar av ett kort går alltid: ändra Antal.')
    expect(document.body.textContent).not.toContain('ada@example.com')
  })

  it('says a refusal for anything else as it always did, with every ceiling null', async () => {
    run = await startServer({ auth: true, authBypass: true })
    await login('ada@example.com')
    const id = await made()
    await editor(id, 'Tabell')
    fireEvent.click(await screen.findByRole('button', { name: '+ Nytt kort' }))
    await waitFor(() => expect(document.querySelectorAll('tbody tr').length).toBeGreaterThan(3))
    await new Promise((r) => setTimeout(r, 100))
    expect(document.querySelector('.byd-editor-notice')).toBeNull()
  })
})

describe('a table over the ceiling, under «Starta nytt bord» (#1198)', () => {
  it('says to the owner how many tables are open, and the way out', async () => {
    run = await startServer({ auth: true, authBypass: true, plans: tiers({ openTables: 1 }) })
    await login('ada@example.com')
    const other = await made({ ...projectDoc(), name: 'Hamnen' })
    expect((await fetch(`${run.http}/projects/${other}/sessions`, { method: 'POST' })).status).toBe(201)
    const id = await made()
    await editor(id, 'Bord')
    fireEvent.click(await screen.findByRole('button', { name: 'Starta nytt bord' }))
    await answerStart()
    await waitFor(() => expect(document.querySelector('.byd-tables-failed')).not.toBeNull())
    const line = document.querySelector<HTMLElement>('.byd-tables-failed')!
    expect(line.getAttribute('role')).toBe('alert')
    expect(line.querySelector('span')?.textContent).toBe('Bordet startades inte. Du har 1 av 1 bord öppna. Avsluta ett bord som ingen spelar vid, eller öppna ett som redan kör och uppdatera det till version 1.')
    expect(within(line).getByRole('button', { name: 'Försök igen' })).toBeTruthy()
  })

  it('says to a test leader that the tables are the owner’s, by name', async () => {
    run = await startServer({ auth: true, authBypass: true, plans: tiers({ openTables: 1 }) })
    await login('ada@example.com')
    await fetch(`${run.http}/me/name`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Ada' }) })
    const other = await made({ ...projectDoc(), name: 'Hamnen' })
    expect((await fetch(`${run.http}/projects/${other}/sessions`, { method: 'POST' })).status).toBe(201)
    const id = await made()
    const bo = await login('bo@example.com')
    await run.projects.share(id, bo, 'tester')
    await editor(id, 'Bord')
    fireEvent.click(await screen.findByRole('button', { name: 'Starta nytt bord' }))
    await answerStart()
    await waitFor(() => expect(document.querySelector('.byd-tables-failed span')).not.toBeNull())
    expect(document.querySelector('.byd-tables-failed span')?.textContent).toBe('Bordet startades inte. Ada har 1 av 1 bord öppna, och bord i spelet räknas mot Adas konto. Be Ada avsluta ett bord.')
  })
})

describe('an upload over the ceiling on storage, in Media (#1198)', () => {
  // A picture nobody has uploaded, of exactly `size` bytes: a PNG signature and bytes of its own.
  let pictures = 0
  const picture = (size: number): File => {
    const head = [137, 80, 78, 71, 13, 10, 26, 10, ...new TextEncoder().encode(`${++pictures}-${Date.now()}-`)]
    return new File([new Uint8Array([...head, ...new Array<number>(size - head.length).fill(7)])], 'skog-baksida.png', { type: 'image/png' })
  }

  it('names the game in the upload, so the ceiling is asked there, and says it on the upload’s line', async () => {
    run = await startServer({ auth: true, authBypass: true, plans: tiers({ storageBytes: 1_000_000 }) })
    await login('ada@example.com')
    // What the account already uses: a picture a version of one of its games names.
    const first = await fetch(`${run.http}/assets`, { method: 'POST', headers: { 'content-type': 'image/png' }, body: picture(900_000) })
    const { hash } = (await first.json()) as { hash: string }
    const id = await made({ ...projectDoc(), pictures: { [hash]: { name: 'skogen' } } })
    const asked: string[] = []
    const real = globalThis.fetch
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      asked.push(String(input instanceof Request ? input.url : input))
      return real(input, init)
    })
    await editor(id, 'Media')
    fireEvent.change(screen.getByLabelText('Ladda upp media'), { target: { files: [picture(300_000)] } })
    await waitFor(() => expect(document.querySelector('.byd-media-said[data-quota]')).not.toBeNull())
    const line = document.querySelector<HTMLElement>('.byd-media-said[data-quota]')!
    expect(line.querySelector('b')?.textContent).toBe('Bilden skog-baksida.png kunde inte laddas upp och har tagits bort igen:')
    expect(line.textContent).toBe(
      'Bilden skog-baksida.png kunde inte laddas upp och har tagits bort igen: kontots lagring har 0,1 MB kvar av 1 MB, och bilden är 300 kB.Att ta bort en bild ur spelet frigör ingenting, eftersom historiken behåller den; ett spel som tas bort frigör sitt.',
    )
    expect(asked.some((url) => url === `${run.http}/assets?project=${id}`)).toBe(true)
  })
})
