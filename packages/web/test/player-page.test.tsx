// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TableClient } from '../src/client.js'
import { PlayerPage } from '../src/player/PlayerPage.js'
import { admit, asSeat, asTable, createSession, roomOf, seatSetup, startServer, type Running } from './fixture.js'

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  vi.useRealTimers()
  await run.stop()
})

// Opens the phone for a seat with a token bought for it, and returns that token: the same
// guest on another connection (a test helper) is the same token, not a second admission.
async function open(sessionId: string, seat: string, name: string): Promise<string> {
  const token = await admit(run, sessionId, seat, name)
  history.replaceState(null, '', `/play?session=${sessionId}&seat=${seat}&name=${name}&token=${token}&server=${encodeURIComponent(run.url)}`)
  render(<PlayerPage />)
  await screen.findByText(name)
  return token
}

describe('PlayerPage', () => {
  it('claims its seat by name on connect and shows the hand it is dealt', async () => {
    const id = await createSession(run)
    const table = TableClient.connect(await asTable(run, id))
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
    const id = await createSession(run)
    const table = TableClient.connect(await asTable(run, id))
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
    const id = await createSession(run)
    const table = TableClient.connect(await asTable(run, id))
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
    const id = await createSession(run)
    const table = TableClient.connect(await asTable(run, id))
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
    const id = await createSession(run)
    const token = await open(id, 'A', 'Ada')
    const undo = () => screen.getByRole('button', { name: /Ångra/ }) as HTMLButtonElement
    expect(undo().disabled).toBe(true)

    const me = TableClient.connect({ url: run.url, sessionId: id, seat: 'A', token })
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
    const id = await createSession(run)
    const token = await open(id, 'A', 'Ada')
    const me = TableClient.connect({ url: run.url, sessionId: id, seat: 'A', token })
    const other = TableClient.connect(await asSeat(run, id, 'B'))
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
    const id = await createSession(run)
    const token = await open(id, 'B', 'Bo')
    const ada = TableClient.connect(await asSeat(run, id, 'A'))
    await ada.ready()
    await ada.send({ v: 'seat.claim', seat: 'A', name: 'Ada' }, { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    const bo = TableClient.connect({ url: run.url, sessionId: id, seat: 'B', token })
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

describe('flagging a moment (G3)', () => {
  it('a tap on Flagga, an optional note, and the moment is in the log', async () => {
    const id = await createSession(run)
    await open(id, 'A', 'Ada')
    fireEvent.click(screen.getByRole('button', { name: /Flagga/ }))
    fireEvent.change(screen.getByPlaceholderText(/Vad hände/), { target: { value: 'Draken känns för stark här' } })
    fireEvent.click(screen.getByRole('button', { name: 'Flagga' }))
    expect((await screen.findByRole('status')).textContent).toMatch(/Ögonblicket är flaggat/)
    await waitFor(async () => expect((await run.store.read(id)).at(-1)).toMatchObject({ by: 'A', intent: { v: 'flag', note: 'Draken känns för stark här' } }))
    expect(screen.queryByPlaceholderText(/Vad hände/)).toBeNull()
  })
})

describe('ending the session and the survey after it (C9, G3)', () => {
  it('Avsluta asks first, then locks the log; the survey takes one question at a time and lands on the server, tied to the version', async () => {
    const id = await createSession(run)
    await open(id, 'A', 'Ada')
    fireEvent.click(screen.getByRole('button', { name: /Avsluta/ }))
    expect(screen.getByText(/Avsluta sessionen\?/)).toBeTruthy()
    expect((await run.store.read(id)).some((l) => l.intent.v === 'session.end')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: /Avsluta för alla/ }))
    expect(await screen.findByText(/Sessionen är slut/)).toBeTruthy()
    expect((await run.store.read(id)).at(-1)).toMatchObject({ by: 'A', intent: { v: 'session.end' } })

    const next = () => fireEvent.click(screen.getByRole('button', { name: 'Nästa' }))
    expect((screen.getByRole('button', { name: 'Nästa' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '4' }))
    next()
    fireEvent.click(screen.getByRole('button', { name: '3' }))
    next()
    fireEvent.click(screen.getByRole('button', { name: '2' }))
    next()
    fireEvent.change(screen.getByPlaceholderText(/En mening räcker/), { target: { value: 'Draken är för stark' } })
    fireEvent.click(screen.getByRole('button', { name: 'Skicka' }))
    expect(await screen.findByText(/Tack, Ada/)).toBeTruthy()
    const listed = (await (await fetch(`${run.http}/sessions/${id}/surveys`)).json()) as unknown[]
    expect(listed).toEqual([expect.objectContaining({ who: 'Ada', seat: 'A', version: 'v1', answers: { fun: 4, clarity: 3, balance: 2, change: 'Draken är för stark' } })])
  })
})

describe('being kicked (DRIFT §9)', () => {
  it('the phone is told the host removed it and does not come back on its own', async () => {
    const id = await createSession(run)
    await open(id, 'A', 'Ada')
    const kicked = await fetch(`${run.http}/sessions/${id}/kick`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${roomOf(id).hostKey}` }, body: JSON.stringify({ seat: 'A' }) })
    expect(kicked.status).toBe(200)
    expect(await screen.findByText(/Värden har tagit bort dig/)).toBeTruthy()
    await new Promise((r) => setTimeout(r, 200))
    // A shut door is one of the nine states (#12): the phone says it as `forbidden` and stays
    // there, rather than reconnecting into the same answer.
    expect(document.querySelector('[data-status-notice]')?.getAttribute('data-status-notice')).toBe('forbidden')
  })
})

describe('saving the session to an account (G1)', () => {
  it('once the session has ended, the phone offers to save it, through the claim page with its token', async () => {
    const id = await createSession(run)
    const token = await open(id, 'A', 'Ada')
    expect(screen.queryByText(/Spara till ditt konto/)).toBeNull()
    const table = TableClient.connect(await asTable(run, id))
    await table.ready()
    await table.send({ v: 'session.end' })
    const link = (await screen.findByRole('link', { name: /Spara till ditt konto/ })) as HTMLAnchorElement
    const url = new URL(link.href, 'http://x')
    expect(url.pathname).toBe('/claim')
    expect(url.searchParams.get('token')).toBe(token)
    expect(url.searchParams.get('server')).toBe(run.http)
    table.close()
  })
})

describe('counters and the area in front of you (C4)', () => {
  it('shows the seat\'s counters as a row and counts with a tap; the log carries setCounter', async () => {
    const id = await createSession(run, 's1', undefined, seatSetup())
    await open(id, 'A', 'Ada')
    const liv = await screen.findByText('Liv', { selector: '[data-counter="Liv"] span' })
    expect(liv.parentElement?.querySelector('b')?.textContent).toBe('20')
    fireEvent.click(screen.getByRole('button', { name: 'Liv minus' }))
    await waitFor(() => expect(screen.getByText('19', { selector: '[data-counter="Liv"] b' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Guld plus' }))
    await waitFor(() => expect(screen.getByText('4', { selector: '[data-counter="Guld"] b' })).toBeTruthy())
    const log = await run.store.read(id)
    expect(log.at(-1)).toMatchObject({ by: 'A', intent: { v: 'setCounter', value: 4 } })
    // The other seat's counters are not this phone's to change, nor listed as zones to play to.
    expect(screen.getAllByRole('button', { name: /minus/ })).toHaveLength(2)
    expect(document.querySelectorAll('[data-counter]')).toHaveLength(2)
    expect(document.querySelector('[data-zone-summary="counters:B"]')).toBeNull()
  })

  it('shows the cards in front of you as a strip with take up, flip and play, and hides the other seat\'s', async () => {
    const id = await createSession(run, 's1', undefined, seatSetup())
    const token = await open(id, 'A', 'Ada')
    const me = TableClient.connect({ url: run.url, sessionId: id, seat: 'A', token })
    await me.ready()
    await me.send({ v: 'draw', from: 'draw', to: 'mine:A', count: 2 })
    const mine = await waitFor(() => {
      const cards = document.querySelectorAll('[data-mine-card]')
      expect(cards).toHaveLength(2)
      return cards
    })
    expect(screen.getByText(/Framför dig · 2/)).toBeTruthy()
    fireEvent.click(mine[0]!.querySelector('button[data-act="flip"]')!)
    await waitFor(() => expect(document.querySelector('[data-mine-card][data-face="front"]')).toBeTruthy())
    fireEvent.click(document.querySelector('[data-mine-card] button[data-act="take"]')!)
    await waitFor(() => expect(document.querySelectorAll('[data-mine-card]')).toHaveLength(1))
    expect(document.querySelectorAll('[data-hand-card]')).toHaveLength(1)
    fireEvent.click(document.querySelector('[data-mine-card] button[data-act="play"]')!)
    expect(await screen.findByRole('dialog', { name: 'Spela till' })).toBeTruthy()
    const targets = screen.getAllByRole('button').map((b) => b.textContent ?? '')
    expect(targets.some((t) => t.startsWith('Framför mig'))).toBe(true)
    expect(targets.some((t) => t.includes('Framför B'))).toBe(false)
    me.close()
  })
})
