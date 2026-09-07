// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TableClient } from '../src/client.js'
import { JoinPage } from '../src/join/JoinPage.js'
import { asSeat, asTable, createSession, roomOf, startServer, type Running } from './fixture.js'

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

async function open(sessionId: string) {
  history.replaceState(null, '', `/join?code=${roomOf(sessionId).code}&server=${encodeURIComponent(run.url)}`)
  render(<JoinPage />)
  await screen.findByRole('button', { name: /Sätt dig/ })
}

describe('JoinPage', () => {
  it('shows every seat live with who sits there, and preselects the next free one', async () => {
    const id = await createSession(run)
    const table = TableClient.connect(await asTable(run, id))
    await table.ready()
    await table.send({ v: 'seat.claim', seat: 'A', name: 'Ada' })
    await open(id)

    const a = document.querySelector('[data-seat="A"]')!
    const b = document.querySelector('[data-seat="B"]')!
    expect(a.textContent).toContain('Ada')
    expect(a.getAttribute('aria-disabled')).toBe('true')
    expect(b.getAttribute('aria-pressed')).toBe('true')

    // Someone else sits down while we look: the picker follows.
    const other = TableClient.connect(await asSeat(run, id, 'B'))
    await other.ready()
    await other.send({ v: 'seat.claim', seat: 'B', name: 'Bo' })
    await waitFor(() => expect(document.querySelector('[data-seat="B"]')!.textContent).toContain('Bo'))
    expect(document.querySelector('[aria-pressed="true"]')).toBeNull()
    table.close()
    other.close()
  })
})

describe('sitting down', () => {
  it('navigates to /play with the chosen seat, the name and the server; a taken seat cannot be picked', async () => {
    const id = await createSession(run)
    const table = TableClient.connect(await asTable(run, id))
    await table.ready()
    await table.send({ v: 'seat.claim', seat: 'A', name: 'Ada' })
    history.replaceState(null, '', `/join?code=${roomOf(id).code}&server=${encodeURIComponent(run.url)}`)
    const gone: string[] = []
    render(<JoinPage onSit={(url) => gone.push(url)} />)
    await screen.findByRole('button', { name: /Sätt dig/ })

    fireEvent.click(document.querySelector('[data-seat="A"]')!)
    expect(document.querySelector('[data-seat="B"]')!.getAttribute('aria-pressed')).toBe('true')

    expect((screen.getByRole('button', { name: /Sätt dig/ }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Ditt namn'), { target: { value: ' Bo ' } })
    fireEvent.click(screen.getByRole('button', { name: /Sätt dig/ }))
    // The code buys a token for the seat first (DRIFT §9); the link carries it.
    await waitFor(() => expect(gone).toHaveLength(1))
    const link = new URL(gone[0] ?? '', 'http://x')
    expect(link.pathname).toBe('/play')
    expect(Object.fromEntries(link.searchParams)).toMatchObject({ session: id, seat: 'B', name: 'Bo', server: run.url })
    expect(link.searchParams.get('token')?.length).toBeGreaterThan(20)
    table.close()
  })
})

describe('watching instead of playing (C8)', () => {
  it('offers to observe with a name, which leads to the observer view', async () => {
    const id = await createSession(run)
    const seen: string[] = []
    history.replaceState(null, '', `/join?code=${roomOf(id).code}&server=${encodeURIComponent(run.url)}`)
    render(<JoinPage onSit={(url) => seen.push(url)} />)
    await screen.findByRole('button', { name: /Sätt dig/ })
    fireEvent.change(screen.getByLabelText('Ditt namn'), { target: { value: 'Eva' } })
    fireEvent.click(screen.getByRole('button', { name: /Bara titta/ }))
    await waitFor(() => expect(seen).toHaveLength(1))
    expect(seen[0]).toMatch(new RegExp(`^/observe\\?session=${id}&name=Eva&token=`))
  })
})

describe('playing from this screen (C2)', () => {
  it('offers to play with the table on this screen, which leads to the online view for the chosen seat', async () => {
    const id = await createSession(run)
    const seen: string[] = []
    history.replaceState(null, '', `/join?code=${roomOf(id).code}&server=${encodeURIComponent(run.url)}`)
    render(<JoinPage onSit={(url) => seen.push(url)} />)
    await screen.findByRole('button', { name: /Sätt dig/ })
    fireEvent.change(screen.getByLabelText('Ditt namn'), { target: { value: 'Ada' } })
    fireEvent.click(screen.getByRole('button', { name: /Spela på den här skärmen/ }))
    await waitFor(() => expect(seen).toHaveLength(1))
    expect(seen[0]).toMatch(new RegExp(`^/online\\?session=${id}&seat=A&name=Ada&token=`))
  })
})

describe('a code that does not resolve (DRIFT §9)', () => {
  it('says the code no longer applies instead of connecting', async () => {
    history.replaceState(null, '', `/join?code=ZZZZZZ&server=${encodeURIComponent(run.url)}`)
    render(<JoinPage />)
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('ZZZZZZ'))
  })
})
