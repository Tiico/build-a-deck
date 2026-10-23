// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { TableClient } from '../src/client.js'
import { PlayerPage } from '../src/player/PlayerPage.js'
import { StatusLive } from '../src/status/StatusLive.js'
import { admit, asTable, createSession, startServer, type Running } from './fixture.js'

let run: Running
// jsdom lays nothing out, and an arrow in the hand goes to the card the eye sees that way (the
// grid's spatial roving, #1147): the cards are given the places a row of them has on a phone.
const real = HTMLElement.prototype.getBoundingClientRect
beforeEach(async () => {
  run = await startServer()
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    const at = handCards().indexOf(this)
    if (at < 0) return real.call(this)
    return { x: at * 120, y: 300, left: at * 120, top: 300, width: 112, height: 156, right: at * 120 + 112, bottom: 456, toJSON: () => ({}) } as DOMRect
  }
})
afterEach(async () => {
  HTMLElement.prototype.getBoundingClientRect = real
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
// The cards as the grid lays them out, so that a test about walking the hand asks about the
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

// Every word the phone says about a card, over a real wire: the grid, the spoken name, the bar
// over the tabs and the panel behind Enter (#412). The row id `dragon` is nowhere in them.
describe('the phone calls a card by its title (#412, A4)', () => {
  it('says «Björnen» in the grid, in the spoken name, in the bar and in the panel', async () => {
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

    // Tapping the card marks it, and the bar over the tabs says the same word again.
    await user.click(screen.getByRole('button', { name: /^Björnen, i min hand/ }))
    await waitFor(() => expect(document.querySelector('[data-hand-bar] strong')?.textContent).toBe('Björnen'))
    expect(document.body.textContent).not.toContain('dragon')
    table.close()
  })
})

// The keyboard offers a hand card what a thumb is offered, and nothing else (#483, fynd 12;
// beställarens beslut A efter prototyp 33). The panel used to read the felt's verbs and places —
// Vänd, Rotera, Avslöja, another seat's hand, «På {kort}» — which the touch sheet leaves out on
// purpose (C4, L48), and put the deck's shortcut at the top where the sheet puts it underneath.
describe('the panel behind Enter on the phone is the play sheet', () => {
  it('offers the same places the sheet does, in the same words, plus looking', async () => {
    const { table } = await phone()
    const user = userEvent.setup()
    const card = handCards()[0]!
    const words = (dialog: HTMLElement) => within(dialog).getAllByRole('button').map((b) => (b.textContent ?? '').replace(/\s+/g, ' ').trim())

    fireEvent.click(card)
    fireEvent.click(within(document.querySelector('[data-hand-bar]') as HTMLElement).getByRole('button', { name: 'Spela…' }))
    const sheet = await screen.findByRole('dialog', { name: 'Spela till' })
    const offered = words(sheet)
    fireEvent.keyDown(sheet, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    card.focus()
    await user.keyboard('{Enter}')
    const panel = await screen.findByRole('dialog', { name: /^Handlingar för/ })
    const inPanel = words(panel).filter((w) => !/^(Titta|Stäng)/.test(w))
    expect(inPanel).toEqual(offered.filter((w) => !/^(Stäng|Avbryt)/.test(w)))
    expect(within(panel).queryByRole('button', { name: /^(Vänd|Rotera|Avslöja)/ })).toBeNull()
    expect(within(panel).getByRole('button', { name: /^Titta/ })).toBeTruthy()
    table.close()
  })
})

describe('the hand is playable without a gesture (#1)', () => {
  it('names every card, holds one tab stop, and walks the hand with the arrows', async () => {
    const { table } = await phone()
    const user = userEvent.setup()
    // Nothing is marked until a thumb marks it (#1147), and the one tab stop is the hand's first
    // card until then — and the card marked last after that (#559 P-26).
    expect(screen.getByRole('button', { name: 'dragon, i min hand. Enter öppnar handlingar.' })).toBeTruthy()
    expect(handStops()).toEqual(['0', '-1', '-1'])

    const [first, second] = handCards()
    first!.focus()
    await user.keyboard('{ArrowRight}')
    await waitFor(() => expect(labelOf(document.activeElement as HTMLElement)).toBe(labelOf(second!)))
    expect(handStops()).toEqual(['-1', '0', '-1'])
    await user.click(handCards()[2]!)
    expect(handStops()).toEqual(['-1', '-1', '0'])
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

  it('plays two marked cards to a named place in one envelope, as the play sheet does (K3, #483)', async () => {
    const { id, table } = await phone()
    const user = userEvent.setup()
    const [first, second] = handCards()
    // The two the space bar is about to mark, named by the grid rather than guessed at: the
    // envelope below is checked against these two and not against a pair of ids read off a
    // particular hand order.
    const marked = [first!.dataset['handCard'], second!.dataset['handCard']]
    first!.focus()
    await user.keyboard(' {ArrowRight} {Enter}')

    const panel = await screen.findByRole('dialog', { name: 'Handlingar för 2 kort' })
    await user.click(within(panel).getByRole('button', { name: /^Kasta/ }))
    // The same envelope the play sheet sends (#483): each card moved, and turned face up because
    // the discard is an open pile — one batch.
    await waitFor(async () => {
      const log = await run.store.read(id)
      const moves = log.filter((l) => l.intent.v === 'move').slice(-2)
      expect(moves.map((l) => l.intent)).toEqual(marked.map((component) => expect.objectContaining({ v: 'move', component, to: 'discard' })))
      expect(log.slice(-4).map((l) => l.intent.v).sort()).toEqual(['flip', 'flip', 'move', 'move'])
      expect(new Set(log.slice(-4).map((l) => l.batch)).size).toBe(1)
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

// The hand's order without a drag (#552, WCAG 2.5.7): a card held up from the hand carries it one
// place along the hand, as Alt and an arrow do (K4), and the focus stays on the button so the next
// press carries it one more. At an end the button says it can go no further.
describe('a card moves along the hand without a drag (#552)', () => {
  it('swaps the card read with its neighbour, keeps it held up, and keeps the focus on the button', async () => {
    const { id } = await phone()
    const user = userEvent.setup()
    const first = handCards()[0]!
    await user.click(first)
    await user.click(screen.getByRole('button', { name: 'Läs stort' }))
    const name = labelOf(first).split(',')[0]!
    const held = document.querySelector('.byd-inspect') as HTMLElement
    const left = within(held).getByRole('button', { name: 'Flytta vänster' })
    const right = within(held).getByRole('button', { name: 'Flytta höger' })
    expect(left.getAttribute('aria-disabled')).toBe('true')
    // The arrows are drawn for the eye; a reader hears the words alone.
    const drawn = (b: HTMLElement) => [b.textContent?.trim(), [...b.querySelectorAll('svg[data-glyph]')].map((g) => g.getAttribute('data-glyph'))]
    expect(drawn(left)).toEqual(['Flytta vänster', ['arrow-left']])
    expect(drawn(right)).toEqual(['Flytta höger', ['arrow-right']])

    right.focus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(labelOf(handCards()[1]!).split(',')[0]).toBe(name))
    await waitFor(async () => expect((await run.store.read(id)).at(-1)?.intent).toMatchObject({ v: 'move', to: 'hand:A', index: 1 }))
    expect(document.activeElement).toBe(right)
    expect(document.querySelector('[data-inspect]')?.getAttribute('data-inspect')).toBe(first.dataset['handCard'])
    expect(left.getAttribute('aria-disabled')).toBeNull()

    await user.keyboard('{Enter}')
    await waitFor(() => expect(labelOf(handCards()[2]!).split(',')[0]).toBe(name))
    expect(right.getAttribute('aria-disabled')).toBe('true')
    // A press at the end sends nothing.
    const lines = (await run.store.read(id)).length
    await user.keyboard('{Enter}')
    expect((await run.store.read(id)).length).toBe(lines)
    expect(document.activeElement).toBe(right)
  })
})
