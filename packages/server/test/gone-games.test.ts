import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { NICKLAS, aWorld, accountBackends, as, type AccountBackend } from './account-backends.js'

type Gone = { id: string; name: string; why: 'removed' | 'account'; at: string }

// The band on a co-editor's Mina spel (#1334, beställarens beslut 2026-10-25): a game she worked on
// that went, because its owner took it away or deleted her account. The notice keeps the game's
// name, why it went and when, and never who the owner was (G6, «försvinner direkt»); it is written
// with the removal, stands until she closes it, and then goes.
for (const backend of accountBackends) {
  describe.skipIf(backend.skip)(`a game gone from a co-editor's Mina spel, in ${backend.name} (#1334)`, () => {
    let db: AccountBackend
    beforeAll(async () => {
      db = await backend.open()
    })
    afterAll(async () => {
      await db.close()
    })
    const goneFor = async (call: ReturnType<typeof as>): Promise<Gone[]> => {
      const res = await call('GET', '/me/gone')
      expect(res.status).toBe(200)
      return (await res.json()) as Gone[]
    }

    it('tells each member a game the owner took away, by its name, and never the owner herself', async () => {
      const w = await aWorld(db, `r${backend.name}`)
      const before = Date.now()
      expect((await w.nicklas.call('DELETE', `/projects/${w.ids.forest}`)).status).toBe(200)
      const told = await goneFor(w.kim.call)
      expect(told).toEqual([{ id: expect.any(String), name: 'Skogens råd', why: 'removed', at: expect.any(String) }])
      expect(Date.parse(told[0]!.at)).toBeGreaterThanOrEqual(before - 1000)
      // Not the owner, who took it away herself (her one band is Månskugga, which Sara took away
      // from her), and not Sara, who was never in it.
      expect((await goneFor(w.nicklas.call)).map((g) => g.name)).toEqual(['Månskugga'])
      expect(await goneFor(w.sara.call)).toEqual([])
      // A game with no members leaves no notice anywhere.
      expect((await w.nicklas.call('DELETE', `/projects/${w.ids.star}`)).status).toBe(200)
      expect(await goneFor(w.kim.call)).toHaveLength(1)
    })

    it('tells each member a game that went with its owner’s account, and says that is why', async () => {
      const w = await aWorld(db, `a${backend.name}`)
      vi.spyOn(console, 'log').mockImplementation(() => undefined)
      expect((await w.nicklas.call('DELETE', '/me')).status).toBe(200)
      vi.mocked(console.log).mockRestore()
      expect(await goneFor(w.kim.call)).toEqual([{ id: expect.any(String), name: 'Skogens råd', why: 'account', at: expect.any(String) }])
      // Sara's game stays, so Sara is told nothing.
      expect(await goneFor(w.sara.call)).toEqual([])
    })

    it('goes when she closes it, and only she can close it', async () => {
      const w = await aWorld(db, `c${backend.name}`)
      expect((await w.nicklas.call('DELETE', `/projects/${w.ids.forest}`)).status).toBe(200)
      const [notice] = await goneFor(w.kim.call)
      expect((await w.sara.call('DELETE', `/me/gone/${notice!.id}`)).status).toBe(404)
      expect((await as(db.run, null)('DELETE', `/me/gone/${notice!.id}`)).status).toBe(401)
      expect((await as(db.run, null)('GET', '/me/gone')).status).toBe(401)
      expect(await goneFor(w.kim.call)).toHaveLength(1)
      expect((await w.kim.call('DELETE', `/me/gone/${notice!.id}`)).status).toBe(204)
      expect(await goneFor(w.kim.call)).toEqual([])
      expect((await w.kim.call('DELETE', `/me/gone/${notice!.id}`)).status).toBe(404)
      if (db.rows) expect(await db.column('gone_games', 'id')).not.toContain(notice!.id)
    })

    it('never keeps who the owner was: not her id, her name or her address', async () => {
      const w = await aWorld(db, `o${backend.name}`)
      expect((await w.nicklas.call('DELETE', `/projects/${w.ids.forest}`)).status).toBe(200)
      const told = await goneFor(w.kim.call)
      expect(Object.keys(told[0]!).sort()).toEqual(['at', 'id', 'name', 'why'])
      for (const owner of [NICKLAS, w.nicklas.email, w.ids.forest]) expect([owner, JSON.stringify(told).includes(owner)]).toEqual([owner, false])
      // Her id is a number, so it is looked for as a whole value: inside a date it is a digit or two.
      expect(Object.values(told[0]!)).not.toContain(w.id)
      // On the rows themselves, column by column: every column there is in the table.
      if (db.rows) {
        expect((await db.rows())['gone_games']?.length).toBeGreaterThan(0)
        for (const column of ['id', 'name', 'why', 'at']) {
          const values = await db.column('gone_games', column)
          expect([column, values.filter((v) => v === w.id || v === w.ids.forest || v.includes(NICKLAS) || v.toLowerCase().includes(w.nicklas.email))]).toEqual([column, []])
        }
        // Her id is in `account_id` only for the bands that are her own: Månskugga, which Sara took
        // away from her.
        expect((await db.column('gone_games', 'account_id')).filter((v) => v === w.id)).toHaveLength((await goneFor(w.nicklas.call)).length)
      }
    })

    it('goes with her own account when she deletes it', async () => {
      const w = await aWorld(db, `k${backend.name}`)
      expect((await w.nicklas.call('DELETE', `/projects/${w.ids.forest}`)).status).toBe(200)
      expect(await goneFor(w.kim.call)).toHaveLength(1)
      const kim = (await db.auth.accountByEmail(w.kim.email))!.id
      vi.spyOn(console, 'log').mockImplementation(() => undefined)
      expect((await w.kim.call('DELETE', '/me')).status).toBe(200)
      vi.mocked(console.log).mockRestore()
      if (db.rows) expect(await db.column('gone_games', 'account_id')).not.toContain(kim)
      expect(await db.run.projects!.goneFor(kim)).toEqual([])
    })
  })
}
