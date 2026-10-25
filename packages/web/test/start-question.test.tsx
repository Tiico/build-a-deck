// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { EditorPage } from '../src/editor/EditorPage.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'

// Starta frågar hur ni sitter (L77, #1130): en gång, innan bordet finns, och svaret väljer vilken
// skärm värden får — TV:n i ett rum, eller sin egen plats vid bordet på `/online`.

let run: Running
beforeEach(async () => {
  run = await startServer()
  localStorage.clear()
})
afterEach(async () => {
  vi.restoreAllMocks()
  await run.stop()
})

// Fliken som öppnas i klicket, innan bordet finns, och får sin adress när starten har svarat. En
// webbläsare som stoppar nya fönster svarar `null`.
type Tab = { location: { href: string }; name: string; opener: unknown; closed: boolean; close(): void }
function opening(blocked = false) {
  const tab: Tab = {
    location: { href: 'about:blank' },
    name: '',
    opener: window,
    closed: false,
    close() {
      this.closed = true
    },
  }
  const open = vi.spyOn(window, 'open').mockImplementation(() => (blocked ? null : (tab as unknown as Window)))
  return { tab, open }
}

async function openEditor(): Promise<void> {
  await run.projects.create(run.projectId, projectDoc())
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
}

async function tablesOfTheGame(): Promise<number> {
  const res = await fetch(`${run.http}/projects/${run.projectId}/sessions`)
  return ((await res.json()) as unknown[]).length
}

const header = () => document.querySelector('header')!

describe('Starta on a game without a table (L77)', () => {
  it('asks how you sit before anything starts, and Avbryt starts nothing and hands the keys back', async () => {
    const user = userEvent.setup()
    opening()
    await openEditor()
    const start = within(header()).getByRole('button', { name: 'Starta bord' })
    await user.click(start)

    const dialog = await screen.findByRole('dialog', { name: 'Starta ett bord' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    const how = within(dialog).getByRole('radiogroup', { name: 'Hur sitter ni?' })
    expect(within(how).getAllByRole('radio').map((r) => r.getAttribute('aria-describedby') !== null)).toEqual([true, true])
    expect(within(how).getByRole('radio', { name: 'Runt en skärm' })).toBeTruthy()
    expect(within(how).getByRole('radio', { name: 'Var och en vid sin dator' })).toBeTruthy()
    // Inget bord innan frågan är besvarad.
    expect(document.querySelector('[data-room-code]')).toBeNull()

    await user.click(within(dialog).getByRole('button', { name: 'Avbryt' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(start)
    expect(await tablesOfTheGame()).toBe(0)
  })

  it('closes on Escape like every other door', async () => {
    const user = userEvent.setup()
    opening()
    await openEditor()
    await user.click(within(header()).getByRole('button', { name: 'Starta bord' }))
    await screen.findByRole('dialog', { name: 'Starta ett bord' })
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(await tablesOfTheGame()).toBe(0)
  })

  it('«Var och en vid sin dator» asks your name and seats you at /online under it, as owner, with the room', async () => {
    const user = userEvent.setup()
    const { tab, open } = opening()
    await openEditor()
    await user.click(within(header()).getByRole('button', { name: 'Starta bord' }))
    const dialog = await screen.findByRole('dialog', { name: 'Starta ett bord' })
    expect(within(dialog).queryByRole('textbox', { name: 'Ditt namn vid bordet' })).toBeNull()
    await user.click(within(dialog).getByRole('radio', { name: 'Var och en vid sin dator' }))

    const name = within(dialog).getByRole('textbox', { name: 'Ditt namn vid bordet' })
    const go = within(dialog).getByRole('button', { name: 'Starta och sätt dig' })
    // Ett namn är vad de andra ser vid bordet; utan ett finns inget att sätta sig under.
    expect((go as HTMLButtonElement).disabled).toBe(true)
    await user.type(name, 'Vera')
    await user.click(go)

    // Fliken öppnas i klicket, där webbläsaren tillåter det, och får adressen när bordet finns.
    // Den behåller sin öppnare (#1217): utan den hittar bordets väg tillbaka aldrig editorns flik.
    expect(open).toHaveBeenCalledTimes(1)
    expect(tab.opener).toBe(window)
    const code = (await screen.findByText((_, el) => el?.hasAttribute('data-room-code') ?? false)).textContent!
    await waitFor(() => expect(tab.location.href).toMatch(new RegExp(`^${location.origin}/online\\?`)))
    const q = new URL(tab.location.href).searchParams
    expect(q.get('seat')).toBe('A')
    // Her name is in no address (#1306): this browser remembers it for the seat.
    expect(q.has('name')).toBe(false)
    expect(q.get('owner')).toBe('1')
    expect(q.get('code')).toBe(code)
    expect(q.get('session')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('«Runt en skärm» starts the table as before and opens its screen', async () => {
    const user = userEvent.setup()
    const { tab } = opening()
    await openEditor()
    await user.click(within(header()).getByRole('button', { name: 'Starta bord' }))
    const dialog = await screen.findByRole('dialog', { name: 'Starta ett bord' })
    await user.click(within(dialog).getByRole('radio', { name: 'Runt en skärm' }))
    expect(within(dialog).queryByRole('textbox')).toBeNull()
    await user.click(within(dialog).getByRole('button', { name: 'Starta' }))

    await screen.findByText((_, el) => el?.hasAttribute('data-room-code') ?? false)
    await waitFor(() => expect(tab.location.href).toMatch(new RegExp(`^${location.origin}/table\\?`)))
    const q = new URL(tab.location.href).searchParams
    expect(q.get('mode')).toBe('tv')
    // The key is in the fragment, which goes in no request (#1306).
    expect(q.has('host')).toBe(false)
    expect(new URLSearchParams(new URL(tab.location.href).hash.slice(1)).get('host')).toBeTruthy()
  })

  it('says so in the band, with the way in as a link, when the browser stops the new window', async () => {
    const user = userEvent.setup()
    opening(true)
    await openEditor()
    await user.click(within(header()).getByRole('button', { name: 'Starta bord' }))
    const dialog = await screen.findByRole('dialog', { name: 'Starta ett bord' })
    await user.click(within(dialog).getByRole('radio', { name: 'Var och en vid sin dator' }))
    await user.type(within(dialog).getByRole('textbox', { name: 'Ditt namn vid bordet' }), 'Vera')
    await user.click(within(dialog).getByRole('button', { name: 'Starta och sätt dig' }))

    const band = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('.byd-editor-table-link')
      expect(el).toBeTruthy()
      return el!
    })
    const link = await within(band).findByRole('link', { name: 'Sätt dig vid bordet' })
    expect(band.textContent).toContain('Webbläsaren öppnade inget nytt fönster')
    expect(link.getAttribute('href')).toMatch(/^\/online\?.*owner=1/)
    // Bordets egen flik för platsen (#1217): ett andra tryck tar fram den i stället för en till.
    expect(link.getAttribute('target')).toMatch(/^byd-online-/)
  })

  it('remembers the answer and the name for the next table', async () => {
    const user = userEvent.setup()
    opening()
    await openEditor()
    await user.click(within(header()).getByRole('button', { name: 'Starta bord' }))
    let dialog = await screen.findByRole('dialog', { name: 'Starta ett bord' })
    await user.click(within(dialog).getByRole('radio', { name: 'Var och en vid sin dator' }))
    await user.type(within(dialog).getByRole('textbox', { name: 'Ditt namn vid bordet' }), 'Vera')
    await user.click(within(dialog).getByRole('button', { name: 'Starta och sätt dig' }))
    await screen.findByText((_, el) => el?.hasAttribute('data-room-code') ?? false)

    // Ett annat spel, en annan dag: svaret är värdens och inte spelets, så det står förvalt där.
    cleanup()
    await run.projects.create(run.otherProjectId, projectDoc())
    history.replaceState(null, '', `/editor?project=${run.otherProjectId}&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')
    await user.click(within(header()).getByRole('button', { name: 'Starta bord' }))
    dialog = await screen.findByRole('dialog', { name: 'Starta ett bord' })
    expect((within(dialog).getByRole('radio', { name: 'Var och en vid sin dator' }) as HTMLInputElement).checked).toBe(true)
    expect((within(dialog).getByRole('textbox', { name: 'Ditt namn vid bordet' }) as HTMLInputElement).value).toBe('Vera')
  })

  it('asks nothing once a table runs: «Uppdatera bordet» just updates', async () => {
    const user = userEvent.setup()
    opening()
    await openEditor()
    await user.click(within(header()).getByRole('button', { name: 'Starta bord' }))
    const dialog = await screen.findByRole('dialog', { name: 'Starta ett bord' })
    await user.click(within(dialog).getByRole('button', { name: 'Starta' }))
    await screen.findByText((_, el) => el?.hasAttribute('data-room-code') ?? false)
    await run.completeRenders()
    await user.click(await within(header()).findByRole('button', { name: 'Uppdatera bordet' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
