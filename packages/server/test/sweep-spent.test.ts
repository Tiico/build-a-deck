import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { MemoryAuthStore, MemoryLogStore, MemoryProjectStore, PostgresLogStore, hash, type AuthStore, type LogStore } from '../src/index.js'
import type { ProjectStore } from '../src/projects.js'
import { GUEST_PENDING_TTL_MS } from '../src/rooms.js'
import { INVITE_KEEP_MS, inviteKeepFrom, sweepSpent } from '../src/sweep.js'
import { start, twoSeatSetup } from './fixture.js'
import { template } from './deck.js'

// What can no longer be used is swept (#1277, G6): login links that are spent or out of date,
// cookies that have run out, invitations a month after they were used or ran out, and admissions
// that were never opened before their wait ran out. Nothing that still answers anything, and nothing
// that is a table's history. The same test against the memory stores and against Postgres, whose
// queries are the ones the box answers with; the Postgres half runs only with DATABASE_URL.
const url = process.env['DATABASE_URL']
const schema = `test_sweep_spent_${process.pid}_${Date.now()}`

type Backend = { auth: AuthStore; projects: ProjectStore; store: LogStore; close(): Promise<void> }
const backends: { name: string; skip: boolean; open(): Promise<Backend> }[] = [
  { name: 'memory', skip: false, open: async () => ({ auth: new MemoryAuthStore(), projects: new MemoryProjectStore(), store: new MemoryLogStore(), close: () => Promise.resolve() }) },
  {
    name: 'Postgres',
    skip: !url,
    open: async () => {
      const store = PostgresLogStore.connect(url!, { schema })
      await store.migrate()
      return {
        auth: store.auth(),
        projects: store.projects(),
        store,
        close: async () => {
          await store.dropSchema()
          await store.close()
        },
      }
    },
  },
]

const DAY = 24 * 3600_000
const later = (from: Date, ms: number) => new Date(from.getTime() + ms)
const iso = (d: Date) => d.toISOString()
const game = (name: string) => {
  const { zones, seats, floor } = twoSeatSetup()
  return { name, template, rows: [{ id: 'dragon', fields: { title: 'Drake', antal: 1 } }], icons: {}, setup: { zones, seats, floor, deckZone: 'draw' } }
}
// What a sweep says, kept apart from whatever else the run prints.
const quietly = () => vi.spyOn(console, 'log').mockImplementation(() => undefined)

for (const backend of backends) {
  describe.skipIf(backend.skip)(`sweeping what can no longer be used, in ${backend.name} (#1277)`, () => {
    let db: Backend
    beforeAll(async () => {
      db = await backend.open()
    })
    afterAll(async () => {
      await db.close()
    })
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('takes the login links that are spent or ran out, and a link that still holds works as before', async () => {
      const run = await start({ auth: db.auth, projects: db.projects, store: db.store })
      try {
        const ask = async (email: string) => {
          await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
          return /\/auth\/verify\?token=\S+/.exec(run.mail.sent.at(-1)?.text ?? '')?.[0] ?? ''
        }
        const verify = async (link: string) => {
          const res = await fetch(`${run.http}${link}`, { redirect: 'manual' })
          return { status: res.status, body: await res.text() }
        }
        const spent = await ask(`spent-${backend.name}@example.com`)
        expect((await verify(spent)).status).toBe(302)
        // What a spent link says before the sweep is what it says after it, and what a link that
        // was never given says: the answer does not need the row (G6: gone when it cannot be used).
        const before = await verify(spent)
        expect(before.status).toBe(400)
        const never = await verify('/auth/verify?token=never-given&next=%2F')
        expect(never).toEqual(before)

        quietly()
        const now = new Date()
        expect(await sweepSpent(db, now)).toMatchObject({ login_tokens: 1 })
        expect(await verify(spent)).toEqual(before)

        // One asked for now still holds, and is taken only once it has run out.
        const fresh = await ask(`fresh-${backend.name}@example.com`)
        expect(await sweepSpent(db, now)).toMatchObject({ login_tokens: 0 })
        expect((await verify(fresh)).status).toBe(302)
        const unused = await ask(`unused-${backend.name}@example.com`)
        expect(await sweepSpent(db, later(new Date(), 16 * 60_000))).toMatchObject({ login_tokens: 2 })
        expect((await verify(unused)).status).toBe(400)
      } finally {
        await run.stop()
      }
    })

    it('takes the cookies that ran out, and logs nobody out', async () => {
      const run = await start({ auth: db.auth, projects: db.projects, store: db.store, authBypass: true })
      try {
        const login = await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `ada-${backend.name}@example.com` }) })
        const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
        const me = async (c: string) => ((await (await fetch(`${run.http}/auth/me`, { headers: { cookie: c } })).json()) as { email: string | null }).email
        expect(await me(cookie)).toBe(`ada-${backend.name}@example.com`)
        const ada = await db.auth.accountByEmail(`ada-${backend.name}@example.com`)
        await db.auth.createSession(hash('old-cookie'), ada!.id, iso(later(new Date(), -DAY)))

        quietly()
        expect(await sweepSpent(db, new Date())).toMatchObject({ auth_sessions: 1 })
        expect(await sweepSpent(db, new Date())).toMatchObject({ auth_sessions: 0 })
        expect(await me(cookie)).toBe(`ada-${backend.name}@example.com`)
      } finally {
        await run.stop()
      }
    })

    it('takes an invitation a month after it was used or ran out, and the ones waiting stay in Dela', async () => {
      const now = new Date('2026-11-30T12:00:00.000Z')
      const owner = await db.auth.ensureAccount(`owner-${backend.name}@example.com`)
      const project = `invites-${backend.name}`
      await db.projects.create(project, game('Inbjudningar'), owner.id)
      const invite = (who: string, expiresAt: Date) => db.projects.invite({ tokenHash: hash(who), project, email: `${who}@example.com`, role: 'editor', by: owner.id, expiresAt: iso(expiresAt) })
      await invite('ran-out-long-ago', later(now, -31 * DAY))
      await invite('ran-out-lately', later(now, -29 * DAY))
      await invite('used-long-ago', later(now, -20 * DAY))
      expect(await db.projects.acceptInvite(hash('used-long-ago'), iso(later(now, -31 * DAY)))).toMatchObject({ project })
      await invite('used-lately', later(now, 5 * DAY))
      expect(await db.projects.acceptInvite(hash('used-lately'), iso(later(now, -2 * DAY)))).toMatchObject({ project })
      await invite('waiting', later(now, 7 * DAY))
      const dela = await db.projects.openInvites(project, iso(now))

      quietly()
      expect(await sweepSpent(db, now)).toMatchObject({ project_invites: 2 })
      expect(await sweepSpent(db, now)).toMatchObject({ project_invites: 0 })
      expect(await db.projects.openInvites(project, iso(now))).toEqual(dela)
      expect(dela.map((i) => i.email)).toEqual(['waiting@example.com'])
      // The month is the box's to shorten (G6, F4) and nobody's to stretch past the decision.
      expect(await sweepSpent(db, now, inviteKeepFrom({ INVITE_KEEP_MS: String(DAY) }))).toMatchObject({ project_invites: 2 })
    })

    it('takes an admission never opened once its wait is over, and leaves the opened, the kicked and the claimed', async () => {
      const id = `sweep-guests-${backend.name}`
      await db.store.createSession({ id, version: 'v1', setup: twoSeatSetup() })
      const t0 = new Date('2026-10-25T10:00:00.000Z')
      const admit = (token: string, seat: string | null, at: Date) => db.store.issueGuest(id, { tokenHash: hash(token), kind: seat === null ? 'observer' : 'seat', seat, name: `Namn ${token}`, issuedAt: iso(at), expiresAt: iso(later(at, GUEST_PENDING_TTL_MS)) })
      // Opened: the phone connected within its wait.
      expect(await admit('opened', 'A', t0)).toBe(true)
      expect(await db.store.activateGuest(id, hash('opened'), iso(later(t0, 30_000)), iso(later(t0, 3 * 3600_000)))).not.toBeNull()
      // Kicked before it was ever opened: what the host did is the table's.
      expect(await admit('kicked', 'B', t0)).toBe(true)
      expect(await db.store.revokeGuests(id, 'B', iso(later(t0, 60_000)))).toBe(1)
      // Claimed to an account without ever being opened (G1).
      const bo = await db.auth.ensureAccount(`bo-${backend.name}@example.com`)
      expect(await admit('claimed', null, t0)).toBe(true)
      expect(await db.store.claimGuest(hash('claimed'), bo.id)).toMatchObject({ sessionId: id })
      // Never opened, a watcher and a seat; the seat's wait was given away to the next guest.
      expect(await admit('never-watched', null, t0)).toBe(true)
      expect(await admit('never-sat', 'B', later(t0, 2 * 60_000))).toBe(true)
      expect(await admit('next-at-B', 'B', later(t0, 10 * 60_000))).toBe(true)
      const played = await db.store.guestsOf(bo.id)
      const now = later(t0, 11 * 60_000)

      quietly()
      expect(await sweepSpent(db, now)).toMatchObject({ guest_tokens: 2 })
      expect(await sweepSpent(db, now)).toMatchObject({ guest_tokens: 0 })
      expect((await db.store.guestsAt(id)).map((g) => g.name).sort()).toEqual(['Namn claimed', 'Namn kicked', 'Namn next-at-B', 'Namn opened'])
      // «Bord du spelat vid» is read off what the account claimed, and says what it said.
      expect(await db.store.guestsOf(bo.id)).toEqual(played)
      // The guest waiting at B now keeps her seat until her own wait is over.
      expect(await sweepSpent(db, later(t0, 13 * 60_000))).toMatchObject({ guest_tokens: 1 })
    })

    it('says how many rows went from each table, and never which', async () => {
      const now = new Date()
      await db.auth.issueToken(hash('a-secret-link'), `secret-${backend.name}@example.com`, iso(later(now, -DAY)))
      const owner = await db.auth.ensureAccount(`said-${backend.name}@example.com`)
      await db.auth.createSession(hash('a-secret-cookie'), owner.id, iso(later(now, -DAY)))
      const id = `sweep-said-${backend.name}`
      await db.store.createSession({ id, version: 'v1', setup: twoSeatSetup() })
      await db.store.issueGuest(id, { tokenHash: hash('a-secret-guest'), kind: 'observer', seat: null, name: 'Hemliga Hedda', issuedAt: iso(later(now, -DAY)), expiresAt: iso(later(now, -DAY + GUEST_PENDING_TTL_MS)) })

      const said: string[] = []
      vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => void said.push(args.map(String).join(' ')))
      const counts = await sweepSpent(db, now)
      expect(said).toHaveLength(1)
      expect(JSON.parse(said[0]!)).toEqual({ msg: 'swept', ...counts })
      expect(Object.values(counts).every((n) => Number.isInteger(n))).toBe(true)
      for (const secret of [`secret-${backend.name}@example.com`, `said-${backend.name}@example.com`, 'Hemliga Hedda', hash('a-secret-link'), hash('a-secret-cookie'), hash('a-secret-guest'), owner.id, id]) expect(said[0]).not.toContain(secret)
    })
  })
}

describe('how long an invitation is kept (#1277, G6)', () => {
  it('is thirty days, and the box may say fewer but never more', () => {
    expect(INVITE_KEEP_MS).toBe(30 * DAY)
    expect(inviteKeepFrom({})).toBe(30 * DAY)
    expect(inviteKeepFrom({ INVITE_KEEP_MS: String(7 * DAY) })).toBe(7 * DAY)
    expect(inviteKeepFrom({ INVITE_KEEP_MS: String(90 * DAY) })).toBe(30 * DAY)
    expect(() => inviteKeepFrom({ INVITE_KEEP_MS: 'en månad' })).toThrow(/INVITE_KEEP_MS/)
  })
})
