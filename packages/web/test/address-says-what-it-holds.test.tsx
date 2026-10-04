// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { EditorPage } from '../src/editor/EditorPage.js'
import { TablePage } from '../src/table/TablePage.js'
import { PlayerPage } from '../src/player/PlayerPage.js'
import { admit, createSession, roomOf, startServer, type Running } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// What a screen says when it cannot show what it promised has to match the address it was
// opened on (#753, D5). An address with nothing in it, a table that never was, and a viewer's
// link opened on the phone's page are three different things, and none of them is «avslutat».
const notice = () => document.querySelector<HTMLElement>('[data-status-notice]')

describe('/editor without a project', () => {
  it('says the link holds no game and sends the reader to their games, without guessing at a typo', () => {
    history.replaceState(null, '', '/editor')
    render(<EditorPage />)
    expect(screen.getByRole('heading', { name: 'Ingen länk till ett spel' })).toBeTruthy()
    const said = notice()!.textContent ?? ''
    expect(said).toMatch(/Mina spel/)
    expect(said).not.toMatch(/tecken fel|borttaget/)
    expect(within(notice()!).getByRole('link', { name: 'Till mina spel' })).toBeTruthy()
  })
})

describe('the live routes', () => {
  let run: Running
  beforeEach(async () => {
    run = await startServer()
  })
  afterEach(async () => {
    await run.stop()
  })

  it('/table without a session says the link holds no table, not that one has ended', () => {
    history.replaceState(null, '', `/table?server=${encodeURIComponent(run.url)}`)
    render(<TablePage />)
    expect(screen.getByRole('heading', { name: 'Ingen länk till ett bord' })).toBeTruthy()
    expect(notice()!.textContent).not.toMatch(/slut|gäller inte längre/)
  })

  it('/table with a session the server has never heard of says the table is not there, not that it has ended', async () => {
    history.replaceState(null, '', `/table?session=no-such-room&server=${encodeURIComponent(run.url)}`)
    render(<TablePage />)
    expect(await screen.findByRole('heading', { name: 'Vi hittar inte bordet' })).toBeTruthy()
    const said = notice()!.textContent ?? ''
    expect(said).toMatch(/Länken pekar på ett bord som inte finns/)
    expect(said).not.toMatch(/slut|gäller inte längre/)
  })

  it('/play with a viewer s token and no seat says she is only watching, and leads to the observer', async () => {
    const id = await createSession(run)
    const token = await admit(run, id, null, 'Eva')
    const q = new URLSearchParams({ session: id, token, code: roomOf(id).code, name: 'Eva', server: run.url })
    history.replaceState(null, '', `/play?${q.toString()}`)
    render(<PlayerPage />)
    expect(screen.getByRole('heading', { name: 'Du tittar bara' })).toBeTruthy()
    expect(notice()!.textContent).not.toMatch(/finns inte|avslutats/)
    const out = within(notice()!).getByRole('link', { name: 'Till observatören' })
    const href = new URL(out.getAttribute('href')!, location.origin)
    expect(href.pathname).toBe('/observe')
    expect(Object.fromEntries(href.searchParams)).toEqual(Object.fromEntries(q))
  })
})
