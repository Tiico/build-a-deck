// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TableClient } from '../src/client.js'
import { DocumentTitle } from '../src/status/DocumentTitle.js'
import { StatusLive } from '../src/status/StatusLive.js'
import { PlayerPage } from '../src/player/PlayerPage.js'
import { ObserverPage } from '../src/observer/ObserverPage.js'
import { admit, asTable, createSession, startServer, type Running } from './fixture.js'

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

async function seated(id: string) {
  const token = await admit(run, id, 'A', 'Ada')
  history.replaceState(null, '', `/play?session=${id}&seat=A&name=Ada&token=${token}&server=${encodeURIComponent(run.url)}`)
  render(
    <DocumentTitle route="play">
      <StatusLive>
        <PlayerPage />
      </StatusLive>
    </DocumentTitle>,
  )
  await screen.findByText('Ada')
}

const lift = (card: Element) => {
  fireEvent.pointerDown(card, { clientX: 100, clientY: 500 })
  fireEvent.pointerMove(card, { clientX: 100, clientY: 430 })
  fireEvent.pointerUp(card, { clientX: 100, clientY: 430 })
}

// `TableClient.send` has always answered `{ ok: false, reason }`; before #7 no view read it, so
// a move the table refused simply did not happen and nobody was told why.
describe('an action the table refuses', () => {
  it('says so where it was asked, in Swedish, and never in the server s own words', async () => {
    const id = await createSession(run)
    const table = TableClient.connect(await asTable(run, id))
    await table.ready()
    await seated(id)
    await table.send({ v: 'draw', from: 'draw', to: 'hand:A', count: 2 })
    await waitFor(() => expect(document.querySelectorAll('[data-hand-card]')).toHaveLength(2))

    // The session is locked from another screen while this hand is still on this one (C9).
    await table.send({ v: 'session.end' })
    await waitFor(() => expect(document.querySelector('[data-ended], [data-page="player"]')).toBeTruthy())

    lift(document.querySelector('[data-hand-card]')!)
    fireEvent.click(await screen.findByRole('button', { name: /Kasthög/ }))

    const said = await screen.findByTestId('refusal')
    expect(said.textContent).toMatch(/avslutad/i)
    expect(said.textContent).not.toMatch(/session has ended|Error/)
    table.close()
  })

  it('ties the message to the control that was refused', async () => {
    const id = await createSession(run)
    const table = TableClient.connect(await asTable(run, id))
    await table.ready()
    await seated(id)
    await table.send({ v: 'draw', from: 'draw', to: 'hand:A', count: 2 })
    await waitFor(() => expect(document.querySelectorAll('[data-hand-card]')).toHaveLength(2))
    await table.send({ v: 'session.end' })

    lift(document.querySelector('[data-hand-card]')!)
    const control = await screen.findByRole('button', { name: /Kasthög/ })
    fireEvent.click(control)

    const said = await screen.findByTestId('refusal')
    await waitFor(() => expect(control.getAttribute('aria-describedby')).toBe(said.id))
    expect(said.id).not.toBe('')
    table.close()
  })

  it('announces it assertively, because it is something someone asked for that did not happen', async () => {
    const id = await createSession(run)
    const table = TableClient.connect(await asTable(run, id))
    await table.ready()
    await seated(id)
    await table.send({ v: 'draw', from: 'draw', to: 'hand:A', count: 2 })
    await waitFor(() => expect(document.querySelectorAll('[data-hand-card]')).toHaveLength(2))
    await table.send({ v: 'session.end' })

    lift(document.querySelector('[data-hand-card]')!)
    fireEvent.click(await screen.findByRole('button', { name: /Kasthög/ }))
    await waitFor(() => expect(document.querySelector('[data-status-live="assertive"]')!.textContent).toMatch(/avslutad/i))
    table.close()
  })

  it('keeps the question open so the answer stands where the reader is looking', async () => {
    const id = await createSession(run)
    const table = TableClient.connect(await asTable(run, id))
    await table.ready()
    await seated(id)
    await table.send({ v: 'draw', from: 'draw', to: 'hand:A', count: 2 })
    await waitFor(() => expect(document.querySelectorAll('[data-hand-card]')).toHaveLength(2))
    await table.send({ v: 'session.end' })

    lift(document.querySelector('[data-hand-card]')!)
    fireEvent.click(await screen.findByRole('button', { name: /Kasthög/ }))
    await screen.findByTestId('refusal')
    // The card is still in the hand and the sheet is still open: nothing was quietly lost.
    expect(document.querySelectorAll('[data-hand-card]')).toHaveLength(2)
    expect(screen.getByRole('dialog', { name: /Spela till/ })).toBeTruthy()
    table.close()
  })

  it('takes the message back when the same control is asked again', async () => {
    const id = await createSession(run)
    const table = TableClient.connect(await asTable(run, id))
    await table.ready()
    await seated(id)
    await table.send({ v: 'draw', from: 'draw', to: 'hand:A', count: 2 })
    await waitFor(() => expect(document.querySelectorAll('[data-hand-card]')).toHaveLength(2))

    lift(document.querySelector('[data-hand-card]')!)
    fireEvent.click(await screen.findByRole('button', { name: /Kasthög/ }))
    // Nothing was refused: the play went through and no message was left behind.
    await waitFor(() => expect(document.querySelectorAll('[data-hand-card]')).toHaveLength(1))
    expect(screen.queryByTestId('refusal')).toBeNull()
    table.close()
  })
})

// Every sheet that sends something has a button that can be answered no, and the answer belongs
// beside that button too — not in a toast that says the opposite of what happened.
describe('a flag the table refuses', () => {
  it.each([
    ['/play', async (id: string) => {
      history.replaceState(null, '', `/play?session=${id}&seat=A&name=Ada&token=${await admit(run, id, 'A', 'Ada')}&server=${encodeURIComponent(run.url)}`)
      render(
        <DocumentTitle route="play">
          <StatusLive>
            <PlayerPage />
          </StatusLive>
        </DocumentTitle>,
      )
      await screen.findByText('Ada')
    }],
    ['/observe', async (id: string) => {
      history.replaceState(null, '', `/observe?session=${id}&name=Eva&token=${await admit(run, id, null, 'Eva')}&server=${encodeURIComponent(run.url)}`)
      render(
        <DocumentTitle route="observe">
          <StatusLive>
            <ObserverPage />
          </StatusLive>
        </DocumentTitle>,
      )
      await screen.findByRole('button', { name: /Flagga/ })
    }],
  ])('says why beside the button that was pressed on %s', async (_path, mount) => {
    const id = await createSession(run)
    const table = TableClient.connect(await asTable(run, id))
    await table.ready()
    await mount(id)

    fireEvent.click(screen.getByRole('button', { name: /Flagga/ }))
    const flag = await screen.findByRole('button', { name: 'Flagga' })
    // The session is locked from another screen while this sheet stands open (C9).
    await table.send({ v: 'session.end' })
    fireEvent.click(flag)

    const said = await screen.findByTestId('refusal')
    expect(said.textContent).toMatch(/avslutad/i)
    expect(flag.getAttribute('aria-describedby')).toBe(said.id)
    await waitFor(() => expect(document.querySelector('[data-status-live="assertive"]')!.textContent).toMatch(/avslutad/i))
    table.close()
  })
})
