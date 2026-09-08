// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { WebSocket as WsClient } from 'ws'
import { TableClient, useWebSocketImplementation, type WebSocketCtor } from '../src/client.js'
import { OnlinePage } from '../src/online/OnlinePage.js'
import { StatusLive } from '../src/status/StatusLive.js'
import { admit, asTable, createSession, startServer, type Running } from './fixture.js'

// Every frame the page's own socket was ever handed, verbatim. The repo proves hidden
// information on the wire and not on the screen (D4, B6), so the keyboard is held to the same
// proof: what a reader can hear is bounded by what the wire carried, and nothing else.
const frames: string[] = []
class Recording extends WsClient {
  constructor(url: string | URL, protocols?: string | string[]) {
    super(url, protocols)
    this.on('message', (data: unknown) => frames.push(String(data)))
  }
}

let run: Running
beforeEach(async () => {
  frames.length = 0
  useWebSocketImplementation(Recording as unknown as WebSocketCtor)
  run = await startServer()
})
afterEach(async () => {
  useWebSocketImplementation(WsClient as unknown as WebSocketCtor)
  await run.stop()
})

// Every name on this table that Ada is not entitled to: Bo's whole hand, and the card lying
// face down on the felt.
const NOT_HERS = /dragon|knight|wizard|rogue/

describe('a keyboard learns nothing a pointer does not (B6, D4)', () => {
  it('names a card it may not see "Dolt kort", and the names it may not have never crossed the wire at all', async () => {
    const id = await createSession(run)
    const table = TableClient.connect(await asTable(run, id))
    await table.ready()
    await table.send({ v: 'draw', from: 'draw', to: 'hand:B', count: 3 })
    await table.send({ v: 'draw', from: 'draw', to: 'table', count: 1 })
    await table.synced(2)
    const hidden = table.view!.components.find((c) => c.zone === 'table')!.id
    await table.send({ v: 'move', component: hidden, to: 'table', x: 400, y: 300 })
    await table.send({ v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    await table.synced(4)
    table.close()

    const token = await admit(run, id, 'A', 'Ada')
    history.replaceState(null, '', `/online?session=${id}&seat=A&name=Ada&token=${token}&server=${encodeURIComponent(run.url)}`)
    render(
      <StatusLive>
        <OnlinePage />
      </StatusLive>,
    )
    // The whole table, drawn: her own card in the fan and the face-down one on the felt.
    await waitFor(() => expect(screen.getByRole('button', { name: /^Dolt kort, kort i Spelyta/ })).toBeTruthy(), { timeout: 10_000 })

    // The proof: raw frames. Nothing Ada may not know was ever sent to her socket.
    expect(frames.length).toBeGreaterThan(0)
    expect(frames.join('\n')).not.toMatch(NOT_HERS)
    // And her own card did arrive, so the check above is not passing by silence.
    expect(frames.join('\n')).toMatch(/priest/)

    // Therefore the keyboard cannot say them either: the names come from the same projection.
    const named = [...document.querySelectorAll('[aria-label]')].map((el) => el.getAttribute('aria-label') ?? '')
    expect(named.join('\n')).not.toMatch(NOT_HERS)
    expect(screen.getByRole('button', { name: 'Dolt kort, kort i Spelyta. Enter öppnar handlingar.' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'priest, i min hand. Enter öppnar handlingar.' })).toBeTruthy()
    // Bo's hand is a count on the felt and not a place to stand at all.
    expect(document.querySelector('[data-zone="hand:B"]')!.getAttribute('data-count')).toBe('3')
    expect(document.querySelector('[data-zone="hand:B"] [data-kbd]')).toBeNull()

    // The panel says no more than the felt does — for the card and for the hidden pile.
    const user = userEvent.setup()
    screen.getByRole('button', { name: /^Dolt kort, kort i Spelyta/ }).focus()
    await user.keyboard('{Enter}')
    const panel = await screen.findByRole('dialog', { name: 'Handlingar för Dolt kort' })
    expect(panel.textContent).not.toMatch(NOT_HERS)
    // A card nobody can read is exactly what "Avslöja" is for, so it is offered.
    expect(within(panel).getByRole('button', { name: /^Avslöja/ })).toHaveProperty('disabled', false)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    expect(screen.getByRole('button', { name: 'Översta kortet i Draghög: Dolt kort. Enter öppnar handlingar.' })).toBeTruthy()
    expect(frames.join('\n')).not.toMatch(NOT_HERS)
  })
})
