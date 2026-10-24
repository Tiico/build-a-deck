import WebSocket from 'ws'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MemoryAuthStore, MemoryLogStore, MemoryProjectStore, MemorySurveyStore, PostgresLogStore, type AuthStore, type LogStore, type SurveyStore } from '../src/index.js'
import type { ProjectStore } from '../src/projects.js'
import type { Waiting } from '../src/waiting.js'
import { WireClient } from './client.js'
import { template } from './deck.js'
import { registerRoom, start, twoSeatSetup, type Running } from './fixture.js'

// «Väntar på dig» (#1225, #1204 beslut B) i ett eget svar efter listan: `GET /me/waiting`, per spel
// det som väntar på kontot.
//
// - `playtest`: för den som får läsa spelets playtest (#524, `canStartTables`) — hur många enkätsvar
//   spelarna har gett vid spelets bord, i alla versioner (observatörernas står för sig, L70, och
//   räknas inte), och de nya flaggorna.
// - **En ny flagga är en flagga som restes på spelets senaste version.** En flagga hör till versionen
//   den restes på (L70): bordets version, eller den som en «Uppdatera» (C7) flyttade bordet till
//   före flaggan. När designern sparar en ny version är de gamla flaggorna inte längre nya, och ett
//   bord som fortsätter på en äldre version reser inga nya flaggor. Både bord som pågår och bord
//   som avslutats räknas.
// - `other`: spelets senaste version, när någon annan än kontot sparade den och det är känt vem
//   (#1225). Den säger vem med det namn hon gav sitt konto (#1254), aldrig adressen eller dess ord.
//
// Mot minnet och mot Postgres. Postgres-halvan körs bara med DATABASE_URL=postgres://... pnpm test.
const url = process.env['DATABASE_URL']
const schema = `test_waiting_${process.pid}_${Date.now()}`

type Backend = { store: LogStore; surveys: SurveyStore; projects: ProjectStore; auth: AuthStore; close(): Promise<void> }
const backends: { name: string; skip: boolean; open(): Promise<Backend> }[] = [
  { name: 'minnet', skip: false, open: async () => ({ store: new MemoryLogStore(), surveys: new MemorySurveyStore(), projects: new MemoryProjectStore(), auth: new MemoryAuthStore(), close: () => Promise.resolve() }) },
  {
    name: 'Postgres',
    skip: !url,
    open: async () => {
      const store = PostgresLogStore.connect(url!, { schema })
      await store.migrate()
      return {
        store,
        surveys: store.surveys(),
        projects: store.projects(),
        auth: store.auth(),
        close: async () => {
          await store.dropSchema()
          await store.close()
        },
      }
    },
  },
]

const game = (name = 'Skogens herrar', antal = 6) => {
  const { zones, seats, floor } = twoSeatSetup()
  return { name, template, rows: [{ id: 'dragon', fields: { title: 'Drake', antal } }], icons: {}, setup: { zones, seats, floor, deckZone: 'draw' } }
}
let games = 0

for (const backend of backends) {
  describe.skipIf(backend.skip)(`det som väntar på kontot, i ${backend.name} (#1225)`, () => {
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
    const shareWith = async (owner: ReturnType<typeof as>, project: string, email: string, role: string): Promise<string> => {
      await owner('POST', `/projects/${project}/invites`, { email, role })
      const link = /\/invites\/([A-Za-z0-9_-]+)/.exec(run.mail.sent.at(-1)?.text ?? '')?.[1] ?? ''
      const theirs = await login(email)
      await as(theirs)('POST', `/invites/${link}`)
      return theirs
    }
    const waiting = async (cookie: string): Promise<Waiting> => {
      const res = await as(cookie)('GET', '/me/waiting')
      expect(res.status).toBe(200)
      return (await res.json()) as Waiting
    }
    const table = async (who: ReturnType<typeof as>, project: string) => {
      const made = (await (await who('POST', `/projects/${project}/sessions`, {})).json()) as { id: string; code: string; hostKey: string }
      registerRoom(made.id, made)
      return made
    }
    // Sparar en version ur editorn, som den som är inloggad med kakan.
    const saveFromEditor = async (cookie: string, project: string, rename: string) => {
      const ws = new WebSocket(`${run.base}/projects/${project}/edit?name=Editor`, { headers: { cookie } })
      const seen: { v: string }[] = []
      ws.on('message', (data) => seen.push(JSON.parse(data.toString()) as { v: string }))
      const until = async (v: string) => {
        for (let i = 0; i < 200 && !seen.some((m) => m.v === v); i++) await new Promise((r) => setTimeout(r, 10))
        expect(seen.some((m) => m.v === v)).toBe(true)
      }
      await until('project')
      ws.send(JSON.stringify({ t: 'edit', intent: { v: 'rename', name: rename } }))
      await until('edits')
      ws.send(JSON.stringify({ t: 'save' }))
      await until('saved')
      ws.close()
    }

    it('räknar spelarnas enkätsvar i alla versioner och flaggorna på den senaste versionen som nya', async () => {
      const cookie = await login(`ada-${++games}@example.com`)
      const ada = as(cookie)
      const project = `p-${process.pid}-${games}`
      await ada('POST', '/projects', { id: project, ...game() })
      expect((await waiting(cookie))[project]).toEqual({ rev: 1, playtest: { answers: 0, flags: 0, tables: 0, at: null } })

      // Ett bord på version 1: två flaggor från en plats och en från en observatör, ett svar från
      // platsen och ett från observatören.
      const first = await table(ada, project)
      const tokens = { a: await run.admit(first.id, 'A', 'Ada'), cilla: await run.admit(first.id, null, 'Cilla') }
      const seat = await WireClient.connect(run.base, first.id, 'A', undefined, { token: tokens.a })
      const watcher = await WireClient.connect(run.base, first.id, null, { role: 'observer', name: 'Cilla' }, { token: tokens.cilla })
      await seat.send('A', { v: 'seat.claim', seat: 'A', name: 'Ada' })
      await seat.send('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
      await seat.send('A', { v: 'flag', note: 'Draken är för stark' })
      await seat.send('A', { v: 'flag' })
      await watcher.send(null, { v: 'flag', note: 'Långsamt' })
      await seat.send('A', { v: 'session.end' })
      await seat.close()
      await watcher.close()
      const answer = (token: string, seat: string | null) =>
        as(null)('POST', `/sessions/${first.id}/survey`, { token, seat, ...(seat === null ? { observer: true } : {}), answers: { fun: 4, clarity: 3, balance: 4, change: '' } })
      expect((await answer(tokens.a, 'A')).status).toBe(201)
      expect((await answer(tokens.cilla, null)).status).toBe(201)

      const one = (await waiting(cookie))[project]!
      expect(one).toMatchObject({ rev: 1, playtest: { answers: 1, flags: 3, tables: 1 } })
      const playtest = (await (await ada('GET', `/projects/${project}/playtest`)).json()) as { tables: { flags: { at: string }[] }[] }
      // När den senaste nya flaggan restes: den sista av de tre.
      expect(one.playtest!.at).toBe(playtest.tables[0]!.flags.at(-1)!.at)

      // Ett bord som börjar på version 1 och fortsätter efter att version 2 sparats.
      const old = await table(ada, project)
      const late = await WireClient.connect(run.base, old.id, 'A', undefined, { token: await run.admit(old.id, 'A', 'Bo') })
      await late.send('A', { v: 'seat.claim', seat: 'A', name: 'Bo' })

      // Designern sparar version 2: flaggorna på version 1 är inte längre nya, svaren står kvar.
      expect((await ada('PUT', `/projects/${project}`, { rev: 1, ...game('Skogens herrar', 5) })).status).toBe(200)
      expect((await waiting(cookie))[project]).toEqual({ rev: 2, playtest: { answers: 1, flags: 0, tables: 0, at: null } })

      // Bordet på version 1 reser en flagga efter sparningen: den hör till version 1 och är inte ny.
      await late.send('A', { v: 'flag', note: 'Fortfarande version 1' })
      expect((await waiting(cookie))[project]!.playtest).toMatchObject({ flags: 0, tables: 0 })
      // Uppdaterat till version 2 (C7) är det bordets nästa flagga som är ny.
      expect((await ada('POST', `/sessions/${old.id}/refresh`, {})).status).toBe(200)
      await late.send('A', { v: 'flag', note: 'Nu version 2' })
      await late.close()
      // Och ett bord som startas på version 2.
      const second = await table(ada, project)
      const fresh = await WireClient.connect(run.base, second.id, 'A', undefined, { token: await run.admit(second.id, 'A', 'Dan') })
      await fresh.send('A', { v: 'seat.claim', seat: 'A', name: 'Dan' })
      await fresh.send('A', { v: 'flag' })
      await fresh.close()
      expect((await waiting(cookie))[project]!.playtest).toMatchObject({ answers: 1, flags: 2, tables: 2 })
    })

    it('säger när en annan har sparat spelets senaste version, med namnet och aldrig adressen', async () => {
      const adaCookie = await login(`ada-${++games}@example.com`)
      const ada = as(adaCookie)
      const project = `p-${process.pid}-${games}`
      await ada('POST', '/projects', { id: project, ...game() })
      const kim = await shareWith(ada, project, `kim.berg-${games}@example.com`, 'editor')
      const bo = await shareWith(ada, project, `bo-${games}@example.com`, 'viewer')
      // Namnen är kontots egna (#1254).
      await ada('PUT', '/me/name', { name: 'Ada' })
      await as(kim)('PUT', '/me/name', { name: 'Kim' })
      // Ägaren skapade spelet; ingen annan har sparat något.
      expect((await waiting(adaCookie))[project]!.other).toBeUndefined()
      expect((await waiting(kim))[project]).toMatchObject({ rev: 1, other: { name: 'Ada' } })

      await saveFromEditor(kim, project, 'Skogens andar')
      const seen = (await waiting(adaCookie))[project]!
      expect(seen).toMatchObject({ rev: 2, other: { name: 'Kim', at: expect.any(String) } })
      expect(JSON.stringify(seen)).not.toContain('@')
      // Den som sparade den har inget att vänta på.
      expect((await waiting(kim))[project]!.other).toBeUndefined()
      // En betraktare får veta om versionen, men läser inga flaggor och inga svar (#524).
      const viewer = (await waiting(bo))[project]!
      expect(viewer).toEqual({ rev: 2, other: { name: 'Kim', at: seen.other!.at } })

      // Ägaren sparar i sin tur, över HTTP: nu är det Kim som har något att se.
      expect((await ada('PUT', `/projects/${project}`, { rev: 2, ...game('Skogens andar', 4) })).status).toBe(200)
      expect((await waiting(adaCookie))[project]!.other).toBeUndefined()
      expect((await waiting(kim))[project]).toMatchObject({ rev: 3, other: { name: 'Ada' } })
    })

    // Adressens ord är bara ett förslag (#1254, beslut 2): ett konto utan namn nämns inte, hur läsbar
    // adressen än är.
    it('nämner ingen som inte har gett sitt konto ett namn, och inget spel som kontot inte har', async () => {
      const ownerCookie = await login(`eva-${++games}@example.com`)
      const owner = as(ownerCookie)
      const project = `p-${process.pid}-${games}`
      await owner('POST', '/projects', { id: project, ...game() })
      const other = await shareWith(owner, project, `kim.berg-${games}@example.com`, 'editor')
      await saveFromEditor(other, project, 'Annat namn')
      expect((await waiting(ownerCookie))[project]).toMatchObject({ other: { name: null } })
      expect((await waiting(await login(`stranger-${games}@example.com`)))[project]).toBeUndefined()
      expect((await as(null)('GET', '/me/waiting')).status).toBe(401)
    })

    // Många spel och många flaggor (sample-deck-hides-density): varje spel räknas för sig, och ett
    // bord med långa loggar räknas lika rätt som ett kort.
    it('räknar rätt för många spel med många bord och flaggor', async () => {
      const cookie = await login(`many-${++games}@example.com`)
      const owner = as(cookie)
      const ids: string[] = []
      for (let g = 0; g < 8; g++) {
        const project = `p-${process.pid}-${games}-${g}`
        ids.push(project)
        await owner('POST', '/projects', { id: project, ...game(`Spel ${g}`, 40) })
        for (let t = 0; t < g % 3; t++) {
          const made = await table(owner, project)
          const seat = await WireClient.connect(run.base, made.id, 'A', undefined, { token: await run.admit(made.id, 'A', 'Ada') })
          await seat.send('A', { v: 'seat.claim', seat: 'A', name: 'Ada' })
          for (let m = 0; m < 12; m++) {
            await seat.send('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
            if (m % 2 === 0) await seat.send('A', { v: 'flag', note: `${g}-${t}-${m}` })
          }
          await seat.close()
        }
      }
      const read = await waiting(cookie)
      for (const [g, project] of ids.entries()) expect(read[project]!.playtest).toMatchObject({ flags: (g % 3) * 6, tables: g % 3 })
    })
  })
}
