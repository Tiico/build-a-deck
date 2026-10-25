import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { REDACTED } from '@byd/protocol'
import { BO_NOTE, HER_CHANGE, HER_FLAG, HER_NOTE, NICKLAS, aWorld, accountBackends, as, type AccountBackend } from './account-backends.js'
import { COLUMNS } from './column-map.js'

// «Radera kontot…» (#1280, G6, art. 17, variant A): the account goes, and its games with it as «Ta
// bort spelet» takes one — Kim, who edited one of them, loses it — and its claimed seats are masked.
// Proven on every door the account had, on the doors the others still have, on the mail, and in
// Postgres on the rows themselves: no column that can say a person says her id or her address
// afterwards, except the erasure ledger.
for (const backend of accountBackends) {
  describe.skipIf(backend.skip)(`an account that deletes itself, in ${backend.name} (#1280)`, () => {
    let db: AccountBackend
    beforeAll(async () => {
      db = await backend.open()
    })
    afterAll(async () => {
      await db.close()
    })

    it('says first what goes: each game, who else loses it, the tables playing, the games it leaves and the tables it claimed', async () => {
      const w = await aWorld(db, `q${backend.name}`)
      const res = await w.nicklas.call('GET', '/me/deletion')
      expect(res.status).toBe(200)
      const said = (await res.json()) as { games: { name: string; others: string[]; playing: number }[]; leaving: { name: string; owner: string | null }[]; tables: number }
      expect(said.games.map((g) => [g.name, g.others, g.playing]).sort()).toEqual([
        ['Skogens råd', ['Kim Kvar'], 0],
        ['Stjärnhandel', [], 1],
      ])
      expect(said.leaving).toEqual([expect.objectContaining({ name: 'Vargtimmen', owner: 'Sara' })])
      expect(said.tables).toBe(1)
      expect((await as(db.run, null)('GET', '/me/deletion')).status).toBe(401)
    })

    it('takes the account, its games and its words away, logs it out everywhere, and says so in a last letter', async () => {
      const w = await aWorld(db, `d${backend.name}`)
      const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
      const gone = await w.nicklas.call('DELETE', '/me?lang=sv')
      log.mockRestore()
      expect(gone.status).toBe(200)
      expect(gone.headers.get('set-cookie')).toMatch(/^byd_session=; .*Max-Age=0/)

      // Every way the account had answers as to nobody.
      for (const [method, path] of [['GET', '/projects'], ['GET', '/me/data'], ['GET', '/me/played'], ['GET', '/me/deletion'], ['DELETE', '/me']] as const) expect([path, (await w.nicklas.call(method, path)).status]).toEqual([path, 401])
      expect(await (await w.nicklas.call('GET', '/auth/me')).json()).toMatchObject({ email: null })
      expect(await db.auth.accountByEmail(w.nicklas.email)).toBeNull()

      // Her games went, as «Ta bort spelet» takes them: Kim lost Skogens råd, and the table playing
      // at Stjärnhandel ended and was masked with Bo's words.
      const kims = (await (await w.kim.call('GET', '/projects')).json()) as { id: string }[]
      expect(kims.map((p) => p.id)).not.toContain(w.ids.forest)
      expect((await w.kim.call('GET', `/projects/${w.ids.forest}`)).status).toBe(404)
      const star = await db.run.store.read(w.star.id)
      expect(star.at(-1)?.intent.v).toBe('session.end')
      expect(JSON.stringify(star)).not.toContain(BO_NOTE)
      // Sara's game stays hers, without Nicklas in it, and her seat at Sara's table is masked.
      const members = (await (await w.sara.call('GET', `/projects/${w.ids.wolf}/members`)).json()) as { email: string }[]
      expect(members.map((m) => m.email)).toEqual([w.sara.email])
      const playtest = await (await w.sara.call('GET', `/projects/${w.ids.wolf}/playtest`)).text()
      for (const word of [NICKLAS, HER_FLAG, HER_CHANGE]) expect([word, playtest.includes(word)]).toEqual([word, false])
      expect(JSON.stringify(await db.run.store.read(w.saras.id))).not.toContain(HER_NOTE)
      expect((await db.run.store.guestsAt(w.saras.id)).find((g) => g.seat === 'A')).toMatchObject({ name: REDACTED })
      expect((await db.run.store.guestsAt(w.saras.id)).find((g) => g.seat === 'A')?.accountId).toBeUndefined()

      // The last letter, in the language she deleted in, names every game that went.
      const letter = db.run.mail.sent.at(-1)!
      expect(letter).toMatchObject({ to: w.nicklas.email, subject: 'Ditt konto hos Deckster är raderat' })
      expect(letter.text).toMatch(/Skogens råd och Stjärnhandel|Stjärnhandel och Skogens råd/)
      expect(letter.text).toContain('30 dagar')
      expect(letter.html).toContain('Ditt konto är raderat')

      // The ledger names the account by its id, and nothing else does.
      const ledger = await db.run.erasures!.ledger()
      expect(ledger.filter((e) => e.kind === 'account')).toEqual([expect.objectContaining({ account: w.id, reason: 'request' })])
      // Her two games, beside every world's Månskugga, which Sara took away (#1334).
      expect(ledger.filter((e) => e.kind === 'game').map((e) => (e.kind === 'game' ? e.project : '')).filter((p) => !p.startsWith('moon-')).sort()).toEqual([w.ids.forest, w.ids.star].sort())
      expect(JSON.stringify(ledger)).not.toContain(w.nicklas.email)

      if (db.rows) {
        const rows = await db.rows()
        const leftovers: string[] = []
        for (const [column, kind] of Object.entries(COLUMNS)) {
          const [table, name] = column.split('.') as [string, string]
          if (kind === 'none' || table === 'erasures' || !(table in rows)) continue
          for (const value of await db.column(table, name)) if (value === w.id || value.toLowerCase().includes(w.nicklas.email)) leftovers.push(column)
        }
        expect(leftovers).toEqual([])
        // Her address anywhere at all, in any table there is; her name too, at the tables of this world.
        for (const [table, all] of Object.entries(rows)) if (table !== 'erasures') expect([table, all.filter((r) => r.includes(w.nicklas.email))]).toEqual([table, []])
        for (const session of [w.saras.id, w.star.id]) {
          for (const table of ['events', 'guest_tokens', 'surveys']) expect([table, (rows[table] ?? []).filter((r) => r.includes(session) && r.includes(NICKLAS))]).toEqual([table, []])
        }
      }
    })

    // The sweep (G6, F4, DRIFT §4): what only her games named goes 30 days later, from Postgres and
    // from the bucket; what another game names stays. Only Postgres keeps anything for 30 days.
    if (backend.name === 'Postgres') it('sweeps the pictures and renderings only her games named, 30 days on, and keeps what another game names', async () => {
      const w = await aWorld(db, `s${backend.name}`)
      const upload = async (cookie: string, bytes: Uint8Array<ArrayBuffer>) => ((await (await fetch(`${db.run.http}/assets`, { method: 'POST', headers: { 'content-type': 'image/png', cookie }, body: bytes })).json()) as { hash: string }).hash
      const png = (n: number) => new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, n, w.id.length, 3])
      const hers = await upload(w.nicklas.cookie, png(41))
      const shared = await upload(w.nicklas.cookie, png(42))
      const card = (art: string) => [{ id: 'dragon', fields: { title: 'Drake', antal: 6, art: `asset:${art}` } }]
      const doc = async (call: typeof w.kim.call, id: string) => (await (await call('GET', `/projects/${id}`)).json()) as Record<string, unknown> & { rev: number }
      const star = await doc(w.nicklas.call, w.ids.star)
      expect((await w.nicklas.call('PUT', `/projects/${w.ids.star}`, { ...star, rows: [...card(hers), { id: 'troll', fields: { title: 'Troll', antal: 1, art: `asset:${shared}` } }] })).status).toBe(200)
      expect((await w.kim.call('POST', '/projects', { ...(await doc(w.nicklas.call, w.ids.forest)), id: `kims-${w.ids.forest}`, name: 'Kims eget', rows: card(shared) })).status).toBe(201)
      const named = async () => (await db.column('assets', 'hash')).filter((h) => h === hers || h === shared).sort()
      expect(await named()).toEqual([hers, shared].sort())
      const at = new Date()
      vi.spyOn(console, 'log').mockImplementation(() => undefined)
      expect((await w.nicklas.call('DELETE', '/me')).status).toBe(200)
      const renders = (await db.column('asset_sweeps', 'hash')).filter((h) => h !== hers && h !== shared)

      expect(await db.sweep!.sweep(new Date(at.getTime() + 29 * 24 * 3600_000))).toEqual({ assets: 0, renders: 0, kept: 0 })
      expect(await named()).toEqual([hers, shared].sort())
      const done = await db.sweep!.sweep(new Date(at.getTime() + 31 * 24 * 3600_000))
      vi.mocked(console.log).mockRestore()
      expect(done).toMatchObject({ assets: 1, kept: 1 })
      expect(await named()).toEqual([shared])
      expect(await db.objects.get(`assets/${hers}`)).toBeNull()
      expect(await db.objects.get(`assets/${shared}`)).not.toBeNull()
      // The renderings she bore went with them, and nothing is left to sweep.
      for (const hash of renders) expect([hash, (await db.column('render_jobs', 'hash')).includes(hash)]).toEqual([hash, false])
      expect(await db.column('asset_sweeps', 'hash')).toEqual([])
    })
  })
}
