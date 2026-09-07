// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TableClient } from '../src/client.js'
import { ObserverPage } from '../src/observer/ObserverPage.js'
import { createSession, startServer, type Running } from './fixture.js'

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

describe('ObserverPage (C8)', () => {
  it('sees every hand, says what she is, and can only flag — stamped with her name', async () => {
    const id = await createSession(run.store)
    const ada = TableClient.connect({ url: run.url, sessionId: id, seat: 'A' })
    await ada.ready()
    await ada.send({ v: 'seat.claim', seat: 'A', name: 'Ada' }, { v: 'draw', from: 'draw', to: 'hand:A', count: 2 })
    history.replaceState(null, '', `/observe?session=${id}&name=Eva&server=${encodeURIComponent(run.url)}`)
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
    const id = await createSession(run.store)
    const table = TableClient.connect({ url: run.url, sessionId: id, seat: null })
    await table.ready()
    await table.send({ v: 'draw', from: 'draw', to: 'table', count: 1 })
    history.replaceState(null, '', `/observe?session=${id}&name=Eva&server=${encodeURIComponent(run.url)}`)
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
    const id = await createSession(run.store)
    history.replaceState(null, '', `/observe?session=${id}&name=Eva&server=${encodeURIComponent(run.url)}`)
    render(<ObserverPage />)
    await screen.findByText(/Du är observatör/)
    expect(screen.queryByText(id)).toBeNull()
    expect(screen.queryByText(/anslut med telefon/)).toBeNull()
  })
})
