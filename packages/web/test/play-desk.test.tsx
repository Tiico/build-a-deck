// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TableClient } from '../src/client.js'
import { PlayerPage } from '../src/player/PlayerPage.js'
import { DESK_QUERY } from '../src/player/desk.js'
import { admit, asTable, createSession, roomOf, seatSetup, startServer, type Running } from './fixture.js'

// `/play` in a wide window (#1310, beställarens beslut A i #1308): a computer at a table around a TV
// gets its hand along the foot of the window, in full size, and the places a card can be played to
// as targets over it. The mouse does what it does in `/online`'s hand (K11, #1291): resting reads,
// a click turns, a drag to a target plays. The phone and narrow windows keep the four tabs (C4).

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  cleanup()
  vi.unstubAllGlobals()
  await run.stop()
})

// A window that answers the desk's question, and only that one: wide, or not.
function windowIs(wide: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: wide && query === DESK_QUERY,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }))
}

async function seated(wide: boolean, cards = 3): Promise<{ table: TableClient; id: string }> {
  windowIs(wide)
  const id = await createSession(run, 's1', undefined, seatSetup())
  const table = TableClient.connect(await asTable(run, id))
  await table.ready()
  const token = await admit(run, id, 'A', 'Ada')
  history.replaceState(null, '', `/play?session=${id}&seat=A&code=${roomOf(id).code}&server=${encodeURIComponent(run.url)}#token=${token}`)
  render(<PlayerPage />)
  await screen.findAllByText('Ada')
  if (cards > 0) {
    await table.send({ v: 'draw', from: 'draw', to: 'hand:A', count: cards })
    await waitFor(() => expect(document.querySelectorAll('[data-hand-card]')).toHaveLength(cards))
  }
  return { table, id }
}

const zone = (id: string) => document.querySelector<HTMLElement>(`[data-drop-zone="${id}"]`)
const card = (i: number) => document.querySelectorAll<HTMLElement>('[data-hand-card]')[i]!
const at = (x: number, y: number, pointerType = 'mouse') => ({ clientX: x, clientY: y, pointerId: 1, isPrimary: true, button: 0, pointerType })

// jsdom lays nothing out, so the point a card is let go at is told what lies under it.
function under(el: Element | null): void {
  document.elementFromPoint = () => el
}

// A drag as a mouse makes one: down on the card, up past the threshold, over the target, let go.
async function drag(from: HTMLElement, onto: HTMLElement | null): Promise<void> {
  under(onto)
  await act(async () => void fireEvent.pointerDown(from, at(400, 700)))
  await act(async () => void fireEvent.pointerMove(from, at(400, 660)))
  await act(async () => void fireEvent.pointerMove(from, at(420, 300)))
  await act(async () => void fireEvent.pointerUp(from, at(420, 300)))
}

describe('the hand along the foot of a wide window (#1310)', () => {
  it('draws the hand in a row and the places to play to over it, and no tabs', async () => {
    const { table } = await seated(true)
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(document.querySelector('[data-hand-row]')?.querySelectorAll('[data-hand-card]')).toHaveLength(3)
    for (const id of ['draw', 'discard', 'mine:A', 'mine:B', 'table']) expect(zone(id), id).not.toBeNull()
    // A counters zone is not a place for a card (C4, #713), and neither is a hand.
    for (const id of ['counters:A', 'counters:B', 'hand:A', 'hand:B']) expect(zone(id), id).toBeNull()
    table.close()
  })

  it('carries in its head what «Mer» holds on the phone, Ångra, and where the table is', async () => {
    const { table } = await seated(true)
    const head = document.querySelector('.byd-desk-head')!
    expect(head.textContent).toContain('Bordet står på TV:n')
    for (const name of [/^Ångra$/, /^Flagga$/, /^Lämna… eller avsluta/, /^Hjälp om handen$/]) expect(screen.getByRole('button', { name }), String(name)).toBeTruthy()
    // The counters stand there too (C4): what a seat keeps count of.
    expect(head.querySelector('[data-counter="Liv"]')).not.toBeNull()
    table.close()
  })

  it('turns a card with a mouse click and sends nothing', async () => {
    const { table } = await seated(true)
    const first = card(0)
    const id = first.getAttribute('data-hand-card')!
    await act(async () => void fireEvent.pointerDown(first, at(400, 700)))
    await act(async () => void fireEvent.pointerUp(first, at(400, 700)))
    expect(document.querySelector(`[data-hand-card="${id}"]`)?.getAttribute('data-turned')).toBe('true')
    expect(screen.queryByRole('dialog')).toBeNull()
    // The table sees the hand as a count and never the card (B6): still three, and nothing played.
    await new Promise((r) => setTimeout(r, 200))
    expect(table.view?.zones.find((z) => z.id === 'hand:A')).toMatchObject({ count: 3 })
    table.close()
  })

  it('plays a card dragged onto a target there, face up in a public area (K11)', async () => {
    const { table } = await seated(true)
    const id = card(1).getAttribute('data-hand-card')!
    await drag(card(1), zone('mine:A'))
    await waitFor(() => expect(table.view?.components.find((c) => c.id === id)).toMatchObject({ zone: 'mine:A', face: 'front' }))
    table.close()
  })

  it('plays a card turned in the hand face down wherever it is dragged (K11, #1133)', async () => {
    const { table } = await seated(true)
    const id = card(0).getAttribute('data-hand-card')!
    fireEvent.keyDown(card(0), { key: 'f' })
    await waitFor(() => expect(card(0).getAttribute('data-turned')).toBe('true'))
    await drag(card(0), zone('table'))
    await waitFor(() => expect(table.view?.components.find((c) => c.id === id)).toMatchObject({ zone: 'table', face: 'back' }))
    table.close()
  })

  it('marks the target a carried card is over, and puts a card let go over nothing back in the hand', async () => {
    const { table } = await seated(true)
    const id = card(0).getAttribute('data-hand-card')!
    under(zone('discard'))
    await act(async () => void fireEvent.pointerDown(card(0), at(400, 700)))
    await act(async () => void fireEvent.pointerMove(card(0), at(400, 660)))
    await act(async () => void fireEvent.pointerMove(card(0), at(500, 300)))
    expect(zone('discard')?.hasAttribute('data-aim')).toBe(true)
    expect(zone('mine:A')?.hasAttribute('data-aim')).toBe(false)
    under(document.querySelector('.byd-desk-head'))
    await act(async () => void fireEvent.pointerMove(card(0), at(500, 20)))
    expect(document.querySelectorAll('[data-drop-zone][data-aim]')).toHaveLength(0)
    await act(async () => void fireEvent.pointerUp(card(0), at(500, 20)))
    await new Promise((r) => setTimeout(r, 200))
    expect(table.view?.zones.find((z) => z.id === 'hand:A')).toMatchObject({ count: 3 })
    expect(document.querySelector(`[data-hand-card="${id}"]`)).not.toBeNull()
    table.close()
  })

  it('draws the top card of a pile into the hand on a click (#79)', async () => {
    const { table } = await seated(true, 1)
    fireEvent.click(document.querySelector('[data-zone-draw="draw"]')!)
    await waitFor(() => expect(document.querySelectorAll('[data-hand-card]')).toHaveLength(2))
    table.close()
  })

  it('keeps Enter for the address panel and Space for turning (K16, #1291)', async () => {
    const { table } = await seated(true)
    fireEvent.keyDown(card(2), { key: ' ' })
    await waitFor(() => expect(card(2).getAttribute('data-turned')).toBe('true'))
    fireEvent.keyDown(card(2), { key: 'Enter' })
    expect(await screen.findByRole('dialog', { name: /^Handlingar för/ })).toBeTruthy()
    table.close()
  })

  it('reads a card the mouse rests on over the hand, saying what a click and a drag do here', async () => {
    const { table } = await seated(true)
    act(() => void fireEvent.pointerEnter(card(0), { pointerType: 'mouse' }))
    expect(document.querySelector('[data-lift]')?.getAttribute('data-lift')).toBe(card(0).getAttribute('data-hand-card'))
    expect(document.querySelector('[data-lift-says]')?.textContent).toBe('Klick vänder · dra till en yta spelar')
    table.close()
  })

  it('leaves a finger the press that reads and then asks (#484 fynd 10)', async () => {
    const { table } = await seated(true)
    const tap = async () => {
      await act(async () => void fireEvent.pointerDown(card(0), at(400, 700, 'touch')))
      await act(async () => void fireEvent.pointerUp(card(0), at(400, 700, 'touch')))
    }
    await tap()
    expect(document.querySelector('[data-lift]')).not.toBeNull()
    expect(card(0).getAttribute('data-turned')).toBeNull()
    await tap()
    expect(await screen.findByRole('dialog', { name: /^Handlingar för/ })).toBeTruthy()
    table.close()
  })

  it('keeps the four tabs in a narrow window', async () => {
    const { table } = await seated(false)
    expect(screen.getByRole('tablist')).toBeTruthy()
    expect(document.querySelector('[data-hand-row]')).toBeNull()
    table.close()
  })
})
