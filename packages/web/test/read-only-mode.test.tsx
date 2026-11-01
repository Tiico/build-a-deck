// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { HomePage } from '../src/account/HomePage.js'
import { EditorPage } from '../src/editor/EditorPage.js'
import { StatusLive } from '../src/status/StatusLive.js'
import { plansFromEnv } from '../../server/src/quotas.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'

// The read-only mode L2 as the designer meets it (#1492, beställarens beslut variant A, G5): her Pro
// has lapsed and the account is held to the free tier. In Mina spel a game in read-only mode wears a
// mark and its reason, its buttons are the ones that work, and one band under the heading says why
// once. In the editor it is #489's reading band with the mode's own sentence; an edit the mode does
// not let through is refused here before it is sent, and one that only makes the game smaller
// (#1511) goes as usual. A co-editor hears whose it is, by the owner's name, never her tier.
let run: Running
afterEach(async () => {
  vi.restoreAllMocks()
  localStorage.clear()
  await run.stop()
})

const tiers = plansFromEnv({ BYD_PLANS: JSON.stringify({ default: 'free', plans: { free: { projects: 2, cardRowsPerProject: 3 }, pro: {} } }) })
const login = async (email: string): Promise<{ id: string; cookie: string }> => {
  await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
  return { id: (await run.auth!.accountByEmail(email))!.id, cookie: document.cookie }
}
const tick = () => new Promise((r) => setTimeout(r, 5))
const made = async (name: string, rows = 3): Promise<string> => {
  const doc = projectDoc()
  const extra = Array.from({ length: Math.max(0, rows - doc.rows.length) }, (_, i) => ({ id: `extra-${i}`, fields: { title: `Extra ${i}`, body: '', antal: 1 } }))
  const res = await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...doc, name, rows: [...doc.rows, ...extra] }) })
  expect(res.status).toBe(201)
  await tick()
  return ((await res.json()) as { id: string }).id
}
// Ada had Pro and four games; Pro lapses. Newest first: Skogens herrar has four cards, over the free
// tier's three, and takes no place; Fyren and Kajen fit; Hamnen is past the two games Gratis holds.
const FOUR: [string, number][] = [['Hamnen', 3], ['Kajen', 3], ['Fyren', 3], ['Skogens herrar', 4]]
const lapsed = async (games: [string, number][] = FOUR) => {
  run = await startServer({ auth: true, authBypass: true, plans: tiers })
  const ada = await login('ada@example.com')
  await run.accountPlans!.setPlan(ada.id, 'pro', 'operator')
  const ids: Record<string, string> = {}
  for (const [name, rows] of games) ids[name] = await made(name, rows)
  await run.accountPlans!.lapse(ada.id)
  return { ada, hamnen: ids['Hamnen']!, kajen: ids['Kajen']!, fyren: ids['Fyren']!, skogen: ids['Skogens herrar']! }
}
const home = (): void => {
  history.replaceState(null, '', `/?server=${encodeURIComponent(run.http)}`)
  render(
    <StatusLive>
      <HomePage onNavigate={() => undefined} />
    </StatusLive>,
  )
}
const gameOf = (id: string): HTMLElement => document.querySelector<HTMLElement>(`.byd-home-game[data-project="${id}"]`)!

describe('Mina spel for a lapsed account (#1492)', () => {
  it('says once, under the heading, how many games are read-only and why, and the way back', async () => {
    await lapsed()
    home()
    const band = await screen.findByRole('region', { name: 'Läsläge' })
    expect(band.textContent).toBe(
      '2 spel är i läsläge. Ditt abonnemang har gått ut, och kontot rymmer nu det som Gratis rymmer. Spelen i läsläge går att öppna, läsa och exportera, men inte ändra eller starta bord ur.' +
        'Ingenting tas bort. Ett spel blir som vanligt igen när det ryms: ta bort kort, exemplar eller bilder ur det, eller ta bort ett annat spel.' +
        'Stäng',
    )
    // Closed, it stays closed in this browser, and the marks on the games remain.
    fireEvent.click(within(band).getByRole('button', { name: 'Stäng' }))
    expect(screen.queryByRole('region', { name: 'Läsläge' })).toBeNull()
  })

  it('marks each game in read-only mode with its reason, and gives it the buttons that work', async () => {
    const g = await lapsed()
    home()
    await screen.findByRole('region', { name: 'Läsläge' })
    // The hero is the game saved last, read-only for its cards: «Exportera…» where «Starta bord» stood.
    const hero = gameOf(g.skogen)
    await waitFor(() => expect(within(hero).getByText('Läsläge')).toBeTruthy())
    expect(hero.querySelector('[data-read-only-why]')?.textContent).toBe('4 kort, och Gratis rymmer 3 per spel.')
    expect(within(hero).queryByRole('button', { name: 'Starta bord' })).toBeNull()
    expect(within(hero).getByRole('button', { name: 'Exportera…' })).toBeTruthy()
    // A row past the number of games.
    const hamnen = gameOf(g.hamnen)
    expect(within(hamnen).getByText('Läsläge')).toBeTruthy()
    expect(hamnen.querySelector('[data-read-only-why]')?.textContent).toBe('Utöver de 2 spel som Gratis rymmer.')
    // The games that fit look as they do today.
    expect(within(gameOf(g.kajen)).queryByText('Läsläge')).toBeNull()
    // The ⋯ keeps its choices, and says why the ones that write do not go.
    fireEvent.click(within(hamnen).getByRole('button', { name: 'Fler val för Hamnen' }))
    const menu = await screen.findByRole('group', { name: 'Val för Hamnen' })
    for (const name of ['Starta bord', 'Byt namn…', 'Duplicera']) {
      const item = within(menu).getByRole('button', { name: new RegExp(`^${name}`) })
      expect(item.getAttribute('aria-disabled')).toBe('true')
      expect(item.textContent).toBe(`${name}Inte i läsläge`)
    }
    expect(within(menu).getByRole('button', { name: 'Exportera…' }).getAttribute('aria-disabled')).toBeNull()
  })

  it('looks as it does today for an account whose tier holds', async () => {
    run = await startServer({ auth: true, authBypass: true, plans: tiers })
    const ada = await login('ada@example.com')
    await run.accountPlans!.setPlan(ada.id, 'pro', 'operator')
    await made('Skogens herrar', 4)
    home()
    await screen.findByText('Skogens herrar')
    await new Promise((r) => setTimeout(r, 100))
    expect(screen.queryByRole('region', { name: 'Läsläge' })).toBeNull()
    expect(screen.queryByText('Läsläge')).toBeNull()
  })
})

const editor = async (project: string): Promise<void> => {
  history.replaceState(null, '', `/editor?project=${project}&server=${encodeURIComponent(run.http)}`)
  render(
    <StatusLive>
      <EditorPage onNavigate={() => undefined} />
    </StatusLive>,
  )
  fireEvent.click(await screen.findByRole('tab', { name: 'Tabell' }))
}
const reading = async (): Promise<HTMLElement> => {
  await waitFor(() => expect(document.querySelector('#byd-editor-reading')).not.toBeNull())
  return document.querySelector<HTMLElement>('#byd-editor-reading')!
}

describe('the editor on a game in read-only mode (#1492)', () => {
  it('says before any edit, in the reading band, why the game cannot be changed and what still goes', async () => {
    const g = await lapsed()
    await editor(g.skogen)
    const band = await reading()
    await waitFor(() => expect(band.textContent).toContain('Skogens herrar har 4 kort, och Gratis rymmer 3 per spel.'))
    expect(band.querySelector('b')?.textContent).toBe('Läsläge')
    expect(band.textContent).toContain('Du kan läsa, söka, jämföra versioner och exportera, och ta bort kort, exemplar och bilder. Spelet går att ändra igen när det ryms.')
  })

  it('refuses an edit that changes the game before it is sent, and lets one through that makes it smaller', async () => {
    // Two games: Skogens herrar, over the cards, has a place to take once it is made smaller.
    const g = await lapsed([['Kajen', 3], ['Skogens herrar', 4]])
    await editor(g.skogen)
    await reading()
    const logged = async () => JSON.stringify(await run.projects.readEdits(g.skogen, 0))
    const title = await screen.findByDisplayValue('Drake')
    fireEvent.change(title, { target: { value: 'Draken' } })
    fireEvent.blur(title)
    await waitFor(() => expect(document.querySelector('.byd-editor-reading-said')?.textContent).toBe('Läsläge: bara att ta bort kort, sänka Antal och ta bort bilder sparas.'))
    expect(await logged()).not.toContain('Draken')
    expect((screen.getAllByDisplayValue('Drake')).length).toBeGreaterThan(0)
    // Taking a card away goes, and the game, three cards now, fits: the band goes.
    fireEvent.click(screen.getByRole('button', { name: 'ta bort extra-0' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Ja, ta bort' }))
    await waitFor(async () => expect(await logged()).toContain('"removeRow"'))
    await waitFor(() => expect(document.querySelector('#byd-editor-reading')).toBeNull())
  })

  it('tells a co-editor whose game it is, by her name, and not her tier', async () => {
    const g = await lapsed()
    await run.auth!.setName(g.ada.id, 'Ada')
    const bo = await login('bo@example.com')
    await run.projects.share(g.skogen, bo.id, 'editor')
    await editor(g.skogen)
    const band = await reading()
    await waitFor(() => expect(band.textContent).toContain('Skogens herrar ligger över det Adas konto rymmer just nu, så ingen kan ändra det.'))
    expect(band.textContent).not.toContain('Gratis')
  })
})
