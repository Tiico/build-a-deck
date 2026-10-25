import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import { PersonalData } from '../src/account-data.js'
import { BO_NOTE, HER_CHANGE, HER_FLAG, HER_NOTE, NICKLAS, aWorld, accountBackends, as, login, type AccountBackend } from './account-backends.js'
import { COLUMNS } from './column-map.js'

// Where each column with a person's own data stands in the extract (#1280): a path in it, or why
// it is not there. A personal column added to the map without a line here turns this red (#1276),
// and a path here that the extract of a whole account leaves empty does too.
const IN_THE_EXTRACT: Readonly<Record<string, string | { not: string }>> = {
  'accounts.email': 'account.email',
  'accounts.name': 'account.name',
  'login_tokens.email': 'loginLinks.0.expiresAt',
  'passkeys.device': 'passkeys.0.device',
  'ai_keys.last4': 'aiKey.last4',
  'ai_keys.ciphertext': { not: 'the key itself is never told, to anyone (DRIFT §5); its provider and its last four are' },
  'terms_acceptances.accepted_at': 'account.terms.0.acceptedAt',
  'project_invites.email': 'invitesSent.0.email',
  'guest_tokens.name': 'tables.0.name',
  'events.intent': 'tables.0.flags.0.note',
  'surveys.who': 'tables.0.name',
  'surveys.answers': 'tables.0.survey.answers',
}
const at = (value: unknown, path: string): unknown => path.split('.').reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined), value)

// «Ladda ner mina uppgifter» (#1280, G6, art. 15 och 20, variant A): the account's own extract, a
// zip straight from the Konto card, in the form of a game's export (G5): the data as JSON, its JSON
// Schema out of the same zod schema, and a LASMIG.md in the reader's language (A4).
let n = 0
for (const backend of accountBackends) {
  describe.skipIf(backend.skip)(`the account's extract, in ${backend.name} (#1280)`, () => {
    let db: AccountBackend
    beforeAll(async () => {
      db = await backend.open()
    })
    afterAll(async () => {
      await db.close()
    })
    const someone = async () => {
      const email = `utdrag-${backend.name.toLowerCase()}-${++n}@example.com`
      const cookie = await login(db.run, email)
      return { email, cookie, call: as(db.run, cookie) }
    }
    const extract = async (call: ReturnType<typeof as>, lang = 'sv') => {
      const res = await call('GET', `/me/data?lang=${lang}`)
      expect(res.status).toBe(200)
      const files = unzipSync(new Uint8Array(await res.arrayBuffer()))
      return { res, files, data: PersonalData.parse(JSON.parse(strFromU8(files['uppgifter.json']!))) }
    }

    it('is a zip of the data, its schema and a LASMIG.md, named for the day, and only for the one logged in', async () => {
      const me = await someone()
      expect((await me.call('PUT', '/me/name', { name: 'Nicklas Utdrag' })).status).toBe(200)
      const { res, files, data } = await extract(me.call)
      expect(res.headers.get('content-type')).toBe('application/zip')
      expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="deckster-uppgifter-\d{4}-\d{2}-\d{2}\.zip"$/)
      expect(Object.keys(files).sort()).toEqual(['LASMIG.md', 'schema.json', 'uppgifter.json'])
      expect(data.account).toMatchObject({ email: me.email, name: 'Nicklas Utdrag' })
      expect(JSON.parse(strFromU8(files['schema.json']!))).toMatchObject({ type: 'object' })
      expect(strFromU8(files['LASMIG.md']!)).toContain('# Dina uppgifter i Deckster')
      expect(strFromU8((await extract(me.call, 'en')).files['LASMIG.md']!)).toContain('# Your data in Deckster')
      expect((await as(db.run, null)('GET', '/me/data')).status).toBe(401)
    })

    it('holds every personal column there is about the account, and nothing about anyone else', async () => {
      const w = await aWorld(db, `x${backend.name}`)
      const { files, data } = await extract(w.nicklas.call)
      const text = strFromU8(files['uppgifter.json']!)
      expect(Object.keys(IN_THE_EXTRACT).sort()).toEqual(Object.entries(COLUMNS).filter(([, c]) => c === 'personal').map(([k]) => k).sort())
      for (const [column, where] of Object.entries(IN_THE_EXTRACT)) if (typeof where === 'string') expect([column, at(data, where) ?? null]).not.toEqual([column, null])

      expect(data.account).toMatchObject({ email: w.nicklas.email, name: NICKLAS, plan: { plan: 'beta', source: 'operator' }, terms: [{ version: '2026-10-25' }] })
      expect(data.passkeys).toEqual([expect.objectContaining({ device: 'Safari på Mac', aaguid: 'fbfc3007-154e-4ecc-8c0b-6e020557d7bd' })])
      expect(data.aiKey).toMatchObject({ provider: 'anthropic', last4: 'x7Qd' })
      expect(data.games.map((g) => [g.name, g.role]).sort()).toEqual([['Skogens råd', 'owner'], ['Stjärnhandel', 'owner'], ['Vargtimmen', 'editor']])
      expect(data.games.find((g) => g.name === 'Vargtimmen')?.versionsSaved.map((v) => v.rev)).toEqual([2])
      expect(data.invitesSent).toEqual([expect.objectContaining({ game: 'Skogens råd', email: w.kim.email, role: 'editor' })])
      expect(data.invitesReceived).toEqual([expect.objectContaining({ game: 'Vargtimmen', email: w.nicklas.email })])
      expect(data.tables).toEqual([
        expect.objectContaining({ session: w.saras.id, game: 'Vargtimmen', kind: 'seat', seat: 'A', name: NICKLAS, ended: true, flags: [expect.objectContaining({ note: HER_FLAG })], notes: [expect.objectContaining({ text: HER_NOTE })], survey: expect.objectContaining({ answers: expect.objectContaining({ change: HER_CHANGE }) }) }),
      ])
      // Her own table; the one at Sara's game is borne by Sara.
      expect(data.borne.tables).toBe(1)
      // Nothing of the key itself, and nothing about the others: Kim is only the address she invited.
      for (const other of ['sk-ant-api03-hemligx7Qd', 'Kim Kvar', 'Sara', w.sara.email, 'Bo', BO_NOTE]) expect([other, text.includes(other)]).toEqual([other, false])
    })
  })
}
