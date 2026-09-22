// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
    const art = String(stored?.rows[0]?.fields['art'])
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
    expect((await screen.findByRole('dialog', { name: 'spelet' })).textContent).toMatch(/csv-verktyg väntar i editorn/i)
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
    expect((await screen.findByRole('dialog', { name: 'spelet' })).textContent).toMatch(/utan kort, fält eller mall/i)
    const blank = screen.getByRole('button', { name: 'Skapa ett tomt spel i editorn' })
    expect(blank.classList.contains('byd-secondary')).toBe(true)
    expect(blank.classList.contains('byd-primary')).toBe(false)
  })
})
