// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TableClient } from '../src/client.js'
import { OnlinePage, type OnlinePageProps } from '../src/online/OnlinePage.js'
import { admit, asTable, createSession, roomOf, startServer, type Running } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'
import { tabStops } from './tabs.js'
import { atWindow } from './felt-frame.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

// A landscape window, said outright: it is what decides which shape the seat's own hand takes
// (#77), and jsdom's own default would otherwise decide it by accident.
async function open(sessionId: string, seat: string, name: string, props: OnlinePageProps = {}) {
  atWindow({ w: 1280, h: 800 })
  const address = `/online?session=${sessionId}&seat=${seat}&name=${name}&token=${await admit(run, sessionId, seat, name)}&code=${roomOf(sessionId).code}&server=${encodeURIComponent(run.url)}`
  history.replaceState(null, '', address)
  render(<OnlinePage {...props} />)
  await screen.findByText(/Draghög/)
}

describe('OnlinePage (C2): both roles in one window', () => {
  it('sits down, fans its own hand by name at the bottom, shows the others as backs, and turns the table so its seat is at the bottom', async () => {
    const id = await createSession(run)
    const table = TableClient.connect(await asTable(run, id))
    await table.ready()
    await table.send({ v: 'deal', from: 'draw', to: ['hand:A', 'hand:B'], each: 2 })
    await open(id, 'B', 'Bo')
    await table.synced(2)
    expect(table.view?.seats.find((s) => s.id === 'B')).toEqual({ id: 'B', name: 'Bo', edge: 'N' })
    await waitFor(() => expect(document.querySelectorAll('[data-hand-fan] [data-hand-card]')).toHaveLength(2))
    // B sits at the top of the setup; the table is turned around so B is at the bottom.
    expect(document.querySelector('[data-table]')!.getAttribute('data-rotate')).toBe('180')
    // Own hand is not fanned on the felt as well; A's hand is backs and a count.
    expect(document.querySelector('[data-zone="hand:B"]')!.getAttribute('data-count')).toBe('2')
    expect(document.querySelectorAll('[data-zone="hand:B"] [data-component]')).toHaveLength(0)
    expect(document.querySelector('[data-zone="hand:A"]')!.textContent).not.toMatch(/dragon|knight/)
    expect(document.querySelector('[data-playable]')).toBeTruthy()
    table.close()
  })

  it('a card dragged out of the hand lands on the table face-up, in one envelope', async () => {
    const id = await createSession(run)
    const table = TableClient.connect(await asTable(run, id))
    await table.ready()
    await table.send({ v: 'draw', from: 'draw', to: 'hand:A', count: 2 })
    await open(id, 'A', 'Ada')
    await waitFor(() => expect(document.querySelectorAll('[data-hand-fan] [data-hand-card]')).toHaveLength(2))
    const card = document.querySelector('[data-hand-fan] [data-hand-card]') as HTMLElement
    const cardId = card.getAttribute('data-hand-card')
    // jsdom: the table's box is at (0,0) and the fitted scale is 1, so client px are mm + floor origin.
    // The hand stands beside the felt in this window, so a card is played by dragging it *across*
    // toward the table; a drag along the column is the column scrolling and plays nothing (#77).
    fireEvent.pointerDown(card, { clientX: 900, clientY: 300, pointerId: 1, isPrimary: true, button: 0 })
    fireEvent.pointerMove(card, { clientX: 400, clientY: 300, pointerId: 1 })
    fireEvent.pointerUp(card, { clientX: 400, clientY: 300, pointerId: 1 })
    await waitFor(async () => expect((await run.store.read(id)).slice(-2).map((l) => l.intent.v)).toEqual(['move', 'flip']))
    const log = await run.store.read(id)
    expect(log.at(-2)?.intent).toMatchObject({ v: 'move', component: cardId, to: 'table' })
    expect(new Set(log.slice(-2).map((l) => l.batch)).size).toBe(1)
    await waitFor(() => expect(document.querySelectorAll('[data-hand-fan] [data-hand-card]')).toHaveLength(1))
    table.close()
  })

  // K17's axis split, traded rather than broken (#77, section I). The band lay under the felt and
  // a card came up out of it while a sideways drag scrolled; the column stands beside the felt, so
  // a card comes across out of it and a drag along the column is the column scrolling. It is still
  // one decision per press, settled on the first movement that is long enough to mean anything.
  it('plays nothing when the drag runs along the column, because that is the column scrolling', async () => {
    const id = await createSession(run)
    const table = TableClient.connect(await asTable(run, id))
    await table.ready()
    await table.send({ v: 'draw', from: 'draw', to: 'hand:A', count: 2 })
    await open(id, 'A', 'Ada')
    await waitFor(() => expect(document.querySelectorAll('[data-hand-fan] [data-hand-card]')).toHaveLength(2))
    const before = (await run.store.read(id)).length
    const card = document.querySelector('[data-hand-fan] [data-hand-card]') as HTMLElement
    fireEvent.pointerDown(card, { clientX: 900, clientY: 700, pointerId: 1, isPrimary: true, button: 0 })
    fireEvent.pointerMove(card, { clientX: 900, clientY: 300, pointerId: 1 })
    fireEvent.pointerUp(card, { clientX: 400, clientY: 300, pointerId: 1 })
    // Not even the release over the felt revives it: the press stopped being a card at the first
    // movement, and nothing downstream can bring it back.
    expect((await run.store.read(id)).length).toBe(before)
    expect(document.querySelectorAll('[data-hand-fan] [data-hand-card]')).toHaveLength(2)
    table.close()
  })

  it('carries the phone\'s controls: flag, undo, the way out, and the survey after', async () => {
    const id = await createSession(run)
    await open(id, 'A', 'Ada')
    fireEvent.click(screen.getByRole('button', { name: /Flagga/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Flagga' }))
    await waitFor(async () => expect((await run.store.read(id)).at(-1)).toMatchObject({ by: 'A', intent: { v: 'flag' } }))
    fireEvent.click(screen.getByRole('button', { name: 'Ut… ur bordet' }))
    fireEvent.click(screen.getByRole('button', { name: 'Avsluta bordet för alla' }))
    fireEvent.click(screen.getByRole('button', { name: /Avsluta för alla/ }))
    expect(await screen.findByText(/Bordet är avslutat/)).toBeTruthy()
  })

  // The same need and the same way out (#31): distance mode shares the phone's session controls,
  // so it shares the exit that asks which.
  it('leaves the same way the phone does, and lands in the same seat picker', async () => {
    const id = await createSession(run)
    const table = TableClient.connect(await asTable(run, id))
    await table.ready()
    const went: string[] = []
    await open(id, 'A', 'Ada', { onLeave: (url) => went.push(url) })
    await table.send({ v: 'draw', from: 'draw', to: 'hand:A', count: 2 })
    await waitFor(() => expect(document.querySelectorAll('[data-hand-fan] [data-hand-card]')).toHaveLength(2))

    fireEvent.click(screen.getByRole('button', { name: 'Ut… ur bordet' }))
    expect(screen.getByRole('dialog', { name: 'På väg ut?' }).textContent).toMatch(/Tappar du nätet i stället står platsen kvar/)
    fireEvent.click(screen.getByRole('button', { name: 'Lämna bordet' }))
    await waitFor(async () => expect((await run.store.read(id)).at(-1)).toMatchObject({ by: 'A', intent: { v: 'seat.release', seat: 'A' } }))
    await table.synced(3)
    expect(table.view?.seats.find((s) => s.id === 'A')).toEqual({ id: 'A', name: null, edge: 'S' })
    expect(new URL(went[0] ?? '', 'http://x').pathname).toBe('/join')
    table.close()
  })
})

// The online seat shares the phone's session overlays, so it shares the phone's quiet once the
// table has ended (UX-38, #83): the felt and the hand are the picture behind the survey.
describe('the ended table goes quiet behind the survey (C9, D5, G3, #83)', () => {
  it('takes the felt and the hand out of reach, and leaves the survey the only thing Tab can reach', async () => {
    const id = await createSession(run)
    await open(id, 'A', 'Ada')
    const table = TableClient.connect(await asTable(run, id))
    await table.ready()
    await table.send({ v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    await waitFor(() => expect(document.querySelectorAll('[data-hand-fan] [data-hand-card]')).toHaveLength(1))
    expect(document.querySelector('[data-hand-fan]')!.closest('[inert]')).toBeNull()

    await table.send({ v: 'session.end' })
    await screen.findByText(/Bordet är avslutat/)
    expect(document.querySelector('[data-hand-fan]')!.closest('[inert]')).not.toBeNull()
    const survey = document.querySelector('.byd-survey')!
    expect(survey.closest('[inert]')).toBeNull()
    const stops = tabStops()
    expect(stops.length).toBeGreaterThan(1)
    expect(stops.every((el) => survey.contains(el))).toBe(true)
    table.close()
  })
})
