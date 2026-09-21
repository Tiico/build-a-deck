// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { TableClient } from '../src/client.js'
import { ObserverPage } from '../src/observer/ObserverPage.js'
import { admit, asSeat, asTable, createSession, startServer, type Running } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'
import { tabFrom, tabStops } from './tabs.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

describe('ObserverPage (C8)', () => {
  it('sees every hand, says what she is, and can only flag — stamped with her name', async () => {
    const id = await createSession(run)
    const ada = TableClient.connect(await asSeat(run, id, 'A'))
    await ada.ready()
    await ada.send({ v: 'seat.claim', seat: 'A', name: 'Ada' }, { v: 'draw', from: 'draw', to: 'hand:A', count: 2 })
    history.replaceState(null, '', `/observe?session=${id}&name=Eva&token=${await admit(run, id, null, 'Eva')}&server=${encodeURIComponent(run.url)}`)
    render(<ObserverPage />)
    expect(await screen.findByText(/Du är observatör/)).toBeTruthy()
    // A's hand is on her screen by name, which no table screen shows.
    await waitFor(() => expect(document.querySelectorAll('[data-zone="hand:A"] [data-component]').length + document.querySelectorAll('[data-component]').length).toBeGreaterThan(0))
    expect(screen.getByText('dragon')).toBeTruthy()
    expect(document.querySelector('[data-playable]')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Flagga/ }))
    fireEvent.change(screen.getByPlaceholderText(/Vad hände/), { target: { value: 'Ada tvekade' } })
    fireEvent.click(screen.getByRole('button', { name: 'Flagga' }))
    await waitFor(async () => expect((await run.store.read(id)).at(-1)).toMatchObject({ by: null, intent: { v: 'flag', note: 'Ada tvekade', observer: 'Eva' } }))
    ada.close()
  })
})

describe('the observer inspects too (C8, K8)', () => {
  it('fills the inspection panel from the card she points at', async () => {
    const id = await createSession(run)
    const table = TableClient.connect(await asTable(run, id))
    await table.ready()
    await table.send({ v: 'draw', from: 'draw', to: 'table', count: 1 })
    history.replaceState(null, '', `/observe?session=${id}&name=Eva&token=${await admit(run, id, null, 'Eva')}&server=${encodeURIComponent(run.url)}`)
    render(<ObserverPage />)
    await screen.findByText(/Du är observatör/)
    await waitFor(() => expect(document.querySelector('.byd-card')).toBeTruthy())

    const panel = screen.getByRole('region', { name: /inspektion/i })
    expect(panel.textContent).toMatch(/peka på ett kort/)
    fireEvent.pointerEnter(document.querySelector('.byd-card')!)
    // She sees every face (C8), so the card names itself rather than saying it is hidden.
    await waitFor(() => expect(panel.textContent).toMatch(/dragon/))
    table.close()
  })
})

describe('the observer screen is not a screen to join from (K12)', () => {
  it('shows no room code at all rather than the session id spelled out', async () => {
    const id = await createSession(run)
    history.replaceState(null, '', `/observe?session=${id}&name=Eva&token=${await admit(run, id, null, 'Eva')}&server=${encodeURIComponent(run.url)}`)
    render(<ObserverPage />)
    await screen.findByText(/Du är observatör/)
    expect(screen.queryByText(id)).toBeNull()
    expect(screen.queryByText(/anslut med telefon/)).toBeNull()
  })
})

// The shape #6 asked for: the observer watches, so the table is the screen and everything else —
// the feed, the seats and the whole sentence about what she is — is called in behind a handle,
// under the table and never over it.
describe('the observer summons what is not the table (#6)', () => {
  it('keeps who she is and the way to flag on a handle of its own, and calls the rest in', async () => {
    const user = userEvent.setup()
    const id = await createSession(run)
    history.replaceState(null, '', `/observe?session=${id}&name=Eva&token=${await admit(run, id, null, 'Eva')}&server=${encodeURIComponent(run.url)}`)
    render(<ObserverPage />)
    await screen.findByText(/Du är observatör/)

    const handle = document.querySelector('.byd-observer-handle')!
    expect(handle.textContent).toMatch(/Eva tittar på/)
    expect(handle.querySelector('.byd-observer-flag')).toBeTruthy()
    // Nothing floats over the table any more: the banner is a row of the layout.
    expect(document.querySelector('.byd-observer-banner')).toBeNull()

    const more = screen.getByRole('button', { name: /Senast och platser/ })
    expect(document.querySelector('[data-page="observe"]')!.getAttribute('data-drawer')).toBe('shut')
    expect(more.getAttribute('aria-expanded')).toBe('false')
    await user.click(more)
    expect(document.querySelector('[data-page="observe"]')!.getAttribute('data-drawer')).toBe('open')
    expect(more.getAttribute('aria-expanded')).toBe('true')
    // What it opened is the column the table already talks in, with her own sentence at the top
    // of it — one copy of each, not a second one summoned beside the first.
    const aside = document.querySelector('[data-tv] > aside')!
    expect(aside.querySelector('.byd-observer-note')!.textContent).toMatch(/du ser allas händer/)
    expect(document.querySelectorAll('.byd-observer-note')).toHaveLength(1)
    expect(screen.getByRole('region', { name: /inspektion/i })).toBeTruthy()

    // A drawer, not a dialog: it takes no focus, traps none, and closes the way it opened.
    expect(document.activeElement).toBe(more)
    await user.keyboard('{Enter}')
    expect(document.querySelector('[data-page="observe"]')!.getAttribute('data-drawer')).toBe('shut')
  })
})

// The way out is a seat's (#31), and an observer has no seat. Her screen keeps exactly the two
// controls it had — the drawer and the flag — and is offered nothing to leave.
describe('the observer has no seat to leave (#31)', () => {
  it('is offered no way out, and keeps the controls she had', async () => {
    const id = await createSession(run)
    history.replaceState(null, '', `/observe?session=${id}&name=Eva&token=${await admit(run, id, null, 'Eva')}&server=${encodeURIComponent(run.url)}`)
    render(<ObserverPage />)
    expect(await screen.findByText(/Du är observatör/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Ut…' })).toBeNull()
    expect(screen.queryByText(/Lämna bordet/)).toBeNull()
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([expect.stringMatching(/Senast och platser/), expect.stringMatching(/Flagga/)])
  })
})

// The same quiet as the phone's (UX-38, #83): once the table has ended, the felt, the handle and
// the inspection panel are the picture behind the survey, not things to read or press.
describe('the ended table goes quiet behind the survey (C9, D5, G3, #83)', () => {
  it('takes the felt and the handle out of reach, and leaves the survey living', async () => {
    const id = await createSession(run)
    const table = TableClient.connect(await asTable(run, id))
    await table.ready()
    await table.send({ v: 'draw', from: 'draw', to: 'table', count: 1 })
    history.replaceState(null, '', `/observe?session=${id}&name=Eva&token=${await admit(run, id, null, 'Eva')}&server=${encodeURIComponent(run.url)}`)
    render(<ObserverPage />)
    await screen.findByText(/Du är observatör/)
    await waitFor(() => expect(document.querySelector('.byd-card')).toBeTruthy())
    expect(screen.getByRole('button', { name: /Senast och platser/ }).closest('[inert]')).toBeNull()

    await table.send({ v: 'session.end' })
    await screen.findByText(/Bordet är avslutat/)
    expect(document.querySelector('.byd-card')!.closest('[inert]')).not.toBeNull()
    expect(screen.getByRole('button', { name: /Senast och platser/ }).closest('[inert]')).not.toBeNull()
    expect(screen.getByRole('region', { name: /inspektion/i }).closest('[inert]')).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Bordet är avslutat' }).closest('[inert]')).toBeNull()
    expect(screen.getByRole('button', { name: '4' }).closest('[inert]')).toBeNull()
    expect(screen.getByRole('button', { name: 'Nästa' }).closest('[inert]')).toBeNull()
    table.close()
  })

  it('Tab from the survey\'s last control stays in the survey rather than going down into the felt', async () => {
    const id = await createSession(run)
    const table = TableClient.connect(await asTable(run, id))
    await table.ready()
    await table.send({ v: 'draw', from: 'draw', to: 'table', count: 1 }, { v: 'session.end' })
    history.replaceState(null, '', `/observe?session=${id}&name=Eva&token=${await admit(run, id, null, 'Eva')}&server=${encodeURIComponent(run.url)}`)
    render(<ObserverPage />)
    await screen.findByText(/Bordet är avslutat/)
    const survey = document.querySelector('.byd-survey')!
    const stops = tabStops()
    expect(stops.length).toBeGreaterThan(1)
    expect(stops.every((el) => survey.contains(el))).toBe(true)
    const last = screen.getByRole('link', { name: /Spara till ditt konto/ })
    expect(stops.at(-1)).toBe(last)
    expect(tabFrom(last)).toBe(screen.getByRole('button', { name: '1' }))
    table.close()
  })
})

// Observatören får samma hjul som TV:n (#325). Hon ramar ingenting in åt sig själv — hennes filt
// passas i ramen som förut — men vyn är hennes att ta över, och det är vad ytan säger om sig
// själv. Att den faktiskt zoomar mäts där en filt har en storlek att zooma i
// (`table-renderer.test.tsx`); jsdom ger varje ram noll pixlar.
describe('observatörens kamera (#325)', () => {
  it('säger att vyn är hennes att köra, utan att rama in åt henne', async () => {
    const id = await createSession(run)
    const table = TableClient.connect(await asTable(run, id))
    await table.ready()
    history.replaceState(null, '', `/observe?session=${id}&name=Eva&token=${await admit(run, id, null, 'Eva')}&server=${encodeURIComponent(run.url)}`)
    render(<ObserverPage />)
    await screen.findByText(/Du är observatör/)
    const frame = await waitFor(() => {
      const el = document.querySelector('.byd-table-frame')
      if (!el) throw new Error('ingen filt ännu')
      return el
    })
    expect(frame.getAttribute('data-drive')).toBe('hand')
    expect(frame.getAttribute('data-camera')).toBeNull()
    table.close()
  })
})
