// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { WebSocket as WsClient } from 'ws'
import { TableClient, useWebSocketImplementation, type WebSocketCtor } from '../src/client.js'
import { PlayerPage, type PlayerPageProps } from '../src/player/PlayerPage.js'
import { DEFAULT_TIMING } from '../src/status/connection.js'
import { admit, asSeat, asTable, createSession, roomOf, seatSetup, startServer, type Running } from './fixture.js'

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  vi.useRealTimers()
  useWebSocketImplementation(WsClient as unknown as WebSocketCtor)
  await run.stop()
})

// Opens the phone for a seat with a token bought for it, and returns that token: the same
// guest on another connection (a test helper) is the same token, not a second admission.
async function open(sessionId: string, seat: string, name: string, props: PlayerPageProps = {}): Promise<string> {
  const token = await admit(run, sessionId, seat, name)
  // The room code travels with the phone the way the picker sends it (#12, DRIFT §9); it is the
  // only address the way out has to go back to.
  history.replaceState(null, '', `/play?session=${sessionId}&seat=${seat}&name=${name}&token=${token}&code=${roomOf(sessionId).code}&server=${encodeURIComponent(run.url)}`)
  render(<PlayerPage {...props} />)
  await screen.findByText(name)
  return token
}

// A socket that loses the envelope the phone sits down with and then drops, which is what a lift
// eating the signal at the wrong moment looks like from the page. Everything after it is an
// ordinary socket, so the reconnection is the real one.
function losesTheFirstClaim(): WebSocketCtor {
  let eaten = false
  return class extends WsClient {
    override send(data: string): void {
      if (!eaten && data.includes('seat.claim')) {
        eaten = true
        this.close()
        return
      }
      super.send(data)
    }
  } as unknown as WebSocketCtor
}

describe('PlayerPage', () => {
  it('claims its seat by name on connect and shows the hand it is dealt', async () => {
    const id = await createSession(run)
    const table = TableClient.connect(await asTable(run, id))
    await table.ready()
    await open(id, 'A', 'Ada')
    await table.synced(1)
    expect(table.view?.seats.find((s) => s.id === 'A')).toEqual({ id: 'A', name: 'Ada', edge: 'S' })

    await table.send({ v: 'deal', from: 'draw', to: ['hand:A', 'hand:B'], each: 2 })
    await waitFor(() => expect(document.querySelectorAll('[data-hand-card]')).toHaveLength(2))
    expect(screen.getByText('dragon')).toBeTruthy()
    table.close()
  })

  // The hint describes what a finger can do to a card. With no cards it described nothing that
  // was on the screen, which is what UX-16 caught.
  it('holds the gesture hint back until there is a card to use it on', async () => {
    const id = await createSession(run)
    const table = TableClient.connect(await asTable(run, id))
    await table.ready()
    await open(id, 'A', 'Ada')
    await table.synced(1)

    expect(screen.queryByText(/tryck = titta/)).toBeNull()
    expect(screen.getByText(/Tom hand/)).toBeTruthy()

    await table.send({ v: 'deal', from: 'draw', to: ['hand:A'], each: 1 })
    await waitFor(() => expect(document.querySelectorAll('[data-hand-card]')).toHaveLength(1))
    expect(screen.getByText('tryck = titta · dra upp = spela · håll = välj flera')).toBeTruthy()
    expect(screen.queryByText(/Tom hand/)).toBeNull()
    table.close()
  })

  // Sitting down is one envelope, and an envelope can be lost: `send` answers a socket that is
  // not there without throwing, and anything in flight is failed when the line drops. Latching
  // on the attempt rather than on the answer left a phone looking at a seat it never took, with
  // its own name in the link, until somebody thought to reload the page.
  it('sits down again when the first claim never lands', async () => {
    const id = await createSession(run)
    useWebSocketImplementation(losesTheFirstClaim())
    const token = await admit(run, id, 'A', 'Ada')
    history.replaceState(null, '', `/play?session=${id}&seat=A&name=Ada&token=${token}&code=${roomOf(id).code}&server=${encodeURIComponent(run.url)}`)
    render(<PlayerPage timing={{ ...DEFAULT_TIMING, retryPlanMs: [20, 40, 80] }} />)

    expect(await screen.findByText('Ada', undefined, { timeout: 4000 })).toBeTruthy()
    // Once, still: the claim that was lost is the one that comes back, not a second one on top
    // of a seat already taken.
    expect((await run.store.read(id)).map((l) => l.intent.v)).toEqual(['seat.claim'])
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
  // The way out (#31) put a question in front of the question: `Ut…` asks which exit is meant
  // before `Avsluta bordet?` asks whether. Ending is a press further away than it was, and every
  // step after it is exactly what it was.
  it('asks first, then locks the log; the survey takes one question at a time and lands on the server, tied to the version', async () => {
    const id = await createSession(run)
    await open(id, 'A', 'Ada')
    fireEvent.click(screen.getByRole('button', { name: 'Ut… ur bordet' }))
    fireEvent.click(screen.getByRole('button', { name: 'Avsluta bordet för alla' }))
    expect(screen.getByText(/Avsluta bordet\?/)).toBeTruthy()
    expect((await run.store.read(id)).some((l) => l.intent.v === 'session.end')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: /Avsluta för alla/ }))
    expect(await screen.findByText(/Bordet är avslutat/)).toBeTruthy()
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

// The way out (#31, prototype variant C). The row is already full at 375 px, so the exit is not a
// fourth control beside the red one: `Avsluta` becomes `Ut…`, and the sheet behind it asks which
// way out is meant with both consequences written out.
describe('leaving the table (#31)', () => {
  it('Ut… asks which way out, and leaving sends seat.release and lands back in the seat picker', async () => {
    const id = await createSession(run)
    const table = TableClient.connect(await asTable(run, id))
    await table.ready()
    await open(id, 'A', 'Ada', { onLeave: () => undefined })
    await table.send({ v: 'draw', from: 'draw', to: 'hand:A', count: 3 })
    await waitFor(() => expect(document.querySelectorAll('[data-hand-card]')).toHaveLength(3))

    fireEvent.click(screen.getByRole('button', { name: 'Ut… ur bordet' }))
    const sheet = screen.getByRole('dialog', { name: 'På väg ut?' })
    // Both exits stand in it, each under what it costs; asking is not yet answering.
    expect(sheet.textContent).toMatch(/Din plats blir ledig och korten i din hand går tillbaka i draghögen/)
    expect(sheet.textContent).toMatch(/Tappar du nätet i stället står platsen kvar/)
    expect((await run.store.read(id)).some((l) => ['seat.release', 'session.end'].includes(l.intent.v))).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Lämna bordet' }))
    await waitFor(async () => expect((await run.store.read(id)).at(-1)).toMatchObject({ by: 'A', intent: { v: 'seat.release', seat: 'A' } }))
    // The seat is free again for everyone else, and the hand is back in the pile it came from.
    await table.synced(3)
    expect(table.view?.seats.find((s) => s.id === 'A')).toEqual({ id: 'A', name: null, edge: 'S' })
    expect(table.view?.zones.find((z) => z.id === 'draw')).toMatchObject({ count: 10 })
    table.close()
  })

  it('lands her in the seat picker for the same room, told what happened to the seat she gave up', async () => {
    const id = await createSession(run)
    const went: string[] = []
    await open(id, 'A', 'Ada', { onLeave: (url) => went.push(url) })
    fireEvent.click(screen.getByRole('button', { name: 'Ut… ur bordet' }))
    fireEvent.click(screen.getByRole('button', { name: 'Lämna bordet' }))
    await waitFor(() => expect(went).toHaveLength(1))
    const back = new URL(went[0] ?? '', 'http://x')
    expect(back.pathname).toBe('/join')
    // The code, not the session: the code is what buys a token, and a picker that cannot admit
    // anyone is not a way out (DRIFT §9).
    expect(back.searchParams.get('code')).toBe(roomOf(id).code)
    expect(back.searchParams.get('server')).toBe(run.url)
    expect(back.searchParams.get('left')).toBe('1')
  })

  it('does not sit straight back down on the seat it just gave up', async () => {
    const id = await createSession(run)
    await open(id, 'A', 'Ada', { onLeave: () => undefined })
    fireEvent.click(screen.getByRole('button', { name: 'Ut… ur bordet' }))
    fireEvent.click(screen.getByRole('button', { name: 'Lämna bordet' }))
    await waitFor(async () => expect((await run.store.read(id)).at(-1)?.intent.v).toBe('seat.release'))
    // The page is still standing where the browser has not navigated away from it yet, and the
    // seat it is looking at is free. Sitting down is what the way in does, once.
    await new Promise((r) => setTimeout(r, 120))
    expect((await run.store.read(id)).map((l) => l.intent.v)).toEqual(['seat.claim', 'seat.release'])
  })

  it('asks its own question before ending the table, so ending is one press further away than it was', async () => {
    const id = await createSession(run)
    await open(id, 'A', 'Ada')
    fireEvent.click(screen.getByRole('button', { name: 'Ut… ur bordet' }))
    fireEvent.click(screen.getByRole('button', { name: 'Avsluta bordet för alla' }))
    expect(screen.getByRole('dialog', { name: 'Avsluta bordet?' })).toBeTruthy()
    expect((await run.store.read(id)).some((l) => l.intent.v === 'session.end')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Avsluta för alla' }))
    expect(await screen.findByText(/Bordet är avslutat/)).toBeTruthy()
  })

  it('hands the focus back to the control that opened it, whichever way the question was answered', async () => {
    const id = await createSession(run)
    await open(id, 'A', 'Ada')
    const out = screen.getByRole('button', { name: 'Ut… ur bordet' })
    fireEvent.click(out)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Stanna kvar' }))
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'På väg ut?' }), { key: 'Escape' })
    await waitFor(() => expect(document.activeElement).toBe(out))
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
