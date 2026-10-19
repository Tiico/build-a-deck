// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { HomePage } from '../src/account/HomePage.js'
import { pitchSeen } from '../src/account/pitch.js'
import { startServer, type Running } from './fixture.js'

// `/` for whoever is not logged in (#1009, beställarens beslut 2026-10-18, variant A «Bordet»): the
// landing page in the login card's place. It says what the product is, its doors go to the start
// page of the editor through `/login`, and the code row (#675) is still there for a player.
let run: Running
// The loading notice is a heading too, so the page is waited for by its own.
const landed = () => screen.findByRole('heading', { level: 1, name: 'Bygg ditt kortspel. Spela det i kväll.' })
beforeEach(async () => {
  localStorage.clear()
  run = await startServer({ auth: true })
  history.replaceState(null, '', `/?server=${encodeURIComponent(run.http)}`)
})
afterEach(async () => {
  await run.stop()
})

describe('the landing page at / (#1009)', () => {
  it('stands where the login card stood, and asks for no address itself', async () => {
    render(<HomePage onNavigate={() => undefined} />)
    expect(await landed()).toBeTruthy()
    expect(document.querySelector('[data-page="home"][data-landing]')).not.toBeNull()
    // The login card is `/login`'s now: no e-mail field on this page.
    expect(document.querySelector('[data-login]')).toBeNull()
    expect(screen.queryByLabelText('E-post')).toBeNull()
  })

  it('leads every door for the maker to the start page of the editor, through the login', async () => {
    render(<HomePage onNavigate={() => undefined} />)
    await landed()
    const doors = [...document.querySelectorAll<HTMLAnchorElement>('a[data-landing-door]')]
    expect(doors.map((a) => a.textContent)).toEqual(['Mina spel', 'Börja bygga', 'Till editorn'])
    for (const door of doors) {
      const url = new URL(door.getAttribute('href') ?? '', 'http://x')
      expect(url.pathname).toBe('/login')
      // Back here once logged in, which is Mina spel; with the server the page itself was given.
      expect(url.searchParams.get('next')).toBe(`/?server=${encodeURIComponent(run.http)}`)
      expect(url.searchParams.get('server')).toBe(run.http)
    }
  })

  it('keeps the player’s door: the code row takes the code to the room’s own address', async () => {
    const went: string[] = []
    render(<HomePage onNavigate={(url) => went.push(url)} />)
    const field = await screen.findByLabelText('Ska du spela? Skriv rumskoden')
    fireEvent.change(field, { target: { value: 'k7mq2x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Gå in' }))
    const url = new URL(went[0] ?? '', 'http://x')
    expect(url.pathname).toBe('/K7MQ2X')
    expect(url.searchParams.get('server')).toBe(run.http)
  })

  it('draws its cards with the one renderer, and says the table once as a picture', async () => {
    render(<HomePage onNavigate={() => undefined} />)
    const scene = await screen.findByRole('img', { name: /Ett dukat bord/ })
    // Every card on the page is a CardPreview: the compiler's markup, scoped to its own id.
    const cards = document.querySelectorAll('.byd-landing-card')
    expect(cards.length).toBeGreaterThan(10)
    for (const card of cards) expect(card.querySelector(':scope > .byd-preview[id] > style')).not.toBeNull()
    // The table's words are its picture's: none of them is read out on its own.
    expect(within(scene).queryAllByRole('heading')).toEqual([])
    expect(scene.textContent).toContain('Ugglans råd')
  })

  it('counts as the sales line having been seen (L36), so the login card does not sell twice', async () => {
    expect(pitchSeen()).toBe(false)
    render(<HomePage onNavigate={() => undefined} />)
    await landed()
    // Marked by an effect after the page is drawn, so the heading being found is no promise the
    // effect has run: on CI's runners it once had not. The test waits for what it asks about.
    await waitFor(() => expect(pitchSeen()).toBe(true))
  })
})
