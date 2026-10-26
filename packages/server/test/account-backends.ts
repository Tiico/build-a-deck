import postgres from 'postgres'
import { MemoryAuthStore, MemoryLogStore, MemoryProjectStore, MemorySurveyStore, PostgresLogStore } from '../src/index.js'
import { MemoryAccountPlanStore } from '../src/account-plans.js'
import { PostgresRenderStore } from '@byd/render/queue'
import { MemoryObjectStore } from '@byd/render'
import type { AssetSweep } from '../src/store-postgres.js'
import { AiKeyVault, MemoryAiKeyStore } from '../src/ai-keys.js'
import { providersFromEnv } from '../src/ai-providers.js'
import type { AuthStore } from '../src/auth.js'
import type { AccountPlanStore } from '../src/account-plans.js'
import { expect } from 'vitest'
import { registerRoom, start, twoSeatSetup, type Running } from './fixture.js'
import { WireClient } from './client.js'
import { template } from './deck.js'

// The account's own ways (#1280): the extract and the erasure, against the memory stores and
// against Postgres, whose queries are the box's. The Postgres half runs only with DATABASE_URL.
// Every store an account leaves something in is the server's here, so that what the extract says
// and what the erasure takes can be held against all of them.
const url = process.env['DATABASE_URL']

export type AccountBackend = {
  run: Running
  auth: AuthStore
  vault: AiKeyVault
  accountPlans: AccountPlanStore
  // Every row of the database as text, table by table, for a search for her id and address; null
  // in memory, where there are no rows to read.
  rows: (() => Promise<Record<string, string[]>>) | null
  // The sweep of a deleted account's pictures and renderings, and the bucket they are in; only
  // Postgres has it, since nothing in memory lives 30 days.
  sweep: AssetSweep | null
  objects: MemoryObjectStore
  // One column's every value as text.
  column(table: string, column: string): Promise<string[]>
  close(): Promise<void>
}

// No provider is asked anything: a key is saved straight into the vault.
const providers = providersFromEnv({})

export const accountBackends: { name: string; skip: boolean; open(extra?: Parameters<typeof start>[0]): Promise<AccountBackend> }[] = [
  {
    name: 'memory',
    skip: false,
    open: async (extra = {}) => {
      const store = new MemoryLogStore()
      const surveys = new MemorySurveyStore()
      const projects = new MemoryProjectStore()
      const auth = new MemoryAuthStore()
      const accountPlans = new MemoryAccountPlanStore()
      const vault = new AiKeyVault(new MemoryAiKeyStore(), Buffer.alloc(32, 7))
      const run = await start({ store, surveys, projects, auth, accountPlans, ai: { vault, providers }, ...extra })
      return { run, auth, vault, accountPlans, rows: null, sweep: null, objects: new MemoryObjectStore(), column: async () => [], close: () => run.stop() }
    },
  },
  {
    name: 'Postgres',
    skip: !url,
    open: async (extra = {}) => {
      const schema = `test_account_${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const store = PostgresLogStore.connect(url!, { schema })
      await store.migrate()
      const sql = postgres(url!, { max: 1, onnotice: () => undefined, connection: { search_path: schema } })
      // The render queue in the same schema, as on the box: what the account bore is in its log.
      const renders = PostgresRenderStore.connect(url!, undefined, { schema })
      await renders.migrate()
      const vault = new AiKeyVault(store.aiKeys(), Buffer.alloc(32, 7))
      const auth = store.auth()
      const accountPlans = store.accountPlans()
      const objects = new MemoryObjectStore()
      const run = await start({ store, surveys: store.surveys(), projects: store.projects(), auth, accountPlans, renders, objects, assets: store.assets(objects), ai: { vault, providers }, ...extra })
      return {
        run,
        auth,
        vault,
        accountPlans,
        sweep: store.assetSweep(objects),
        objects,
        rows: async () => {
          const tables = await sql<{ table_name: string }[]>`select table_name from information_schema.tables where table_schema = ${schema} order by table_name`
          const out: Record<string, string[]> = {}
          for (const { table_name } of tables) out[table_name] = (await sql.unsafe(`select t::text as row from "${table_name}" t`)).map((r) => String(r['row']))
          return out
        },
        column: async (table, column) => (await sql.unsafe(`select "${column}"::text as v from "${table}" where "${column}" is not null`)).map((r) => String(r['v'])),
        close: async () => {
          await run.stop()
          await renders.close()
          await sql.end()
          await store.dropSchema()
          await store.close()
        },
      }
    },
  },
]

// Logged in through the link in the mail, as a designer is: the cookie it sets.
export async function login(run: Running, email: string): Promise<string> {
  await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
  const link = /\/auth\/verify\?token=\S+/.exec(run.mail.sent.at(-1)?.text ?? '')?.[0] ?? ''
  return ((await fetch(`${run.http}${link}`, { redirect: 'manual' })).headers.get('set-cookie') ?? '').split(';')[0] ?? ''
}
export const as = (run: Running, cookie: string | null) => (method: string, path: string, body?: unknown) =>
  fetch(`${run.http}${path}`, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })

// A designer's whole account, in every store there is (#1280): Nicklas, with a name, a passkey, an
// AI key, a tier and the terms; Stjärnhandel, a game of hers with a table that Bo sat down at and
// nobody played (#1376);
// Skogens råd, a game of hers shared with Kim; Vargtimmen, Sara's game, which she edits and saved a
// version of; Månskugga, Sara's game that she edited and Sara took away (#1334); and a table of
// Sara's she sat at, flagged, noted and answered at, and claimed.
export const NICKLAS = 'Nicklas Raderas'
export const HER_FLAG = 'Nicklas flagga om draken'
export const HER_NOTE = 'Nicklas anteckning om poängen'
export const HER_CHANGE = 'Nicklas önskan om färre kort'
export const BO_NOTE = 'Bos poänglista'
let worlds = 0
const game = (name: string) => {
  const { zones, seats, floor } = twoSeatSetup()
  return { name, template, rows: [{ id: 'dragon', fields: { title: 'Drake', antal: 6 } }], icons: {}, setup: { zones, seats, floor, deckZone: 'draw' } }
}
export async function aWorld(db: AccountBackend, tag: string) {
  const run = db.run
  const i = ++worlds
  const email = (who: string) => `${who}-${tag.toLowerCase()}-${i}@example.com`
  const cookie = await login(run, email('nicklas'))
  const nicklas = { email: email('nicklas'), cookie, call: as(run, cookie) }
  const kimCookie = await login(run, email('kim'))
  const kim = { email: email('kim'), cookie: kimCookie, call: as(run, kimCookie) }
  const saraCookie = await login(run, email('sara'))
  const sara = { email: email('sara'), cookie: saraCookie, call: as(run, saraCookie) }
  await nicklas.call('PUT', '/me/name', { name: NICKLAS })
  await kim.call('PUT', '/me/name', { name: 'Kim Kvar' })
  await sara.call('PUT', '/me/name', { name: 'Sara' })
  const id = (await db.auth.accountByEmail(nicklas.email))!.id
  const now = new Date().toISOString()
  await db.auth.addPasskey({ id: `pk-${tag}-${i}`, accountId: id, publicKey: new Uint8Array([1, 2, 3]), counter: 0, transports: ['internal'], aaguid: 'fbfc3007-154e-4ecc-8c0b-6e020557d7bd', device: 'Safari på Mac', createdAt: now, lastUsedAt: null })
  await db.vault.save(id, 'anthropic', 'sk-ant-api03-hemligx7Qd')
  await db.accountPlans.setPlan(id, 'beta', 'operator')
  await db.auth.acceptTerms(id, '2026-10-25', now)

  const ids = { star: `star-${tag}-${i}`, forest: `forest-${tag}-${i}`, wolf: `wolf-${tag}-${i}` }
  expect((await nicklas.call('POST', '/projects', { id: ids.star, ...game('Stjärnhandel') })).status).toBe(201)
  expect((await nicklas.call('POST', '/projects', { id: ids.forest, ...game('Skogens råd') })).status).toBe(201)
  expect((await sara.call('POST', '/projects', { id: ids.wolf, ...game('Vargtimmen') })).status).toBe(201)
  const invite = async (from: typeof nicklas, project: string, to: typeof kim) => {
    expect((await from.call('POST', `/projects/${project}/invites`, { email: to.email, role: 'editor' })).status).toBeLessThan(300)
    const link = /\/invites\/([A-Za-z0-9_-]+)/.exec(run.mail.sent.at(-1)?.text ?? '')?.[1] ?? ''
    expect((await to.call('POST', `/invites/${link}`)).status).toBe(200)
  }
  await invite(nicklas, ids.forest, kim)
  await invite(sara, ids.wolf, nicklas)
  // Månskugga, a game of Sara's that Nicklas edited and that Sara took away (#1334): the band on
  // Nicklas's Mina spel.
  const moon = `moon-${tag}-${i}`
  expect((await sara.call('POST', '/projects', { id: moon, ...game('Månskugga') })).status).toBe(201)
  await invite(sara, moon, nicklas)
  expect((await sara.call('DELETE', `/projects/${moon}`)).status).toBe(200)
  // A version of Sara's game saved by Nicklas.
  expect((await nicklas.call('PUT', `/projects/${ids.wolf}`, { rev: 1, ...game('Vargtimmen'), rows: [{ id: 'dragon', fields: { title: 'Drake', antal: 5 } }] })).status).toBe(200)

  const table = async (owner: typeof nicklas, project: string) => {
    const t = (await (await owner.call('POST', `/projects/${project}/sessions`, {})).json()) as { id: string; code: string; hostKey: string }
    registerRoom(t.id, t)
    return t
  }
  // Her own game's table, started and never played, with Bo at it.
  const star = await table(nicklas, ids.star)
  const boToken = await run.admit(star.id, 'B', 'Bo')
  const bo = await WireClient.connect(run.base, star.id, 'B', undefined, { token: boToken })
  expect((await bo.send('B', { v: 'seat.claim', seat: 'B', name: 'Bo' })).t).toBe('ack')
  expect((await bo.send('B', { v: 'note.add', text: BO_NOTE })).t).toBe('ack')
  await bo.close()
  // Sara's table, where Nicklas sat as a guest and then claimed the seat to her account.
  const saras = await table(sara, ids.wolf)
  const token = await run.admit(saras.id, 'A', NICKLAS)
  const phone = await WireClient.connect(run.base, saras.id, 'A', undefined, { token })
  // She draws a card to her hand and flags it, and flags one she laid face down on the table (#1350).
  expect((await phone.send('A', { v: 'seat.claim', seat: 'A', name: NICKLAS })).t).toBe('ack')
  expect((await phone.send('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })).t).toBe('ack')
  expect((await phone.send('A', { v: 'draw', from: 'draw', to: 'table', count: 1, face: 'back' })).t).toBe('ack')
  await phone.waitFor(() => phone.view?.components.some((c) => c.zone === 'table') === true)
  const inHand = phone.view!.components.find((c) => c.zone === 'hand:A')!.id
  const faceDown = phone.view!.components.find((c) => c.zone === 'table')!.id
  for (const it of [{ v: 'flag', note: HER_FLAG, component: inHand }, { v: 'flag', component: faceDown }, { v: 'note.add', text: HER_NOTE }, { v: 'session.end' }] as const) expect((await phone.send('A', it)).t).toBe('ack')
  await phone.close()
  expect((await as(run, null)('POST', `/sessions/${saras.id}/survey`, { token, seat: 'A', answers: { fun: 4, clarity: 3, balance: 2, change: HER_CHANGE } })).status).toBe(201)
  expect((await nicklas.call('POST', '/guests/claim', { token })).status).toBe(200)
  // A table of one of her games where a card was drawn (#1376): one that is being played, where the
  // star's table was only sat down at.
  const played = async (project: string) => {
    const t = await table(nicklas, project)
    const eva = await WireClient.connect(run.base, t.id, 'A', undefined, { token: await run.admit(t.id, 'A', 'Eva') })
    for (const it of [{ v: 'seat.claim', seat: 'A', name: 'Eva' }, { v: 'draw', from: 'draw', to: 'hand:A', count: 1 }] as const) expect((await eva.send('A', it)).t).toBe('ack')
    await eva.close()
    return t
  }
  return { id, nicklas, kim, sara, ids, star, saras, flagged: { inHand, faceDown }, played }
}
