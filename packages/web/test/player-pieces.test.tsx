// @vitest-environment jsdom
// A seat's wooden pieces on the phone (#1476, prototype #1472 telefonen A), over a real wire. The
// phone never draws the table (C2): «Framför mig» shows the seat's own pieces by the zone they lie
// in, «Bordet» the floor's and the other seats'. A press chooses one, the bar over the tabs offers
// «Lägg ner» and «Flytta till…», and the sheet's zones are the felt's areas and never a hand (K32).
// Every press below opens its tab first: a closed tab is hidden, and nothing in it can be reached.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { MEEPLE, type SetupDef } from '@byd/engine'
import { PlayerPage } from '../src/player/PlayerPage.js'
import { StatusLive } from '../src/status/StatusLive.js'
import { admit, createSession, seatSetup, startServer, type Running } from './fixture.js'

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

const meeple = (seat: string, zone: string, x: number, y: number, face = 'standing') => ({ type: { id: MEEPLE.id, version: MEEPLE.version }, cardRef: seat, zone, face, x, y })
// Ada has three meeples not yet moved in front of her and one out on the floor; Bo one in front of him.
function withMeeples(): SetupDef {
  const setup = seatSetup()
  setup.components.push(meeple('A', 'mine:A', 300, 30), meeple('A', 'mine:A', 300, 30), meeple('A', 'mine:A', 300, 30), meeple('A', 'table', 400, 380), meeple('B', 'mine:B', 300, 30))
  return setup
}

async function phone(setup: SetupDef) {
  const id = await createSession(run, 's1', undefined, setup)
  const token = await admit(run, id, 'A', 'Ada')
  history.replaceState(null, '', `/play?session=${id}&seat=A&name=Ada&token=${token}&server=${encodeURIComponent(run.url)}`)
  render(
    <StatusLive>
      <PlayerPage />
    </StatusLive>,
  )
  await screen.findByRole('tab', { name: /^Framför mig/ })
  await waitFor(async () => expect((await run.store.read(id)).some((l) => l.intent.v === 'seat.claim')).toBe(true))
  return id
}
const moves = async (id: string) => (await run.store.read(id)).map((l) => l.intent).filter((i) => i.v === 'move' || i.v === 'flip')

describe('the phone’s pieces (#1476)', () => {
  it('shows the seat’s own meeples in «Framför mig», by the zone each lies in', async () => {
    await phone(withMeeples())
    const user = userEvent.setup()
    await user.click(screen.getByRole('tab', { name: /^Framför mig/ }))
    const mine = await screen.findByRole('region', { name: 'Dina meeples · 4' })
    const groups = within(mine).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(groups).toEqual(['Framför A3', 'Spelyta1'])
    expect(within(mine).getAllByRole('button', { name: 'meeple, Adas, i Framför A' })).toHaveLength(3)
    // Bo's are not hers.
    expect(within(mine).queryByRole('button', { name: /B:s/ })).toBeNull()
  })

  it('moves a meeple chosen in «Framför mig» to the zone chosen in the sheet, which offers no hand', async () => {
    const id = await phone(withMeeples())
    const user = userEvent.setup()
    await user.click(screen.getByRole('tab', { name: /^Framför mig/ }))
    const [first] = await screen.findAllByRole('button', { name: 'meeple, Adas, i Framför A' })
    await user.click(first!)
    const bar = await screen.findByRole('region', { name: 'Pjäsens handlingar' })
    expect(within(bar).getByText('Din meeple · Framför A')).toBeTruthy()
    await user.click(within(bar).getByRole('button', { name: 'Flytta till…' }))
    const sheet = await screen.findByRole('dialog', { name: 'Flytta din meeple till' })
    const places = within(sheet).getAllByRole('button').map((b) => b.getAttribute('data-zone')).filter((z) => z !== null)
    expect(places).toEqual(['table', 'mine:B'])
    await user.click(within(sheet).getByRole('button', { name: /^Spelyta/ }))
    await waitFor(async () => expect(await moves(id)).toEqual([expect.objectContaining({ v: 'move', to: 'table' })]))
    expect(screen.queryByRole('dialog', { name: /Flytta/ })).toBeNull()
  })

  it('lays a meeple down from the bar, and stands it up again', async () => {
    const id = await phone(withMeeples())
    const user = userEvent.setup()
    await user.click(screen.getByRole('tab', { name: /^Framför mig/ }))
    await user.click(await screen.findByRole('button', { name: 'meeple, Adas, i Spelyta' }))
    await user.click(within(await screen.findByRole('region', { name: 'Pjäsens handlingar' })).getByRole('button', { name: 'Lägg ner' }))
    await waitFor(async () => expect(await moves(id)).toEqual([expect.objectContaining({ v: 'flip', face: 'lying' })]))
    await user.click(within(await screen.findByRole('region', { name: 'Pjäsens handlingar' })).getByRole('button', { name: 'Res upp' }))
    await waitFor(async () => expect((await moves(id)).map((i) => i.v === 'flip' && i.face)).toEqual(['lying', 'standing']))
  })

  it('shows the floor’s pieces and the other seats’ in «Bordet», and moves another seat’s too (B5)', async () => {
    const id = await phone(withMeeples())
    const user = userEvent.setup()
    await user.click(screen.getByRole('tab', { name: /^Bordet/ }))
    const table = await screen.findByRole('region', { name: 'Pjäserna på bordet' })
    expect(within(table).getByRole('button', { name: 'meeple, Adas, i Spelyta' })).toBeTruthy()
    await user.click(within(table).getByRole('button', { name: 'meeple, B:s, i Framför B' }))
    const bar = await screen.findByRole('region', { name: 'Pjäsens handlingar' })
    expect(within(bar).getByText('B:s meeple · Framför B')).toBeTruthy()
    await user.click(within(bar).getByRole('button', { name: 'Flytta till…' }))
    await user.click(within(await screen.findByRole('dialog', { name: 'Flytta B:s meeple till' })).getByRole('button', { name: /^Spelyta/ }))
    await waitFor(async () => expect(await moves(id)).toEqual([expect.objectContaining({ v: 'move', to: 'table' })]))
  })

  // An area's tile counts its cards: three meeples in front of Ada are not «3 kort».
  it('counts the cards in an area on «Bordet», and not the pieces lying there', async () => {
    await phone(withMeeples())
    const user = userEvent.setup()
    await user.click(screen.getByRole('tab', { name: /^Bordet/ }))
    const tile = document.querySelector<HTMLElement>('[data-zone-summary="mine:A"]')
    expect(tile?.textContent).toContain('0 kort')
  })

  it('draws nothing of pieces on a table that has none', async () => {
    await phone(seatSetup())
    const user = userEvent.setup()
    await user.click(screen.getByRole('tab', { name: /^Framför mig/ }))
    expect(screen.queryByRole('region', { name: /meeples|pjäser/i })).toBeNull()
    await user.click(screen.getByRole('tab', { name: /^Bordet/ }))
    expect(screen.queryByRole('region', { name: 'Pjäserna på bordet' })).toBeNull()
  })
})
