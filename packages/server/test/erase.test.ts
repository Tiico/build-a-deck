import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import postgres from 'postgres'
import { REDACTED, type Applied, type Intent } from '@byd/protocol'
import { initialState, redactLine, replay } from '@byd/engine'
import { MemoryAuthStore, MemoryLogStore, MemoryProjectStore, MemorySurveyStore, PostgresLogStore, hash, type AuthStore, type LogStore, type SurveyStore } from '../src/index.js'
import type { ProjectStore } from '../src/projects.js'
import { ADMISSION_ERASED as ERASED, ADMISSION_REVOKED as REVOKED, changesAt, entry, parseLedger, retentionCutoff, sweepErasures, type ErasureStore } from '../src/erase.js'
import { runErase, type EraseStores } from '../src/erase-cli.js'
import type { GuestRecord } from '../src/store.js'
import { WireClient } from './client.js'
import { template } from './deck.js'
import { registerRoom, registry, start, twoSeatSetup, type Running } from './fixture.js'

// Erasure in the store (#1279, G6, väg A): one guest, a table's guests and a game's tables are
// masked where they lie — the personal fields of the log (`PERSONAL_FIELDS`), the admissions' names
// and the surveys — and the game is the same game (D4). Proven on what the doors answer, on what
// crosses the wire to a new connection, and on the raw rows themselves. The same test against the
// memory stores and against Postgres, whose queries are the ones the box answers with; the Postgres
// half runs only with DATABASE_URL, and the restore at the end only there.
const url = process.env['DATABASE_URL']
const schema = `test_erase_${process.pid}_${Date.now()}`

type Backend = { store: LogStore; surveys: SurveyStore; projects: ProjectStore; auth: AuthStore; raw(session: string): Promise<string>; cli(run: Running): EraseStores; close(): Promise<void> }
const backends: { name: string; skip: boolean; open(): Promise<Backend> }[] = [
  {
    name: 'memory',
    skip: false,
    open: async () => {
      const store = new MemoryLogStore()
      const surveys = new MemorySurveyStore()
      const projects = new MemoryProjectStore()
      return {
        store,
        surveys,
        projects,
        auth: new MemoryAuthStore(),
        // Everything the memory store holds of a table, as it holds it.
        raw: async (session) => JSON.stringify([await store.read(session), await store.guestsAt(session), await surveys.list(session)]),
        cli: (run) => ({ store, erasures: run.erasures!, projects }),
        close: () => Promise.resolve(),
      }
    },
  },
  {
    name: 'Postgres',
    skip: !url,
    open: async () => {
      const store = PostgresLogStore.connect(url!, { schema })
      await store.migrate()
      const sql = postgres(url!, { max: 1, onnotice: () => undefined, connection: { search_path: schema } })
      // The operator's script is another process with its own connection (DRIFT §10): the app hears
      // of what it did only through Postgres.
      const script = PostgresLogStore.connect(url!, { schema })
      return {
        store,
        surveys: store.surveys(),
        projects: store.projects(),
        auth: store.auth(),
        // The rows themselves, every column as text: what a backup holds.
        raw: async (session) => {
          const rows = await Promise.all([
            sql`select e::text from events e where session_id = ${session} order by seq`,
            sql`select g::text from guest_tokens g where session_id = ${session} order by issued_at`,
            sql`select s::text from surveys s where session_id = ${session} order by id`,
            sql`select s::text from sessions s where id = ${session}`,
          ])
          return JSON.stringify(rows.map((r) => r.map((row) => Object.values(row)[0])))
        },
        cli: () => ({ store: script, erasures: script.erasures(), projects: script.projects() }),
        close: async () => {
          await script.close()
          await sql.end()
          await store.dropSchema()
          await store.close()
        },
      }
    },
  },
]

const NAME = 'Adelina Raderas'
const COMMENT = 'Adelinas kommentar om draken'
const NOTE = 'Adelinas anteckning om poängen'
const CHANGE = 'Adelinas önskan om kortare rundor'
const BO = 'Bosse Kvarstår'
const BO_NOTE = 'Bosses poänglista'
const CILLA = 'Cilla Tittar'
const CILLA_COMMENT = 'Cillas iakttagelse'
const HERS = [NAME, COMMENT, NOTE, CHANGE]

const game = () => {
  const { zones, seats, floor } = twoSeatSetup()
  return { name: 'Raderingens spel', template, rows: [{ id: 'dragon', fields: { title: 'Drake', antal: 6 } }], icons: {}, setup: { zones, seats, floor, deckZone: 'draw' } }
}
const containsAny = (text: string, words: readonly string[]) => words.filter((w) => text.includes(w))
// A value with every one of `words` masked: what the masked log must replay to.
const masked = <T>(value: T, words: readonly string[]): T => {
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return words.includes(v) ? REDACTED : v
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]))
    return v
  }
  return walk(value) as T
}
async function eventually(check: () => Promise<void>, ms = 4000): Promise<void> {
  const until = Date.now() + ms
  for (;;) {
    try {
      return await check()
    } catch (e) {
      if (Date.now() > until) throw e
      await new Promise((r) => setTimeout(r, 25))
    }
  }
}
const quietly = () => vi.spyOn(console, 'log').mockImplementation(() => undefined)
let n = 0

for (const backend of backends) {
  describe.skipIf(backend.skip)(`erasure in the store, in ${backend.name} (#1279)`, () => {
    let db: Backend
    let run: Running
    beforeAll(async () => {
      db = await backend.open()
      run = await start({ store: db.store, surveys: db.surveys, projects: db.projects, auth: db.auth })
    })
    afterAll(async () => {
      await run.stop()
      await db.close()
    })

    const login = async (email: string): Promise<string> => {
      await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
      const link = /\/auth\/verify\?token=\S+/.exec(run.mail.sent.at(-1)?.text ?? '')?.[0] ?? ''
      return ((await fetch(`${run.http}${link}`, { redirect: 'manual' })).headers.get('set-cookie') ?? '').split(';')[0] ?? ''
    }
    const as = (cookie: string | null) => (method: string, path: string, body?: unknown) =>
      fetch(`${run.http}${path}`, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    const script = async (...args: string[]) => {
      const out: string[] = []
      const code = await runErase(args, db.cli(run), { out: (l) => out.push(l), err: (l) => out.push(l), read: async () => '' })
      return { code, out: out.join('\n') }
    }

    // A game, a table started from it, and three people at it: Adelina and Bosse at the seats and
    // Cilla watching. Each of them writes in every personal field there is.
    async function played() {
      const i = ++n
      const ownerEmail = `agare-${backend.name.toLowerCase()}-${i}@example.com`
      const owner = as(await login(ownerEmail))
      const project = `erase-${backend.name}-${process.pid}-${i}`
      await owner('POST', '/projects', { id: project, ...game() })
      const table = (await (await owner('POST', `/projects/${project}/sessions`, {})).json()) as { id: string; code: string; hostKey: string }
      registerRoom(table.id, table)
      const tokens = { ada: await run.admit(table.id, 'A', NAME), bo: await run.admit(table.id, 'B', BO), cilla: await run.admit(table.id, null, CILLA) }
      const ada = await WireClient.connect(run.base, table.id, 'A', undefined, { token: tokens.ada })
      const bo = await WireClient.connect(run.base, table.id, 'B', undefined, { token: tokens.bo })
      const cilla = await WireClient.connect(run.base, table.id, null, { role: 'observer', name: CILLA }, { token: tokens.cilla })
      const ok = async (c: WireClient, seat: string | null, it: Intent) => expect((await c.send(seat, it)).t).toBe('ack')
      await ok(ada, 'A', { v: 'seat.claim', seat: 'A', name: NAME })
      await ok(bo, 'B', { v: 'seat.claim', seat: 'B', name: BO })
      await ok(ada, 'A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
      await ok(ada, 'A', { v: 'flag', note: COMMENT })
      await ok(ada, 'A', { v: 'note.add', text: NOTE })
      await ok(bo, 'B', { v: 'note.add', text: BO_NOTE })
      await ok(cilla, null, { v: 'flag', note: CILLA_COMMENT })
      return { project, table, tokens, ada, bo, cilla, owner, ownerEmail, ok }
    }
    const answer = (table: string, token: string, seat: string | null, change: string) =>
      as(null)('POST', `/sessions/${table}/survey`, { token, seat, ...(seat === null ? { observer: true } : {}), answers: { fun: 4, clarity: 3, balance: 2, change } })

    it('erases one guest at an ended table: no door, no new connection and no row says her name or her words, and the game is the same game', async () => {
      const t = await played()
      await t.ok(t.ada, 'A', { v: 'session.end' })
      for (const c of [t.ada, t.bo, t.cilla]) await c.close()
      expect((await answer(t.table.id, t.tokens.ada, 'A', CHANGE)).status).toBe(201)
      expect((await answer(t.table.id, t.tokens.bo, 'B', 'Bosses önskan')).status).toBe(201)
      // She has claimed the table to her account since (G1): «Bord du spelat vid» is a door too.
      const email = `adelina-${backend.name.toLowerCase()}-${n}@example.com`
      const adelina = as(await login(email))
      expect((await adelina('POST', '/guests/claim', { token: t.tokens.ada })).status).toBe(200)

      const reads = async () => {
        const fresh = await run.connectTable(t.table.id, t.table.hostKey)
        await fresh.close()
        return {
          playtest: await (await t.owner('GET', `/projects/${t.project}/playtest`)).text(),
          export: await (await t.owner('GET', `/sessions/${t.table.id}/export`)).text(),
          played: await (await adelina('GET', '/me/played')).text(),
          frames: fresh.frames.join('\n'),
          raw: await db.raw(t.table.id),
        }
      }
      // Each place is first shown to hold what it must lose, or its silence afterwards proves nothing.
      const before = await reads()
      expect(containsAny(before.playtest, [NAME, COMMENT, CHANGE])).toEqual([NAME, COMMENT, CHANGE])
      expect(containsAny(before.export, [NAME, COMMENT, NOTE])).toEqual([NAME, COMMENT, NOTE])
      expect(containsAny(before.played, [NAME])).toEqual([NAME])
      expect(containsAny(before.frames, [NAME, NOTE])).toEqual([NAME, NOTE])
      expect(containsAny(before.raw, HERS)).toEqual(HERS)
      const session = (await db.store.loadSession(t.table.id))!
      const log = await db.store.read(t.table.id)

      const done = await script('table', t.table.id, '--name', NAME)
      expect(done.code).toBe(0)
      expect(JSON.parse(done.out)).toMatchObject({ msg: 'erase', verb: 'table', session: t.table.id, admissions: 1, tables: 1, guests: 1, surveys: 1 })

      await eventually(async () => {
        const after = await reads()
        for (const [door, text] of Object.entries(after)) expect([door, containsAny(text, HERS)]).toEqual([door, []])
        // And only hers: Bosse and Cilla are where they were.
        expect(containsAny(after.playtest, [BO, CILLA, CILLA_COMMENT, 'Bosses önskan'])).toEqual([BO, CILLA, CILLA_COMMENT, 'Bosses önskan'])
        expect(containsAny(after.export, [BO, BO_NOTE])).toEqual([BO, BO_NOTE])
        expect(containsAny(after.played, [REDACTED])).toEqual([REDACTED])
      })

      // The game is the same game (D4): every line is there, and only her personal fields changed.
      const after = await db.store.read(t.table.id)
      const hers = new Set(log.filter((l) => l.by === 'A' && redactLine(l) !== l).map((l) => l.seq))
      expect(hers.size).toBe(3)
      expect(after).toEqual(log.map((l) => (hers.has(l.seq) ? redactLine(l) : l)))
      const initial = initialState(session.version, session.setup, registry)
      expect(replay(initial, registry, after)).toEqual(masked(replay(initial, registry, log), [NAME, COMMENT, NOTE]))

      // The ledger and what the script said hold no name, no address and no token.
      const ledger = JSON.stringify(await db.cli(run).erasures.ledger())
      for (const text of [ledger, done.out]) expect(containsAny(text, [NAME, email, t.ownerEmail, t.tokens.ada, hash(t.tokens.ada)])).toEqual([])
      // Run again, it finds nothing left to mask.
      expect(JSON.parse((await script('table', t.table.id, '--seat', 'A')).out)).toMatchObject({ admissions: 1, lines: 0, guests: 0, surveys: 0 })
    })

    it('erases a guest at a table in play: her seat stays taken under the masked name, and the others play on', async () => {
      const t = await played()
      await t.bo.synced(t.bo.view!.seq)
      const view = structuredClone(t.bo.view!)
      expect(view.seats.find((s) => s.id === 'A')?.name).toBe(NAME)

      expect((await script('table', t.table.id, '--seat', 'A')).code).toBe(0)
      // Bosse is patched as after any line: the names and the words masked, nothing else.
      await t.bo.waitFor((m) => m.t === 'patch' && t.bo.view?.seats.find((s) => s.id === 'A')?.name === REDACTED, 4000)
      expect(t.bo.view).toEqual(masked(view, [NAME, NOTE, COMMENT]))
      await t.ok(t.bo, 'B', { v: 'draw', from: 'draw', to: 'hand:B', count: 1 })
      // Her own admission is erased, and what it would write now is refused (#1348).
      expect(await t.ada.send('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })).toMatchObject({ t: 'reject', reason: ERASED })
      // A connection opened now is told the masked log.
      const fresh = await run.connectTable(t.table.id, t.table.hostKey)
      await fresh.close()
      expect(containsAny(fresh.frames.join('\n'), [NAME, NOTE, COMMENT])).toEqual([])
      expect(containsAny(fresh.frames.join('\n'), [BO, BO_NOTE])).toEqual([BO, BO_NOTE])
      for (const c of [t.ada, t.bo, t.cilla]) await c.close()
    })

    it('masks the tables of a game taken away and drops their answers, and the quotas count the same tables', async () => {
      const t = await played()
      await t.ok(t.ada, 'A', { v: 'session.end' })
      for (const c of [t.ada, t.bo, t.cilla]) await c.close()
      expect((await answer(t.table.id, t.tokens.ada, 'A', CHANGE)).status).toBe(201)
      expect((await answer(t.table.id, t.tokens.cilla, null, 'Cillas önskan')).status).toBe(201)
      const everyone = [...HERS, BO, BO_NOTE, CILLA, CILLA_COMMENT, 'Cillas önskan']
      expect(containsAny(await db.raw(t.table.id), everyone)).toEqual(everyone)
      const owner = (await db.auth.accountByEmail(t.ownerEmail))!
      const since = new Date(Date.now() - 30 * 24 * 3600_000)
      const counted = await db.store.tablesOf(owner.id, since)

      expect((await t.owner('DELETE', `/projects/${t.project}`)).status).toBe(200)
      expect(containsAny(await db.raw(t.table.id), everyone)).toEqual([])
      expect(await db.surveys.list(t.table.id)).toEqual([])
      expect(await db.store.loadSession(t.table.id)).not.toBeNull()
      expect(await db.store.tablesOf(owner.id, since)).toEqual(counted)
      expect((await db.cli(run).erasures.ledger()).filter((e) => e.kind === 'game' && e.project === t.project)).toMatchObject([{ reason: 'removed' }])
    })

    it('masks, in its first round, the tables of a game taken away before #1279, and a second round changes nothing', async () => {
      const t = await played()
      await t.ok(t.ada, 'A', { v: 'session.end' })
      for (const c of [t.ada, t.bo, t.cilla]) await c.close()
      // As every game was taken away before: the game goes, its tables stay as they were.
      expect(await db.projects.remove(t.project)).toBe(true)
      expect(containsAny(await db.raw(t.table.id), [NAME, BO, CILLA])).toEqual([NAME, BO, CILLA])

      quietly()
      const erasures = run.erasures!
      expect(await sweepErasures(erasures, new Date())).toMatchObject({ orphans: 1, retained: 0 })
      expect(containsAny(await db.raw(t.table.id), [NAME, NOTE, BO, BO_NOTE, CILLA, CILLA_COMMENT])).toEqual([])
      const raw = await db.raw(t.table.id)
      const ledger = await erasures.ledger()
      expect(await sweepErasures(erasures, new Date())).toMatchObject({ orphans: 0, retained: 0, lines: 0, guests: 0, surveys: 0 })
      expect(await db.raw(t.table.id)).toBe(raw)
      expect(await erasures.ledger()).toEqual(ledger)
      vi.restoreAllMocks()
    })

    it('masks a guest without an account twelve months after her table ended, and leaves a claimed guest and a later table alone', async () => {
      const now = new Date()
      const month = 30 * 24 * 3600_000
      const at = (d: Date, ms: number) => new Date(d.getTime() + ms).toISOString()
      // Two tables written straight into the store: one ended thirteen months ago, one eleven.
      const table = async (id: string, ended: Date, who: string) => {
        await db.store.createSession({ id, version: 'v1', setup: twoSeatSetup() })
        const t0 = new Date(ended.getTime() - 3600_000)
        const admit = async (token: string, seat: string | null, name: string) => {
          expect(await db.store.issueGuest(id, { tokenHash: hash(token), kind: seat === null ? 'observer' : 'seat', seat, name, issuedAt: at(t0, -60_000), expiresAt: at(t0, 3 * 3600_000) })).toBe(true)
        }
        await admit(`${id}-a`, 'A', `${who} Gäst`)
        await admit(`${id}-b`, 'B', `${who} Konto`)
        await admit(`${id}-o`, null, `${who} Tittare`)
        expect(await db.store.claimGuest(hash(`${id}-b`), 'konto-1')).toMatchObject({ seat: 'B' })
        const lines: [string | null, Intent][] = [
          ['A', { v: 'seat.claim', seat: 'A', name: `${who} Gäst` }],
          ['B', { v: 'seat.claim', seat: 'B', name: `${who} Konto` }],
          ['A', { v: 'flag', note: `${who} kommentar` }],
          ['B', { v: 'note.add', text: `${who} kontots anteckning` }],
          [null, { v: 'flag', observer: `${who} Tittare`, note: `${who} tittarens ord` }],
          [null, { v: 'session.end' }],
        ]
        await db.store.append(id, lines.map(([by, intent], i): Applied => ({ schemaVersion: 1, seq: i + 1, batch: `${id}-${i}`, at: i === lines.length - 1 ? ended.toISOString() : at(t0, i * 60_000), by, intent })))
        for (const [seat, name] of [['A', `${who} Gäst`], ['B', `${who} Konto`], [null, `${who} Tittare`]] as const) {
          await db.surveys.put({ sessionId: id, version: 'v1', at: ended.toISOString(), who: name, seat, ...(seat === null ? { observer: true } : {}), answers: { fun: 5, clarity: 4, balance: 3, change: `${name} önskan` } })
        }
      }
      const old = `retention-old-${backend.name}-${process.pid}`
      const later = `retention-later-${backend.name}-${process.pid}`
      await table(old, new Date(now.getTime() - 13 * month), 'Gammal')
      await table(later, new Date(now.getTime() - 11 * month), 'Senare')
      expect(Date.parse(retentionCutoff(now).toISOString())).toBeLessThan(now.getTime() - 11 * month)
      const laterRaw = await db.raw(later)

      quietly()
      const erasures = run.erasures!
      expect(await sweepErasures(erasures, now)).toMatchObject({ retained: 2, guests: 2, surveys: 2 })
      const raw = await db.raw(old)
      expect(containsAny(raw, ['Gammal Gäst', 'Gammal kommentar', 'Gammal Tittare', 'Gammal tittarens ord', 'Gammal Gäst önskan', 'Gammal Tittare önskan'])).toEqual([])
      expect(containsAny(raw, ['Gammal Konto', 'Gammal kontots anteckning', 'Gammal Konto önskan'])).toEqual(['Gammal Konto', 'Gammal kontots anteckning', 'Gammal Konto önskan'])
      // The answers keep their numbers and lose their words (F4).
      const answers = await db.surveys.list(old)
      expect(answers.map((s) => ({ seat: s.seat, masked: s.who.startsWith(REDACTED), answers: s.answers }))).toEqual(
        expect.arrayContaining([
          { seat: 'A', masked: true, answers: { fun: 5, clarity: 4, balance: 3, change: '' } },
          { seat: null, masked: true, answers: { fun: 5, clarity: 4, balance: 3, change: '' } },
          { seat: 'B', masked: false, answers: { fun: 5, clarity: 4, balance: 3, change: 'Gammal Konto önskan' } },
        ]),
      )
      // The ledger names the two by their table, seat and moment, and why; one round is one moment,
      // so within it the ledger has no order to keep.
      const named = (await erasures.ledger()).filter((e) => e.kind === 'guest' && e.session === old).map((e) => [e.reason, e.kind === 'guest' ? e.seat : 'none'])
      expect(named).toHaveLength(2)
      expect(named).toEqual(expect.arrayContaining([
        ['retention', 'A'],
        ['retention', null],
      ]))
      expect(await db.raw(later)).toBe(laterRaw)
      expect(await sweepErasures(erasures, now)).toMatchObject({ retained: 0, lines: 0, guests: 0, surveys: 0 })
      vi.restoreAllMocks()
    })

    // The guest's own way (#1281, G6, F5): her phone asks with the token her seat or her watch was
    // bought with, and the server erases that admission and nothing else, the way the operator's
    // script erases one when she writes to Kontakt.
    const eraseMe = (table: string, token: unknown) => as(null)('POST', `/sessions/${table}/erase`, { token })

    it('lets a guest erase herself with her own token, at a table in play, and the others see the seat taken under the masked name', async () => {
      const t = await played()
      await t.bo.synced(t.bo.view!.seq)
      expect(t.bo.view!.seats.find((s) => s.id === 'A')?.name).toBe(NAME)
      const res = await eraseMe(t.table.id, t.tokens.ada)
      expect(res.status).toBe(200)
      // What it answers says what it did, counted, and never a name.
      const said = await res.text()
      expect(JSON.parse(said)).toEqual({ ok: true })
      await t.bo.waitFor(() => t.bo.view?.seats.find((s) => s.id === 'A')?.name === REDACTED, 4000)
      // Her own connection is patched too, and the seat stays taken until she gives it up.
      await t.ada.waitFor(() => t.ada.view?.seats.find((s) => s.id === 'A')?.name === REDACTED, 4000)
      // A connection opened now is told nothing of her: not her name, not her words.
      const fresh = await run.connectTable(t.table.id, t.table.hostKey)
      await fresh.close()
      expect(containsAny(fresh.frames.join('\n'), [NAME, NOTE, COMMENT])).toEqual([])
      expect(containsAny(fresh.frames.join('\n'), [BO, BO_NOTE, CILLA, CILLA_COMMENT])).toEqual([BO, BO_NOTE, CILLA, CILLA_COMMENT])
      expect(containsAny(await db.raw(t.table.id), [NAME, NOTE, COMMENT])).toEqual([])
      // Written in the ledger as asked for, with no name and no token.
      const ledger = await db.cli(run).erasures.ledger()
      expect(ledger.at(-1)).toMatchObject({ kind: 'guest', session: t.table.id, seat: 'A', reason: 'request' })
      expect(containsAny(JSON.stringify(ledger), [NAME, t.tokens.ada, hash(t.tokens.ada)])).toEqual([])
      for (const c of [t.ada, t.bo, t.cilla]) await c.close()
    })

    it('lets a guest erase herself after the survey, and her answers go with her name', async () => {
      const t = await played()
      await t.ok(t.ada, 'A', { v: 'session.end' })
      for (const c of [t.ada, t.bo, t.cilla]) await c.close()
      expect((await answer(t.table.id, t.tokens.ada, 'A', CHANGE)).status).toBe(201)
      expect((await answer(t.table.id, t.tokens.cilla, null, 'Cillas önskan')).status).toBe(201)
      const before = await (await t.owner('GET', `/projects/${t.project}/playtest`)).text()
      expect(containsAny(before, [NAME, COMMENT, CHANGE, CILLA, 'Cillas önskan'])).toEqual([NAME, COMMENT, CHANGE, CILLA, 'Cillas önskan'])

      expect((await eraseMe(t.table.id, t.tokens.ada)).status).toBe(200)
      // The observer has her own way, the same one.
      expect((await eraseMe(t.table.id, t.tokens.cilla)).status).toBe(200)
      const after = await (await t.owner('GET', `/projects/${t.project}/playtest`)).text()
      expect(containsAny(after, [NAME, COMMENT, CHANGE, CILLA, CILLA_COMMENT, 'Cillas önskan'])).toEqual([])
      expect(containsAny(after, [BO])).toEqual([BO])
      expect((await db.surveys.list(t.table.id)).map((s) => s.who)).toEqual([])
      // Asked again, it is done already, and says so the same way.
      expect((await eraseMe(t.table.id, t.tokens.ada)).status).toBe(200)
    })

    it('lets a kicked guest erase herself, since the token still says who she was', async () => {
      const t = await played()
      const kicked = await fetch(`${run.http}/sessions/${t.table.id}/kick`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${t.table.hostKey}` }, body: JSON.stringify({ seat: 'A' }) })
      expect(kicked.status).toBe(200)
      expect((await eraseMe(t.table.id, t.tokens.ada)).status).toBe(200)
      expect(containsAny(await db.raw(t.table.id), [NAME, NOTE, COMMENT])).toEqual([])
      for (const c of [t.ada, t.bo, t.cilla]) await c.close()
    })

    // An admission that is over writes nothing more (#1348). A phone that was reloaded at the table
    // had never claimed the seat itself, and when the release freed it, it claimed it again under
    // her name, after the erasure, on a connection let in before it. So the table asks each guest
    // envelope whether the admission it came in on is still hers: revoked, it may do nothing, and
    // erased, it may only give up its seat, which says nothing of her.
    it('lets a claim sent behind the release of an erased seat write nothing, so her name never comes back (#1348)', async () => {
      const t = await played()
      await t.bo.synced(t.bo.view!.seq)
      expect((await eraseMe(t.table.id, t.tokens.ada)).status).toBe(200)
      await t.ada.waitFor(() => t.ada.view?.seats.find((s) => s.id === 'A')?.name === REDACTED, 4000)
      await t.bo.waitFor(() => t.bo.view?.seats.find((s) => s.id === 'A')?.name === REDACTED, 4000)
      const seen = t.bo.frames.length

      // The release and, straight behind it on the same socket before any answer, the claim a
      // reloaded phone sent when the release's patch said the seat was free.
      const release = t.ada.waitFor((m) => m.t === 'ack' && m.id === 'gone-1')
      t.ada.sendRaw(JSON.stringify({ t: 'envelope', envelope: { id: 'gone-1', seat: 'A', intents: [{ v: 'seat.release', seat: 'A' }] } }))
      t.ada.sendRaw(JSON.stringify({ t: 'envelope', envelope: { id: 'gone-2', seat: 'A', intents: [{ v: 'seat.claim', seat: 'A', name: NAME }] } }))
      await release
      await t.ada.closed()
      // A line after both, so the claim has been decided by the time anything is read.
      await t.ok(t.bo, 'B', { v: 'draw', from: 'draw', to: 'hand:B', count: 1 })

      expect(t.bo.view!.seats.find((s) => s.id === 'A')?.name).toBeNull()
      expect(containsAny(t.bo.frames.slice(seen).join('\n'), [NAME])).toEqual([])
      const fresh = await run.connectTable(t.table.id, t.table.hostKey)
      await fresh.close()
      expect(containsAny(fresh.frames.join('\n'), [NAME])).toEqual([])
      expect(containsAny(await db.raw(t.table.id), [NAME, NOTE, COMMENT])).toEqual([])
      for (const c of [t.bo, t.cilla]) await c.close()
    })

    it('refuses every intent from an erased admission but giving up its own seat, and from a revoked one everything (#1348)', async () => {
      const t = await played()
      expect((await eraseMe(t.table.id, t.tokens.ada)).status).toBe(200)
      expect((await eraseMe(t.table.id, t.tokens.cilla)).status).toBe(200)
      await t.ada.waitFor(() => t.ada.view?.seats.find((s) => s.id === 'A')?.name === REDACTED, 4000)
      const words: Intent[] = [
        { v: 'note.add', text: 'Adelinas nya rad' },
        { v: 'flag', note: 'Adelinas nya kommentar' },
        { v: 'draw', from: 'draw', to: 'hand:A', count: 1 },
      ]
      for (const it of words) expect(await t.ada.send('A', it)).toMatchObject({ t: 'reject', reason: ERASED })
      // Her seat's way out is not her other seat's: an envelope that gives up anything else is refused whole.
      expect(await t.ada.send('A', { v: 'seat.release', seat: 'A' }, { v: 'note.add', text: 'och en rad' })).toMatchObject({ t: 'reject', reason: ERASED })
      // The watcher erased herself too, and flags nothing more.
      expect(await t.cilla.send(null, { v: 'flag', note: 'Cillas nya iakttagelse' })).toMatchObject({ t: 'reject', reason: ERASED })
      // Bosse is nobody's erasure, and plays on.
      await t.ok(t.bo, 'B', { v: 'note.add', text: 'Bosses nya rad' })
      // Revoked in the store behind the table's back, as a kick revokes before it empties the seat:
      // the table asks the store, not its memory, and Bosse's connection writes nothing more.
      await db.store.revokeGuests(t.table.id, 'B', new Date().toISOString())
      expect(await t.bo.send('B', { v: 'note.add', text: 'Bosses sista rad' })).toMatchObject({ t: 'reject', reason: REVOKED })
      expect(await t.bo.send('B', { v: 'seat.release', seat: 'B' })).toMatchObject({ t: 'reject', reason: REVOKED })
      // Her own way out still goes through, and writes nothing of her.
      expect(await t.ada.send('A', { v: 'seat.release', seat: 'A' })).toMatchObject({ t: 'ack' })
      const raw = await db.raw(t.table.id)
      expect(containsAny(raw, [NAME, NOTE, COMMENT, 'Adelinas nya', 'och en rad', CILLA, 'Cillas nya', 'Bosses sista rad'])).toEqual([])
      expect(containsAny(raw, ['Bosses nya rad'])).toEqual(['Bosses nya rad'])
      for (const c of [t.ada, t.bo, t.cilla]) await c.close()
    })

    it('erases only the seat the token is for, and a token from another table erases nothing', async () => {
      const t = await played()
      const other = await played()
      for (const c of [t.ada, t.bo, t.cilla, other.ada, other.bo, other.cilla]) await c.close()
      const rawT = await db.raw(t.table.id)
      const rawOther = await db.raw(other.table.id)
      // Another table's token, a made-up one and none at all are nobody here.
      expect((await eraseMe(t.table.id, other.tokens.ada)).status).toBe(403)
      expect((await eraseMe(t.table.id, 'not-a-token')).status).toBe(403)
      expect((await eraseMe(t.table.id, undefined)).status).toBe(400)
      expect((await eraseMe('no-such-table', t.tokens.ada)).status).toBe(404)
      expect(await db.raw(t.table.id)).toBe(rawT)
      expect(await db.raw(other.table.id)).toBe(rawOther)
      // Bosse's token takes Bosse, and leaves Adelina where she is.
      expect((await eraseMe(t.table.id, t.tokens.bo)).status).toBe(200)
      const raw = await db.raw(t.table.id)
      expect(containsAny(raw, [BO, BO_NOTE])).toEqual([])
      expect(containsAny(raw, [NAME, NOTE, COMMENT, CILLA, CILLA_COMMENT])).toEqual([NAME, NOTE, COMMENT, CILLA, CILLA_COMMENT])
      expect(await db.raw(other.table.id)).toBe(rawOther)
    })

    it('says what it does without a name, and refuses what it cannot do', async () => {
      expect((await script()).code).toBe(2)
      expect((await script('table')).code).toBe(2)
      expect((await script('table', 'x', '--seat')).code).toBe(2)
      expect((await script('table', 'no-such-table', '--seat', 'A')).code).toBe(1)
      const t = await played()
      for (const c of [t.ada, t.bo, t.cilla]) await c.close()
      const none = await script('table', t.table.id, '--name', 'Ingen Sådan')
      expect(none.code).toBe(1)
      expect(none.out).not.toContain('Ingen Sådan')
      const ledger = await script('ledger')
      expect(ledger.code).toBe(0)
      expect(containsAny(ledger.out, [NAME, BO, CILLA])).toEqual([])
    })
  })
}

// Whose lines are whose (#1279): a seat is taken through the admission that is live when it is
// claimed, so two guests who sat at one seat after each other are told apart; a claim no admission's
// life holds falls back on the name it was taken under.
describe('which lines are a guest’s', () => {
  const at = (min: number) => new Date(Date.UTC(2026, 9, 25, 10, min)).toISOString()
  const line = (seq: number, min: number, by: string | null, intent: Intent): Applied => ({ schemaVersion: 1, seq, batch: `b${seq}`, at: at(min), by, intent })
  const guest = (seat: string | null, name: string, issued: number, revoked?: number, accountId?: string): GuestRecord => ({ tokenHash: `${name}-${issued}`, kind: seat === null ? 'observer' : 'seat', seat, name, issuedAt: at(issued), expiresAt: at(issued + 180), ...(revoked !== undefined ? { revokedAt: at(revoked) } : {}), ...(accountId ? { accountId } : {}) })
  const log = [
    line(1, 1, 'A', { v: 'seat.claim', seat: 'A', name: 'Första' }),
    line(2, 2, 'A', { v: 'note.add', text: 'Förstas rad' }),
    line(3, 3, null, { v: 'seat.release', seat: 'A' }),
    line(4, 5, 'A', { v: 'seat.claim', seat: 'A', name: 'Andra' }),
    line(5, 6, 'A', { v: 'flag', note: 'Andras ord' }),
    line(6, 7, null, { v: 'flag', observer: 'Tittaren', note: 'Tittarens ord' }),
  ]
  const guests = [guest('A', 'Första', 0, 3), guest('A', 'Andra', 4), guest(null, 'Tittaren', 0)]

  it('takes the sitting her admission was live for, and not the one after it at the same seat', () => {
    expect(changesAt({ log, guests, surveys: [] }, { kind: 'guest', session: 's', seat: 'A', issuedAt: at(0) }, 'request')).toEqual({ seqs: [1, 2], guests: [0], drop: [], mask: [] })
    expect(changesAt({ log, guests, surveys: [] }, { kind: 'guest', session: 's', seat: 'A', issuedAt: at(4) }, 'request')).toEqual({ seqs: [4, 5], guests: [1], drop: [], mask: [] })
    expect(changesAt({ log, guests, surveys: [] }, { kind: 'guest', session: 's', seat: null, issuedAt: at(0) }, 'request')).toEqual({ seqs: [6], guests: [2], drop: [], mask: [] })
  })

  it('falls back on the name when no admission’s life holds the claim, and the retention leaves what a claimed admission shares', () => {
    const skewed = [guest('A', 'Första', 100), guest('A', 'Första', 200, undefined, 'konto')]
    expect(changesAt({ log, guests: skewed, surveys: [] }, { kind: 'guest', session: 's', seat: 'A', issuedAt: at(100) }, 'request').seqs).toEqual([1, 2])
    expect(changesAt({ log, guests: skewed, surveys: [] }, { kind: 'guest', session: 's', seat: 'A', issuedAt: at(100) }, 'retention').seqs).toEqual([])
  })

  it('names nothing once it is masked', () => {
    const e = { kind: 'guest', session: 's', seat: 'A', issuedAt: at(0) } as const
    const first = changesAt({ log, guests, surveys: [] }, e, 'request')
    const maskedLog = log.map((l) => (first.seqs.includes(l.seq) ? redactLine(l) : l))
    const renamed = guests.map((g, i) => (first.guests.includes(i) ? { ...g, name: REDACTED } : g))
    expect(changesAt({ log: maskedLog, guests: renamed, surveys: [] }, e, 'request')).toEqual({ seqs: [], guests: [], drop: [], mask: [] })
    expect(entry(e, 'request')).toMatchObject({ ...e, reason: 'request', id: expect.any(String), at: expect.any(String) })
  })
})

// The ledger kept before a restore (RUNBOOK §6): what `erase ledger` wrote, under pnpm's heading,
// and what `ops/restore.sh` writes from a restored database, which leaves an observer's seat out.
describe('a ledger read back', () => {
  it('reads both forms, and refuses a line that is not an entry', () => {
    const written = entry({ kind: 'guest', session: 's', seat: 'A', issuedAt: '2026-10-25T10:00:00.000Z' }, 'request')
    const text = [
      '> @byd/server erase /x', // pnpm's heading
      JSON.stringify(written),
      JSON.stringify({ msg: 'erasure', id: 'r1', at: '2026-10-25T11:00:00.000Z', kind: 'guest', reason: 'retention', session: 's', issuedAt: '2026-10-25T09:00:00.000Z' }),
      JSON.stringify({ msg: 'erasure', id: 'r2', at: '2026-10-25T12:00:00.000Z', kind: 'game', reason: 'removed', project: 'p' }),
      '',
    ].join('\n')
    expect(parseLedger(text)).toEqual([
      written,
      { id: 'r1', at: '2026-10-25T11:00:00.000Z', kind: 'guest', reason: 'retention', session: 's', seat: null, issuedAt: '2026-10-25T09:00:00.000Z' },
      { id: 'r2', at: '2026-10-25T12:00:00.000Z', kind: 'game', reason: 'removed', project: 'p' },
    ])
    expect(() => parseLedger(JSON.stringify({ id: 'x', at: 'y', kind: 'guest', reason: 'request' }))).toThrow(/not a ledger line/)
    expect(() => parseLedger(JSON.stringify({ id: 'x', at: 'y', kind: 'table', reason: 'whim', session: 's' }))).toThrow(/not a ledger line/)
  })
})

// A restore to a point before an erasure (DRIFT §5, RUNBOOK §6), in Postgres: the tables copied
// aside as a backup holds them, an erasure and a game taken away after it, the copy put back — and
// the names are back — and the ledger kept from before the restore run again. What it leaves is what
// the erasure left, row for row, and running it once more changes nothing.
describe.skipIf(!url)('the ledger run again after a restore, in Postgres (#1279)', () => {
  const own = `test_erase_restore_${process.pid}_${Date.now()}`
  const TABLES = ['projects', 'project_versions', 'sessions', 'events', 'guest_tokens', 'surveys', 'erasures']
  let store: PostgresLogStore
  let sql: postgres.Sql
  beforeAll(async () => {
    store = PostgresLogStore.connect(url!, { schema: own })
    await store.migrate()
    sql = postgres(url!, { max: 1, onnotice: () => undefined, connection: { search_path: own } })
  })
  afterAll(async () => {
    await sql.unsafe(`drop schema if exists "${own}_backup" cascade`)
    await sql.end()
    await store.dropSchema()
    await store.close()
  })
  const dump = async () => {
    const out: Record<string, string[]> = {}
    for (const t of TABLES) out[t] = (await sql.unsafe(`select x::text as row from ${t} x`)).map((r) => String(r['row'])).sort()
    return out
  }

  it('leaves what the erasure left, and running it again changes nothing', async () => {
    const projects = store.projects()
    const surveys = store.surveys()
    const erasures: ErasureStore = store.erasures()
    const stores = { store, erasures, projects }
    for (const [project, session, who] of [['kvar', 'bord-kvar', 'Återställd Gäst'], ['borta', 'bord-borta', 'Borttagen Gäst']] as const) {
      await projects.create(project, game())
      await store.createSession({ id: session, version: 'v1', setup: twoSeatSetup(), project })
      const t0 = new Date(Date.now() - 3600_000)
      expect(await store.issueGuest(session, { tokenHash: hash(`${session}-a`), kind: 'seat', seat: 'A', name: who, issuedAt: t0.toISOString(), expiresAt: new Date(t0.getTime() + 3 * 3600_000).toISOString() })).toBe(true)
      await store.append(session, [
        { schemaVersion: 1, seq: 1, batch: 'b1', at: new Date(t0.getTime() + 60_000).toISOString(), by: 'A', intent: { v: 'seat.claim', seat: 'A', name: who } },
        { schemaVersion: 1, seq: 2, batch: 'b2', at: new Date(t0.getTime() + 120_000).toISOString(), by: 'A', intent: { v: 'note.add', text: `${who}s rad` } },
      ])
      await surveys.put({ sessionId: session, version: 'v1', at: t0.toISOString(), who, seat: 'A', answers: { fun: 3, clarity: 3, balance: 3, change: `${who}s önskan` } })
    }
    // The backup: every table as it stands before the erasure.
    await sql.unsafe(`create schema "${own}_backup"`)
    for (const t of TABLES) await sql.unsafe(`create table "${own}_backup".${t} as table ${t}`)

    const out: string[] = []
    const io = (ledger = '') => ({ out: (l: string) => out.push(l), err: (l: string) => out.push(l), read: async () => ledger })
    expect(await runErase(['table', 'bord-kvar', '--name', 'Återställd Gäst'], stores, io())).toBe(0)
    expect(await projects.remove('borta')).toBe(true)
    await erasures.erase([entry({ kind: 'game', project: 'borta' }, 'removed')])
    const erased = await dump()
    expect(containsAny(JSON.stringify(erased), ['Återställd Gäst', 'Borttagen Gäst'])).toEqual([])
    out.length = 0
    expect(await runErase(['ledger'], stores, io())).toBe(0)
    const kept = out.join('\n')

    // The restore: the backup put back, and the names with it.
    await sql.unsafe(`truncate ${TABLES.join(', ')} cascade`)
    for (const t of TABLES) await sql.unsafe(`insert into ${t} select * from "${own}_backup".${t}`)
    expect(containsAny(JSON.stringify(await dump()), ['Återställd Gäst', 'Borttagen Gäst'])).toEqual(['Återställd Gäst', 'Borttagen Gäst'])
    expect(await erasures.ledger()).toEqual([])

    expect(await runErase(['replay', '--from', 'raderingar.jsonl'], stores, io(kept))).toBe(0)
    expect(await dump()).toEqual(erased)
    expect(await runErase(['replay'], stores, io())).toBe(0)
    expect(await dump()).toEqual(erased)
    expect(JSON.parse(out.at(-1)!)).toMatchObject({ msg: 'erase', verb: 'replay', entries: 2, lines: 0, guests: 0, surveys: 0 })
  })
})
