// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MAX_PLAYERS } from '@byd/server/doc'
import { NewProjectPage } from '../src/wizard/NewProjectPage.js'
import { startServer, type Running } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'
import { watchFontNet, type FontNet } from './font-net.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// A picture the designer picks, as a picture actually is: the server reads the bytes and not the
// name, so a file called drake.png that is not one never becomes an asset (#204).
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])

let run: Running
// Den guidade starten hämtar startramens ansikte när spelet skapas (#420), och den trafiken går
// inte ut på riktigt här: `watchFontNet` svarar på katalogens två adresser och på filen bygget
// bär, och lämnar allt annat — bland annat den här sviten egen server — i fred.
let net: FontNet
beforeEach(async () => {
  run = await startServer()
  net = watchFontNet()
})
afterEach(async () => {
  net.undo()
  await run.stop()
})

function open(onNavigate: (url: string) => void) {
  history.replaceState(null, '', `/new?server=${encodeURIComponent(run.http)}`)
  render(<NewProjectPage onNavigate={onNavigate} />)
}

describe('NewProjectPage (L6, approved prototype A)', () => {
  // The same reconciliation the editor's own panel got (K19): the wizard offered six seat counts
  // while the table seats `MAX_PLAYERS`, so a game for seven or eight could not be started at all
  // — and the two counts where a rim first carries two seats (K18) were the two nobody could ask
  // for. What is offered is what the table can hold, said once rather than written out.
  it('offers every seat count the table can hold', () => {
    open(() => undefined)
    const group = screen.getByRole('group', { name: 'Spelare' })
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(Array.from({ length: MAX_PLAYERS }, (_, i) => String(i + 1)))
  })

  it('builds starter cards graphically and shows a newly added field on every card', () => {
    open(() => undefined)

    expect(screen.queryByLabelText('Kort som CSV')).toBeNull()
    expect(screen.getByLabelText('kort 1 Titel')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '+ Textfält' }))
    expect(screen.getByLabelText('kort 1 Nytt textfält')).toBeTruthy()
    expect(screen.getByText('Placeras på mallen i editorn')).toBeTruthy()
  })

  it('lets the designer choose an image for an image field and previews it', async () => {
    open(() => undefined)
    const input = screen.getByLabelText('kort 1 Illustration') as HTMLInputElement
    expect(input.type).toBe('file')

    const file = new File([PNG], 'drake.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [file] } })
    expect(await screen.findByRole('img', { name: 'Förhandsvisning av Illustration' })).toBeTruthy()
  })

  it('builds a project from the form with a live card, and hands off to the editor', async () => {
    const gone: string[] = []
    open((url) => gone.push(url))
    const live = () => within(document.querySelector('.byd-wizard-preview') as HTMLElement)
    expect(live().getByText('Kort 1')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Spelets namn'), { target: { value: 'Skogens herrar' } })
    fireEvent.click(screen.getByRole('button', { name: /^3$/ }))
    fireEvent.change(screen.getByLabelText('kort 1 Titel'), { target: { value: 'Drake' } })
    const file = new File([PNG], 'drake.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('kort 1 Illustration'), { target: { files: [file] } })
    await screen.findByRole('img', { name: 'Förhandsvisning av Illustration' })
    fireEvent.click(screen.getByRole('button', { name: '+ Nytt kort' }))
    fireEvent.change(screen.getByLabelText('kort 2 Titel'), { target: { value: 'Riddare' } })

    fireEvent.click(screen.getByRole('button', { name: /skapa spelet och fortsätt i editorn/i }))
    await waitFor(() => expect(gone).toHaveLength(1))
    const url = new URL(gone[0]!, 'http://x')
    expect(url.pathname).toBe('/editor')
    const id = url.searchParams.get('project')!
    expect(url.searchParams.get('server')).toBe(run.http)
    const stored = await run.projects.load(id)
    expect(stored?.name).toBe('Skogens herrar')
    expect(stored?.rows.map((r) => r.id)).toEqual(['drake', 'riddare'])
    // The image went up as an asset (E1): the row points at it by hash, and the server serves it.
    // The column is the field's name as written in step 2 (#476, L44).
    const art = String(stored?.rows[0]?.fields['Illustration'])
    expect(art).toMatch(/^asset:[0-9a-f]{64}$/)
    const served = await fetch(`${run.http}/assets/${art.slice('asset:'.length)}`)
    expect(served.headers.get('content-type')).toBe('image/png')
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(PNG)
    expect(stored?.setup.seats).toEqual(['A', 'B', 'C'])
    expect(stored?.template.faces['front']?.base.map((e) => e.id)).toContain('art')
  })

  it('makes the editor the clear next step instead of offering a direct table', async () => {
    open(() => undefined)
    expect(screen.getByText('Wizarden är startpunkten')).toBeTruthy()
    // What waits in the editor is said behind the first step's question mark (L36).
    fireEvent.click(screen.getByRole('button', { name: 'Hjälp om spelet' }))
    expect((await screen.findByRole('dialog', { name: 'Hjälp om spelet' })).textContent).toMatch(/csv-verktyg väntar i editorn/i)
    expect(screen.queryByRole('button', { name: /öppna bordet/i })).toBeNull()
  })

  // Vägen framåt är inte låst utan öppen, och svarar när den trycks (#416, variant B): namnet
  // krävs fortfarande, men villkoret sägs i stället för att vara en grå knapp utan förklaring.
  // Hela svaret — beskedet, fokusflytten och att ingenting skapas — mäts i `name-required`.
  it('does not proceed without a name, and says so instead of standing locked', () => {
    const gone: string[] = []
    open((url) => gone.push(url))
    const next = screen.getByRole('button', { name: /fortsätt i editorn/i }) as HTMLButtonElement
    expect(next.disabled).toBe(false)
    fireEvent.click(next)
    expect(gone).toEqual([])
    expect(screen.getByRole('alert').textContent).toMatch(/Spelet behöver ett namn först/)
  })
})

// WCAG 2.5.3: what a control is called has to contain what is written beside it, or someone who
// says the words on the screen out loud reaches nothing. The field was labelled twice — "Spelets
// namn" over it and "Namn" in its own name — and the shorter one won (UX-kontroll 2026-09-10).
describe('the field is called what it says it is called', () => {
  it('names the game field with the words standing over it', () => {
    history.replaceState(null, '', '/new')
    render(<NewProjectPage />)
    expect(screen.getByRole('textbox', { name: 'Spelets namn' })).toBeTruthy()
  })
})

// The guided start is a door, not a gate (L42): whoever would rather build everything in the
// editor gives the game a name and its seats — the two things every game has — and goes
// straight there with no cards, no fields and no frame. The same request makes the same kind of
// document as the guided way, so the editor does not know which door it came in by (E3).
describe('a game without the guided start (L42)', () => {
  it('creates the game from the name and the seats alone, and opens the editor', async () => {
    const gone: string[] = []
    open((url) => gone.push(url))
    fireEvent.change(screen.getByLabelText('Spelets namn'), { target: { value: 'Kråkkriget' } })
    fireEvent.click(screen.getByRole('button', { name: /^4$/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Skapa ett tomt spel i editorn' }))

    await waitFor(() => expect(gone).toHaveLength(1))
    const url = new URL(gone[0]!, 'http://x')
    expect(url.pathname).toBe('/editor')
    expect(url.searchParams.get('server')).toBe(run.http)
    const stored = await run.projects.load(url.searchParams.get('project')!)
    expect(stored?.name).toBe('Kråkkriget')
    expect(stored?.setup.seats).toEqual(['A', 'B', 'C', 'D'])
    expect(stored?.rows).toEqual([])
    expect(stored?.template.faces['front']?.base).toEqual([])
    expect(stored?.template.faces['back']?.base).toEqual([])
  })

  it('asks for the name the same way the guided door does, instead of standing locked', () => {
    const gone: string[] = []
    open((url) => gone.push(url))
    const blank = screen.getByRole('button', { name: 'Skapa ett tomt spel i editorn' }) as HTMLButtonElement
    expect(blank.disabled).toBe(false)
    fireEvent.click(blank)
    expect(gone).toEqual([])
    expect(screen.getByRole('alert').textContent).toMatch(/Spelet behöver ett namn först/)
  })

  it('says what it leaves out, and is the second action beside the guided way (L13)', async () => {
    open(() => undefined)
    expect(screen.getByText('Utan guidad start')).toBeTruthy()
    expect(screen.getByText('Bygg hellre allt själv?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Hjälp om spelet' }))
    expect((await screen.findByRole('dialog', { name: 'Hjälp om spelet' })).textContent).toMatch(/utan kort, fält eller mall/i)
    const blank = screen.getByRole('button', { name: 'Skapa ett tomt spel i editorn' })
    expect(blank.classList.contains('byd-secondary')).toBe(true)
    expect(blank.classList.contains('byd-primary')).toBe(false)
  })
})

// The draft (#476): a reload, a step back or a closed tab threw away everything typed, without a
// word — and a draft kept for the login round was sent by itself on the next visit to `/new`,
// making a game nobody pressed «Skapa» for.
describe('the draft in the wizard (#476)', () => {
  it('is still there after a reload, and nothing is made by the reload', async () => {
    const gone: string[] = []
    open((u) => gone.push(u))
    fireEvent.change(screen.getByLabelText('Spelets namn'), { target: { value: 'Skogens herrar' } })
    fireEvent.change(screen.getByLabelText('kort 1 Titel'), { target: { value: 'Drake' } })
    cleanup()
    open((u) => gone.push(u))
    expect((screen.getByLabelText('Spelets namn') as HTMLInputElement).value).toBe('Skogens herrar')
    expect((screen.getByLabelText('kort 1 Titel') as HTMLInputElement).value).toBe('Drake')
    await new Promise((r) => setTimeout(r, 100))
    expect(gone).toEqual([])
  })

  it('asks before the page is left with something typed, and not before', () => {
    open(() => undefined)
    const leave = () => {
      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)
      return event.defaultPrevented
    }
    expect(leave()).toBe(false)
    fireEvent.change(screen.getByLabelText('Spelets namn'), { target: { value: 'Skogens herrar' } })
    expect(leave()).toBe(true)
  })

  it('is never sent by itself when the page is opened again later', async () => {
    sessionStorage.setItem('byd.pending-wizard', JSON.stringify({ state: { name: 'Övergivet', players: 2, frame: 'classic', fields: [], rows: [] }, server: run.http, blank: true }))
    const gone: string[] = []
    open((u) => gone.push(u))
    expect((screen.getByLabelText('Spelets namn') as HTMLInputElement).value).toBe('Övergivet')
    await new Promise((r) => setTimeout(r, 200))
    expect(gone).toEqual([])
  })
})

// A game's name is 64 characters at most (#476), and the field says so where it is written rather
// than the tile on the start page growing to sixteen lines.
describe('the game s name in the wizard (#476)', () => {
  it('stops at 64 characters and says why at the field', () => {
    open(() => undefined)
    const field = screen.getByLabelText('Spelets namn') as HTMLInputElement
    expect(field.maxLength).toBe(64)
    expect(screen.queryByText('Namnet får vara högst 64 tecken.')).toBeNull()
    fireEvent.change(field, { target: { value: 'x'.repeat(64) } })
    const said = screen.getByText('Namnet får vara högst 64 tecken.')
    expect(field.getAttribute('aria-describedby')).toContain(said.id)
  })
})

// `/new` had no way back at all (#476); the editor's is «Mina spel» at the top left, and so is this.
describe('the way back from the wizard (#476)', () => {
  it('leads to the games from the head of the page', () => {
    open(() => undefined)
    const home = within(document.querySelector('.byd-wizard > header') as HTMLElement).getByRole('link', { name: 'Mina spel' })
    expect(home.getAttribute('href')).toBe(`/?server=${encodeURIComponent(run.http)}`)
  })
})

// When the game could not be made (#476): the wizard said «kunde inte skapa spelet: 500» or the
// browser's own «Failed to fetch», never that nothing had been made, and left the focus where it
// was. It now says so in the catalogue's words, with what to do, and takes the focus to it.
describe('when the game could not be made (#476)', () => {
  const create = () => fireEvent.click(screen.getByRole('button', { name: /Skapa spelet och fortsätt i editorn/ }))

  it('says the game was not made and what to do when the service answers with an error', async () => {
    const real = globalThis.fetch
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input instanceof Request ? input.url : input))
      if (url.pathname === '/projects' && init?.method === 'POST') return new Response('{"error":"boom"}', { status: 500 })
      return real(input, init)
    })
    try {
      open(() => undefined)
      fireEvent.change(screen.getByLabelText('Spelets namn'), { target: { value: 'Skogens herrar' } })
      create()
      const said = await screen.findByRole('alert')
      expect(said.textContent).toBe('Spelet skapades inte. Tjänsten svarade med ett fel. Försök igen om en stund.')
      expect(document.activeElement).toBe(said)
    } finally {
      spy.mockRestore()
    }
  })

  it('says the service could not be reached, not the browser s words for it', async () => {
    history.replaceState(null, '', `/new?server=${encodeURIComponent('http://127.0.0.1:1')}`)
    render(<NewProjectPage onNavigate={() => undefined} />)
    fireEvent.change(screen.getByLabelText('Spelets namn'), { target: { value: 'Skogens herrar' } })
    fireEvent.click(screen.getByRole('button', { name: /Fortsätt i editorn/i }))
    const said = await screen.findByRole('alert')
    expect(said.textContent).toBe('Spelet skapades inte. Vi når inte tjänsten; kontrollera anslutningen och försök igen.')
    expect(said.textContent).not.toMatch(/fetch|Error/i)
  })
})

// The image field took any file at all (#476): a .txt was shown as a broken picture, a 36 MB PNG
// was read into memory, and the answer came at «Skapa» as «415» or «413». It now says so at the
// field the moment the file is chosen, and the field stays as it was.
describe('a file that is not a picture the game can hold (#476)', () => {
  it('refuses a file that is not a picture at the field, and keeps the field as it was', async () => {
    open(() => undefined)
    const input = screen.getByLabelText('kort 1 Illustration') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['hej'], 'drake.png', { type: 'image/png' })] } })
    expect((await screen.findByRole('alert')).textContent).toBe('Det där är ingen bild. Välj en PNG, JPEG, GIF eller WebP.')
    expect(screen.queryByRole('img', { name: 'Förhandsvisning av Illustration' })).toBeNull()
  })

  it('refuses a picture larger than the service keeps, before reading it', async () => {
    open(() => undefined)
    const big = new Uint8Array(8 * 1024 * 1024 + 1)
    big.set(PNG)
    fireEvent.change(screen.getByLabelText('kort 1 Illustration'), { target: { files: [new File([big], 'stor.png', { type: 'image/png' })] } })
    expect((await screen.findByRole('alert')).textContent).toBe('Bilden är större än 8 MB. Välj en mindre bild.')
    expect(screen.queryByRole('img', { name: 'Förhandsvisning av Illustration' })).toBeNull()
  })
})

// The live card reads the same columns the game will have (#476): with the fields named as they
// were written, the preview must be handed the card under those names too, or every field but the
// title stands empty on it.
describe('the live card after the fields are named (#476)', () => {
  it('shows what is written in every field, under whatever name the field was given', async () => {
    open(() => undefined)
    fireEvent.change(screen.getByLabelText('Kostnad namn'), { target: { value: 'Pris' } })
    fireEvent.change(screen.getByLabelText('kort 1 Pris'), { target: { value: '7' } })
    fireEvent.change(screen.getByLabelText('kort 1 Text'), { target: { value: 'Flygande drake.' } })
    const preview = document.querySelector('.byd-wizard-preview [data-card]') as HTMLElement
    await waitFor(() => expect(preview.textContent).toContain('Flygande drake.'))
    expect(preview.textContent).toContain('7')
  })
})
