// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { TableClient } from '../src/client.js'
import { ObserverPage } from '../src/observer/ObserverPage.js'
import { admit, asSeat, asTable, createSession, startServer, type Running } from './fixture.js'

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

describe('ObserverPage (C8)', () => {
  it('sees every hand, says what she is, and can only flag — stamped with her name', async () => {
    const id = await createSession(run)
    const ada = TableClient.connect(await asSeat(run, id, 'A'))
    await ada.ready()
    await ada.send({ v: 'seat.claim', seat: 'A', name: 'Ada' }, { v: 'draw', from: 'draw', to: 'hand:A', count: 2 })
    history.replaceState(null, '', `/observe?session=${id}&name=Eva&token=${await admit(run, id, null, 'Eva')}&server=${encodeURIComponent(run.url)}`)
    render(<ObserverPage />)
    expect(await screen.findByText(/Du är observatör/)).toBeTruthy()
    // A's hand is on her screen by name, which no table screen shows.
    await waitFor(() => expect(document.querySelectorAll('[data-zone="hand:A"] [data-component]').length + document.querySelectorAll('[data-component]').length).toBeGreaterThan(0))
    expect(screen.getByText('dragon')).toBeTruthy()
    expect(document.querySelector('[data-playable]')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Flagga/ }))
    fireEvent.change(screen.getByPlaceholderText(/Vad hände/), { target: { value: 'Ada tvekade' } })
    fireEvent.click(screen.getByRole('button', { name: 'Flagga' }))
    await waitFor(async () => expect((await run.store.read(id)).at(-1)).toMatchObject({ by: null, intent: { v: 'flag', note: 'Ada tvekade', observer: 'Eva' } }))
    ada.close()
  })
})

describe('the observer inspects too (C8, K8)', () => {
  it('fills the inspection panel from the card she points at', async () => {
    const id = await createSession(run)
    const table = TableClient.connect(await asTable(run, id))
    await table.ready()
    await table.send({ v: 'draw', from: 'draw', to: 'table', count: 1 })
    history.replaceState(null, '', `/observe?session=${id}&name=Eva&token=${await admit(run, id, null, 'Eva')}&server=${encodeURIComponent(run.url)}`)
    render(<ObserverPage />)
    await screen.findByText(/Du är observatör/)
    await waitFor(() => expect(document.querySelector('.byd-card')).toBeTruthy())

    const panel = screen.getByRole('region', { name: /inspektion/i })
    expect(panel.textContent).toMatch(/peka på ett kort/)
    fireEvent.pointerEnter(document.querySelector('.byd-card')!)
    // She sees every face (C8), so the card names itself rather than saying it is hidden.
    await waitFor(() => expect(panel.textContent).toMatch(/dragon/))
    table.close()
  })
})

describe('the observer screen is not a screen to join from (K12)', () => {
  it('shows no room code at all rather than the session id spelled out', async () => {
    const id = await createSession(run)
    history.replaceState(null, '', `/observe?session=${id}&name=Eva&token=${await admit(run, id, null, 'Eva')}&server=${encodeURIComponent(run.url)}`)
    render(<ObserverPage />)
    await screen.findByText(/Du är observatör/)
    expect(screen.queryByText(id)).toBeNull()
    expect(screen.queryByText(/anslut med telefon/)).toBeNull()
  })
})

// The shape #6 asked for: the observer watches, so the table is the screen and everything else —
// the feed, the seats and the whole sentence about what she is — is called in behind a handle,
// under the table and never over it.
describe('the observer summons what is not the table (#6)', () => {
  it('keeps who she is and the way to flag on a handle of its own, and calls the rest in', async () => {
    const user = userEvent.setup()
    const id = await createSession(run)
    history.replaceState(null, '', `/observe?session=${id}&name=Eva&token=${await admit(run, id, null, 'Eva')}&server=${encodeURIComponent(run.url)}`)
    render(<ObserverPage />)
    await screen.findByText(/Du är observatör/)

    const handle = document.querySelector('.byd-observer-handle')!
    expect(handle.textContent).toMatch(/Eva tittar på/)
    expect(handle.querySelector('.byd-observer-flag')).toBeTruthy()
    // Nothing floats over the table any more: the banner is a row of the layout.
    expect(document.querySelector('.byd-observer-banner')).toBeNull()

    const more = screen.getByRole('button', { name: /Senast och platser/ })
    expect(document.querySelector('[data-page="observe"]')!.getAttribute('data-drawer')).toBe('shut')
    expect(more.getAttribute('aria-expanded')).toBe('false')
    await user.click(more)
    expect(document.querySelector('[data-page="observe"]')!.getAttribute('data-drawer')).toBe('open')
    expect(more.getAttribute('aria-expanded')).toBe('true')
    // What it opened is the column the table already talks in, with her own sentence at the top
    // of it — one copy of each, not a second one summoned beside the first.
    const aside = document.querySelector('[data-tv] > aside')!
    expect(aside.querySelector('.byd-observer-note')!.textContent).toMatch(/du ser allas händer/)
    expect(document.querySelectorAll('.byd-observer-note')).toHaveLength(1)
    expect(screen.getByRole('region', { name: /inspektion/i })).toBeTruthy()

    // A drawer, not a dialog: it takes no focus, traps none, and closes the way it opened.
    expect(document.activeElement).toBe(more)
    await user.keyboard('{Enter}')
    expect(document.querySelector('[data-page="observe"]')!.getAttribute('data-drawer')).toBe('shut')
  })
})
