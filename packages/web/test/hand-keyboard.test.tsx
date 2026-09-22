// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { TableClient } from '../src/client.js'
import { PlayerPage } from '../src/player/PlayerPage.js'
import { StatusLive } from '../src/status/StatusLive.js'
import { admit, asTable, createSession, startServer, type Running } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

// Ada's phone, with three cards in her hand. With a deck, the rows carry the titles the cards are
// called by, exactly as a deck built through the guided start does (#412).
async function phone(deck?: unknown) {
  const id = await createSession(run, 's1', deck)
  const table = TableClient.connect(await asTable(run, id))
  await table.ready()
  await table.send({ v: 'draw', from: 'draw', to: 'hand:A', count: 3 })
  await table.synced(1)
  const token = await admit(run, id, 'A', 'Ada')
  history.replaceState(null, '', `/play?session=${id}&seat=A&name=Ada&token=${token}&server=${encodeURIComponent(run.url)}`)
  render(
    <StatusLive>
      <PlayerPage />
    </StatusLive>,
  )
  await screen.findAllByRole('button', { name: /i min hand/ })
  // The phone sits down on first contact; wait for that line so the log is still afterwards.
  await waitFor(async () => expect((await run.store.read(id)).some((l) => l.intent.v === 'seat.claim')).toBe(true))
  return { id, table }
}

const handStops = () => [...document.querySelectorAll('[data-hand-card]')].map((el) => el.getAttribute('tabindex'))
// The cards as the strip lays them out, so that a test about walking the hand asks about the
// walk and not about which card the engine happened to put where. Which end the hand grows from
// is #415's question and was answered there; it must not be answered a second time here.
const handCards = () => [...document.querySelectorAll<HTMLElement>('[data-hand-card]')]
const labelOf = (el: HTMLElement) => el.getAttribute('aria-label') ?? ''

// A deck whose rows are titled the way a designer titles them: Swedish words with capitals and
// diacritics, and ids the wizard slugged out of them (#412).
const TITLED = {
  template: { faces: { front: { base: [], variants: {} }, back: { base: [], variants: {} } } },
  rows: { dragon: { title: 'Björnen' }, knight: { title: 'Räven' }, wizard: { title: 'Älgen' } },
  icons: {},
}

// Every word the phone says about a card, over a real wire: the strip, the spoken name, the line
// under the strip and the panel behind Enter (#412). The row id `dragon` is nowhere in them.
describe('the phone calls a card by its title (#412, A4)', () => {
  it('says «Björnen» in the strip, in the spoken name, under the strip and in the panel', async () => {
    const { table } = await phone(TITLED)
    const user = userEvent.setup()
    const card = await screen.findByRole('button', { name: /^Björnen, i min hand/ })
    expect(card.textContent).toContain('Björnen')
    expect(screen.queryByRole('button', { name: /dragon/ })).toBeNull()

    card.focus()
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('dialog', { name: 'Handlingar för Björnen' })).toBeTruthy()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    // Tapping the card chooses it, and the line under the strip is the same word again.
    await user.click(screen.getByRole('button', { name: /^Björnen, i min hand/ }))
    await waitFor(() => expect(screen.getByText(/^Valt:/).textContent).toContain('Björnen'))
    expect(document.body.textContent).not.toContain('dragon')
    table.close()
  })
})

describe('the hand is playable without a gesture (#1)', () => {
  it('names every card, holds one tab stop, and walks the hand with the arrows', async () => {
    const { table } = await phone()
    const user = userEvent.setup()
    expect(screen.getByRole('button', { name: 'dragon, i min hand, markerat. Enter öppnar handlingar.' })).toBeTruthy()
    expect(handStops()).toEqual(['0', '-1', '-1'])

    const [first, second] = handCards()
    first!.focus()
    await user.keyboard('{ArrowRight}')
    await waitFor(() => expect(labelOf(document.activeElement as HTMLElement)).toBe(labelOf(second!)))
    expect(handStops()).toEqual(['-1', '0', '-1'])
    table.close()
  })

  it('marks and unmarks several cards with the space bar, and says so in the name', async () => {
    const { table } = await phone()
    const user = userEvent.setup()
    const dragon = screen.getByRole('button', { name: /^dragon, i min hand/ })
    dragon.focus()
    await user.keyboard(' ')
    await waitFor(() => expect(screen.getByRole('button', { name: 'dragon, i min hand, markerat. Enter öppnar handlingar.' })).toBeTruthy())
    expect(screen.getByRole('button', { name: /^dragon/ }).getAttribute('aria-pressed')).toBe('true')
    await user.keyboard(' ')
    await waitFor(() => expect(screen.getByRole('button', { name: /^dragon/ }).getAttribute('aria-pressed')).toBe('false'))
    table.close()
  })

  it('plays two marked cards to a named place in one envelope, from the same panel the felt uses (K3)', async () => {
    const { id, table } = await phone()
    const user = userEvent.setup()
    const [first, second] = handCards()
    // The two the space bar is about to mark, named by the strip rather than guessed at: the
    // envelope below is checked against these two and not against a pair of ids read off a
    // particular hand order.
    const marked = [first!.dataset['handCard'], second!.dataset['handCard']]
    first!.focus()
    await user.keyboard(' {ArrowRight} {Enter}')

    const panel = await screen.findByRole('dialog', { name: 'Handlingar för 2 kort' })
    await user.click(within(panel).getByRole('button', { name: /^Kasthög/ }))
    await waitFor(async () => {
      const log = await run.store.read(id)
      expect(log.slice(-2).map((l) => l.intent)).toEqual(marked.map((component) => ({ v: 'move', component, to: 'discard' })))
      expect(new Set(log.slice(-2).map((l) => l.batch)).size).toBe(1)
    })
    table.close()
  })

  it('opens one card large on this screen alone, and hands the focus back when it is closed (K8)', async () => {
    const { id, table } = await phone()
    const user = userEvent.setup()
    const before = (await run.store.read(id)).length
    const dragon = screen.getByRole('button', { name: /^dragon, i min hand/ })
    dragon.focus()
    await user.keyboard('{Enter}')
    const panel = await screen.findByRole('dialog', { name: 'Handlingar för dragon' })
    await user.click(within(panel).getByRole('button', { name: /^Titta/ }))

    const look = await screen.findByRole('dialog', { name: /dragon/ })
    expect(within(look).getByRole('button', { name: 'Stäng' })).toBeTruthy()
    // Looking is private (K8): nothing was asked of the table, so the log did not move.
    expect((await run.store.read(id)).length).toBe(before)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    table.close()
  })
})
