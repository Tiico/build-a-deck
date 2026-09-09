// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { TableClient } from '../src/client.js'
import { TablePage } from '../src/table/TablePage.js'
import { StatusLive } from '../src/status/StatusLive.js'
import { asSeat, asTable, createSession, roomOf, startServer, twoSeatSetup, type Running } from './fixture.js'

// The same table with one more public area to play into, so the landing rule has somewhere to
// land: `twoSeatSetup` has only the floor.
const withMarket = () => {
  const base = twoSeatSetup()
  return { ...base, zones: [...base.zones, { id: 'market', kind: 'area' as const, name: 'Marknad', visibility: 'all' as const, geometry: { x: -330, y: -280, w: 660, h: 140, rot: 0 } }] }
}

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

// A table with two cards lying face-up on the felt, opened on the table screen (seat null).
async function tableWithTwoCards(setup = twoSeatSetup()) {
  const id = await createSession(run, 's1', undefined, setup)
  const other = TableClient.connect(await asTable(run, id))
  await other.ready()
  await other.send({ v: 'seat.claim', seat: 'A', name: 'Ada' })
  await other.send({ v: 'draw', from: 'draw', to: 'table', count: 2 })
  await other.synced(2)
  const ids = other.view!.components.filter((c) => c.zone === 'table').map((c) => c.id)
  await other.send(
    { v: 'move', component: ids[0]!, to: 'table', x: 100, y: 50 },
    { v: 'flip', component: ids[0]!, face: 'front' },
    { v: 'move', component: ids[1]!, to: 'table', x: 300, y: 200 },
    { v: 'flip', component: ids[1]!, face: 'front' },
  )
  await other.synced(3)
  history.replaceState(null, '', `/table?session=${id}&host=${roomOf(id).hostKey}&mode=tv&server=${encodeURIComponent(run.url)}`)
  render(
    <StatusLive>
      <TablePage />
    </StatusLive>,
  )
  await screen.findAllByRole('button', { name: /kort i Spelyta/ })
  return { id, other, ids }
}

const stops = () => [...document.querySelectorAll('[data-kbd]')].map((el) => `${el.getAttribute('data-kbd')}:${el.getAttribute('tabindex')}`)

describe('the felt is one tab stop with the arrows inside it (#2)', () => {
  it('opens on the first thing on the felt and walks the rest with the arrow keys, never trapping Tab', async () => {
    const { other } = await tableWithTwoCards()
    const user = userEvent.setup()

    const zero = stops().filter((s) => s.endsWith(':0'))
    expect(zero).toHaveLength(1)
    expect(stops().filter((s) => s.endsWith(':-1')).length).toBeGreaterThan(3)

    const first = document.querySelector('[data-kbd][tabindex="0"]') as HTMLElement
    first.focus()
    expect(document.activeElement).toBe(first)
    await user.keyboard('{ArrowDown}')
    await waitFor(() => expect(document.activeElement).not.toBe(first))
    const second = document.activeElement as HTMLElement
    expect(second.getAttribute('data-kbd')).toMatch(/^card:/)
    expect(stops().filter((s) => s.endsWith(':0'))).toEqual([`${second.getAttribute('data-kbd')}:0`])

    await user.keyboard('{ArrowUp}')
    await waitFor(() => expect(document.activeElement).toBe(first))
    other.close()
  })
})

describe('Enter opens the address panel (#1, #2, variant C)', () => {
  it('offers the verbs and the named places, and says in its own row that a point on the felt cannot be said', async () => {
    const { other } = await tableWithTwoCards()
    const user = userEvent.setup()
    const card = screen.getByRole('button', { name: /^dragon, kort i Spelyta/ })
    card.focus()
    await user.keyboard('{Enter}')

    const panel = await screen.findByRole('dialog', { name: 'Handlingar för dragon' })
    expect(within(panel).getByRole('heading', { name: 'Gör' })).toBeTruthy()
    expect(within(panel).getByRole('button', { name: /^Vänd/ })).toBeTruthy()
    expect(within(panel).getByRole('button', { name: /^Vrid 90°/ })).toBeTruthy()
    expect(within(panel).getByRole('button', { name: /^Titta/ })).toBeTruthy()
    // The card is face-up already, so there is nothing left to reveal.
    expect(within(panel).getByRole('button', { name: /^Avslöja/ })).toHaveProperty('disabled', true)

    expect(within(panel).getByRole('heading', { name: 'Flytta till' })).toBeTruthy()
    expect(within(panel).getByRole('button', { name: /^Kasthög/ })).toBeTruthy()
    expect(within(panel).getByRole('button', { name: /^Draghög/ })).toBeTruthy()
    expect(within(panel).getByRole('button', { name: /^På knight/ })).toBeTruthy()
    // The one thing the address cannot express says so rather than pretending.
    const free = within(panel).getByRole('button', { name: /Fri placering/ })
    expect(free).toHaveProperty('disabled', true)
    expect(free.textContent).toMatch(/kräver pekdon/)

    // It takes the focus, and hands it back where it came from.
    expect(panel.contains(document.activeElement)).toBe(true)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(card)
    other.close()
  })
})

// What the last envelope asked the table for.
const lastIntents = async (id: string, n: number) => (await run.store.read(id)).slice(-n).map((l) => l.intent)

describe('the panel says the verbs the pointer already says, and no new one', () => {
  it('flips, turns and reveals a card, and shuffles a pile and turns its top by naming the pile (K15)', async () => {
    const { id, other } = await tableWithTwoCards()
    const user = userEvent.setup()
    const open = async (name: RegExp) => {
      const control = screen.getByRole('button', { name })
      control.focus()
      await user.keyboard('{Enter}')
      return within(await screen.findByRole('dialog'))
    }

    await user.click((await open(/^dragon, kort i Spelyta/)).getByRole('button', { name: /^Vänd/ }))
    await waitFor(async () => expect(await lastIntents(id, 1)).toEqual([{ v: 'flip', component: 'c0', face: 'back' }]))

    await user.click((await open(/^knight, kort i Spelyta/)).getByRole('button', { name: /^Vrid 90°/ }))
    await waitFor(async () => expect(await lastIntents(id, 1)).toEqual([{ v: 'rotate', component: 'c1', rot: 90 }]))

    // The card that is face down again can be revealed; the one still face up cannot.
    await user.click((await open(/^Dolt kort, kort i Spelyta/)).getByRole('button', { name: /^Avslöja/ }))
    await waitFor(async () => expect(await lastIntents(id, 1)).toEqual([{ v: 'reveal', components: ['c0'] }]))

    await user.click((await open(/^Draghög, hela högen/)).getByRole('button', { name: /^Blanda/ }))
    await waitFor(async () => expect(await lastIntents(id, 1)).toEqual([{ v: 'shuffle', pile: 'draw' }]))

    // A hidden pile grants no id for its top, so the address is the pile itself (K15).
    await user.click((await open(/^Översta kortet i Draghög/)).getByRole('button', { name: /^Vänd översta/ }))
    await waitFor(async () => expect(await lastIntents(id, 1)).toEqual([{ v: 'flip', component: { top: 'draw' }, face: 'front' }]))
    other.close()
  })
})

describe('a card moved by keyboard gets a coordinate the client works out (#2)', () => {
  it('lands in the next free slot of the zone rather than on top of the card already there, and the focus follows it', async () => {
    const { id, other } = await tableWithTwoCards(withMarket())
    const user = userEvent.setup()
    const play = async (name: RegExp) => {
      const control = screen.getByRole('button', { name })
      control.focus()
      await user.keyboard('{Enter}')
      const panel = await screen.findByRole('dialog')
      await user.click(within(panel).getByRole('button', { name: /^Marknad/ }))
    }

    await play(/^dragon, kort i Spelyta/)
    await waitFor(async () => expect(await lastIntents(id, 2)).toEqual([
      { v: 'move', component: 'c0', to: 'market', x: 14, y: 14 },
      { v: 'flip', component: 'c0', face: 'front' },
    ]))
    // The focus goes after the card, which is now in Marknad and says so.
    await waitFor(() => expect((document.activeElement as HTMLElement).getAttribute('aria-label')).toMatch(/^dragon, kort i Marknad/))

    await play(/^knight, kort i Spelyta/)
    await waitFor(async () => expect(await lastIntents(id, 2)).toEqual([
      { v: 'move', component: 'c1', to: 'market', x: 91, y: 14 },
      { v: 'flip', component: 'c1', face: 'front' },
    ]))
    other.close()
  })

  it('sends a whole pile with movePile and the top of one with split, both with the coordinate the client invents', async () => {
    const { id, other } = await tableWithTwoCards(withMarket())
    const user = userEvent.setup()
    const open = async (name: RegExp) => {
      const control = screen.getByRole('button', { name })
      control.focus()
      await user.keyboard('{Enter}')
      return within(await screen.findByRole('dialog'))
    }

    await user.click((await open(/^Översta kortet i Draghög/)).getByRole('button', { name: /^Kasthög/ }))
    await waitFor(async () => expect(await lastIntents(id, 1)).toEqual([{ v: 'split', pile: 'draw', at: 1, to: 'discard' }]))

    await user.click((await open(/^Draghög, hela högen/)).getByRole('button', { name: /^Marknad/ }))
    await waitFor(async () => expect(await lastIntents(id, 1)).toEqual([{ v: 'movePile', pile: 'draw', to: 'market', x: -240, y: -190 }]))
    other.close()
  })
})

const live = (which: 'polite' | 'assertive') => document.querySelector(`[data-status-live="${which}"]`)!.textContent

describe('what happens on the table reaches a reader (#1, #2, D5)', () => {
  it('says my own move at once, gathers the others up into one sentence, and cuts in when the table says no', async () => {
    const { id, other } = await tableWithTwoCards(withMarket())
    const user = userEvent.setup()
    const open = async (name: RegExp) => {
      const control = screen.getByRole('button', { name })
      control.focus()
      await user.keyboard('{Enter}')
      return within(await screen.findByRole('dialog'))
    }

    // Mine: this screen acts as the table itself, and hears its own move straight away.
    await user.click((await open(/^dragon, kort i Spelyta/)).getByRole('button', { name: /^Vänd/ }))
    await waitFor(() => expect(live('polite')).toBe('Bordet vände ett kort'))

    // Theirs: three lines in a breath become one sentence with a count, not three interruptions.
    const bo = TableClient.connect(await asSeat(run, id, 'B', 'Bo'))
    await bo.ready()
    await bo.send({ v: 'seat.claim', seat: 'B', name: 'Bo' })
    await bo.send({ v: 'split', pile: 'draw', at: 1, to: 'hand:B' })
    await bo.send({ v: 'shuffle', pile: 'draw' })
    await waitFor(() => expect(live('polite')).toBe('3 drag av de andra, senast: Bo blandade Draghög'), { timeout: 5000 })

    // A refusal is an answer to something someone asked for that did not happen: it cuts in.
    const panel = await open(/^knight, kort i Spelyta/)
    await other.send({ v: 'session.end' })
    await waitFor(() => expect(document.querySelector('[data-ended]')).toBeTruthy())
    await user.click(panel.getByRole('button', { name: /^Vänd/ }))
    await waitFor(() => expect(live('assertive')).toMatch(/Bordet är avslutat/))
    bo.close()
    other.close()
    expect((await run.store.read(id)).at(-1)?.intent.v).toBe('session.end')
  }, 20_000)
})

describe('the panel never offers a place that is where the thing already is', () => {
  it("leaves a pile's own name out of Flytta till: a pile cannot be split onto itself", async () => {
    const { other } = await tableWithTwoCards(withMarket())
    const user = userEvent.setup()
    const top = screen.getByRole('button', { name: /^Översta kortet i Draghög/ })
    top.focus()
    await user.keyboard('{Enter}')
    const panel = within(await screen.findByRole('dialog'))
    expect(panel.queryByRole('button', { name: /^Draghög/ })).toBeNull()
    expect(panel.getByRole('button', { name: /^Kasthög/ })).toBeTruthy()
    other.close()
  })
})

describe('the places are the ones a card can actually go to', () => {
  it('leaves out the hand of a seat nobody is sitting in: there is no one to hand a card to', async () => {
    const { other } = await tableWithTwoCards(withMarket())
    const user = userEvent.setup()
    const card = screen.getByRole('button', { name: /^dragon, kort i Spelyta/ })
    card.focus()
    await user.keyboard('{Enter}')
    const panel = within(await screen.findByRole('dialog'))
    expect(panel.getAllByRole('button', { name: /hand/ }).map((b) => b.textContent)).toEqual([expect.stringContaining('Adas hand')])
    other.close()
  })
})
