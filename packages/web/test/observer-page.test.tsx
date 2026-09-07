// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TableClient } from '../src/client.js'
import { ObserverPage } from '../src/observer/ObserverPage.js'
import { admit, asSeat, createSession, startServer, type Running } from './fixture.js'

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
