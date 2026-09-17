import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryProjectStore } from '../src/index.js'
import { template } from './deck.js'
import { start, twoSeatSetup, type Running } from './fixture.js'
import type { ProjectDoc } from '../src/projects.js'
import type { VersionChange } from '../src/diff.js'
import { PG_TEST_BUDGET } from '../../../test-support/pg-budget.js'

vi.setConfig({ testTimeout: PG_TEST_BUDGET })

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

  // What every version changed, in one answer (#177). A row in the history has to say what its
  // save changed, and asking that of a version at a time is one request per row: fifteen of them
  // for the history the granskning measured, and a request per row for as long as the history
  // grows. The history is read as a whole, so it is answered as a whole.
  it('says what every version changed, in one answer, oldest save against the one before it', async () => {
    await send('POST', '/projects', { id: 'p1', ...doc() })
    await send('PUT', '/projects/p1', { rev: 1, ...doc('Skogens herrar', 4) })
    const third = doc('Skogens herrar', 4)
    third.rows.push({ id: 'troll', fields: { title: 'Troll', antal: 1 } })
    third.rules = { title: 'Så spelas det', blocks: [] }
    await send('PUT', '/projects/p1', { rev: 2, ...third })

    const changes = (await (await send('GET', '/projects/p1/versions/changes')).json()) as VersionChange[]
    // Newest first, as the history itself is listed, so a row finds its own without sorting.
    expect(changes.map((c) => c.rev)).toEqual([3, 2, 1])
    expect(changes[0]).toMatchObject({ rev: 3, added: 1, removed: 0, changed: 0, parts: ['rules'] })
    expect(changes[1]).toMatchObject({ rev: 2, added: 0, removed: 0, changed: 1, parts: [] })
    // The first version of all changed nothing: the game began.
    expect(changes[2]).toMatchObject({ rev: 1, first: true, added: 0, parts: [] })
  })

  // The same answer at the depth a worked project reaches, and against the deck a worked project
  // has (#175–#179). The fixture above is three saves of a one-card game, and three saves of a
  // one-card game is a surface where everything looks fine.
  //
  // What is measured is not how long it takes — that is a fact about the machine, and this suite
  // runs on several — but the two things that decide how long it takes anywhere: the walk reads
  // each version exactly once, and what comes back is a summary and not a history of decks. The
  // second is the one that is easy to lose. `VersionChange` deliberately carries counts where
  // `DocDiff` carries every field of every card that moved, and the day somebody hands the fuller
  // shape out of here instead, thirty versions of a three-hundred-card deck stop being three
  // kilobytes and become a couple of megabytes — the same panel, the same rows, a thousandfold the
  // answer. That is a change no reading of this file's other tests would notice.
  it('answers a deep history of a real deck in a summary, reading each version once', async () => {
    const DEEP = 30
    const deck = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        id: `kort-${i + 1}`,
        fields: { title: `Kort ${i + 1}`, body: 'Ett kort med ett par rader text på sig, ungefär så mycket som ett riktigt kort bär.', antal: (i % 3) + 1, typ: 'varelse' },
      }))
    // Two games of the same history and wildly different size, so what the answer costs per card
    // can be read off the difference between them.
    const built = async (id: string, cards: number) => {
      const now = { ...doc(), rows: deck(cards) }
      await send('POST', '/projects', { id, ...now })
      // Each save is made on the one before it, as a designer's are: a dozen cards rewritten in a
      // window that walks the deck, and now and then a symbol added.
      for (let rev = 1; rev < DEEP; rev++) {
        for (let i = (rev * 13) % cards, n = 0; n < 12; n++, i = (i + 1) % cards) now.rows[i]!.fields['antal'] = rev * 100 + n
        if (rev % 7 === 0) now.icons = { [`sym${rev}`]: `asset:${rev}` }
        expect((await send('PUT', `/projects/${id}`, { rev, ...now })).status).toBe(200)
      }
    }
    await built('small', 3)
    await built('big', 308)

    // Every version is read, and read once: the walk keeps the document it just read as the next
    // one's `before` instead of loading each pair, so a history of thirty is thirty reads and not
    // sixty — and never the fifty-nine a naive walk from newest to oldest would make.
    const reads: number[] = []
    const at = run.projects.at.bind(run.projects)
    const spy = vi.spyOn(run.projects, 'at').mockImplementation(async (id, rev) => {
      if (id === 'big') reads.push(rev)
      return at(id, rev)
    })
    let answer: string
    try {
      answer = await (await send('GET', '/projects/big/versions/changes')).text()
    } finally {
      spy.mockRestore()
    }
    expect(reads).toEqual(Array.from({ length: DEEP }, (_, i) => i + 1))

    const changes = JSON.parse(answer) as VersionChange[]
    expect(changes).toHaveLength(DEEP)
    expect(changes.map((c) => c.rev)).toEqual(Array.from({ length: DEEP }, (_, i) => DEEP - i))
    expect(changes[0]).toMatchObject({ changed: 12 })

    // And the answer is the same size for a deck of three hundred and eight cards as for a deck of
    // three: what a row says is counts, so a hundredfold deck is not a hundredfold answer.
    const small = await (await send('GET', '/projects/small/versions/changes')).text()
    expect(answer.length).toBeLessThan(small.length + 64)
    // Not vacuous: the deck behind the big one really is a deck. One of its thirty documents is
    // itself many times the whole thirty-version answer, which is the arithmetic that makes this
    // one request rather than a download of the history.
    const big = await (await send('GET', '/projects/big/versions/30')).text()
    expect(big.length).toBeGreaterThan(10 * answer.length)
  })

  it('keeps someone else out of another account\'s history', async () => {
    await send('POST', '/projects', { id: 'p1', ...doc() })
    expect((await fetch(`${run.http}/projects/p1/versions`)).status).toBe(401)
    expect((await fetch(`${run.http}/projects/p1/versions/1`)).status).toBe(401)
    expect((await fetch(`${run.http}/projects/p1/versions/changes`)).status).toBe(401)
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
