// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { TableClient } from '../src/client.js'
import { TablePage } from '../src/table/TablePage.js'
import { asSeat, asTable, createNamedSession, createSession, roomOf, startServer, type Running } from './fixture.js'

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

describe('TablePage', () => {
  it('connects from the URL, renders the table with TV chrome, and follows the table live', async () => {
    const id = await createSession(run)
    history.replaceState(null, '', `/table?session=${id}&host=${roomOf(id).hostKey}&mode=tv&server=${encodeURIComponent(run.url)}`)
    render(<TablePage />)

    expect(await screen.findByText(roomOf(id).code)).toBeTruthy()
    expect(document.querySelector('[data-table]')).toBeTruthy()
    expect(document.querySelector('[data-zone="draw"]')!.getAttribute('data-count')).toBe('10')

    const other = TableClient.connect(await asTable(run, id))
    await other.ready()
    await other.send({ v: 'seat.claim', seat: 'A', name: 'Ada' }, { v: 'draw', from: 'draw', to: 'hand:A', count: 3 })
    expect(await screen.findByText(/Ada satte sig/)).toBeTruthy()
    expect(document.querySelector('[data-zone="draw"]')!.getAttribute('data-count')).toBe('7')
    expect(document.querySelector('[data-zone="hand:A"]')!.getAttribute('data-count')).toBe('3')
    expect(screen.getByRole('list', { name: /platser/i }).textContent).toMatch(/Ada.*3 kort på hand/)
    other.close()
  })
})

describe('the screen says which game it runs (C)', () => {
  it('titles the TV with the game name and version from the session record', async () => {
    const id = await createNamedSession(run, 'Skogens herrar')
    history.replaceState(null, '', `/table?session=${id}&host=${roomOf(id).hostKey}&mode=tv&server=${encodeURIComponent(run.url)}`)
    render(<TablePage />)
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Skogens herrar rev-1'))
  })
})

describe('the table mode names the game too (B)', () => {
  it('writes the game, its version and the room code along the top of the felt', async () => {
    const id = await createNamedSession(run, 'Skogens herrar')
    history.replaceState(null, '', `/table?session=${id}&host=${roomOf(id).hostKey}&mode=table&server=${encodeURIComponent(run.url)}`)
    render(<TablePage />)
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(`Skogens herrar · rev-1 · ${roomOf(id).code}`))
    // The felt is the whole screen in table mode: no TV chrome around it.
    expect(document.querySelector('[data-tv]')).toBeNull()
  })
})

describe('a screen that joins mid-game (#20)', () => {
  it('fills SENAST from the log the moment it connects, not only with what happens afterwards', async () => {
    const id = await createSession(run)
    const played = TableClient.connect(await asTable(run, id))
    await played.ready()
    await played.send({ v: 'seat.claim', seat: 'A', name: 'Ada' })
    await played.send({ v: 'draw', from: 'draw', to: 'discard', count: 2 })
    played.close()

    history.replaceState(null, '', `/table?session=${id}&host=${roomOf(id).hostKey}&mode=tv&server=${encodeURIComponent(run.url)}`)
    render(<TablePage />)
    await screen.findByText(roomOf(id).code)

    const feed = screen.getByRole('list', { name: /senast/i })
    await waitFor(() => expect(within(feed).getAllByRole('listitem')).toHaveLength(2))
    expect(within(feed).getAllByRole('listitem').map((l) => l.textContent)).toEqual([
      expect.stringMatching(/^2.*Bordet drog 2 från Draghög/),
      expect.stringMatching(/^1.*Ada satte sig/),
    ])
  })
})

describe('pointing at a card on the TV (C)', () => {
  it('fills the inspection panel from the table underneath it', async () => {
    const id = await createSession(run)
    history.replaceState(null, '', `/table?session=${id}&host=${roomOf(id).hostKey}&mode=tv&server=${encodeURIComponent(run.url)}`)
    render(<TablePage />)
    await screen.findByText(roomOf(id).code)

    const other = TableClient.connect(await asTable(run, id))
    await other.ready()
    await other.send({ v: 'draw', from: 'draw', to: 'table', count: 1 })
    await waitFor(() => expect(document.querySelector('.byd-card')).toBeTruthy())
    const card = document.querySelector('.byd-card')!

    const panel = screen.getByRole('region', { name: /inspektion/i })
    expect(panel.textContent).toMatch(/peka på ett kort/)
    fireEvent.pointerEnter(card)
    await waitFor(() => expect(panel.textContent).toMatch(/dolt kort/))
    fireEvent.pointerLeave(card)
    await waitFor(() => expect(panel.textContent).toMatch(/peka på ett kort/))
    other.close()
  })
})

describe('a screen that joins mid-game', () => {
  it('shows what has happened so far in the feed, not an empty list', async () => {
    const id = await createSession(run)
    const other = TableClient.connect(await asTable(run, id))
    await other.ready()
    await other.send({ v: 'seat.claim', seat: 'A', name: 'Ada' }, { v: 'draw', from: 'draw', to: 'hand:A', count: 2 })
    other.close()

    history.replaceState(null, '', `/table?session=${id}&host=${roomOf(id).hostKey}&mode=tv&server=${encodeURIComponent(run.url)}`)
    render(<TablePage />)
    expect(await screen.findByText(/Ada satte sig/)).toBeTruthy()
    expect(screen.getByText(/drog 2 från Draghög/)).toBeTruthy()
  })
})

describe('a proposed rewind on the table (C)', () => {
  it('shows the table as it was, says who is waited on, has no buttons, and returns to the present when it is settled', async () => {
    const id = await createSession(run)
    history.replaceState(null, '', `/table?session=${id}&host=${roomOf(id).hostKey}&mode=tv&server=${encodeURIComponent(run.url)}`)
    render(<TablePage />)
    await screen.findByText(roomOf(id).code)

    const ada = TableClient.connect(await asSeat(run, id, 'A'))
    const bo = TableClient.connect(await asSeat(run, id, 'B'))
    await Promise.all([ada.ready(), bo.ready()])
    await ada.send({ v: 'seat.claim', seat: 'A', name: 'Ada' }, { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    await bo.send({ v: 'seat.claim', seat: 'B', name: 'Bo' }, { v: 'draw', from: 'draw', to: 'discard', count: 3 })
    await waitFor(() => expect(document.querySelector('[data-zone="draw"]')!.getAttribute('data-count')).toBe('6'))

    await ada.send({ v: 'rewind.propose', toSeq: 2 })
    await waitFor(() => expect(document.querySelector('[data-rewind-preview]')).toBeTruthy())
    expect(document.querySelector('[data-zone="draw"]')!.getAttribute('data-count')).toBe('9')
    expect(document.querySelector('[data-zone="discard"]')!.getAttribute('data-count')).toBe('0')
    expect(screen.getByText(/så här såg bordet ut/)).toBeTruthy()
    expect(screen.getByText(/väntar på Bo/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Godkänn|Avvisa/ })).toBeNull()

    await bo.send({ v: 'rewind.reject', proposal: bo.view!.rewind!.id })
    await waitFor(() => expect(document.querySelector('[data-rewind-preview]')).toBeNull())
    expect(document.querySelector('[data-zone="draw"]')!.getAttribute('data-count')).toBe('6')
    ada.close()
    bo.close()
  })
})

describe('playing on the table (K1, K2, C)', () => {
  it('a drag on the table screen becomes an envelope the server commits', async () => {
    const id = await createSession(run)
    history.replaceState(null, '', `/table?session=${id}&host=${roomOf(id).hostKey}&mode=tv&server=${encodeURIComponent(run.url)}`)
    render(<TablePage />)
    await screen.findByText(/Draghög/)
    const other = TableClient.connect(await asTable(run, id))
    await other.ready()
    await other.send({ v: 'draw', from: 'draw', to: 'table', count: 1 })
    const card = await waitFor(() => {
      const el = document.querySelector('[data-table] .byd-card')
      if (!el) throw new Error('no loose card yet')
      return el
    })
    // jsdom has no layout: the frame is sized 0, so the fitted scale is 0. Pointer deltas in
    // client pixels still map through the fixed geometry once we lift the card far enough.
    fireEvent.pointerDown(card, { clientX: 10, clientY: 10, pointerId: 1, isPrimary: true, button: 0 })
    fireEvent.pointerMove(card, { clientX: 400, clientY: 300, pointerId: 1 })
    fireEvent.pointerUp(card, { clientX: 400, clientY: 300, pointerId: 1 })
    await waitFor(async () => expect((await run.store.read(id)).at(-1)?.intent.v).toBe('move'))
    expect((await run.store.read(id)).at(-1)?.by).toBeNull()
    other.close()
  })
})

describe('presence on the table screen (K6)', () => {
  it('shows where the others are and what they carry, forgets them when they leave, and sends its own pointer', async () => {
    const id = await createSession(run)
    history.replaceState(null, '', `/table?session=${id}&host=${roomOf(id).hostKey}&mode=tv&server=${encodeURIComponent(run.url)}`)
    render(<TablePage />)
    await screen.findByText(/Draghög/)
    const ada = TableClient.connect(await asSeat(run, id, 'A'))
    await ada.ready()
    await ada.send({ v: 'seat.claim', seat: 'A', name: 'Ada' }, { v: 'draw', from: 'draw', to: 'table', count: 1 })
    const cardId = ada.view!.components[0]!.id

    ada.sendPresence({ kind: 'cursor', x: 0, y: 0 })
    const cursor = await waitFor(() => {
      const el = document.querySelector('[data-cursor]')
      if (!el) throw new Error('no cursor yet')
      return el
    })
    expect(cursor.textContent).toContain('Ada')
    ada.sendPresence({ kind: 'drag', component: cardId, x: 100, y: 100 })
    await waitFor(() => expect(document.querySelector(`[data-ghost-of][data-component="${cardId}"]`)).toBeTruthy())
    expect(document.querySelector(`[data-component="${cardId}"][data-carried]`)).toBeTruthy()

    // What this screen does with its pointer reaches Ada.
    const seen: string[] = []
    ada.onPresence((_from, p) => seen.push(p.kind))
    fireEvent.pointerMove(document.querySelector('[data-table]')!, { clientX: 300, clientY: 200 })
    await waitFor(() => expect(seen).toContain('cursor'))

    ada.close()
    await waitFor(() => expect(document.querySelector('[data-cursor]')).toBeNull())
    expect(document.querySelector('[data-ghost-of]')).toBeNull()
  })

  it('a card that just moved carries the colour of the seat that moved it, for a moment', async () => {
    const id = await createSession(run)
    history.replaceState(null, '', `/table?session=${id}&host=${roomOf(id).hostKey}&mode=tv&server=${encodeURIComponent(run.url)}`)
    render(<TablePage />)
    await screen.findByText(/Draghög/)
    const ada = TableClient.connect(await asSeat(run, id, 'A'))
    await ada.ready()
    await ada.send({ v: 'seat.claim', seat: 'A', name: 'Ada' }, { v: 'draw', from: 'draw', to: 'table', count: 1 })
    const cardId = ada.view!.components[0]!.id
    await ada.send({ v: 'move', component: cardId, to: 'table', x: 50, y: 50 })
    await waitFor(() => expect(document.querySelector(`[data-component="${cardId}"]`)!.getAttribute('data-by')).toBe('A'))
    ada.close()
  })
})

describe('the end of a session on the table (C9)', () => {
  it('says the session is over, on which version, with a summary, and points to the phones', async () => {
    const id = await createSession(run)
    history.replaceState(null, '', `/table?session=${id}&host=${roomOf(id).hostKey}&mode=tv&server=${encodeURIComponent(run.url)}`)
    render(<TablePage />)
    await screen.findByText(/Draghög/)
    const ada = TableClient.connect(await asSeat(run, id, 'A'))
    await ada.ready()
    await ada.send({ v: 'seat.claim', seat: 'A', name: 'Ada' }, { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    await ada.send({ v: 'flag', note: 'hm' })
    await ada.send({ v: 'session.end' })
    const over = await screen.findByText(/Sessionen är avslutad/)
    const overlay = over.closest('[data-ended]')!
    await waitFor(() => expect(overlay.textContent).toMatch(/v1/))
    expect(overlay.textContent).toMatch(/1 flaggade ögonblick/)
    expect(overlay.textContent).toMatch(/1 spelare/)
    expect(overlay.textContent).toMatch(/telefonerna/)
    ada.close()
  })
})

describe('the host\'s screen (DRIFT §9)', () => {
  it('opens only with the host key, and shows the room code it is told rather than anything from the URL', async () => {
    const id = await createSession(run)
    history.replaceState(null, '', `/table?session=${id}&mode=tv&server=${encodeURIComponent(run.url)}`)
    const { unmount } = render(<TablePage />)
    expect(await screen.findByText(/värdens länk/)).toBeTruthy()
    expect(document.querySelector('[data-table]')).toBeNull()
    unmount()

    history.replaceState(null, '', `/table?session=${id}&host=${roomOf(id).hostKey}&mode=tv&server=${encodeURIComponent(run.url)}`)
    render(<TablePage />)
    expect(await screen.findByText(roomOf(id).code)).toBeTruthy()
    const qr = await screen.findByAltText(new RegExp(`join\\?code=${roomOf(id).code}`))
    expect(qr.getAttribute('alt')).toContain(`join?code=${roomOf(id).code}`)
  })
})
