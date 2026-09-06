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
    expect(log.slice(-2).map((l) => l.intent)).toEqual([
      expect.objectContaining({ v: 'move', to: 'discard' }),
      expect.objectContaining({ v: 'flip', face: 'front' }),
    ])
    expect(log.at(-1)?.by).toBe('A')
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
    const last = log.slice(-4)
    expect(last.map((l) => l.intent.v)).toEqual(['move', 'flip', 'move', 'flip'])
    expect(new Set(last.map((l) => l.batch)).size).toBe(1)
    table.close()
  })
})

describe('playing turns the card face-up (K11)', () => {
  it('flips when the target is public and leaves it face-down for a hidden pile, in one envelope', async () => {
    const id = await createSession(run.store)
    const table = TableClient.connect({ url: run.url, sessionId: id, seat: null })
    await table.ready()
    await open(id, 'A', 'Ada')
    await table.send({ v: 'draw', from: 'draw', to: 'hand:A', count: 2 })
    await waitFor(() => expect(document.querySelectorAll('[data-hand-card]')).toHaveLength(2))

    const lift = (el: Element) => {
      fireEvent.pointerDown(el, { clientX: 100, clientY: 500 })
      fireEvent.pointerMove(el, { clientX: 100, clientY: 430 })
      fireEvent.pointerUp(el, { clientX: 100, clientY: 430 })
    }
    lift(document.querySelector('[data-hand-card]')!)
    fireEvent.click(await screen.findByRole('button', { name: /Kasthög/ }))
    await waitFor(() => expect(document.querySelectorAll('[data-hand-card]')).toHaveLength(1))
    let log = await run.store.read(id)
    let last = log.slice(-2)
    expect(last.map((l) => l.intent.v)).toEqual(['move', 'flip'])
    expect(last[1]?.intent).toMatchObject({ v: 'flip', face: 'front' })
    expect(new Set(last.map((l) => l.batch)).size).toBe(1)

    lift(document.querySelector('[data-hand-card]')!)
    fireEvent.click(await screen.findByRole('button', { name: /Draghög/ }))
    await waitFor(() => expect(document.querySelectorAll('[data-hand-card]')).toHaveLength(0))
    log = await run.store.read(id)
    last = log.slice(-2)
    expect(last.map((l) => l.intent.v)).toEqual(['flip', 'move'])
    table.close()
  })
})

describe('undo and rewind on the phone (B, C)', () => {
  it('one tap undoes the seat\'s own last act while it is uncontested', async () => {
    const id = await createSession(run.store)
    await open(id, 'A', 'Ada')
    const undo = () => screen.getByRole('button', { name: /Ångra/ }) as HTMLButtonElement
    expect(undo().disabled).toBe(true)

    const me = TableClient.connect({ url: run.url, sessionId: id, seat: 'A' })
    await me.ready()
    await me.send({ v: 'draw', from: 'draw', to: 'hand:A', count: 2 })
    await waitFor(() => expect(document.querySelectorAll('[data-hand-card]')).toHaveLength(2))
    await waitFor(() => expect(undo().disabled).toBe(false))

    fireEvent.click(undo())
    await waitFor(() => expect(document.querySelectorAll('[data-hand-card]')).toHaveLength(0))
    const log = await run.store.read(id)
    expect(log.at(-1)).toMatchObject({ by: 'A', intent: { v: 'undo.self' }, outcome: { kind: 'restore' } })
    me.close()
  })

  it('once someone else has acted, the same tap proposes a rewind, and the proposer can withdraw it', async () => {
    const id = await createSession(run.store)
    await open(id, 'A', 'Ada')
    const me = TableClient.connect({ url: run.url, sessionId: id, seat: 'A' })
    const other = TableClient.connect({ url: run.url, sessionId: id, seat: 'B' })
    await Promise.all([me.ready(), other.ready()])
    await me.send({ v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    await other.send({ v: 'seat.claim', seat: 'B', name: 'Bo' }, { v: 'draw', from: 'draw', to: 'hand:B', count: 1 })
    await waitFor(() => expect(document.querySelectorAll('[data-hand-card]')).toHaveLength(1))

    fireEvent.click(await screen.findByRole('button', { name: /Ångra/ }))
    expect(await screen.findByText(/Du föreslår att spola tillbaka/)).toBeTruthy()
    expect((await run.store.read(id)).at(-1)).toMatchObject({ by: 'A', intent: { v: 'rewind.propose', toSeq: 1 } })
    expect((screen.getByRole('button', { name: /Ångra/ }) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: /Dra tillbaka/ }))
    await waitFor(() => expect(screen.queryByText(/Du föreslår/)).toBeNull())
    expect((await run.store.read(id)).at(-1)).toMatchObject({ by: 'A', intent: { v: 'rewind.reject' } })
    me.close()
    other.close()
  })

  it('the other phone is asked and can approve, which restores the table', async () => {
    const id = await createSession(run.store)
    await open(id, 'B', 'Bo')
    const ada = TableClient.connect({ url: run.url, sessionId: id, seat: 'A' })
    await ada.ready()
    await ada.send({ v: 'seat.claim', seat: 'A', name: 'Ada' }, { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    const bo = TableClient.connect({ url: run.url, sessionId: id, seat: 'B' })
    await bo.ready()
    await bo.send({ v: 'draw', from: 'draw', to: 'hand:B', count: 1 })
    await waitFor(() => expect(document.querySelectorAll('[data-hand-card]')).toHaveLength(1))
    await ada.send({ v: 'rewind.propose', toSeq: 2 })

    expect(await screen.findByText('Ada vill spola tillbaka')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Godkänn' }))
    await waitFor(() => expect(document.querySelectorAll('[data-hand-card]')).toHaveLength(0))
    await waitFor(() => expect(screen.queryByText('Ada vill spola tillbaka')).toBeNull())
    expect((await run.store.read(id)).at(-1)).toMatchObject({ by: 'B', intent: { v: 'rewind.confirm' }, outcome: { kind: 'restore' } })
    ada.close()
    bo.close()
  })
})
