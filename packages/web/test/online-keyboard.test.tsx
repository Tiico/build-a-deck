// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { TableClient } from '../src/client.js'
import { OnlinePage } from '../src/online/OnlinePage.js'
import { StatusLive } from '../src/status/StatusLive.js'
import { CARD_STANDARD_63x88, type SetupDef } from '@byd/engine'
import { admit, asTable, createSession, startServer, twoSeatSetup, type Running } from './fixture.js'

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

// Ada, playing entirely online: cards in her fan and one lying face-up on the felt.
async function online(held = 2) {
  const id = await createSession(run, `s-${held}`, undefined, deckOf(held))
  const table = TableClient.connect(await asTable(run, id))
  await table.ready()
  await table.send({ v: 'draw', from: 'draw', to: 'hand:A', count: held })
  await table.send({ v: 'draw', from: 'draw', to: 'table', count: 1 })
  await table.synced(2)
  const loose = table.view!.components.find((c) => c.zone === 'table')!.id
  await table.send({ v: 'move', component: loose, to: 'table', x: 400, y: 300 }, { v: 'flip', component: loose, face: 'front' })
  await table.synced(3)
  const token = await admit(run, id, 'A', 'Ada')
  history.replaceState(null, '', `/online?session=${id}&seat=A&name=Ada&token=${token}&server=${encodeURIComponent(run.url)}`)
  render(
    <StatusLive>
      <OnlinePage />
    </StatusLive>,
  )
  await screen.findAllByRole('button', { name: /i min hand/ })
  await waitFor(async () => expect((await run.store.read(id)).some((l) => l.intent.v === 'seat.claim')).toBe(true))
  return { id, table, loose }
}

describe('the distance view is played with the same model as the felt and the phone (#2)', () => {
  it('makes the fan real controls and plays a card to a named place with a coordinate of its own', async () => {
    const { id, table } = await online()
    const user = userEvent.setup()
    expect(screen.getByRole('button', { name: 'dragon, i min hand. Enter öppnar handlingar.' })).toBeTruthy()
    expect([...document.querySelectorAll('[data-hand-fan] [data-hand-card]')].map((el) => el.getAttribute('tabindex'))).toEqual(['0', '-1'])

    screen.getByRole('button', { name: /^dragon, i min hand/ }).focus()
    await user.keyboard('{Enter}')
    const panel = await screen.findByRole('dialog', { name: 'Handlingar för dragon' })
    await user.click(within(panel).getByRole('button', { name: /^Bordet/ }))
    await waitFor(async () =>
      expect((await run.store.read(id)).slice(-2).map((l) => l.intent)).toEqual([
        { v: 'move', component: 'c0', to: 'table', x: 91, y: 14 },
        { v: 'flip', component: 'c0', face: 'front' },
      ]),
    )
    table.close()
  })

  it('gives the felt behind the fan the same names and the same tab stop it has on the table screen', async () => {
    const { table } = await online()
    const user = userEvent.setup()
    const card = await screen.findByRole('button', { name: /^wizard, kort i Spelyta/ })
    card.focus()
    await user.keyboard('{Enter}')
    const panel = await screen.findByRole('dialog', { name: 'Handlingar för wizard' })
    expect(within(panel).getByRole('button', { name: /^Min hand/ })).toBeTruthy()
    expect(within(panel).getByRole('button', { name: /Fri placering/ })).toHaveProperty('disabled', true)
    table.close()
  })
})

// A draw pile deep enough to fill a hand right up; the fixture's own ten cards do not reach a
// hand of twenty-one, and the size of the hand is the whole question here.
function deckOf(held: number): SetupDef {
  const base = twoSeatSetup()
  if (held <= 10) return base
  return { ...base, components: Array.from({ length: held + 4 }, (_, i) => ({ type: { id: CARD_STANDARD_63x88.id, version: 1 }, cardRef: `Kort ${i}`, zone: 'draw', face: 'back' as const })) }
}

// A hand big enough that the band cannot hold it at once (#24): it is the twenty-first card, the
// one furthest from where the tab stop starts, that says whether the whole hand is still one tab
// stop with the arrows inside it (K16) — in the fan, and in the grid the fan is read in.
const HELD = 21

const handCards = () => [...document.querySelectorAll('[data-hand-fan] [data-hand-card]')] as HTMLElement[]

describe('the whole hand stays one tab stop with the arrows inside it, however big it is (K16, #24)', () => {
  it('walks the arrows from the first card of twenty-one to the last, and opens it', async () => {
    const { table } = await online(HELD)
    const user = userEvent.setup()
    await waitFor(() => expect(handCards()).toHaveLength(HELD))
    // One stop for the hand, not twenty-one: exactly one card is in the tab order.
    expect(handCards().filter((el) => el.getAttribute('tabindex') === '0')).toHaveLength(1)

    handCards()[0]!.focus()
    await user.keyboard('{ArrowRight>20/}')

    const last = handCards()[HELD - 1]!
    expect(document.activeElement).toBe(last)
    expect(last.getAttribute('aria-label')).toMatch(/Enter öppnar handlingar/)
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('dialog', { name: /^Handlingar för/ })).toBeTruthy()
    table.close()
  })

  it('raises the whole hand as a grid, walks the arrows to the twenty-first card there too, and hands focus back on Escape', async () => {
    const { table } = await online(HELD)
    const user = userEvent.setup()
    await waitFor(() => expect(handCards()).toHaveLength(HELD))

    const show = screen.getByRole('button', { name: /Visa alla/ })
    await user.click(show)
    const spread = await screen.findByRole('dialog', { name: /Hela handen/ })
    // The grid is raised to be read, so it opens standing in the hand and not on its own Stäng.
    const grid = () => within(spread).getAllByRole('button', { name: /i min hand/ })
    await waitFor(() => expect(grid()).toHaveLength(HELD))
    expect(document.activeElement).toBe(grid()[0])
    // One hand, one copy of it: the band underneath is out of the tab order while the grid is up.
    expect(screen.getAllByRole('button', { name: /i min hand/ })).toHaveLength(HELD)

    await user.keyboard('{ArrowRight>20/}')
    expect(document.activeElement).toBe(grid()[HELD - 1])

    // `Question.tsx`'s manners (L9, K16): Escape closes it and gives focus back to what opened it.
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Hela handen/ })).toBeNull())
    expect(document.activeElement).toBe(show)
    table.close()
  })
})
