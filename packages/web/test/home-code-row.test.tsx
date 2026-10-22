// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { HomePage } from '../src/account/HomePage.js'
import { startServer, type Running } from './fixture.js'

// The start page's way in for whoever came to play (#675, beslut C 2026-10-06): a row that takes a
// typed code to the room's own address. It stood under the login card; since #1009 the landing
// page carries it, first on a phone and under the maker's door everywhere else.
let run: Running
beforeEach(async () => {
  run = await startServer({ auth: true })
  history.replaceState(null, '', `/?server=${encodeURIComponent(run.http)}`)
})
afterEach(async () => {
  await run.stop()
})

describe('the code row on the start page (#675)', () => {
  it('stands on the landing page, and takes the typed code to the room’s own address', async () => {
    const went: string[] = []
    render(<HomePage onNavigate={(url) => went.push(url)} />)
    const field = await screen.findByLabelText('Ska du spela? Skriv rumskoden')
    expect(field.closest('[data-landing]')).not.toBeNull()
    fireEvent.change(field, { target: { value: 'k7mq2x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Gå in' }))
    expect(went).toHaveLength(1)
    const url = new URL(went[0] ?? '', 'http://x')
    expect(url.pathname).toBe('/K7MQ2X')
    expect(url.searchParams.get('server')).toBe(run.http)
  })

  it('says what is missing, and what cannot be a code, without going anywhere', async () => {
    const went: string[] = []
    render(<HomePage onNavigate={(url) => went.push(url)} />)
    const field = await screen.findByLabelText('Ska du spela? Skriv rumskoden')
    fireEvent.click(screen.getByRole('button', { name: 'Gå in' }))
    expect(screen.getByRole('alert').textContent).toBe('Skriv rumskoden först.')
    expect(field.getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(field)
    fireEvent.change(field, { target: { value: 'hej' } })
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Gå in' }))
    expect(screen.getByRole('alert').textContent).toBe('Koden finns inte eller har gått ut. Fråga värden efter den nya.')
    expect(went).toEqual([])
  })
})
