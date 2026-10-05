import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PostgresLogStore, SeqConflictError } from '../src/index.js'
import { template } from './deck.js'
import { twoSeatSetup } from './fixture.js'
import { SCHEMA_VERSION, type Applied } from '@byd/protocol'
import postgres from 'postgres'
import { PG_TEST_BUDGET } from '../../../test-support/pg-budget.js'

vi.setConfig({ testTimeout: PG_TEST_BUDGET })

// Runs only against a real Postgres: DATABASE_URL=postgres://... pnpm test
// In a schema of its own, so a stack running against the same database is never touched.
const url = process.env['DATABASE_URL']
const schema = `test_server_${process.pid}_${Date.now()}`

describe.skipIf(!url)('PostgresLogStore', () => {
  let store: PostgresLogStore
  const id = `t-${Date.now()}`

  beforeAll(async () => {
    store = PostgresLogStore.connect(url!, { schema })
    await store.migrate()
    await store.createSession({ id, version: 'v1', setup: twoSeatSetup() })
  })
  afterAll(async () => {
    await store.dropSchema()
    await store.close()
  })

  const line = (seq: number): Applied => ({
    schemaVersion: SCHEMA_VERSION,
    seq,
    batch: `b${seq}`,
    at: '2026-09-06T00:00:00.000Z',
    by: null,
    intent: { v: 'draw', from: 'draw', to: 'table', count: 1 },
  })

  it('round-trips the session and appends in order', async () => {
    expect(await store.loadSession(id)).toMatchObject({ id, version: 'v1' })
    await store.append(id, [line(1), line(2)])
    expect((await store.read(id)).map((l) => l.seq)).toEqual([1, 2])
  })

  // The deck of each version a table was refreshed to (C7, #677), beside the start record it
  // leaves alone; writing one version twice keeps the last.
  it('keeps a refreshed deck under its version, and the start deck where it was', async () => {
    const deck = { template, rows: {}, icons: {} }
    const refreshed = `r-${Date.now()}`
    await store.createSession({ id: refreshed, version: 'rev-1', setup: twoSeatSetup(), deck })
    expect((await store.loadSession(refreshed))?.decks).toBeUndefined()
    await store.addDeck(refreshed, 'rev-2', { ...deck, rows: { a: { title: 'Ett' } } })
    await store.addDeck(refreshed, 'rev-2', { ...deck, rows: { a: { title: 'Två' } } })
    const loaded = await store.loadSession(refreshed)
    expect(loaded).toMatchObject({ version: 'rev-1', deck })
    expect(loaded?.decks).toEqual({ 'rev-2': { ...deck, rows: { a: { title: 'Två' } } } })
  })

  // «Ny kod» (#820): the code and the host key are rotated together, in one write.
  it('rotates the code and the host key together', async () => {
    const rotating = `k-${Date.now()}`
    await store.createSession({ id: rotating, version: 'v1', setup: twoSeatSetup(), code: 'ABCDEF', codeExpiresAt: '2026-09-07T13:00:00.000Z', hostKeyHash: 'old' })
    await store.rotateAdmission(rotating, 'GHJKMN', '2026-09-07T14:00:00.000Z', 'new')
    expect(await store.loadSession(rotating)).toMatchObject({ code: 'GHJKMN', codeExpiresAt: '2026-09-07T14:00:00.000Z', hostKeyHash: 'new' })
    expect(await store.sessionByCode('ABCDEF')).toBeNull()
  })

  it('refuses a gap or an overlap', async () => {
    await expect(store.append(id, [line(4)])).rejects.toBeInstanceOf(SeqConflictError)
    await expect(store.append(id, [line(2)])).rejects.toBeInstanceOf(SeqConflictError)
    expect((await store.read(id)).map((l) => l.seq)).toEqual([1, 2])
  })

  it('a row from before versioning is lifted to today\'s schema when read, and never rewritten (DRIFT §7)', async () => {
    const sql = postgres(url!, { max: 1, onnotice: () => undefined, connection: { search_path: schema } })
    try {
      await sql`insert into events (session_id, seq, batch, at, by_seat, intent, outcome) values (${id}, 3, 'legacy', '2026-09-06T00:00:00.000Z', 'A', ${sql.json({ v: 'flag', note: 'gammal' })}, null)`
      const read = await store.read(id)
      expect(read.at(-1)).toEqual({ schemaVersion: SCHEMA_VERSION, seq: 3, batch: 'legacy', at: '2026-09-06T00:00:00.000Z', by: 'A', intent: { v: 'flag', note: 'gammal' } })
      const [row] = await sql<{ schema_version: number | null }[]>`select schema_version from events where session_id = ${id} and seq = 3`
      expect(row?.schema_version).toBeNull()
      const [written] = await sql<{ schema_version: number | null }[]>`select schema_version from events where session_id = ${id} and seq = 1`
      expect(written?.schema_version).toBe(SCHEMA_VERSION)
    } finally {
      await sql.end()
    }
  })

  // A table's last move is the last physical line, not the last line (#706): a seat taken after
  // the last draw is not a move, and a table where only a seat was taken has none.
  it("says a table's last move is its last move on the table, not a seat taken", async () => {
    const game = `p-${Date.now()}`
    const { zones, seats, floor } = twoSeatSetup()
    await store.projects().create(game, { name: 'Drag', template, rows: [], icons: {}, setup: { zones, seats, floor, deckZone: 'draw' } })
    const played = `played-${Date.now()}`
    const seated = `seated-${Date.now()}`
    await store.createSession({ id: played, version: 'v1', setup: twoSeatSetup(), project: game })
    await store.createSession({ id: seated, version: 'v1', setup: twoSeatSetup(), project: game })
    const claim = (seq: number, at: string): Applied => ({ ...line(seq), at, intent: { v: 'seat.claim', seat: 'A', name: 'Ada' } })
    await store.append(played, [{ ...line(1), at: '2026-09-06T10:00:00.000Z' }, claim(2, '2026-09-06T11:00:00.000Z')])
    await store.append(seated, [claim(1, '2026-09-06T12:00:00.000Z')])
    const listed = Object.fromEntries((await store.sessionsOf(game)).map((s) => [s.id, s.lastAt]))
    expect(listed).toEqual({ [played]: '2026-09-06T10:00:00.000Z', [seated]: null })
  })
})

describe.skipIf(!url)('PostgresProjectStore', () => {
  it('creates, loads, replaces with optimistic concurrency', async () => {
    const store = PostgresLogStore.connect(url!, { schema })
    await store.migrate()
    const projects = store.projects()
    const id = `p-${Date.now()}`
    const { zones, seats, floor } = twoSeatSetup()
    const doc = { name: 'Test', template, rows: [{ id: 'a', fields: { title: 'A' } }], icons: {}, setup: { zones, seats, floor, deckZone: 'draw' } }
    expect((await projects.create(id, doc)).rev).toBe(1)
    expect((await projects.load(id))?.name).toBe('Test')
    expect(await projects.replace(id, 5, doc)).toBe('conflict')
    const next = await projects.replace(id, 1, { ...doc, name: 'Test 2' })
    expect(next).toMatchObject({ rev: 2, name: 'Test 2' })
    expect(await projects.replace('nope', 1, doc)).toBe('missing')
    await store.close()
  })

  it('lists the invitations that can still be followed, and none that were used or ran out (#477)', async () => {
    const store = PostgresLogStore.connect(url!, { schema })
    await store.migrate()
    const projects = store.projects()
    const id = `p-inv-${Date.now()}`
    const { zones, seats, floor } = twoSeatSetup()
    await projects.create(id, { name: 'Test', template, rows: [], icons: {}, setup: { zones, seats, floor, deckZone: 'draw' } })
    const later = '2099-01-01T00:00:00.000Z'
    await projects.invite({ tokenHash: `${id}-a`, project: id, email: 'bo@example.com', role: 'editor', expiresAt: later })
    await projects.invite({ tokenHash: `${id}-b`, project: id, email: 'cee@example.com', role: 'viewer', expiresAt: later })
    await projects.invite({ tokenHash: `${id}-c`, project: id, email: 'dee@example.com', role: 'viewer', expiresAt: '2000-01-01T00:00:00.000Z' })
    await projects.acceptInvite(`${id}-b`, new Date().toISOString())
    expect(await projects.openInvites(id, new Date().toISOString())).toEqual([{ email: 'bo@example.com', role: 'editor', expiresAt: later }])
    // Withdrawn, whatever case the address is written in, and only what was still waiting.
    expect(await projects.withdrawInvites(id, 'BO@example.com')).toBe(1)
    expect(await projects.withdrawInvites(id, 'cee@example.com')).toBe(0)
    expect(await projects.openInvites(id, new Date().toISOString())).toEqual([])
    expect(await projects.acceptInvite(`${id}-a`, new Date().toISOString())).toBeNull()
    await store.close()
  })

  it("lists a game with its first card, the deck in the table's own order (G1)", async () => {
    const store = PostgresLogStore.connect(url!, { schema })
    await store.migrate()
    const projects = store.projects()
    const id = `fan-${Date.now()}`
    const { zones, seats, floor } = twoSeatSetup()
    // Nine cards: the list names the first of them, exactly as the memory store's listing does.
    const rows = Array.from({ length: 9 }, (_, i) => ({ id: `r${i}`, fields: i === 8 ? {} : { title: `Kort ${i}` } }))
    // Accounts are numbered here (the API speaks of them as text), so the owner is a real
    // account's id and not a name: `list` joins it against a bigint column.
    const ada = await store.auth().ensureAccount(`ada-${Date.now()}@example.com`)
    await projects.create(id, { name: 'Stora leken', template, rows, icons: {}, setup: { zones, seats, floor, deckZone: 'draw' } }, ada.id)
    const listed = (await projects.list(ada.id)).find((p) => p.id === id)
    expect(listed?.card).toEqual({ id: 'r0', title: 'Kort 0' })
    // An untitled first card answers to its id, and a game with no rows at all has no card.
    const untitled = `fan-untitled-${Date.now()}`
    await projects.create(untitled, { name: 'Namnlösa', template, rows: [{ id: 'namnlöst', fields: {} }], icons: {}, setup: { zones, seats, floor, deckZone: 'draw' } }, ada.id)
    const empty = `fan-empty-${Date.now()}`
    await projects.create(empty, { name: 'Tomt', template, rows: [], icons: {}, setup: { zones, seats, floor, deckZone: 'draw' } }, ada.id)
    const all = await projects.list(ada.id)
    expect(all.find((p) => p.id === untitled)?.card).toEqual({ id: 'namnlöst', title: 'namnlöst' })
    expect(all.find((p) => p.id === empty)?.card).toBeNull()
    await store.close()
  })
})

describe.skipIf(!url)('project row order survives storage', () => {
  it('keeps the rows in the order they were written, including numeric-looking ids', async () => {
    const store = PostgresLogStore.connect(url!, { schema })
    await store.migrate()
    const projects = store.projects()
    const id = `order-${Date.now()}`
    const { zones, seats, floor } = twoSeatSetup()
    const rows = [
      { id: 'zeta', fields: { title: 'Z' } },
      { id: '10', fields: { title: 'Ten' } },
      { id: 'alpha', fields: { title: 'A' } },
      { id: '2', fields: { title: 'Two' } },
    ]
    await projects.create(id, { name: 'Order', template, rows, icons: {}, setup: { zones, seats, floor, deckZone: 'draw' } })
    expect((await projects.load(id))?.rows.map((r) => r.id)).toEqual(['zeta', '10', 'alpha', '2'])
    await store.close()
  })
})
