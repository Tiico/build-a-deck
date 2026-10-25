// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { EditorPage } from '../src/editor/EditorPage.js'
import { TablePage } from '../src/table/TablePage.js'
import { PlayerPage } from '../src/player/PlayerPage.js'
import { admit, createSession, roomOf, startServer, type Running } from './fixture.js'

// What a screen says when it cannot show what it promised has to match the address it was
// opened on (#753, D5). An address with nothing in it, a table that never was, and a viewer's
// link opened on the phone's page are three different things, and none of them is «avslutat».
const notice = () => document.querySelector<HTMLElement>('[data-status-notice]')

describe('/editor without a project', () => {
  it('says the link holds no game and sends the reader to their games, without guessing at a typo', () => {
    history.replaceState(null, '', '/editor')
    render(<EditorPage />)
    expect(screen.getByRole('heading', { name: 'Inget spel i länken' })).toBeTruthy()
    const said = notice()!.textContent ?? ''
    expect(said).toMatch(/Mina spel/)
    expect(said).not.toMatch(/tecken fel|borttaget/)
    expect(within(notice()!).getByRole('link', { name: 'Mina spel' })).toBeTruthy()
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
    expect(screen.getByRole('heading', { name: 'Inget bord i länken' })).toBeTruthy()
    expect(notice()!.textContent).not.toMatch(/slut|gäller inte längre/)
  })

  it('/table with a session the server has never heard of says the table is not there, not that it has ended', async () => {
    history.replaceState(null, '', `/table?session=no-such-room&server=${encodeURIComponent(run.url)}`)
    render(<TablePage />)
    expect(await screen.findByRole('heading', { name: 'Bordet finns inte' })).toBeTruthy()
    const said = notice()!.textContent ?? ''
    expect(said).toMatch(/Länken leder till ett bord som inte finns/)
    expect(said).not.toMatch(/slut|gäller inte längre/)
  })

  it('/play with a viewer s token and no seat says she is only watching, and leads to the observer', async () => {
    const id = await createSession(run)
    const token = await admit(run, id, null, 'Eva')
    // The token in the fragment, as the picker sends her (#1278); the link on carries it there too.
    const q = new URLSearchParams({ session: id, code: roomOf(id).code, server: run.url })
    history.replaceState(null, '', `/play?${q.toString()}#token=${token}`)
    render(<PlayerPage />)
    expect(screen.getByRole('heading', { name: 'Du kan bara titta' })).toBeTruthy()
    expect(notice()!.textContent).not.toMatch(/finns inte|avslutats/)
    const out = within(notice()!).getByRole('link', { name: 'Öppna som observatör' })
    const href = new URL(out.getAttribute('href')!, location.origin)
    expect(href.pathname).toBe('/observe')
    expect(Object.fromEntries(href.searchParams)).toEqual(Object.fromEntries(q))
    expect(href.hash).toBe(`#token=${token}`)
  })
})
