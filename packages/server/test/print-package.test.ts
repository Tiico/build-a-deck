import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CARD_STANDARD_63x88, STANDARD_TYPES, TypeRegistry, type SetupDef } from '@byd/engine'
import { createFakeProvider, MULTI_STEP_INCHES, SINGLE_ORDER_MM, type FakeConfig, type PreparedOrder } from '@byd/print'
import { printProviderContract } from '@byd/print/contract'
import { MemoryRenderStore, Renderer, runWorker } from '@byd/render'
import { compileCard, type Template } from '@byd/template'
import { decodePng } from '../../../test-support/png.js'
import type { Deck } from '../src/faces.js'
import { printFileJobsOf, printManifestOf, renderedFiles } from '../src/print-files.js'
import { testPrinterConfig } from '../src/print-providers.js'
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
async function drawn(order: PreparedOrder, from: Deck = deck) {
  const renders = new MemoryRenderStore()
  const jobs = printFileJobsOf(from, registry, order, 1)
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

  // A wooden piece is stock the partner packs, as a die is (#1478, beställarens beslut 5 i #1470),
  // and it wears its seat's colour (L11): each seat's meeples are a line of their own, in the
  // colour the table draws the seat in, and a piece of no seat has no colour.
  it('lists each seat\'s meeples as hardware in the seat\'s colour, never as cards', () => {
    const piece = (kind: string, seat: string) => ({ type: { id: `piece.${kind}`, version: 1 }, cardRef: seat, zone: 'table', face: kind === 'meeple' ? 'standing' : 'front' })
    const seated: SetupDef = { ...setup, seats: ['A', 'B'], components: [...setup.components, piece('meeple', 'A'), piece('meeple', 'B'), piece('meeple', 'A'), piece('disc', ''), piece('meeple', 'A')] }
    const manifest = printManifestOf(deck, seated, registry)
    expect(manifest.cards.map((c) => c.cardRef)).toEqual(['drake', 'troll', 'drake'])
    expect(manifest.hardware).toEqual([
      { type: { id: 'die.d6', version: 1 }, count: 1 },
      { type: { id: 'piece.meeple', version: 1 }, count: 3, colour: '#e05a4f' },
      { type: { id: 'piece.meeple', version: 1 }, count: 1, colour: '#3c8ce7' },
      { type: { id: 'piece.disc', version: 1 }, count: 1 },
    ])
  })
})

// The printed parts beyond the card (#1488, beställarens beslut 12 i #1470): a board's side is drawn
// from the board's own template under its name, a marker's sides from the marker's template, and each
// goes to the partner as a file of its own with the bleed the partner asks for. Identical markers are
// one entry per copy, as copies of a card are, and one file per side.
const reaching = (w: number, h: number, reach: number, fill: string): Template['faces'][string] => ({ base: [{ kind: 'shape', id: 'bg', x: -reach, y: -reach, w: w + 2 * reach, h: h + 2 * reach, shape: 'rect', fill }], variants: {} })
const BOARD = { id: 'board.rect610', version: 1 }
const HEX = { id: 'tile.hex.52', version: 1 }
const parts: Deck = {
  ...deck,
  boards: { Kartan: { faces: { front: reaching(610, 457, 4, '#2e6b46') } } },
  templates: { 'marker:guld': { faces: { front: reaching(52, 60.04, 4, '#d99a1f'), back: reaching(52, 60.04, 4, '#3a2a1a') } } },
  drawnWith: { 'marker:guld': 'marker:guld' },
  rows: { ...deck.rows, 'marker:guld': { title: 'Guld' } },
}
const withParts: SetupDef = {
  ...setup,
  components: [
    ...setup.components,
    { type: BOARD, cardRef: 'Kartan', zone: 'table', face: 'front' },
    { type: HEX, cardRef: 'marker:guld', zone: 'table', face: 'back' },
    { type: HEX, cardRef: 'marker:guld', zone: 'table', face: 'back' },
  ],
}

describe('a board and tiles as a print partner is handed them (#1488)', () => {
  it('lists the board and every marker as printed parts, each copy an entry and each side one picture', () => {
    const manifest = printManifestOf(parts, withParts, registry)
    expect(manifest.cards.map((c) => [c.cardRef, c.type.id])).toEqual([
      ['drake', 'card.standard.63x88'],
      ['troll', 'card.standard.63x88'],
      ['drake', 'card.standard.63x88'],
      ['Kartan', 'board.rect610'],
      ['marker:guld', 'tile.hex.52'],
      ['marker:guld', 'tile.hex.52'],
    ])
    expect(Object.keys(manifest.cards[3]!.faces)).toEqual(['front'])
    expect(manifest.cards[4]!.faces).toEqual(manifest.cards[5]!.faces)
  })

  it('draws the board from its own template, in its own size and the partner\'s bleed, and the markers once', () => {
    const order = multiStep().prepare(printManifestOf(parts, withParts, registry))
    const jobs = printFileJobsOf(parts, registry, order, 1)
    const board = jobs.find((j) => j.name === 'Kartan-front.png')!
    const compiled = compileCard({ template: parts.boards!['Kartan']!, type: registry.get(BOARD), row: {}, icons: parts.icons, bleed: 3.175 })['front']!
    expect(board.job.compiled).toEqual({ html: compiled.html, css: compiled.css })
    expect(board.job.kind).toEqual({ kind: 'raster', format: 'png', widthPx: 7280, heightPx: 5473 })
    expect(jobs.filter((j) => j.name.startsWith('marker_guld')).map((j) => j.name)).toEqual(['marker_guld-front.png', 'marker_guld-back.png'])
  })

  // DRIFT §6: the render container's cap is 1 500 MB, and the worker draws one page at a time. The
  // largest raster any partner asks for is the big board at 300 DPI; decoded it is width × height ×
  // 4 bytes, and Chromium holds the page's surface, the screenshot and the PNG being written, about
  // four of it at once. That has to stand well under the cap with the browser's own ~255 MiB.
  it('asks no partner for a board raster the render worker could not hold', () => {
    const CAP_MB = 1500
    const BROWSER_MB = 255
    for (const provider of [multiStep(), singleOrder(), createFakeProvider(testPrinterConfig(STANDARD_TYPES))]) {
      for (const def of STANDARD_TYPES.filter((t) => t.ownFaces)) {
        const req = provider.supports(def) ? provider.requirements(def) : undefined
        if (req?.kind !== 'printed' || req.file.kind !== 'raster') continue
        const mb = (req.file.widthPx * req.file.heightPx * 4 * 4) / 1024 / 1024
        expect(mb + BROWSER_MB, `${provider.id} ${def.id}`).toBeLessThan(CAP_MB)
      }
    }
  })
})

// Testtryckeriet packs what the registry says is stock (#1140, #1478): a die by its kind, and a
// wooden piece by its kind with a part number for each seat colour, since it pretends to stock them.
describe('Testtryckeriet\'s stock (#1478)', () => {
  it('packs a meeple as «meeple», in every seat colour', () => {
    const config = testPrinterConfig(STANDARD_TYPES)
    const stock = (id: string) => config.catalog.find((r) => r.type.id === id)
    expect(stock('die.d6')).toMatchObject({ kind: 'stock', sku: 'd6' })
    const meeple = stock('piece.meeple')
    expect(meeple).toMatchObject({ kind: 'stock', sku: 'meeple' })
    expect(meeple?.kind === 'stock' ? meeple.colours?.slice(0, 2) : null).toEqual([
      { colour: '#e05a4f', sku: 'meeple-red' },
      { colour: '#3c8ce7', sku: 'meeple-blue' },
    ])
    const prepared = createFakeProvider(config).prepare({ cards: [], hardware: [{ type: { id: 'piece.meeple', version: 1 }, count: 5, colour: '#3c8ce7' }] })
    expect(prepared.hardware).toEqual([{ type: { id: 'piece.meeple', version: 1 }, sku: 'meeple-blue', count: 5, colour: '#3c8ce7' }])
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
  // And a game with the big board and two identical markers (#1488): the board's 7 280 × 5 473 px
  // raster is the largest any partner asks for, and the worker draws it inside its cap (DRIFT §6).
  printProviderContract(`${name}, med ett bräde och brickor`, { provider, manifest: printManifestOf(parts, withParts, registry), files: (order) => drawn(order, parts) })
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
  }, 90_000)

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
