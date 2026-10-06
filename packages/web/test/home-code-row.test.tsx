// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { HomePage } from '../src/account/HomePage.js'
import { startServer, type Running } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// The start page's way in for whoever came to play (#675, beslut C 2026-10-06): a row under the
// login card, which itself stays untouched, that takes a typed code to the room's own address.
let run: Running
beforeEach(async () => {
  run = await startServer({ auth: true })
  history.replaceState(null, '', `/?server=${encodeURIComponent(run.http)}`)
})
afterEach(async () => {
  await run.stop()
})

describe('the code row under the login card (#675)', () => {
  it('stands after the card, and takes the typed code to the room’s own address', async () => {
    const went: string[] = []
    render(<HomePage onNavigate={(url) => went.push(url)} />)
    const field = await screen.findByLabelText('Ska du spela? Skriv rumskoden')
    const card = document.querySelector('[data-login]')!
    // After the card in the document, never inside it: the card is #691's and #757's.
    expect(card.contains(field)).toBe(false)
    expect(card.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
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
    expect(screen.getByRole('alert').textContent).toBe('Koden finns inte eller har gått ut — fråga värden efter den nya.')
    expect(went).toEqual([])
  })
})
