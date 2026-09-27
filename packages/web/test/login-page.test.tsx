// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LoginPage } from '../src/account/LoginPage.js'
import { startServer, type Running } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// `/login` for somebody who is already signed in (#475): the card asked for an address the page
// already had, and a link that led here with somewhere to go next went nowhere.
let run: Running
beforeEach(async () => {
  run = await startServer({ auth: true, authBypass: true })
})
afterEach(async () => {
  await run.stop()
})

describe('the login page (#475)', () => {
  it('sends whoever is already signed in straight on to where they were going', async () => {
    await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'bo@example.com' }) })
    const next = `/editor?project=${run.projectId}`
    history.replaceState(null, '', `/login?next=${encodeURIComponent(next)}&server=${encodeURIComponent(run.http)}`)
    const gone: string[] = []
    render(<LoginPage onNavigate={(u) => gone.push(u)} />)
    await waitFor(() => expect(gone).toEqual([next]))
    expect(screen.queryByLabelText('E-post')).toBeNull()
  })

  it('shows the card to whoever is not', async () => {
    history.replaceState(null, '', `/login?server=${encodeURIComponent(run.http)}`)
    const gone: string[] = []
    render(<LoginPage onNavigate={(u) => gone.push(u)} />)
    expect(await screen.findByLabelText('E-post')).toBeTruthy()
    expect(gone).toEqual([])
  })
})

// The address the server would not take (#475): the field says it is the one at fault and which
// sentence says why, and the sentence goes away once the address is being put right rather than
// standing under an address that may already be fine.
describe('an address the server would not take (#475)', () => {
  it('marks the field, ties the sentence to it, and takes both back when the address is edited', async () => {
    await run.stop()
    run = await startServer({ auth: true })
    history.replaceState(null, '', `/login?server=${encodeURIComponent(run.http)}`)
    render(<LoginPage onNavigate={() => undefined} />)
    const field = await screen.findByLabelText('E-post')
    fireEvent.change(field, { target: { value: 'ada@nowhere' } })
    fireEvent.click(screen.getByRole('button', { name: /Skicka inloggningslänk/ }))
    const said = await screen.findByRole('alert')
    expect(said.textContent).toMatch(/inte ut som en e-postadress/)
    expect(field.getAttribute('aria-invalid')).toBe('true')
    expect(field.getAttribute('aria-describedby')).toBe(said.id)

    fireEvent.change(field, { target: { value: 'ada@nowhere.se' } })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(field.getAttribute('aria-invalid')).not.toBe('true')
    expect(field.hasAttribute('aria-describedby')).toBe(false)
  })
})

// An address with no «@» (#475, beslut 2026-09-27): the button used to be toned and Enter did
// nothing at all, so the reader was never told what was missing. The button is always there to
// press, and pressing it says what the address needs — as the wizard says «Spelet behöver ett namn
// först» — without asking the server anything.
describe('an address that is not one yet (#475)', () => {
  it('says what is missing when the button is pressed, and asks the server nothing', async () => {
    history.replaceState(null, '', `/login?server=${encodeURIComponent(run.http)}`)
    render(<LoginPage onNavigate={() => undefined} />)
    const field = await screen.findByLabelText('E-post')
    const button = screen.getByRole('button', { name: /Skicka inloggningslänk/ })
    expect(button.hasAttribute('disabled')).toBe(false)

    fireEvent.click(button)
    expect((await screen.findByRole('alert')).textContent).toBe('Skriv in din e-postadress först.')
    expect(document.activeElement).toBe(field)

    fireEvent.change(field, { target: { value: 'ada' } })
    fireEvent.submit(field.closest('form')!)
    const said = await screen.findByRole('alert')
    expect(said.textContent).toBe('Adressen behöver ett @.')
    expect(field.getAttribute('aria-invalid')).toBe('true')
    expect(field.getAttribute('aria-describedby')).toBe(said.id)
    expect(run.mail.sent).toHaveLength(0)
  })
})
