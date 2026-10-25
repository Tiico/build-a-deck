import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MemoryRenderStore, PostgresRenderStore, screenRequest, type RenderStore } from '@byd/render/queue'
import { CURRENT_CLASSIFIER, type ScreeningResult } from '@byd/screening'
import { MemoryAssetStore, MemoryProjectStore, PostgresLogStore } from '../src/index.js'
import type { AssetStore } from '../src/assets.js'
import type { ProjectStore } from '../src/projects.js'
import { addReferenceFromAsset, importReferences, queueAllScreenings, queueScreening, screeningReport } from '../src/screening.js'
import { twoSeatSetup } from './fixture.js'
import { template } from './deck.js'

// The operator's two scripts for screening (F4, #1271, DRIFT §12): `screening run <spel>` queues the
// saved version's pictures, and `screening report <tröskel>` says how many are screened and which
// reach the threshold. Nothing is shown to a designer and nothing is stopped (F4, beslut 10–11).
//
// Against the memory stores and against Postgres, the render queue's included. The Postgres half
// runs only with DATABASE_URL=postgres://... pnpm test.
const url = process.env['DATABASE_URL']
const schema = `test_screening_${process.pid}_${Date.now()}`

type Backend = { projects: ProjectStore; assets: AssetStore; renders: RenderStore; close(): Promise<void> }
const backends: { name: string; skip: boolean; open(): Promise<Backend> }[] = [
  {
    name: 'minnet',
    skip: false,
    open: async () => {
      const assets = new MemoryAssetStore()
      return { projects: new MemoryProjectStore(assets), assets, renders: new MemoryRenderStore(), close: () => Promise.resolve() }
    },
  },
  {
    name: 'Postgres',
    skip: !url,
    open: async () => {
      const store = PostgresLogStore.connect(url!, { schema })
      await store.migrate()
      const renders = PostgresRenderStore.connect(url!, undefined, { schema })
      await renders.migrate()
      return {
        projects: store.projects(),
        assets: store.assets(),
        renders,
        close: async () => {
          await renders.close()
          await store.dropSchema()
          await store.close()
        },
      }
    },
  },
]

const bytes = (text: string) => new TextEncoder().encode(text)
let made = 0

for (const backend of backends) {
  describe.skipIf(backend.skip)(`screeningens skript, i ${backend.name} (#1271)`, () => {
    let db: Backend
    beforeAll(async () => {
      db = await backend.open()
    })
    afterAll(async () => {
      await db.close()
    })

    // A game whose saved version names a picture in a card, a symbol, a typeface and a picture
    // nobody uploaded; every byte is the game's own, so no hash is one another test queued.
    async function game(owner = 'ada') {
      const tag = `${schema}-${++made}`
      const art = await db.assets.put(bytes(`<svg xmlns="http://www.w3.org/2000/svg"><text>${tag} art</text></svg>`), 'image/svg+xml')
      const icon = await db.assets.put(bytes(`<svg xmlns="http://www.w3.org/2000/svg"><text>${tag} icon</text></svg>`), 'image/svg+xml')
      const photo = await db.assets.put(bytes(`${tag} png`), 'image/png')
      const font = await db.assets.put(bytes(`${tag} ttf`), 'font/ttf')
      const gone = '9'.repeat(63) + (made % 10).toString()
      const { zones, seats, floor } = twoSeatSetup()
      const id = `spel-${tag}`
      await db.projects.create(
        id,
        {
          name: 'Skogens herrar',
          template,
          rows: [
            { id: 'a', fields: { title: 'Drake', art: `asset:${art}` } },
            { id: 'b', fields: { title: 'Troll', art: `asset:${photo}` } },
            { id: 'c', fields: { title: 'Borta', art: `asset:${gone}` } },
          ],
          icons: { eld: `asset:${icon}` },
          fonts: { brod: { stack: 'Brod, serif', asset: `asset:${font}` } },
          setup: { zones, seats, floor, deckZone: 'draw' },
        },
        owner,
      )
      return { id, pictures: [art, icon, photo].sort(), font, gone }
    }

    it('köar den sparade versionens bilder, inte typsnitten och inte det som inte finns, i den klassificerare som gäller', async () => {
      const g = await game()
      expect(await queueScreening(db, g.id, CURRENT_CLASSIFIER, 1)).toEqual({ ok: true, game: g.id, rev: 1, classifier: 'vit-nsfw.clip-violence@1', pictures: 3, queued: 3, queuedAlready: 0, cached: 0 })

      // The jobs are the screenings of exactly those pictures: they are what the queue now hands out.
      const claimed: string[] = []
      for (let job = await db.renders.claim(2); job; job = await db.renders.claim(2)) if (job.kind.kind === 'screen') claimed.push(job.kind.asset)
      expect(claimed.sort()).toEqual(g.pictures)
    })

    it('köar inget två gånger, och inget som redan har ett resultat i versionen', async () => {
      const g = await game()
      await queueScreening(db, g.id, CURRENT_CLASSIFIER, 1)
      expect(await queueScreening(db, g.id, CURRENT_CLASSIFIER, 2)).toMatchObject({ queued: 0, queuedAlready: 3, cached: 0 })

      for (let job = await db.renders.claim(3); job; job = await db.renders.claim(3))
        if (job.kind.kind === 'screen') await db.renders.completeScreening(job.hash, { asset: job.kind.asset, classifier: CURRENT_CLASSIFIER, scores: { sexual: 0, violence: 0 }, imageHash: { algorithm: 'pdq-256', bits: '00'.repeat(32), quality: 80 }, screenedAt: 3 })
      expect(await queueScreening(db, g.id, CURRENT_CLASSIFIER, 4)).toMatchObject({ queued: 0, queuedAlready: 0, cached: 3 })
      // Another version of the classifier screens them again.
      expect(await queueScreening(db, g.id, { ...CURRENT_CLASSIFIER, version: '2' }, 5)).toMatchObject({ queued: 3 })
    })

    // Screening happens without any designer noticing (#1271): it is no rendering of theirs.
    it('räknar inte screeningen på spelets ägare', async () => {
      const g = await game('grace')
      await queueScreening(db, g.id, CURRENT_CLASSIFIER, 1)
      expect(await db.renders.rendersBy('grace', 0)).toBe(0)
    })

    it('säger till om spelet inte finns', async () => {
      expect(await queueScreening(db, 'inget-sadant-spel', CURRENT_CLASSIFIER, 1)).toEqual({ ok: false, reason: 'no-such-game' })
    })
  })

  describe.skipIf(backend.skip)(`screeningens rapport, i ${backend.name} (#1271)`, () => {
    let db: Backend
    const ref = { id: 'fake', version: `rapport-${backend.name}-${Date.now()}` }
    const asset = (n: number) => n.toString(16).padStart(64, 'c')
    const result = (n: number, sexual: number, violence: number): ScreeningResult => ({ asset: asset(n), classifier: ref, scores: { sexual, violence }, imageHash: { algorithm: 'dhash-64', bits: '00000000000000ff' }, screenedAt: 100 + n })

    beforeAll(async () => {
      db = await backend.open()
      const results = [result(1, 0.1, 0.95), result(2, 0.85, 0.2), result(3, 0.05, 0.1), result(4, 0.9, 0.92)]
      for (const r of results) await db.renders.enqueue(screenRequest(r.asset, ref, 1))
      await db.renders.enqueue(screenRequest(asset(5), ref, 2))
      for (let job = await db.renders.claim(10); job; job = await db.renders.claim(10)) {
        if (job.kind.kind !== 'screen') continue
        const found = results.find((r) => job && job.kind.kind === 'screen' && r.asset === job.kind.asset)
        if (found) await db.renders.completeScreening(job.hash, found)
        else await db.renders.fail(job.hash, `asset ${job.kind.asset}: the picture could not be drawn: Chromium could not decode it`)
      }
    })
    afterAll(async () => {
      await db.close()
    })

    it('skriver hur många som klassificerats, hur många som misslyckats, och vilka som når tröskeln, högst först', async () => {
      const report = await screeningReport(db.renders, ref, 0.85)
      expect(report.summary).toEqual({ classifier: `fake@${ref.version}`, threshold: 0.85, classified: 4, failed: 1, reached: 3, byCategory: { sexual: 2, violence: 2 }, shareByCategory: { sexual: 0.5, violence: 0.5 }, references: 0, referenced: 0 })
      expect(report.reached.map((r) => [r.asset, r.category, r.score])).toEqual([
        [asset(1), 'violence', 0.95],
        [asset(4), 'violence', 0.92],
        [asset(2), 'sexual', 0.85],
      ])
      expect(report.reached[1]).toMatchObject({ scores: { sexual: 0.9, violence: 0.92 }, imageHash: { algorithm: 'dhash-64', bits: '00000000000000ff' }, screenedAt: 104 })
      expect(report.failed).toEqual([{ asset: asset(5), error: expect.stringContaining(asset(5)) }])
    })

    it('ser bara den klassificerare och version som frågas om', async () => {
      expect((await screeningReport(db.renders, { ...ref, version: 'ingen' }, 0.5)).summary).toMatchObject({ classified: 0, failed: 0, reached: 0 })
    })

    it('vägrar en tröskel som inte är en poäng', async () => {
      for (const bad of [-0.1, 1.5, Number.NaN]) await expect(screeningReport(db.renders, ref, bad)).rejects.toThrow(/between 0 and 1/)
    })
  })

  // The reference list (F4, beslut 9; #1273): what is taken down goes on it by its screening's PDQ
  // hash, hashes from lists others keep are read from a file, and the report finds every screened
  // picture near something on it, as the list stands now.
  describe.skipIf(backend.skip)(`referenslistan, i ${backend.name} (#1273)`, () => {
    let db: Backend
    const ref = { id: 'box', version: `referens-${backend.name}-${Date.now()}` }
    const asset = (n: number) => n.toString(16).padStart(64, 'd')
    const near = (flip: number) => (BigInt(`0x${'5a'.repeat(32)}`) ^ ((1n << BigInt(flip)) - 1n)).toString(16).padStart(64, '0')
    const result = (n: number, bits: string, quality = 90): ScreeningResult => ({ asset: asset(n), classifier: ref, scores: { sexual: 0.01, violence: 0.02 }, imageHash: { algorithm: 'pdq-256', bits, quality }, screenedAt: 10 + n })

    beforeAll(async () => {
      db = await backend.open()
      // 1 is what is taken down; 2 a copy of it saved again; 3 a picture of its own; 4 the copy of
      // something on a list from elsewhere; 5 a flat picture, near everything flat.
      const results = [result(1, near(0)), result(2, near(6)), result(3, 'f0'.repeat(32)), result(4, near(200)), result(5, near(1), 20)]
      for (const r of results) await db.renders.enqueue(screenRequest(r.asset, ref, 1))
      for (let job = await db.renders.claim(10); job; job = await db.renders.claim(10)) {
        const kind = job.kind
        const found = kind.kind === 'screen' ? results.find((r) => r.asset === kind.asset) : undefined
        if (found) await db.renders.completeScreening(job.hash, found)
      }
    })
    afterAll(async () => {
      await db.close()
    })

    it('tar en bild på lådan till listan med dess PDQ-hash, en gång, och bara en som har screenats', async () => {
      expect(await addReferenceFromAsset(db.renders, ref, asset(1), 'borttagen 2026-10-25 efter anmälan', 20)).toEqual({ ok: true, added: true, reference: { imageHash: { algorithm: 'pdq-256', bits: near(0), quality: 90 }, source: 'borttagen 2026-10-25 efter anmälan', addedAt: 20 } })
      expect(await addReferenceFromAsset(db.renders, ref, asset(1), 'igen', 21)).toMatchObject({ ok: true, added: false })
      expect(await addReferenceFromAsset(db.renders, ref, asset(9), 'finns inte', 22)).toEqual({ ok: false, reason: 'not-screened' })
    })

    it('läser PDQ-hashar ur en fil, en rad i taget, och säger vilka rader den inte tog', async () => {
      const file = [JSON.stringify({ bits: near(203), source: 'lista A' }), '', JSON.stringify({ bits: near(203) }), JSON.stringify({ bits: 'inte en hash' }), 'inte json', JSON.stringify({ bits: 'ab'.repeat(32), quality: 70 })].join('\n')
      const imported = await importReferences(db.renders, file, 'filens källa', 30)
      expect(imported).toMatchObject({ added: 2, known: 1 })
      expect(imported.refused.map((r) => r.line)).toEqual([4, 5])
      expect((await db.renders.screeningReferences()).map((r) => r.source)).toEqual(['borttagen 2026-10-25 efter anmälan', 'lista A', 'filens källa'])
    })

    it('säger i rapporten vilka bilder som ligger nära något på listan, närmast först, och inte en bild utan innehåll', async () => {
      const report = await screeningReport(db.renders, ref, 0.9)
      expect(report.summary).toMatchObject({ classified: 5, references: 3, referenced: 3 })
      expect(report.referenced.map((r) => [r.asset, r.source, r.distance])).toEqual([
        [asset(1), 'borttagen 2026-10-25 efter anmälan', 0],
        [asset(4), 'lista A', 3],
        [asset(2), 'borttagen 2026-10-25 efter anmälan', 6],
      ])
    })
  })

  describe.skipIf(backend.skip)(`screening av allt som fanns före, i ${backend.name} (#1273)`, () => {
    let db: Backend
    beforeAll(async () => {
      db = await backend.open()
    })
    afterAll(async () => {
      await db.close()
    })

    it('köar varje bild på lådan en gång, svg med, och inte typsnitten', async () => {
      const ref = { id: 'box', version: `alla-${backend.name}-${Date.now()}` }
      const png = await db.assets.put(bytes(`\x89PNG alla ${made++}`), 'image/png')
      const svg = await db.assets.put(bytes(`<svg xmlns="http://www.w3.org/2000/svg" id="alla-${made++}"/>`), 'image/svg+xml')
      await db.assets.put(bytes(`wOF2 alla ${made++}`), 'font/woff2')
      const first = await queueAllScreenings(db, ref, 1)
      expect(first).toMatchObject({ classifier: `box@${ref.version}`, queued: first.pictures, queuedAlready: 0, cached: 0 })
      expect(await db.assets.pictures()).toEqual(expect.arrayContaining([png, svg]))
      expect((await db.assets.pictures()).length).toBe(first.pictures)
      expect(await queueAllScreenings(db, ref, 2)).toMatchObject({ queued: 0, queuedAlready: first.pictures })
    })
  })
}
