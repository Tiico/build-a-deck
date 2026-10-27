import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryAuthStore, MemoryProjectStore, PostgresLogStore } from '../src/index.js'
import type { ProjectDoc, ProjectStore } from '../src/projects.js'
import { DEFAULT_BOX_TYPE } from '../src/box.js'
import { template } from './deck.js'
import { start, twoSeatSetup, type Running } from './fixture.js'

// Heron i Mina spel visar lådan (#1416, L91) först när designern själv har öppnat den. Att hon har
// gjort det sparas på spelet, inte i dokumentet och inte på kontot: det gäller på alla hennes
// skärmar och för länkbilden (#1417), och det är ingen redigering, så det blir ingen version och
// inget steg att ångra.
//
// Mot minnet och mot Postgres. Postgres-halvan körs bara med DATABASE_URL=postgres://... pnpm test.

const url = process.env['DATABASE_URL']
const schema = `test_hero_box_${process.pid}_${Date.now()}`
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

const doc = (name = 'Skogens herrar', cards = 1): ProjectDoc => {
  const { zones, seats, floor } = twoSeatSetup()
  return { name, template, rows: Array.from({ length: cards }, (_, i) => ({ id: `r${i}`, fields: { title: `Kort ${i}`, antal: 1 } })), icons: {}, setup: { zones, seats, floor, deckZone: 'draw' } }
}
let n = 0
const fresh = () => `p-herobox-${process.pid}-${++n}`

describe.each(stores)('att lådan har öppnats, i %s (#1416)', (_, open) => {
  it('står inte på ett nytt spel, står efter att lådan öppnats, och bara på det spelet', async () => {
    const projects = await open()
    const [a, b] = [fresh(), fresh()]
    await projects.create(a, doc('Ett'), '7')
    await projects.create(b, doc('Två'), '7')
    const flag = async () => Object.fromEntries((await projects.list('7')).filter((p) => p.id === a || p.id === b).map((p) => [p.id, p.boxOpened === true]))
    expect(await flag()).toEqual({ [a]: false, [b]: false })
    expect(await projects.boxOpened(a)).toBe(false)

    expect(await projects.openBox(a)).toBe(true)
    expect(await flag()).toEqual({ [a]: true, [b]: false })
    expect(await projects.boxOpened(a)).toBe(true)
    // En gång räcker; att öppna den igen ändrar ingenting.
    expect(await projects.openBox(a)).toBe(true)
    expect(await projects.boxOpened(a)).toBe(true)
  })

  it('är ingen version: historiken och revisionen står kvar', async () => {
    const projects = await open()
    const id = fresh()
    await projects.create(id, doc(), '7')
    await projects.openBox(id)
    expect((await projects.versions(id)).map((v) => v.rev)).toEqual([1])
    expect((await projects.load(id))?.rev).toBe(1)
    // En sparad version efter tar inte bort den.
    await projects.replace(id, 1, doc('Skogens andar'))
    expect(await projects.boxOpened(id)).toBe(true)
  })

  it('säger nej om ett spel som inte finns', async () => {
    const projects = await open()
    expect(await projects.openBox(fresh())).toBe(false)
    expect(await projects.boxOpened(fresh())).toBe(false)
  })
})

describe('heron och lådan över HTTP (#1416)', () => {
  let run: Running
  let cookie = ''
  let auth: MemoryAuthStore
  const login = async (email: string): Promise<string> => {
    await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
    const link = /\/auth\/verify\?token=\S+/.exec(run.mail.sent.at(-1)?.text ?? '')?.[0] ?? ''
    const res = await fetch(`${run.http}${link}`, { redirect: 'manual' })
    return (res.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
  }
  beforeEach(async () => {
    auth = new MemoryAuthStore()
    run = await start({ auth })
    cookie = await login('ada@example.com')
  })
  afterEach(async () => {
    await run.stop()
  })
  const send = (method: string, path: string, body?: unknown, as = cookie) =>
    fetch(`${run.http}${path}`, { method, headers: { 'content-type': 'application/json', cookie: as }, body: body === undefined ? null : JSON.stringify(body) })
  const cover = async (id: string) => ((await (await send('GET', '/projects')).json()) as { id: string; cover?: boolean }[]).find((p) => p.id === id)?.cover === true

  it('lists the cover only once the designer has opened the box, and on that game only', async () => {
    await send('POST', '/projects', { id: 'p1', ...doc() })
    await send('POST', '/projects', { id: 'p2', ...doc('Polarnatt') })
    expect(await cover('p1')).toBe(false)

    expect((await send('POST', '/projects/p1/box/opened')).status).toBe(204)
    expect(await cover('p1')).toBe(true)
    expect(await cover('p2')).toBe(false)
    // Opening a tab is not a change to the game: no version, nothing in the log to take back.
    expect(((await (await send('GET', '/projects/p1/versions')).json()) as unknown[]).length).toBe(1)
  })

  it('lists the cover of a game whose box is drawn, since drawing it is opening it', async () => {
    // An import or a copy carries the drawn box and not the fact that its tab was opened.
    const front = { base: [{ kind: 'shape', id: 'g', x: 0, y: 0, w: 65, h: 90, shape: 'rect', fill: '#123456' }], variants: {} }
    await send('POST', '/projects', { id: 'p1', ...doc(), box: { type: DEFAULT_BOX_TYPE, faces: { front } } })
    expect(await cover('p1')).toBe(true)
  })

  it('is marked only by whoever may edit the game', async () => {
    await send('POST', '/projects', { id: 'p1', ...doc() })
    expect((await fetch(`${run.http}/projects/p1/box/opened`, { method: 'POST' })).status).toBe(401)
    const kim = await login('kim@example.com')
    expect((await send('POST', '/projects/p1/box/opened', undefined, kim)).status).toBe(403)
    const account = await auth.ensureAccount('kim@example.com')
    await run.projects.share('p1', account.id, 'viewer')
    expect((await send('POST', '/projects/p1/box/opened', undefined, kim)).status).toBe(403)
    expect(await cover('p1')).toBe(false)
    await run.projects.share('p1', account.id, 'editor')
    expect((await send('POST', '/projects/p1/box/opened', undefined, kim)).status).toBe(204)
    expect(await cover('p1')).toBe(true)
    expect((await send('POST', '/projects/nothing/box/opened')).status).toBe(404)
  })

  it("hands over the cover: the box's front and right side, neutral with the game's name until drawn", async () => {
    // A dense deck, so the box is as deep as a real one (108 cards: 65 × 90 × 34,5 mm, L91).
    await send('POST', '/projects', { id: 'p1', ...doc('Skogens herrar', 108) })
    const res = await send('GET', '/projects/p1/cover')
    expect(res.status).toBe(200)
    const got = (await res.json()) as { type: unknown; size: unknown; faces: Record<string, { drawn: boolean; template: { base: { kind: string; bind?: { literal?: string }; fill?: string }[] } }> }
    expect(got.type).toEqual(DEFAULT_BOX_TYPE)
    expect(got.size).toEqual({ width: 65, height: 90, depth: 34.5 })
    expect(Object.keys(got.faces).sort()).toEqual(['front', 'right'])
    for (const face of Object.values(got.faces)) expect(face.drawn).toBe(false)
    expect(got.faces['front']!.template.base.find((el) => el.kind === 'text')?.bind?.literal).toBe('Skogens herrar')
    // The cover is the game's, and answers only whoever may read it.
    expect((await fetch(`${run.http}/projects/p1/cover`)).status).toBe(401)
  })
})
