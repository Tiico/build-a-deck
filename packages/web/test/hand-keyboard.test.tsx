// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { TableClient } from '../src/client.js'
import { PlayerPage } from '../src/player/PlayerPage.js'
import { StatusLive } from '../src/status/StatusLive.js'
import { admit, asTable, createSession, startServer, type Running } from './fixture.js'

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

// Ada's phone, with three cards in her hand.
async function phone() {
  const id = await createSession(run)
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

describe('the hand is playable without a gesture (#1)', () => {
  it('names every card, holds one tab stop, and walks the hand with the arrows', async () => {
    const { table } = await phone()
    const user = userEvent.setup()
    expect(screen.getByRole('button', { name: 'dragon, i min hand. Enter öppnar handlingar.' })).toBeTruthy()
    expect(handStops()).toEqual(['0', '-1', '-1'])

    const first = screen.getByRole('button', { name: /^dragon, i min hand/ })
    first.focus()
    await user.keyboard('{ArrowRight}')
    await waitFor(() => expect((document.activeElement as HTMLElement).getAttribute('aria-label')).toMatch(/^knight/))
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
    screen.getByRole('button', { name: /^dragon, i min hand/ }).focus()
    await user.keyboard(' {ArrowRight} {Enter}')

    const panel = await screen.findByRole('dialog', { name: 'Handlingar för 2 kort' })
    await user.click(within(panel).getByRole('button', { name: /^Kasthög/ }))
    await waitFor(async () => {
      const log = await run.store.read(id)
      expect(log.slice(-2).map((l) => l.intent)).toEqual([
        { v: 'move', component: 'c0', to: 'discard' },
        { v: 'move', component: 'c1', to: 'discard' },
      ])
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
