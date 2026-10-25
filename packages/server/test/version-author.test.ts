import postgres from 'postgres'
import { afterAll, describe, expect, it } from 'vitest'
import { MemoryProjectStore, PostgresLogStore } from '../src/index.js'
import type { ProjectDoc, ProjectStore } from '../src/projects.js'
import { template } from './deck.js'
import { twoSeatSetup } from './fixture.js'

// En version vet vem som sparade den (#1225): «Väntar på dig» säger «Kim sparade version 5» om ett
// delat spel, och det kan bara sägas om versionen bär sin författare. `by` är kontot som sparade;
// en version utan `by` är en vars författare inte är känd — en som kom in med en import, en som
// sparades utan konto, och de flesta som sparades innan kolumnen fanns.
//
// Mot minnet och mot Postgres, vars frågor är de lådan svarar med. Postgres-halvan körs bara med
// DATABASE_URL=postgres://... pnpm test.

const url = process.env['DATABASE_URL']
const schema = `test_version_author_${process.pid}_${Date.now()}`
const opened: PostgresLogStore[] = []
afterAll(async () => {
  for (const store of opened) {
    await store.dropSchema()
    await store.close()
  }
})

const stores: [string, () => Promise<ProjectStore>][] = [
  ['minnet', async () => new MemoryProjectStore()],
  ...(url
    ? ([
        [
          'Postgres',
          async () => {
            const store = PostgresLogStore.connect(url, { schema })
            opened.push(store)
            await store.migrate()
            return store.projects()
          },
        ],
      ] as [string, () => Promise<ProjectStore>][])
    : []),
]

const doc = (name: string): ProjectDoc => {
  const { zones, seats, floor } = twoSeatSetup()
  return { name, template, rows: [{ id: 'a', fields: { title: name } }], icons: {}, setup: { zones, seats, floor, deckZone: 'draw' } }
}
let n = 0
const fresh = () => `p-author-${process.pid}-${++n}`

describe.each(stores)('vem som sparade en version, i %s (#1225)', (_, open) => {
  it('är den som skapade spelet för första versionen, och den som sparade för varje version efter', async () => {
    const projects = await open()
    const id = fresh()
    await projects.create(id, doc('Ett'), '7')
    expect((await projects.versions(id))[0]).toMatchObject({ rev: 1, by: '7' })
    await projects.replace(id, 1, doc('Två'), 0, undefined, [], '8')
    await projects.replace(id, 2, doc('Tre'), 0)
    const [three, two, one] = await projects.versions(id)
    expect(two).toMatchObject({ rev: 2, by: '8' })
    // Sparad utan konto: ingen författare att nämna, och ingen gissas fram.
    expect(three!.rev).toBe(3)
    expect(three!.by).toBeUndefined()
    expect(one!.by).toBe('7')
  })

  it('är okänd för ett spel från före konton och för en historik som kom in med en import', async () => {
    const projects = await open()
    const old = fresh()
    await projects.create(old, doc('Gammalt'))
    expect((await projects.versions(old))[0]!.by).toBeUndefined()
    const brought = fresh()
    await projects.restore(brought, [{ rev: 1, at: '2026-01-02T03:04:05.000Z', doc: doc('Ett') }, { rev: 2, at: '2026-02-03T04:05:06.000Z', doc: doc('Två') }], '7')
    // Versionerna sparades någon annanstans, av någon som den här lådan inte känner.
    for (const v of await projects.versions(brought)) expect(v.by).toBeUndefined()
  })
})

// Bakåtfyllnaden (#1225): kolumnen fylls bara där det går att veta. Det går att veta för en version
// som sparades här (den bär `at_seq`, vilket en import aldrig skriver) i ett spel med ägare som
// ingen annan någonsin har kunnat redigera — inget antaget inbjudan som medredigerare. Där har
// ägaren sparat varje version. Allt annat lämnas okänt: första versionen (den kan vara en import),
// ett spel som delats med en medredigerare, även om delningen tagits tillbaka, och ett spel från
// före konton.
describe.skipIf(!url)('bakåtfyllnaden av project_versions.saved_by (#1225)', () => {
  const before = `test_version_author_fill_${process.pid}_${Date.now()}`
  let pg: PostgresLogStore
  afterAll(async () => {
    await pg.dropSchema()
    await pg.close()
  })

  it('ger ägaren de versioner som bara ägaren kan ha sparat, och lämnar resten okända', async () => {
    pg = PostgresLogStore.connect(url!, { schema: before })
    await pg.migrate()
    const projects = pg.projects()
    const ensam = 'p-ensam'
    const delat = 'p-delat'
    const tittat = 'p-tittat'
    const gammalt = 'p-gammalt'
    const importerat = 'p-importerat'
    await projects.create(ensam, doc('Ensam'), '7')
    await projects.replace(ensam, 1, doc('Ensam 2'), 3)
    await projects.replace(ensam, 2, doc('Ensam 3'), 5)
    await projects.create(delat, doc('Delat'), '7')
    await projects.replace(delat, 1, doc('Delat 2'), 2)
    await projects.create(tittat, doc('Tittat'), '7')
    await projects.replace(tittat, 1, doc('Tittat 2'), 2)
    await projects.create(gammalt, doc('Gammalt'))
    await projects.replace(gammalt, 1, doc('Gammalt 2'), 1)
    await projects.restore(importerat, [{ rev: 1, at: '2026-01-02T03:04:05.000Z', doc: doc('Ett') }, { rev: 2, at: '2026-02-03T04:05:06.000Z', doc: doc('Två') }], '7')
    // En medredigerare som tackade ja och sedan togs bort, och en betraktare som är kvar.
    await projects.invite({ tokenHash: 'redigerare', project: delat, email: 'kim@example.com', role: 'editor', expiresAt: '2099-01-01T00:00:00.000Z' })
    await projects.acceptInvite('redigerare', '2026-10-01T00:00:00.000Z')
    await projects.invite({ tokenHash: 'betraktare', project: tittat, email: 'bo@example.com', role: 'viewer', expiresAt: '2099-01-01T00:00:00.000Z' })
    await projects.acceptInvite('betraktare', '2026-10-01T00:00:00.000Z')
    // En inbjudan som aldrig följdes har inte släppt in någon.
    await projects.invite({ tokenHash: 'aldrig', project: ensam, email: 'ingen@example.com', role: 'editor', expiresAt: '2099-01-01T00:00:00.000Z' })

    // Lådan som den stod före kolumnen.
    const sql = postgres(url!, { max: 1, onnotice: () => undefined, connection: { search_path: before } })
    try {
      await sql`alter table project_versions drop column saved_by`
    } finally {
      await sql.end()
    }

    await pg.migrate()
    const by = async (id: string) => Object.fromEntries((await projects.versions(id)).map((v) => [v.rev, v.by ?? null]))
    expect(await by(ensam)).toEqual({ 1: null, 2: '7', 3: '7' })
    expect(await by(delat)).toEqual({ 1: null, 2: null })
    expect(await by(tittat)).toEqual({ 1: null, 2: '7' })
    expect(await by(gammalt)).toEqual({ 1: null, 2: null })
    expect(await by(importerat)).toEqual({ 1: null, 2: null })

    // Att köra migreringen igen ändrar ingenting, och en version sparad efter den bär sin författare.
    await projects.replace(delat, 2, doc('Delat 3'), 4, undefined, [], '9')
    await pg.migrate()
    expect(await by(delat)).toEqual({ 1: null, 2: null, 3: '9' })
    expect(await by(ensam)).toEqual({ 1: null, 2: '7', 3: '7' })
  })
})
