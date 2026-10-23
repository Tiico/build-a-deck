// @vitest-environment jsdom
// The step before the guided start (L79, #1218, prototype B): `/new` is a crossroads — the game's
// name, its seats and two doors — and the guide behind the first door is two steps, the fields and
// the cards. The name and the seats were the guide's first step until then (L42).
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { NewProjectPage } from '../src/wizard/NewProjectPage.js'
import { startServer, type Running } from './fixture.js'
import { watchFontNet, type FontNet } from './font-net.js'
import { atWidth } from './viewport.js'

let run: Running
let net: FontNet
beforeEach(async () => {
  run = await startServer()
  net = watchFontNet()
})
afterEach(async () => {
  cleanup()
  net.undo()
  await run.stop()
  sessionStorage.clear()
})

function open(onNavigate: (url: string) => void = () => undefined, path = '/new') {
  history.replaceState(null, '', `${path}?server=${encodeURIComponent(run.http)}`)
  render(<NewProjectPage onNavigate={onNavigate} />)
}

const door = (name: 'Guidad start' | 'Tomt spel') => screen.getByRole('button', { name })
const name = () => screen.getByRole('textbox', { name: 'Spelets namn' }) as HTMLInputElement

describe('the crossroads at /new (L79)', () => {
  it('asks for the name and the seats, and offers two doors and nothing of the guide', () => {
    open()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Skapa ett nytt spel')
    expect(name().value).toBe('')
    expect(screen.getByRole('group', { name: 'Spelare' })).toBeTruthy()
    const ways = screen.getByRole('group', { name: 'Hur vill du börja?' })
    expect(within(ways).getAllByRole('button', { name: /^(Guidad start|Tomt spel)$/ }).map((b) => b.querySelector('strong')?.textContent)).toEqual(['Guidad start', 'Tomt spel'])
    // Each door says what it gives, and that is read as its description, not its name.
    expect(door('Guidad start').getAttribute('aria-describedby')).toBeTruthy()
    expect(door('Tomt spel').getAttribute('aria-describedby')).toBeTruthy()
    // The guided way is the first action (L13), the empty game the second.
    expect(door('Guidad start').dataset.first).toBe('')
    expect(door('Tomt spel').dataset.first).toBeUndefined()
    // The guide's own work is behind the first door, not on the crossroads.
    expect(document.querySelector('.byd-wizard-card-tabs')).toBeNull()
    expect(screen.queryByLabelText('Kostnad namn')).toBeNull()
  })

  it('says the name is missing at the field when a door is pressed without one, and goes nowhere', () => {
    const gone: string[] = []
    open((url) => gone.push(url))
    for (const way of ['Guidad start', 'Tomt spel'] as const) {
      fireEvent.click(door(way))
      expect(screen.getByRole('alert').textContent).toBe('Spelet behöver ett namn först.')
      expect(document.activeElement).toBe(name())
      expect(name().getAttribute('aria-invalid')).toBe('true')
      expect(location.pathname).toBe('/new')
    }
    expect(gone).toEqual([])
  })

  it('goes into the guide behind the first door, at an address of its own, with the name at its head', () => {
    open()
    fireEvent.change(name(), { target: { value: 'Skogens herrar' } })
    fireEvent.click(screen.getByRole('button', { name: 'En spelare fler' }))
    fireEvent.click(door('Guidad start'))

    expect(location.pathname).toBe('/new/guided')
    expect(new URLSearchParams(location.search).get('server')).toBe(run.http)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Skogens herrar')
    expect(screen.getByText('3 spelare')).toBeTruthy()
    expect(screen.getByText('Två steg, ungefär två minuter')).toBeTruthy()
    // Two steps, numbered from one.
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['1Fält', '2Lägg till några exempelkort'])
    expect(screen.queryByRole('textbox', { name: 'Spelets namn' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Tomt spel' })).toBeNull()
    // The keys land in the first thing there is to do.
    expect(document.activeElement).toBe(screen.getByLabelText('Kostnad namn'))
  })

  it('takes Enter in the name as the first door', () => {
    open()
    fireEvent.change(name(), { target: { value: 'Skogens herrar' } })
    fireEvent.keyDown(name(), { key: 'Enter' })
    expect(location.pathname).toBe('/new/guided')
  })

  it('goes back to the crossroads with the name and seats kept, by «Ändra», the way back and the browser', () => {
    open()
    fireEvent.change(name(), { target: { value: 'Skogens herrar' } })
    const into = () => fireEvent.click(door('Guidad start'))
    into()
    fireEvent.click(screen.getByRole('button', { name: 'Ändra namn och spelare' }))
    expect(location.pathname).toBe('/new')
    expect(name().value).toBe('Skogens herrar')
    expect(document.activeElement).toBe(name())

    into()
    fireEvent.click(screen.getByRole('link', { name: 'Nytt spel' }))
    expect(location.pathname).toBe('/new')
    expect(name().value).toBe('Skogens herrar')

    into()
    // The browser's back lands on the crossroads, as the address it left from says.
    act(() => {
      history.replaceState(history.state, '', `/new?server=${encodeURIComponent(run.http)}`)
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(name().value).toBe('Skogens herrar')
  })

  it('keeps the cards made in the guide through a visit to the crossroads', () => {
    open()
    fireEvent.change(name(), { target: { value: 'Skogens herrar' } })
    fireEvent.click(door('Guidad start'))
    fireEvent.change(screen.getByLabelText('kort 1 Titel'), { target: { value: 'Drake' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ändra namn och spelare' }))
    fireEvent.change(name(), { target: { value: 'Drakens år' } })
    fireEvent.click(door('Guidad start'))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Drakens år')
    expect((screen.getByLabelText('kort 1 Titel') as HTMLInputElement).value).toBe('Drake')
  })

  it('makes the empty game from the crossroads without a question, and opens the editor', async () => {
    const gone: string[] = []
    open((url) => gone.push(url))
    fireEvent.change(name(), { target: { value: 'Kråkkriget' } })
    fireEvent.click(door('Tomt spel'))
    await waitFor(() => expect(gone).toHaveLength(1))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    const url = new URL(gone[0]!, 'http://x')
    expect(url.pathname).toBe('/editor')
    const stored = await run.projects.load(url.searchParams.get('project')!)
    expect(stored?.name).toBe('Kråkkriget')
    expect(stored?.rows).toEqual([])
  })

  it('opens the guide again on a reload of its address, and the crossroads when there is no name yet', () => {
    open()
    fireEvent.change(name(), { target: { value: 'Skogens herrar' } })
    fireEvent.click(door('Guidad start'))
    cleanup()
    open(undefined, '/new/guided')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Skogens herrar')

    cleanup()
    sessionStorage.clear()
    open(undefined, '/new/guided')
    expect(location.pathname).toBe('/new')
    expect(name().value).toBe('')
  })
})

describe('the guide behind the first door on a phone (L10, L79)', () => {
  it('is two steps, the fields and the cards', async () => {
    const user = userEvent.setup()
    atWidth(390)
    history.replaceState(null, '', '/new')
    render(<NewProjectPage />)
    await user.type(name(), 'Skogens herrar')
    await user.click(door('Guidad start'))
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent?.trim())).toEqual(['1 · Fälten', '2 · Korten'])
    expect(screen.getByRole('tab', { selected: true }).textContent).toContain('Fälten')
  })
})
