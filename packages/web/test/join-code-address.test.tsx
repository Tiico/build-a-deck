// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { JoinPage } from '../src/join/JoinPage.js'
import { createNamedSession, createSession, roomOf, startServer, type Running } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

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

const SAYS = 'Koden finns inte eller har gått ut — fråga värden efter den nya.'
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
    expect(screen.getByText('Du är på väg in i')).toBeTruthy()
    expect(screen.getByText(`Rum ${roomOf(id).code} · Plats A vald`)).toBeTruthy()
  })
})

describe('/join without a code (#675)', () => {
  it('asks for the code, and takes the one typed to the room’s own address', async () => {
    at('/join')
    const went: string[] = []
    render(<JoinPage onOpen={(url) => went.push(url)} />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Gå in vid ett bord' })).toBeTruthy()
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

  it('suggests playing on this screen from 1024 px, and keeps the phone’s way as the second button', async () => {
    wide(true)
    const id = await createSession(run)
    at(`/${roomOf(id).code}`)
    const went: string[] = []
    render(<JoinPage onSit={(url) => went.push(url)} />)
    const here = await screen.findByRole('button', { name: /Spela på den här skärmen/ })
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('form button')]
    expect(buttons[0]).toBe(here)
    expect(here.classList.contains('byd-primary')).toBe(true)
    expect((here as HTMLButtonElement).type).toBe('submit')
    expect(buttons[1]?.textContent).toMatch(/Sätt dig/)
    expect(buttons[1]?.classList.contains('byd-secondary')).toBe(true)
    // Enter in the name field does what the suggested button does.
    fireEvent.change(screen.getByLabelText('Ditt namn'), { target: { value: 'Ada' } })
    fireEvent.submit(document.querySelector('form')!)
    await waitFor(() => expect(went).toHaveLength(1))
    expect(new URL(went[0] ?? '', 'http://x').pathname).toBe('/online')
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
