import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryProjectStore } from '../src/index.js'
import { template } from './deck.js'
import { start, twoSeatSetup, type Running } from './fixture.js'
import type { ProjectDoc } from '../src/projects.js'

const doc = (name = 'Skogens herrar', cost = 5): ProjectDoc => {
  const { zones, seats, floor } = twoSeatSetup()
  return { name, template, rows: [{ id: 'dragon', fields: { title: 'Drake', cost, antal: 1 } }], icons: {}, setup: { zones, seats, floor, deckZone: 'draw' } }
}

describe('the project\'s history (B4): every edit kept, nothing rewritten', () => {
  it('keeps a version per save, hands back an older one whole, and never lets one be changed', async () => {
    const store = new MemoryProjectStore()
    await store.create('p1', doc(), 'ada')
    await store.replace('p1', 1, doc('Skogens herrar', 4))
    await store.replace('p1', 2, doc('Skogens andar', 4))

    const versions = await store.versions('p1')
    expect(versions.map((v) => v.rev)).toEqual([3, 2, 1])
    expect(versions.every((v) => typeof v.at === 'string' && v.at.length > 0)).toBe(true)
    expect(versions.every((v) => v.label === undefined)).toBe(true)

    const first = await store.at('p1', 1)
    expect(first).toMatchObject({ id: 'p1', rev: 1, name: 'Skogens herrar', owner: 'ada' })
    expect(first?.rows[0]?.fields['cost']).toBe(5)
    expect((await store.at('p1', 3))?.name).toBe('Skogens andar')
    expect(await store.at('p1', 9)).toBeNull()
    expect(await store.at('nope', 1)).toBeNull()

    // A newer save leaves what came before exactly as it was.
    await store.replace('p1', 3, doc('Ändrad igen', 1))
    expect((await store.at('p1', 1))?.rows[0]?.fields['cost']).toBe(5)
    expect((await store.versions('p1')).map((v) => v.rev)).toEqual([4, 3, 2, 1])
  })

  it('names the versions that mean something, and lets a name be taken back', async () => {
    const store = new MemoryProjectStore()
    await store.create('p1', doc())
    await store.replace('p1', 1, doc('Skogens herrar', 4))

    expect(await store.label('p1', 1, 'Första blindtestet')).toMatchObject({ rev: 1, label: 'Första blindtestet' })
    expect((await store.versions('p1')).find((v) => v.rev === 1)?.label).toBe('Första blindtestet')
    expect((await store.versions('p1')).find((v) => v.rev === 2)?.label).toBeUndefined()
    expect(await store.label('p1', 1, null)).toMatchObject({ rev: 1 })
    expect((await store.versions('p1')).find((v) => v.rev === 1)?.label).toBeUndefined()
    expect(await store.label('p1', 9, 'finns inte')).toBe('missing')
  })
})

describe('the history over HTTP (B4)', () => {
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

  it('lists the versions, opens an older one, names it, and says what changed between two', async () => {
    await send('POST', '/projects', { id: 'p1', ...doc() })
    await send('PUT', '/projects/p1', { rev: 1, ...doc('Skogens herrar', 4) })

    const list = (await (await send('GET', '/projects/p1/versions')).json()) as { rev: number; at: string; label?: string }[]
    expect(list.map((v) => v.rev)).toEqual([2, 1])

    const old = await send('GET', '/projects/p1/versions/1')
    expect(old.status).toBe(200)
    expect(((await old.json()) as ProjectDoc & { rev: number }).rows[0]?.fields['cost']).toBe(5)
    expect((await send('GET', '/projects/p1/versions/7')).status).toBe(404)

    expect((await send('PUT', '/projects/p1/versions/1/label', { label: 'Första blindtestet' })).status).toBe(200)
    expect(((await (await send('GET', '/projects/p1/versions')).json()) as { label?: string }[])[1]?.label).toBe('Första blindtestet')

    const diff = (await (await send('GET', '/projects/p1/versions/2/diff?from=1')).json()) as { rows: unknown[]; template: boolean }
    expect(diff.rows).toEqual([{ kind: 'changed', cardRef: 'dragon', fields: [{ field: 'cost', from: 5, to: 4 }] }])
    expect(diff.template).toBe(false)
    // Against the version before it when nothing else is asked for.
    const implied = (await (await send('GET', '/projects/p1/versions/2/diff')).json()) as { rows: unknown[] }
    expect(implied.rows).toEqual(diff.rows)
  })

  it('keeps someone else out of another account\'s history', async () => {
    await send('POST', '/projects', { id: 'p1', ...doc() })
    expect((await fetch(`${run.http}/projects/p1/versions`)).status).toBe(401)
    expect((await fetch(`${run.http}/projects/p1/versions/1`)).status).toBe(401)
  })
})

describe('a version in Postgres (B4)', () => {
  it('keeps every save and hands an older one back whole', async () => {
    const url = process.env['DATABASE_URL']
    if (!url) return
    const { PostgresLogStore } = await import('../src/index.js')
    const schema = `test_history_${process.pid}_${Date.now()}`
    const pg = PostgresLogStore.connect(url, { schema })
    await pg.migrate()
    try {
      const store = pg.projects()
      await store.create('p1', doc(), 'ada')
      await store.replace('p1', 1, doc('Skogens herrar', 4))
      expect((await store.versions('p1')).map((v) => v.rev)).toEqual([2, 1])
      expect((await store.at('p1', 1))?.rows[0]?.fields['cost']).toBe(5)
      expect((await store.at('p1', 2))?.rows[0]?.fields['cost']).toBe(4)
      expect(await store.at('p1', 3)).toBeNull()
      expect(await store.label('p1', 1, 'Blindtest')).toMatchObject({ rev: 1, label: 'Blindtest' })
      expect((await store.versions('p1')).find((v) => v.rev === 1)?.label).toBe('Blindtest')
      expect(await store.label('p1', 1, null)).toMatchObject({ rev: 1 })
      expect((await store.versions('p1')).find((v) => v.rev === 1)?.label).toBeUndefined()
    } finally {
      await pg.dropSchema()
      await pg.close()
    }
  })
})
