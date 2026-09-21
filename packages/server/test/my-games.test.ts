import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryProjectStore } from '../src/index.js'
import { template } from './deck.js'
import { start, twoSeatSetup, type Running } from './fixture.js'
import type { ProjectDoc } from '../src/projects.js'

const doc = (name = 'Skogens herrar'): ProjectDoc => {
  const { zones, seats, floor } = twoSeatSetup()
  return { name, template, rows: [{ id: 'dragon', fields: { title: 'Drake', antal: 1 } }], icons: {}, setup: { zones, seats, floor, deckZone: 'draw' } }
}

describe('a game the account owns (G1)', () => {
  it('can be taken away, and only by the account that owns it', async () => {
    const store = new MemoryProjectStore()
    await store.create('p1', doc(), 'ada')
    await store.replace('p1', 1, doc('Skogens andar'))
    expect(await store.remove('p1')).toBe(true)
    expect(await store.load('p1')).toBeNull()
    expect(await store.list('ada')).toEqual([])
    // The history goes with it: nothing is left pointing at a game that is gone.
    expect(await store.versions('p1')).toEqual([])
    expect(await store.at('p1', 1)).toBeNull()
    expect(await store.remove('p1')).toBe(false)
  })
})

describe('"Mina spel" over HTTP (G1)', () => {
  let run: Running
  let cookie = ''
  beforeEach(async () => {
    run = await start()
    await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'ada@example.com' }) })
    const link = /\/auth\/verify\?token=\S+/.exec(run.mail.sent.at(-1)?.text ?? '')?.[0] ?? ''
    const res = await fetch(`${run.http}${link}`, { redirect: 'manual' })
    cookie = (res.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
  })
  afterEach(async () => {
    await run.stop()
  })
  const send = (method: string, path: string, body?: unknown) =>
    fetch(`${run.http}${path}`, { method, headers: { 'content-type': 'application/json', cookie }, body: body === undefined ? null : JSON.stringify(body) })

  it('says of every game when it was last played, and how many tables it has', async () => {
    await send('POST', '/projects', { id: 'p1', ...doc() })
    await send('POST', '/projects', { id: 'p2', ...doc('Ospelat') })
    const before = (await (await send('GET', '/projects')).json()) as { id: string; lastPlayed: string | null; tables: number }[]
    expect(before.find((p) => p.id === 'p1')).toMatchObject({ lastPlayed: null, tables: 0 })

    await send('POST', '/projects/p1/sessions', {})
    const after = (await (await send('GET', '/projects')).json()) as { id: string; name: string; lastPlayed: string | null; tables: number }[]
    const played = after.find((p) => p.id === 'p1')!
    expect(played.tables).toBe(1)
    // A table that has been started but not played at is still a table; nothing has happened yet.
    expect(played.lastPlayed).toBeNull()
    expect(after.find((p) => p.id === 'p2')).toMatchObject({ tables: 0, lastPlayed: null })
  })

  it("names the game's first card, the deck seen in the table's own order (G1)", async () => {
    const many = { ...doc('Stora leken'), rows: Array.from({ length: 9 }, (_, i) => ({ id: `r${i}`, fields: { title: `Kort ${i}`, antal: 1 } })) }
    await send('POST', '/projects', { id: 'p1', ...doc() })
    await send('POST', '/projects', { id: 'p3', ...many })
    const list = (await (await send('GET', '/projects')).json()) as { id: string; card: { id: string; title: string } | null }[]
    // One card, and it is the deck's first row — the same card at every visit for as long as the
    // designer leaves the table in the order they put it in.
    expect(list.find((p) => p.id === 'p3')!.card).toEqual({ id: 'r0', title: 'Kort 0' })
    expect(list.find((p) => p.id === 'p1')!.card).toEqual({ id: 'dragon', title: 'Drake' })
    // A card nobody has titled yet is still a card, and answers to its id.
    await send('POST', '/projects', { id: 'p4', ...doc('Namnlösa'), rows: [{ id: 'namnlöst', fields: {} }] })
    // A game with no rows has no card to show, and says so rather than inventing one.
    await send('POST', '/projects', { id: 'p0', ...doc('Tomt'), rows: [] })
    const again = (await (await send('GET', '/projects')).json()) as { id: string; card: { id: string; title: string } | null }[]
    expect(again.find((p) => p.id === 'p4')!.card).toEqual({ id: 'namnlöst', title: 'namnlöst' })
    expect(again.find((p) => p.id === 'p0')!.card).toBeNull()
  })

  it('hands over what it takes to draw those cards in an answer of its own, one for the whole list (G1, #231)', async () => {
    await send('POST', '/projects', { id: 'p1', ...doc() })
    await send('POST', '/projects', { id: 'p0', ...doc('Tomt'), rows: [] })
    // The list is the first screen and stays light: it says which card each game has, never what
    // it takes to draw one. No template travels in it, however many games the account owns.
    const list = await (await send('GET', '/projects')).text()
    expect(list).not.toContain('faces')

    // What it takes to draw the cards comes apart, and in one answer for the whole list rather
    // than a round trip per game.
    const res = await send('GET', '/me/cards')
    expect(res.status).toBe(200)
    const cards = (await res.json()) as Record<string, { id: string; title: string; face: unknown; row: Record<string, unknown>; icons: Record<string, string> } | null>
    expect(cards['p1']).toMatchObject({ id: 'dragon', title: 'Drake', row: { title: 'Drake', antal: 1 }, icons: {} })
    // The face is the front of the game's own template, whole, so `CardPreview` draws the card
    // the deck wall draws and not an approximation of it.
    expect(cards['p1']!.face).toEqual(template.faces['front'])
    // A game with no rows has no card to draw, which is the list's intentional empty state.
    expect(cards['p0']).toBeNull()
  })

  it('tells whoever is not logged in to log in first, as the list does', async () => {
    expect((await fetch(`${run.http}/me/cards`)).status).toBe(401)
  })

  it('takes a game away when its owner asks, and refuses everyone else', async () => {
    await send('POST', '/projects', { id: 'p1', ...doc() })
    expect((await fetch(`${run.http}/projects/p1`, { method: 'DELETE' })).status).toBe(401)
    expect((await send('DELETE', '/projects/p1')).status).toBe(200)
    expect((await send('GET', '/projects/p1')).status).toBe(404)
    expect((await send('DELETE', '/projects/p1')).status).toBe(404)
    expect(((await (await send('GET', '/projects')).json()) as unknown[])).toEqual([])
  })
})

describe('the browser is allowed to do what the API offers', () => {
  it('answers a preflight with every method the routes actually serve', async () => {
    const run = await start({ appOrigin: 'http://localhost:5173' })
    try {
      const res = await fetch(`${run.http}/projects/p1`, {
        method: 'OPTIONS',
        headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'DELETE' },
      })
      expect(res.status).toBe(204)
      expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
      const allowed = (res.headers.get('access-control-allow-methods') ?? '').split(/,\s*/)
      // A method the API serves but the preflight does not allow is a route the browser cannot
      // reach at all, and nothing in the server itself would ever notice.
      expect(allowed).toEqual(expect.arrayContaining(['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']))
    } finally {
      await run.stop()
    }
  })
})
