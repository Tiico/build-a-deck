import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CARD_STANDARD_63x88, STANDARD_TYPES, TypeRegistry, type SetupDef } from '@byd/engine'
import { createFakeProvider, MULTI_STEP_INCHES, SINGLE_ORDER_MM, type FakeConfig, type PreparedOrder } from '@byd/print'
import { printProviderContract } from '@byd/print/contract'
import { MemoryRenderStore, Renderer, runWorker } from '@byd/render'
import { compileCard, type Template } from '@byd/template'
import { decodePng } from '../../../test-support/png.js'
import type { Deck } from '../src/faces.js'
import { printFileJobsOf, printManifestOf, renderedFiles } from '../src/print-files.js'
import { start, twoSeatSetup, type Running } from './fixture.js'

// Print files after the partner's requirements (#1207): the files a provider's `prepare` names are
// drawn by the one compiler and the one renderer (E2), each in exactly the pixels or millimetres
// the provider's `requirements()` asks for, with the bleed it asks for — never the type's fixed 3 mm.

const registry = new TypeRegistry(STANDARD_TYPES)
const type = { id: CARD_STANDARD_63x88.id, version: CARD_STANDARD_63x88.version }
const multiStep = () => createFakeProvider(MULTI_STEP_INCHES)
const singleOrder = () => createFakeProvider(SINGLE_ORDER_MM)

// A background reaching `reach` mm past the trim on every side, under a frame and a title.
const templateReaching = (reach: number): Template => ({
  faces: {
    front: {
      base: [
        { kind: 'shape', id: 'paper', x: -reach, y: -reach, w: 63 + 2 * reach, h: 88 + 2 * reach, shape: 'rect', fill: '#c0392b' },
        { kind: 'text', id: 'title', x: 6, y: 6, w: 51, h: 10, bind: { field: 'title' }, font: { family: 'sans-serif', sizePt: 14, weight: 700 }, color: '#ffffff' },
      ],
      variants: {},
    },
    back: { base: [{ kind: 'shape', id: 'bg', x: -reach, y: -reach, w: 63 + 2 * reach, h: 88 + 2 * reach, shape: 'rect', fill: '#2f4068' }], variants: {} },
  },
})

const deck: Deck = { template: templateReaching(4), rows: { drake: { title: 'Drake' }, troll: { title: 'Troll' } }, icons: {} }
const setup: SetupDef = {
  seats: [],
  floor: 'table',
  zones: [{ id: 'table', kind: 'area', name: 'Bord', visibility: 'all', geometry: { x: 0, y: 0, w: 100, h: 100, rot: 0 } }],
  components: [
    { type, cardRef: 'drake', zone: 'table', face: 'back' },
    { type, cardRef: 'troll', zone: 'table', face: 'back' },
    { type, cardRef: 'drake', zone: 'table', face: 'back' },
    { type: { id: 'die.d6', version: 1 }, cardRef: 'd6', zone: 'table', face: 'front' },
  ],
}

// Every file of the order drawn through the queue and the worker, as the render container would.
async function drawn(order: PreparedOrder) {
  const renders = new MemoryRenderStore()
  const jobs = printFileJobsOf(deck, registry, order, 1)
  for (const { job } of jobs) await renders.enqueue(job)
  const renderer = await Renderer.launch()
  try {
    await runWorker({ store: renders, renderer, until: 'empty' })
  } finally {
    await renderer.close()
  }
  return renderedFiles(jobs, renders)
}

describe('the game as a print partner is handed it', () => {
  it('lists every physical card with both its sides, and the dice as hardware', () => {
    const manifest = printManifestOf(deck, setup, registry)
    expect(manifest.cards.map((c) => c.cardRef)).toEqual(['drake', 'troll', 'drake'])
    expect(manifest.cards[0]?.faces).toEqual(manifest.cards[2]?.faces)
    expect(manifest.cards[0]?.faces['front']).not.toBe(manifest.cards[1]?.faces['front'])
    // Both backs are the same picture, so they are one file to the partner.
    expect(manifest.cards[0]?.faces['back']).toBe(manifest.cards[1]?.faces['back'])
    expect(manifest.hardware).toEqual([{ type: { id: 'die.d6', version: 1 }, count: 1 }])
  })
})

describe('the file a provider asks for, as the one renderer draws it (#1207)', () => {
  it('compiles each file with the bleed the provider asks for and draws it in its pixels', () => {
    const order = multiStep().prepare(printManifestOf(deck, setup, registry))
    const jobs = printFileJobsOf(deck, registry, order, 7)
    expect(jobs.map((j) => j.name)).toEqual(order.files.map((f) => f.name))
    for (const { name, job } of jobs) {
      const file = order.files.find((f) => f.name === name)!
      // The very compiler the texture and the PDF come out of, with the partner's bleed as its one
      // print option; nothing else has drawn the card.
      const compiled = compileCard({ template: deck.template, type: CARD_STANDARD_63x88, row: deck.rows[file.cardRef]!, icons: deck.icons, bleed: 3.175 })[file.face]!
      expect(job.compiled).toEqual({ html: compiled.html, css: compiled.css })
      expect(job.kind).toEqual({ kind: 'raster', format: 'png', widthPx: 819, heightPx: 1114 })
      expect(job).toMatchObject({ priority: 'print', requestedAt: 7 })
    }
  })

  it('makes one card in two partners\' forms two renderings, and in one form one', () => {
    const manifest = printManifestOf(deck, setup, registry)
    const hashes = (provider: ReturnType<typeof multiStep>) => printFileJobsOf(deck, registry, provider.prepare(manifest), 1).map((j) => j.job.hash)
    expect(hashes(multiStep())).toEqual(hashes(multiStep()))
    const other = new Set(hashes(singleOrder()))
    for (const hash of hashes(multiStep())) expect(other.has(hash)).toBe(false)
    // QPMN's form is a vector PDF of the same page, bleed and all.
    expect(printFileJobsOf(deck, registry, singleOrder().prepare(manifest), 1).every((j) => j.job.kind.kind === 'pdf' && j.job.compiled.html.includes('data-bleed="3.175"'))).toBe(true)
  })

  // The place CMYK will stand (#1207 leaves it open, E2 says an ICC step afterwards): a partner that
  // asks for it is refused out loud rather than sent sRGB in silence.
  it('refuses a colour space it does not make, rather than sending sRGB in its place', () => {
    const cmyk: FakeConfig = { ...MULTI_STEP_INCHES, catalog: MULTI_STEP_INCHES.catalog.map((r) => (r.kind === 'printed' ? { ...r, colorSpace: 'CMYK' as const } : r)) }
    const order = createFakeProvider(cmyk).prepare(printManifestOf(deck, setup, registry))
    expect(() => printFileJobsOf(deck, registry, order, 1)).toThrow(/CMYK/)
  })

  it('refuses a trim that is not the type\'s, rather than scaling the card to it', () => {
    const tgc: FakeConfig = { ...MULTI_STEP_INCHES, catalog: MULTI_STEP_INCHES.catalog.map((r) => (r.kind === 'printed' ? { ...r, trim: { widthMm: 63.5, heightMm: 88.9 }, file: { kind: 'raster' as const, format: 'png' as const, dpi: 300, widthPx: 825, heightPx: 1125 } } : r)) }
    const order = createFakeProvider(tgc).prepare(printManifestOf(deck, setup, registry))
    expect(() => printFileJobsOf(deck, registry, order, 1)).toThrow(/63\.5/)
  })

  it('draws the partner\'s raster with the background all the way out to the edge of its bleed', async () => {
    const order = multiStep().prepare(printManifestOf(deck, setup, registry))
    const files = await drawn(order)
    const front = order.files.find((f) => f.face === 'front')!
    const pic = decodePng(await files.bytes(front.name))
    expect({ w: pic.width, h: pic.height }).toEqual({ w: 819, h: 1114 })
    // The red reaches the outermost pixel on every side: the bleed is paint, not paper.
    for (const [x, y] of [[0, 557], [818, 557], [409, 0], [409, 1113]] as const) expect(pic.at(x, y), `${x},${y}`).toMatchObject({ r: 192, g: 57, b: 43 })
  }, 60_000)
})

// The suite every adapter is held to (#1206), now with the files the platform actually draws for
// it: each one measured off its own bytes against the requirements it was prepared under.
for (const [name, provider] of [
  ['fake-provider i flerstegsform, med de riktiga filerna', multiStep],
  ['fake-provider i en order, med de riktiga filerna', singleOrder],
] as const) {
  printProviderContract(name, { provider, manifest: printManifestOf(deck, setup, registry), files: drawn })
}

// The print package over HTTP (#1207, read by #1208): the order a provider would get for the game
// as it stands, the files it names drawn in its requirements, and the rulebook beside them.
describe('the print package of a game', () => {
  let run: Running
  let cookie = ''
  beforeEach(async () => {
    run = await start({ printProviders: [multiStep(), singleOrder()] })
    await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'ada@example.com' }) })
    const link = /\/auth\/verify\?token=\S+/.exec(run.mail.sent.at(-1)?.text ?? '')?.[0] ?? ''
    cookie = ((await fetch(`${run.http}${link}`, { redirect: 'manual' })).headers.get('set-cookie') ?? '').split(';')[0] ?? ''
  })
  afterEach(async () => {
    await run.stop()
  })
  const call = (method: string, path: string, body?: unknown) => fetch(`${run.http}${path}`, { method, headers: { 'content-type': 'application/json', cookie }, body: body === undefined ? null : JSON.stringify(body) })
  const game = (reach: number) => {
    const { zones, seats, floor } = twoSeatSetup()
    return {
      name: 'Skogens herrar',
      template: templateReaching(reach),
      rows: [
        { id: 'drake', fields: { title: 'Drake', antal: 2 } },
        { id: 'troll', fields: { title: 'Troll', antal: 1 } },
      ],
      icons: {},
      rules: { title: 'Skogens herrar', blocks: [{ kind: 'text', id: 't1', text: 'Dra ett kort.' }] },
      setup: { zones, seats, floor, deckZone: 'draw' },
    }
  }
  type Package = { provider: { id: string }; order: PreparedOrder; files: { name: string; state: string }[]; rulebook: { name: string; state: string } | null; errors: { code: string; values: Record<string, unknown> }[]; total: number; done: number }

  it('prepares the provider\'s order, draws its files in its pixels, and hands each one over', async () => {
    await call('POST', '/projects', { id: 'p1', ...game(4) })
    const first = (await (await call('GET', '/projects/p1/print-package?provider=fake-multi-step')).json()) as Package
    expect(first.provider.id).toBe('fake-multi-step')
    expect(first.errors).toEqual([])
    expect(first.order.cards.map((c) => c.cardRef).sort()).toEqual(['drake', 'drake', 'troll'])
    expect(first.files.map((f) => f.name)).toEqual(first.order.files.map((f) => f.name))
    expect(first.rulebook?.name).toBe('regelhafte.pdf')
    expect(first.done).toBe(0)
    // Every file asked for is borne by the game's owner, as the export's are (#1197, A2).
    const owner = (await run.projects.load('p1'))?.owner ?? ''
    expect(await run.renders.rendersBy(owner, 0)).toBe(first.total)
    // A file that is not drawn yet says so rather than handing over nothing.
    expect((await call('GET', `/projects/p1/print-package/files/${first.files[0]!.name}?provider=fake-multi-step`)).status).toBe(202)

    await run.renderAll()
    const ready = (await (await call('GET', '/projects/p1/print-package?provider=fake-multi-step')).json()) as Package
    expect(ready.done).toBe(ready.total)
    const front = ready.order.files.find((f) => f.face === 'front')!
    const res = await call('GET', `/projects/p1/print-package/files/${front.name}?provider=fake-multi-step`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    const pic = decodePng(new Uint8Array(await res.arrayBuffer()))
    expect({ w: pic.width, h: pic.height }).toEqual({ w: 819, h: 1114 })
    expect(pic.at(0, 557)).toMatchObject({ r: 192, g: 57, b: 43 })
    const book = await call('GET', '/projects/p1/print-package/files/regelhafte.pdf?provider=fake-multi-step')
    expect(book.headers.get('content-type')).toBe('application/pdf')
    expect((await call('GET', '/projects/p1/print-package/files/nothing.png?provider=fake-multi-step')).status).toBe(404)
  }, 120_000)

  // A background that reaches the type's 3 mm reaches the bleed where no partner is asked, and
  // falls short for a partner that wants an eighth of an inch (E5, #1207): its card files are left
  // out, as the export leaves them out (G5, #1208), and the finding says how far it had to reach.
  it('holds the cards to the bleed of the provider asked, so 3 mm is not enough for 3,175', async () => {
    await call('POST', '/projects', { id: 'p1', ...game(3) })
    const pkg = (await (await call('GET', '/projects/p1/print-package?provider=fake-multi-step')).json()) as Package
    expect(pkg.errors.map((e) => e.code)).toContain('short-of-bleed')
    expect(pkg.errors.find((e) => e.code === 'short-of-bleed')?.values).toEqual({ bleedMm: 3.175 })
    expect(pkg.files).toEqual([])
    expect(pkg.rulebook?.name).toBe('regelhafte.pdf')
    // The order is still prepared, so what would be sent can be shown and why it is held back.
    expect(pkg.order.files.length).toBeGreaterThan(0)
  })

  it('says so for a provider it does not know', async () => {
    await call('POST', '/projects', { id: 'p1', ...game(4) })
    expect((await call('GET', '/projects/p1/print-package?provider=nobody')).status).toBe(404)
    expect((await call('GET', '/projects/p1/print-package')).status).toBe(404)
  })
})
