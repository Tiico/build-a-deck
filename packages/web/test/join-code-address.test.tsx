// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { JoinPage } from '../src/join/JoinPage.js'
import { TableClient } from '../src/client.js'
import { asTable, createNamedSession, createSession, roomOf, startServer, type Running } from './fixture.js'

// The code is the address (#675, beslut C 2026-10-06). The television says `värd/KOD`, and the
// phone that opens it is in the seat picker; `/join` without a code asks for one; a code that
// names nothing is said one way, whether it never was or has gone out, with the code left in the
// field to be put right.
let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
  vi.unstubAllGlobals()
})

const SAYS = 'Koden finns inte eller har gått ut. Fråga värden efter den nya.'
const at = (path: string) => history.replaceState(null, '', `${path}${path.includes('?') ? '&' : '?'}server=${encodeURIComponent(run.url)}`)

describe('the room’s own address (#675)', () => {
  it('is the seat picker for the code in the path, in whatever case it was typed', async () => {
    const id = await createSession(run)
    at(`/${roomOf(id).code.toLowerCase()}`)
    render(<JoinPage />)
    expect(await screen.findByRole('button', { name: /Plats A/ })).toBeTruthy()
    // A table started without a game is known by its room.
    expect(screen.getByRole('heading', { level: 1, name: `Rum ${roomOf(id).code}` })).toBeTruthy()
  })

  it('is headed with the game’s name when the table was started from one', async () => {
    const id = await createNamedSession(run, "Sal's Saloon")
    at(`/${roomOf(id).code}`)
    render(<JoinPage />)
    expect(await screen.findByRole('heading', { level: 1, name: "Sal's Saloon" })).toBeTruthy()
    expect(screen.getByText('Du går med i')).toBeTruthy()
    expect(screen.getByText(`Rum ${roomOf(id).code} · Plats A vald`)).toBeTruthy()
  })
})

describe('/join without a code (#675)', () => {
  it('asks for the code, and takes the one typed to the room’s own address', async () => {
    at('/join')
    const went: string[] = []
    render(<JoinPage onOpen={(url) => went.push(url)} />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Gå med i ett bord' })).toBeTruthy()
    const field = screen.getByLabelText('Rumskod')
    fireEvent.change(field, { target: { value: ' k7mq-2x ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Fortsätt' }))
    expect(went).toHaveLength(1)
    const url = new URL(went[0] ?? '', 'http://x')
    expect(url.pathname).toBe('/K7MQ2X')
    // The development server rides along, as on every other way in.
    expect(url.searchParams.get('server')).toBe(run.url)
  })

  it('says what is missing when nothing is typed, and goes nowhere', async () => {
    at('/join')
    const went: string[] = []
    render(<JoinPage onOpen={(url) => went.push(url)} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Fortsätt' }))
    expect(went).toEqual([])
    expect(screen.getByRole('alert').textContent).toBe('Skriv rumskoden först.')
    expect(screen.getByLabelText('Rumskod').getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(screen.getByLabelText('Rumskod'))
  })
})

describe('a code that names nothing (#675)', () => {
  it.each([['/join?code=ZZZZZZ'], ['/ZZZZZZ']])('is said the one way at %s, with the code kept in the field', async (path) => {
    at(path)
    render(<JoinPage />)
    const field = (await screen.findByLabelText('Rumskod')) as HTMLInputElement
    expect(field.value).toBe('ZZZZZZ')
    expect(field.getAttribute('aria-invalid')).toBe('true')
    expect(document.getElementById(field.getAttribute('aria-describedby') ?? '')?.textContent).toBe(SAYS)
    expect(document.querySelector('[data-seat]')).toBeNull()
  })

  it('is said the same way when it goes out between the picker and the seat', async () => {
    const id = await createSession(run)
    at(`/${roomOf(id).code}`)
    render(<JoinPage onSit={() => undefined} />)
    await screen.findByRole('button', { name: /Sätt dig/ })
    // The host rotates the code while the name is typed: the old one buys nothing any more.
    const real = globalThis.fetch
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input instanceof Request ? input.url : input)
      if (init?.method === 'POST' && url.endsWith('/join')) return new Response(JSON.stringify({ error: 'unknown or expired code' }), { status: 404 })
      return real(input, init)
    })
    fireEvent.change(screen.getByLabelText('Ditt namn'), { target: { value: 'Bo' } })
    fireEvent.click(screen.getByRole('button', { name: /Sätt dig/ }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(SAYS))
    vi.restoreAllMocks()
  })
})

describe('on a laptop (#675)', () => {
  const wide = (matches: boolean) =>
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('min-width: 1024px') ? matches : false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))

  // A laptop has one choice (L77, #1130): the page says how many seats are left, asks for a name
  // and has a single «Gå med», which plays on this screen. The phone's way is a line under it, and
  // so is only watching — both still ways in, neither a second button beside the first.
  it('has one way in from 1024 px, «Gå med», and says how many seats are left', async () => {
    wide(true)
    const id = await createNamedSession(run, "Sal's Saloon")
    at(`/${roomOf(id).code}`)
    const went: string[] = []
    render(<JoinPage onSit={(url) => went.push(url)} />)
    const go = await screen.findByRole('button', { name: 'Gå med' })
    // The room's code stays in the line under the name: it is what people compare.
    expect(screen.getByText(`Rum ${roomOf(id).code} · 2 av 2 platser kvar`)).toBeTruthy()
    expect(go.classList.contains('byd-primary')).toBe(true)
    expect((go as HTMLButtonElement).type).toBe('submit')
    // The one filled thing, and the only control in the form drawn as a button.
    expect([...document.querySelectorAll('form .byd-primary, form .byd-secondary')]).toEqual([go])
    expect(screen.queryByRole('button', { name: 'Sätt dig' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Spela på den här skärmen/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Sitter ni runt en TV? Använd telefonen som hand' }).classList.contains('byd-join-link')).toBe(true)
    expect(screen.getByRole('button', { name: /Bara titta/ }).classList.contains('byd-join-link')).toBe(true)
    // Enter in the name field does what «Gå med» does.
    fireEvent.change(screen.getByLabelText('Ditt namn'), { target: { value: 'Ada' } })
    fireEvent.submit(document.querySelector('form')!)
    await waitFor(() => expect(went).toHaveLength(1))
    expect(new URL(went[0] ?? '', 'http://x').pathname).toBe('/online')
  })

  it('keeps the phone’s way as a line under «Gå med»', async () => {
    wide(true)
    const id = await createSession(run)
    at(`/${roomOf(id).code}`)
    const went: string[] = []
    render(<JoinPage onSit={(url) => went.push(url)} />)
    await screen.findByRole('button', { name: 'Gå med' })
    // Without a game the room is the heading, and the line under it is the seats alone.
    expect(screen.getByText('2 av 2 platser kvar')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Ditt namn'), { target: { value: 'Bo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sitter ni runt en TV? Använd telefonen som hand' }))
    await waitFor(() => expect(went).toHaveLength(1))
    const phone = new URL(went[0] ?? '', 'http://x')
    expect(phone.pathname).toBe('/play')
    expect(phone.searchParams.get('seat')).toBe('A')
  })

  // The guards the phone's buttons keep are the laptop's too: a name first (#416), one way in at a
  // time (#752), whichever of the three is pressed.
  it('asks for the name first, and buys one seat however often «Gå med» is pressed', async () => {
    wide(true)
    const id = await createSession(run)
    at(`/${roomOf(id).code}`)
    const went: string[] = []
    render(<JoinPage onSit={(url) => went.push(url)} />)
    for (const way of ['Gå med', 'Sitter ni runt en TV? Använd telefonen som hand', /Bara titta/]) {
      fireEvent.click(await screen.findByRole('button', { name: way }))
      expect(screen.getByRole('alert').textContent).toBe('Skriv ditt namn först.')
      expect(document.activeElement).toBe(screen.getByLabelText('Ditt namn'))
    }
    fireEvent.change(screen.getByLabelText('Ditt namn'), { target: { value: 'Ada' } })
    const go = screen.getByRole('button', { name: 'Gå med' })
    fireEvent.click(go)
    fireEvent.click(go)
    fireEvent.click(screen.getByRole('button', { name: 'Sitter ni runt en TV? Använd telefonen som hand' }))
    expect(go.getAttribute('aria-busy')).toBe('true')
    await waitFor(() => expect(went).toHaveLength(1))
    expect(new URL(went[0] ?? '', 'http://x').pathname).toBe('/online')
  })

  it('counts the seats as they fill, and says when none is left', async () => {
    wide(true)
    const id = await createSession(run)
    const table = TableClient.connect(await asTable(run, id))
    await table.ready()
    at(`/${roomOf(id).code}`)
    render(<JoinPage />)
    await screen.findByText('2 av 2 platser kvar')
    await table.send({ v: 'seat.claim', seat: 'B', name: 'Bo' })
    // One seat left out of two: «plats» or «platser» follows the table, not what is left.
    await screen.findByText('1 av 2 platser kvar')
    await table.send({ v: 'seat.claim', seat: 'A', name: 'Ada' })
    await screen.findByText('Alla platser är upptagna')
    expect((screen.getByRole('button', { name: 'Gå med' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Sitter ni runt en TV? Använd telefonen som hand' }) as HTMLButtonElement).disabled).toBe(true)
    // Watching asks for no seat.
    expect((screen.getByRole('button', { name: /Bara titta/ }) as HTMLButtonElement).disabled).toBe(false)
    table.close()
  })

  it('keeps «Sätt dig» first on a phone', async () => {
    wide(false)
    const id = await createSession(run)
    at(`/${roomOf(id).code}`)
    render(<JoinPage />)
    const sit = await screen.findByRole('button', { name: /Sätt dig/ })
    expect(document.querySelector('form button')).toBe(sit)
    expect(sit.classList.contains('byd-primary')).toBe(true)
  })
})
