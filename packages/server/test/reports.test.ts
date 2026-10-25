import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import { MemoryObjectStore, MemoryRenderStore, PostgresRenderStore, type RenderStore } from '@byd/render'
import { MemoryAssetStore, MemoryAuthStore, MemoryLogStore, MemoryProjectStore, MemorySurveyStore, PostgresLogStore, type AuthStore, type LogStore, type SurveyStore } from '../src/index.js'
import { assetHash, type AssetStore } from '../src/assets.js'
import type { ProjectStore } from '../src/projects.js'
import { ProjectExport } from '../src/export.js'
import { MemoryReportStore, withoutBlocked, type ReportStore } from '../src/reports.js'
import { runReport, type ReportStores } from '../src/report-cli.js'
import { WireClient } from './client.js'
import { template } from './deck.js'
import { registerRoom, start, twoSeatSetup, type Running } from './fixture.js'

// Reports and blocks (#1274, F4 beslut 12). A report is kept, numbered and receipted; the operator
// blocks a picture by its hash with the script; and from then on no door hands it out — `/assets`, the
// motifs, an upload of the same bytes, a new table, a standing table, the render queue and the export —
// while the owner hears why and nobody else hears anything: a guest's raw frames never say «blocked».
// The same test against the memory stores and against Postgres, whose half runs only with DATABASE_URL
// and has the operator's script on a connection of its own, as on the box.
const url = process.env['DATABASE_URL']
const schema = `test_reports_${process.pid}_${Date.now()}`
const CONTACT = 'hej@deckster.test'

type Backend = { store: LogStore; surveys: SurveyStore; projects: ProjectStore; auth: AuthStore; assets: AssetStore; renders: RenderStore; reports: ReportStore; objects: MemoryObjectStore; script(run: Running): ReportStores; close(): Promise<void> }
const backends: { name: string; skip: boolean; open(): Promise<Backend> }[] = [
  {
    name: 'memory',
    skip: false,
    open: async () => {
      const objects = new MemoryObjectStore()
      const assets = new MemoryAssetStore(objects)
      const projects = new MemoryProjectStore(assets)
      const auth = new MemoryAuthStore()
      const renders = new MemoryRenderStore(objects)
      const reports = new MemoryReportStore()
      return { store: new MemoryLogStore(), surveys: new MemorySurveyStore(), projects, auth, assets, renders, reports, objects, script: (run) => ({ reports, projects, auth, assets, renders, mailer: run.mail, origin: 'http://test.local', contact: CONTACT }), close: () => Promise.resolve() }
    },
  },
  {
    name: 'Postgres',
    skip: !url,
    open: async () => {
      // The bucket as R2 has it on the box: every picture's bytes there, and Postgres knows they exist.
      const objects = new MemoryObjectStore()
      const store = PostgresLogStore.connect(url!, { schema })
      await store.migrate()
      const renders = PostgresRenderStore.connect(url!, objects, { schema })
      await renders.migrate()
      // The operator's script is another process with its own connection (DRIFT §10): the app hears of
      // a block only through Postgres.
      const script = PostgresLogStore.connect(url!, { schema })
      const scriptRenders = PostgresRenderStore.connect(url!, objects, { schema })
      const reports = store.reports()
      return {
        store,
        surveys: store.surveys(),
        projects: store.projects(),
        auth: store.auth(),
        assets: store.assets(objects),
        renders,
        reports,
        objects,
        script: (run) => ({ reports: script.reports(), projects: script.projects(), auth: script.auth(), assets: script.assets(objects), renders: scriptRenders, mailer: run.mail, origin: 'http://test.local', contact: CONTACT }),
        close: async () => {
          await scriptRenders.close()
          await script.close()
          await renders.close()
          await store.dropSchema()
          await store.close()
        },
      }
    },
  },
]

// A picture of its own per test, so a block in one never touches another.
let n = 0
const picture = () => new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0x12, 0x74, ++n, process.pid % 256])
const game = (art: string) => {
  const { zones, seats, floor } = twoSeatSetup()
  return {
    name: 'Skogens råd',
    template: { faces: { ...template.faces, front: { ...template.faces['front']!, base: [...template.faces['front']!.base, { kind: 'image' as const, id: 'art', x: 4, y: 16, w: 55, h: 36, bind: { field: 'art' } }] } } },
    rows: [
      { id: 'dragon', fields: { title: 'Skogsvaktaren', art: `asset:${art}`, antal: 3 } },
      { id: 'knight', fields: { title: 'Gläntan', antal: 1 } },
    ],
    icons: {},
    setup: { zones, seats, floor, deckZone: 'draw' },
  }
}
async function eventually(check: () => Promise<void>, ms = 5000): Promise<void> {
  const until = Date.now() + ms
  for (;;) {
    try {
      return await check()
    } catch (e) {
      if (Date.now() > until) throw e
      await new Promise((r) => setTimeout(r, 25))
    }
  }
}
// What can never be said to anyone but the owner and the co-editors: the block itself.
const SAYS_BLOCKED = /block|spärr|sparr|report|anmäl/i

for (const backend of backends) {
  describe.skipIf(backend.skip)(`reports and blocks, in ${backend.name} (#1274)`, () => {
    let db: Backend
    let run: Running
    beforeAll(async () => {
      db = await backend.open()
      run = await start({ store: db.store, surveys: db.surveys, projects: db.projects, auth: db.auth, assets: db.assets, renders: db.renders, reports: db.reports, objects: db.objects, contact: CONTACT })
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
    const upload = (cookie: string, bytes: Uint8Array) => fetch(`${run.http}/assets`, { method: 'POST', headers: { 'content-type': 'image/png', cookie }, body: Buffer.from(bytes) })
    const script = async (...args: string[]) => {
      const out: string[] = []
      const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
      try {
        const code = await runReport(args, db.script(run), { out: (l) => out.push(l), err: (l) => out.push(l) })
        return { code, out: out.join('\n') }
      } finally {
        log.mockRestore()
      }
    }

    // An owner with a game whose dragon card carries the picture, a table started from it and a guest
    // sitting at it.
    async function played(tag: string) {
      const email = `agare-${tag}-${backend.name.toLowerCase()}@example.com`
      const cookie = await login(email)
      const owner = as(cookie)
      const bytes = picture()
      const got = await upload(cookie, bytes)
      expect(got.status).toBe(201)
      const art = ((await got.json()) as { hash: string }).hash
      const project = `rep-${tag}-${backend.name}-${process.pid}`
      expect((await owner('POST', '/projects', { id: project, ...game(art) })).status).toBe(201)
      const table = (await (await owner('POST', `/projects/${project}/sessions`, {})).json()) as { id: string; code: string; hostKey: string }
      registerRoom(table.id, table)
      const token = await run.admit(table.id, 'A', 'Ada')
      const guest = await WireClient.connect(run.base, table.id, 'A', undefined, { token })
      // She takes the seat and the whole draw pile, so the dragon's face is in her hand on her wire.
      expect((await guest.send('A', { v: 'seat.claim', seat: 'A', name: 'Ada' })).t).toBe('ack')
      expect((await guest.send('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 4 })).t).toBe('ack')
      const actor = (await run.host.get(table.id))!
      const front = () => actor.faceHashes()['dragon']?.['front'] ?? ''
      return { email, cookie, owner, bytes, art, project, table, guest, actor, front }
    }

    it('keeps a report, numbers it, sends the receipt with the report repeated, and tells Kontakt', async () => {
      const anyone = as(null)
      const bad = await anyone('POST', '/reports', { what: 'Bilden', where: '', why: 'Min', goodFaith: false })
      expect(bad.status).toBe(400)
      expect(((await bad.json()) as { fields: string[] }).fields.sort()).toEqual(['goodFaith', 'where'])
      const sent = run.mail.sent.length
      const res = await anyone('POST', '/reports', { what: 'Bilden på <Skogsvaktaren>', where: 'Bord 78R466, Skogens råd', why: 'Min målning.', name: 'Mira Lind', email: 'mira@example.com', goodFaith: true })
      expect(res.status).toBe(201)
      const { id } = (await res.json()) as { id: string }
      expect(id).toMatch(/^A-\d{4}$/)
      const mails = run.mail.sent.slice(sent)
      const receipt = mails.find((m) => m.to === 'mira@example.com')!
      expect(receipt.subject).toContain(id)
      // What she wrote, as text: in the text part as it is, and escaped in the bands.
      expect(receipt.text).toContain('Bilden på <Skogsvaktaren>')
      expect(receipt.html).toContain('Bilden på &lt;Skogsvaktaren&gt;')
      expect(receipt.html).not.toContain('<Skogsvaktaren>')
      expect(receipt.text).toMatch(/två arbetsdagar/)
      // The button leads to section 11, which says how a report is handled, and not to the top (#1361).
      expect(receipt.text).toContain('/villkor#villkor-11')
      expect(mails.find((m) => m.to === CONTACT)?.text).toContain(`report show ${id}`)
      // Without an address there is nobody to receipt, and the report is kept all the same.
      const quiet = run.mail.sent.length
      const anonymous = await anyone('POST', '/reports', { what: 'Bilden', where: 'Ett bord', why: 'Den rör barn.', goodFaith: true })
      expect(anonymous.status).toBe(201)
      expect(run.mail.sent.slice(quiet).map((m) => m.to)).toEqual([CONTACT])
      expect((await script('show', id)).out).toContain('Mira Lind')
    })

    it('blocks a picture by its hash: no door hands it out, a standing table draws it empty, and only the owner is told', async () => {
      const t = await played('block')
      const before = t.front()
      expect(before).not.toBe('')
      await eventually(async () => expect(t.guest.frames.join('\n')).toContain(before))
      expect((await fetch(`${run.http}/assets/${t.art}`)).status).toBe(200)
      // The render queue has the dragon's face under its hash.
      expect(await run.renders.status(before)).not.toBeNull()
      const sent = run.mail.sent.length

      const done = await script('block', t.art, 'rights')
      expect(done.code).toBe(0)
      expect(JSON.parse(done.out)).toMatchObject({ hash: t.art, games: 1, owners: 1 })

      // Every door says what it says about a hash nobody ever uploaded.
      for (const path of [`/assets/${t.art}`, `/assets/${t.art}/bytes`]) expect((await fetch(`${run.http}${path}`)).status).toBe(404)
      expect(await (await fetch(`${run.http}/assets/motifs?of=${t.art}`)).json()).toEqual({})
      expect((await upload(t.cookie, t.bytes)).status).toBe(451)
      // The standing table deals its deck again with the picture empty, and the guest is patched to it.
      await eventually(async () => expect(t.front()).not.toBe(before))
      await eventually(async () => expect(t.guest.frames.join('\n')).toContain(t.front()))
      // What was drawn from the picture is gone from the queue, under its old hash.
      expect(await run.renders.status(before)).toBeNull()
      expect((await fetch(`${run.http}/faces/${before}`)).status).toBe(404)
      // A new table is dealt the same empty face.
      const fresh = (await (await t.owner('POST', `/projects/${t.project}/sessions`, {})).json()) as { id: string }
      expect((await run.host.get(fresh.id))!.faceHashes()['dragon']?.['front']).toBe(t.front())

      // The owner is told why and how to object; nothing on the guest's wire says a word of it.
      const mail = run.mail.sent.slice(sent).find((m) => m.to === t.email)!
      expect(mail.subject).toBe('En bild i Skogens råd är spärrad')
      expect(mail.text).toContain('Skogsvaktaren')
      expect(mail.text).toMatch(/Svara på det här mejlet/)
      expect(mail.text).not.toMatch(/inte fattade beslutet/)
      const wire = t.guest.frames.join('\n')
      expect(wire).not.toMatch(SAYS_BLOCKED)
      expect(wire).not.toContain(t.art)
      // The owner and the co-editors are the ones who may ask; a guest and a stranger may not.
      const blocked = await t.owner('GET', `/projects/${t.project}/blocked`)
      expect(await blocked.json()).toEqual({ blocked: [{ hash: t.art, reason: 'rights', at: expect.any(String) }] })
      expect((await as(null)('GET', `/projects/${t.project}/blocked`)).status).toBe(401)
      expect((await as(await login(`annan-${backend.name}@example.com`))('GET', `/projects/${t.project}/blocked`)).status).toBe(403)
      await t.guest.close()
    })

    it('says in the export that a picture is blocked, and leaves it out of the zip', async () => {
      const t = await played('export')
      await t.guest.close()
      await script('block', t.art, 'rights')
      expect((await t.owner('POST', `/projects/${t.project}/export`)).status).toBe(202)
      await run.renderAll()
      const res = await t.owner('GET', `/projects/${t.project}/export?lang=sv`)
      expect(res.status).toBe(200)
      const files = unzipSync(new Uint8Array(await res.arrayBuffer()))
      const manifest = ProjectExport.parse(JSON.parse(strFromU8(files['spel.json']!)))
      expect(manifest.blocked).toEqual([{ hash: t.art, since: expect.any(String) }])
      expect(manifest.absent).toEqual([])
      expect(manifest.assets.map((a) => a.hash)).not.toContain(t.art)
      expect(Object.keys(files).filter((f) => f.includes(t.art))).toEqual([])
      expect(strFromU8(files['LASMIG.md']!)).toMatch(/spärrad efter en anmälan/)
    }, 60_000)

    it('purges an illegal picture’s bytes for good, and lets a picture that was wrongly blocked come back', async () => {
      const wrong = await played('unblock')
      const before = wrong.front()
      await script('block', wrong.art, 'rights')
      await eventually(async () => expect(wrong.front()).not.toBe(before))
      expect(JSON.parse((await script('unblock', wrong.art)).out)).toMatchObject({ unblocked: true })
      await eventually(async () => expect(wrong.front()).toBe(before))
      expect((await fetch(`${run.http}/assets/${wrong.art}`)).status).toBe(200)
      await wrong.guest.close()

      const bad = await played('purge')
      await bad.guest.close()
      expect((await script('purge', bad.art)).code).toBe(1)
      await script('block', bad.art, 'illegal')
      expect(await db.objects.get(`assets/${bad.art}`)).not.toBeNull()
      expect(JSON.parse((await script('purge', bad.art)).out)).toMatchObject({ purged: true })
      expect(await db.objects.get(`assets/${bad.art}`)).toBeNull()
      expect(await db.assets.get(bad.art)).toBeNull()
      // The block outlives the bytes: the same picture cannot be uploaded again, nor let go.
      expect((await upload(bad.cookie, bad.bytes)).status).toBe(451)
      expect((await script('unblock', bad.art)).code).toBe(1)
    })

    it('mails the decision to whoever reported, and lists the reports', async () => {
      const res = await as(null)('POST', '/reports', { what: 'Bilden', where: 'Skogens råd', why: 'Min.', name: 'Mira', email: 'beslut@example.com', goodFaith: true, lang: 'en' })
      const { id } = (await res.json()) as { id: string }
      const sent = run.mail.sent.length
      expect(JSON.parse((await script('decide', id, 'held')).out)).toMatchObject({ id, decision: 'held', mailed: true })
      const mail = run.mail.sent.slice(sent).find((m) => m.to === 'beslut@example.com')!
      expect(mail.subject).toBe(`Your report ${id}: the report held`)
      expect(mail.text + (mail.html ?? '')).toContain('/villkor#villkor-11')
      expect((await script('list')).out).toContain(`"id":"${id}","at"`)
      expect((await script('decide', 'A-9999', 'held')).code).toBe(1)
      expect((await script('block', 'nope', 'rights')).code).toBe(2)
    })
  })
}

describe('a deck without its blocked pictures (#1274)', () => {
  it('empties every reference and every measurement keyed by one, and hands an untouched deck back as it was', () => {
    const h = assetHash(new Uint8Array([1]))
    const other = assetHash(new Uint8Array([2]))
    const deck = { template, rows: { a: { art: `asset:${h}`, keep: `asset:${other}` } }, icons: { sol: `asset:${h}` }, motifs: { [`asset:${h}`]: { w: 1, h: 1, trim: { left: 0, top: 0, right: 0, bottom: 0 } } } }
    expect(withoutBlocked(deck, new Set([h]))).toEqual({ template, rows: { a: { art: '', keep: `asset:${other}` } }, icons: { sol: '' }, motifs: {} })
    expect(withoutBlocked(deck, new Set([assetHash(new Uint8Array([3]))]))).toBe(deck)
  })
})
