import { randomBytes } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { strFromU8, unzipSync } from 'fflate'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PostgresLogStore } from '../src/index.js'
import { AiKeyVault } from '../src/ai-keys.js'
import { providersFromEnv } from '../src/ai-providers.js'
import { fakeAiProvider } from '../../../test-support/fake-ai-provider.js'
import { listenInBand, start, twoSeatSetup } from './fixture.js'
import { template } from './deck.js'

// The vault as the box keeps it (#999): in Postgres, beside a master key that is not. Runs only
// against a real Postgres: DATABASE_URL=postgres://... pnpm test
const url = process.env['DATABASE_URL']
const schema = `test_ai_keys_${process.pid}_${Date.now()}`
const KEY = 'sk-ant-api03-good-PostgresNeverSeesThis-0123456789Pg4s'

describe.skipIf(!url)('the vault in Postgres', () => {
  let store: PostgresLogStore
  let provider: Server
  let providerUrl = ''
  beforeAll(async () => {
    store = PostgresLogStore.connect(url!, { schema })
    await store.migrate()
    const fake = fakeAiProvider()
    provider = createServer(fake.listener)
    providerUrl = `http://127.0.0.1:${await listenInBand(provider)}`
  })
  afterAll(async () => {
    provider.closeAllConnections()
    await new Promise<void>((resolve) => provider.close(() => resolve()))
    await store.dropSchema()
    await store.close()
  })

  // Every row of every table in the schema, as Postgres itself writes it out.
  const everything = async (): Promise<string> => {
    const sql = (store as unknown as { sql: import('postgres').Sql }).sql
    const tables = await sql<{ table_name: string }[]>`select table_name from information_schema.tables where table_schema = ${schema}`
    const out: string[] = []
    for (const { table_name } of tables) {
      const rows = await sql.unsafe<{ row: string }[]>(`select t::text as row from "${schema}"."${table_name}" t`)
      out.push(...rows.map((r) => r.row))
    }
    return out.join('\n')
  }

  it('opens what it sealed, keeps no key in any table, and opens nothing under another master key', async () => {
    const account = await store.auth().ensureAccount('ada@example.com')
    const vault = new AiKeyVault(store.aiKeys(), randomBytes(32))
    await vault.save(account.id, 'anthropic', KEY, 'claude-opus-5-5')
    expect(await vault.describe(account.id)).toMatchObject({ provider: 'anthropic', last4: 'Pg4s', model: 'claude-opus-5-5' })
    expect(await vault.open(account.id)).toEqual({ provider: 'anthropic', key: KEY, model: 'claude-opus-5-5' })

    const kept = await everything()
    expect(kept).toContain('Pg4s')
    expect(kept).not.toContain(KEY.slice(0, 20))
    expect(kept).not.toContain(Buffer.from(KEY).toString('hex').slice(0, 40))

    // A database brought back without its master key: «ange nyckeln igen», never an error.
    const restored = new AiKeyVault(store.aiKeys(), randomBytes(32))
    expect(await restored.describe(account.id)).toBeNull()
    expect(await restored.open(account.id)).toBeNull()
    expect(await new AiKeyVault(store.aiKeys(), null).describe(account.id)).toBeNull()

    expect((await vault.setModel(account.id, null))?.model).toBeNull()
    await vault.remove(account.id)
    expect(await vault.describe(account.id)).toBeNull()
  })

  it('carries no key in a game’s export, in any file of it', async () => {
    const vault = new AiKeyVault(store.aiKeys(), randomBytes(32))
    const run = await start({ auth: store.auth(), ai: { vault, providers: providersFromEnv({ AI_ANTHROPIC_URL: `${providerUrl}/anthropic`, AI_OPENAI_URL: `${providerUrl}/openai` }) } })
    try {
      await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'bo@example.com' }) })
      const link = /\/auth\/verify\?token=\S+/.exec(run.mail.sent.at(-1)?.text ?? '')?.[0] ?? ''
      const cookie = ((await fetch(`${run.http}${link}`, { redirect: 'manual' })).headers.get('set-cookie') ?? '').split(';')[0] ?? ''
      const as = (method: string, path: string, body?: unknown) => fetch(`${run.http}${path}`, { method, headers: { 'content-type': 'application/json', cookie }, body: body === undefined ? null : JSON.stringify(body) })
      expect((await as('PUT', '/me/ai-key', { provider: 'anthropic', key: KEY })).status).toBe(200)

      const { zones, seats, floor } = twoSeatSetup()
      const made = await as('POST', '/projects', { id: `ai-${schema}`, name: 'Nyckellös', template, rows: [{ id: 'dragon', fields: { title: 'Drake', antal: 1 } }], icons: {}, setup: { zones, seats, floor, deckZone: 'draw' } })
      expect(made.status, await made.text()).toBe(201)
      expect((await as('POST', `/projects/ai-${schema}/export`)).status).toBe(202)
      let res = await as('GET', `/projects/ai-${schema}/export`)
      if (res.status === 202) {
        await run.renderAll()
        res = await as('GET', `/projects/ai-${schema}/export`)
      }
      expect(res.status).toBe(200)
      const files = unzipSync(new Uint8Array(await res.arrayBuffer()))
      expect(Object.keys(files)).toContain('spel.json')
      for (const [name, bytes] of Object.entries(files)) {
        expect({ name, holds: strFromU8(bytes, true).includes(KEY.slice(0, 20)) || strFromU8(bytes, true).includes('Pg4s') }).toEqual({ name, holds: false })
      }
    } finally {
      await run.stop()
    }
  })
})
