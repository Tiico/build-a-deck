// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TableClient } from '../src/client.js'
import { PlayerPage } from '../src/player/PlayerPage.js'
import { createSession, startServer, type Running } from './fixture.js'

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  vi.useRealTimers()
  await run.stop()
})

async function open(sessionId: string, seat: string, name: string) {
  history.replaceState(null, '', `/play?session=${sessionId}&seat=${seat}&name=${name}&server=${encodeURIComponent(run.url)}`)
  render(<PlayerPage />)
  await screen.findByText(name)
}

describe('PlayerPage', () => {
  it('claims its seat by name on connect and shows the hand it is dealt', async () => {
    const id = await createSession(run.store)
    const table = TableClient.connect({ url: run.url, sessionId: id, seat: null })
    await table.ready()
    await open(id, 'A', 'Ada')
    await table.synced(1)
    expect(table.view?.seats.find((s) => s.id === 'A')).toEqual({ id: 'A', name: 'Ada' })

    await table.send({ v: 'deal', from: 'draw', to: ['hand:A', 'hand:B'], each: 2 })
    await waitFor(() => expect(document.querySelectorAll('[data-hand-card]')).toHaveLength(2))
    expect(screen.getByText('dragon')).toBeTruthy()
    table.close()
  })

  it('lifting a card and choosing a zone plays it there — one envelope, seen by the table', async () => {
    const id = await createSession(run.store)
    const table = TableClient.connect({ url: run.url, sessionId: id, seat: null })
    await table.ready()
    await open(id, 'A', 'Ada')
    await table.send({ v: 'draw', from: 'draw', to: 'hand:A', count: 3 })
    await waitFor(() => expect(document.querySelectorAll('[data-hand-card]')).toHaveLength(3))

    const first = document.querySelector('[data-hand-card]')!
    fireEvent.pointerDown(first, { clientX: 100, clientY: 500 })
    fireEvent.pointerMove(first, { clientX: 100, clientY: 430 })
    fireEvent.pointerUp(first, { clientX: 100, clientY: 430 })
    fireEvent.click(await screen.findByRole('button', { name: /Kasthög/ }))

    await waitFor(() => expect(document.querySelectorAll('[data-hand-card]')).toHaveLength(2))
    await table.synced(3)
    const discard = table.view?.zones.find((z) => z.id === 'discard')
    expect(discard).toMatchObject({ mode: 'order', order: [expect.any(String)] })
    const log = await run.store.read(id)
    expect(log.at(-1)).toMatchObject({ by: 'A', intent: { v: 'move', to: 'discard' } })
    table.close()
  })

  it('holding two cards and lifting plays both in one atomic envelope', async () => {
    const id = await createSession(run.store)
    const table = TableClient.connect({ url: run.url, sessionId: id, seat: null })
    await table.ready()
    await open(id, 'A', 'Ada')
    await table.send({ v: 'draw', from: 'draw', to: 'hand:A', count: 3 })
    await waitFor(() => expect(document.querySelectorAll('[data-hand-card]')).toHaveLength(3))

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const [a, b] = [...document.querySelectorAll('[data-hand-card]')] as [Element, Element]
    for (const el of [a, b]) {
      fireEvent.pointerDown(el, { clientX: 100, clientY: 500 })
      act(() => vi.advanceTimersByTime(500))
      fireEvent.pointerUp(el, { clientX: 100, clientY: 500 })
    }
    vi.useRealTimers()
    expect(document.querySelectorAll('[data-selected="true"]')).toHaveLength(2)

    fireEvent.pointerDown(a, { clientX: 100, clientY: 500 })
    fireEvent.pointerMove(a, { clientX: 100, clientY: 430 })
    fireEvent.pointerUp(a, { clientX: 100, clientY: 430 })
    fireEvent.click(await screen.findByRole('button', { name: /Bordet/ }))

    await waitFor(() => expect(document.querySelectorAll('[data-hand-card]')).toHaveLength(1))
    const log = await run.store.read(id)
    const last = log.slice(-2)
    expect(last.map((l) => l.intent.v)).toEqual(['move', 'move'])
    expect(new Set(last.map((l) => l.batch)).size).toBe(1)
    table.close()
  })
})
