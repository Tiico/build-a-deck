// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { TableClient } from '../src/client.js'
import { OnlinePage } from '../src/online/OnlinePage.js'
import { StatusLive } from '../src/status/StatusLive.js'
import { admit, asTable, createSession, startServer, type Running } from './fixture.js'

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

// Ada, playing entirely online: two cards in her fan and one lying face-up on the felt.
async function online() {
  const id = await createSession(run)
  const table = TableClient.connect(await asTable(run, id))
  await table.ready()
  await table.send({ v: 'draw', from: 'draw', to: 'hand:A', count: 2 })
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
