// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { NewProjectPage } from '../src/wizard/NewProjectPage.js'
import { startServer, type Running } from './fixture.js'

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

function open(onNavigate: (url: string) => void) {
  history.replaceState(null, '', `/new?server=${encodeURIComponent(run.http)}`)
  render(<NewProjectPage onNavigate={onNavigate} />)
}

describe('NewProjectPage (L6, prototype B)', () => {
  it('keeps the large preview optional for people building many cards in the wizard', () => {
    open(() => undefined)

    expect(document.querySelector('.byd-wizard > aside')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Visa stor preview' }))
    expect(document.querySelector('.byd-wizard > aside')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Dölj stor preview' }))
    expect(document.querySelector('.byd-wizard > aside')).toBeNull()
  })

  it('builds a project from the form with a live card, and hands off to the editor', async () => {
    const gone: string[] = []
    open((url) => gone.push(url))
    fireEvent.click(screen.getByRole('button', { name: 'Visa stor preview' }))
    const live = () => within(document.querySelector('.byd-wizard-live') as HTMLElement)
    expect(live().getByText('Drake')).toBeTruthy() // the sample row on the live card

    fireEvent.change(screen.getByLabelText('Namn'), { target: { value: 'Skogens herrar' } })
    fireEvent.click(screen.getByRole('button', { name: /^3$/ }))
    fireEvent.click(screen.getByRole('button', { name: /minimal/i }))
    fireEvent.click(screen.getByRole('button', { name: /använd exemplet/i }))
    expect(within(document.querySelector('.byd-wizard-data-actions') as HTMLElement).getByText('4 kort')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /till editorn/i }))
    await waitFor(() => expect(gone).toHaveLength(1))
    const url = new URL(gone[0]!, 'http://x')
    expect(url.pathname).toBe('/editor')
    const id = url.searchParams.get('project')!
    expect(url.searchParams.get('server')).toBe(run.http)
    const stored = await run.projects.load(id)
    expect(stored?.name).toBe('Skogens herrar')
    expect(stored?.rows.map((r) => r.id)).toEqual(['drake', 'riddare', 'trollkarl', 'tjuv'])
    expect(stored?.setup.seats).toEqual(['A', 'B', 'C'])
    expect(stored?.template.faces['front']?.base.map((e) => e.id)).not.toContain('art')
  })

  it('"Öppna bordet" creates the project and a table and goes there', async () => {
    const gone: string[] = []
    open((url) => gone.push(url))
    fireEvent.change(screen.getByLabelText('Namn'), { target: { value: 'Snabbt' } })
    fireEvent.click(screen.getByRole('button', { name: /5 tomma rader/i }))
    fireEvent.click(screen.getByRole('button', { name: /öppna bordet/i }))
    await waitFor(() => expect(gone).toHaveLength(1))
    const url = new URL(gone[0]!, 'http://x')
    expect(url.pathname).toBe('/table')
    expect(url.searchParams.get('mode')).toBe('tv')
    const session = await run.store.loadSession(url.searchParams.get('session')!)
    expect(session?.setup.components).toHaveLength(5)
  })

  it('cannot proceed without a name and at least one card', () => {
    open(() => undefined)
    expect((screen.getByRole('button', { name: /till editorn/i }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Namn'), { target: { value: 'X' } })
    expect((screen.getByRole('button', { name: /till editorn/i }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /5 tomma rader/i }))
    expect((screen.getByRole('button', { name: /till editorn/i }) as HTMLButtonElement).disabled).toBe(false)
  })
})
