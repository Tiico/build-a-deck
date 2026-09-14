import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryObjectStore } from '@byd/render'
import { MemoryAssetStore, assetHash, resolveAssets, resolveFonts, resolveIcons } from '../src/assets.js'
import { start, twoSeatSetup, type Running } from './fixture.js'
import { template } from './deck.js'

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])

describe('the asset store (E1, DRIFT §4): the project\'s images, once each, by content', () => {
  it('stores bytes under their hash with their type, gives the same hash for the same bytes, and links only when the object store can', async () => {
    const objects = new MemoryObjectStore()
    const store = new MemoryAssetStore(objects)
    const hash = await store.put(PNG, 'image/png')
    expect(hash).toBe(assetHash(PNG))
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(await store.put(PNG, 'image/png')).toBe(hash)
    expect(await store.get(hash)).toEqual({ bytes: PNG, contentType: 'image/png' })
    expect(await store.get('0'.repeat(64))).toBeNull()
    // The bytes live in the object store under assets/<hash>, as renders live under renders/.
    expect(await objects.get(`assets/${hash}`)).toEqual(PNG)
    expect(await store.link(hash, 60)).toBeNull()
  })

  it('resolves a row\'s asset references to data URLs for the compiler, and leaves everything else alone', async () => {
    const store = new MemoryAssetStore()
    const hash = await store.put(PNG, 'image/png')
    const { rows } = await resolveAssets([{ id: 'drake', fields: { title: 'Drake', art: `asset:${hash}`, cost: 5 } }, { id: 'torn', fields: { title: 'Torn', art: 'asset:' + '0'.repeat(64) } }], store)
    expect(rows[0]?.fields).toEqual({ title: 'Drake', art: `data:image/png;base64,${Buffer.from(PNG).toString('base64')}`, cost: 5 })
    // An asset that is gone leaves the field empty rather than a broken reference on the card.
    expect(rows[1]?.fields['art']).toBe('')
  })
})

describe('assets over HTTP', () => {
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

  it('takes an image from a logged-in creator, names it by hash, and serves it back immutable to anyone who knows the hash', async () => {
    const anon = await fetch(`${run.http}/assets`, { method: 'POST', headers: { 'content-type': 'image/png' }, body: PNG })
    expect(anon.status).toBe(401)
    const res = await fetch(`${run.http}/assets`, { method: 'POST', headers: { 'content-type': 'image/png', cookie }, body: PNG })
    expect(res.status).toBe(201)
    const { hash } = (await res.json()) as { hash: string }
    expect(hash).toBe(assetHash(PNG))

    const got = await fetch(`${run.http}/assets/${hash}`)
    expect(got.status).toBe(200)
    expect(got.headers.get('content-type')).toBe('image/png')
    expect(got.headers.get('cache-control')).toContain('immutable')
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(PNG)
    expect((await fetch(`${run.http}/assets/${'0'.repeat(64)}`)).status).toBe(404)
    // Only images, and not too big.
    expect((await fetch(`${run.http}/assets`, { method: 'POST', headers: { 'content-type': 'text/html', cookie }, body: '<b>' })).status).toBe(415)
  })

  it('takes a font file as an asset too, so a version can pin the type it was drawn in (B3)', async () => {
    const woff2 = new Uint8Array([119, 79, 70, 50, 0, 1, 0, 0])
    const res = await fetch(`${run.http}/assets`, { method: 'POST', headers: { 'content-type': 'font/woff2', cookie }, body: woff2 })
    expect(res.status).toBe(201)
    const { hash } = (await res.json()) as { hash: string }
    const got = await fetch(`${run.http}/assets/${hash}`)
    expect(got.headers.get('content-type')).toBe('font/woff2')
    // The formats Chromium can draw from a @font-face, and nothing else.
    for (const type of ['font/woff', 'font/ttf', 'font/otf']) {
      expect((await fetch(`${run.http}/assets`, { method: 'POST', headers: { 'content-type': type, cookie }, body: woff2 })).status).toBe(201)
    }
    expect((await fetch(`${run.http}/assets`, { method: 'POST', headers: { 'content-type': 'application/x-font-eot', cookie }, body: woff2 })).status).toBe(415)
  })

  it('compiles a card whose row points at an asset with the image inlined, so the render worker needs nothing but the page', async () => {
    const up = await fetch(`${run.http}/assets`, { method: 'POST', headers: { 'content-type': 'image/png', cookie }, body: PNG })
    const { hash } = (await up.json()) as { hash: string }
    const { zones, seats, floor } = twoSeatSetup()
    const doc = {
      name: 'Skogens herrar',
      template: { faces: { ...template.faces, front: { base: [...template.faces['front']!.base, { kind: 'image', id: 'art', x: 4, y: 4, w: 55, h: 36, bind: { field: 'art' } }], variants: {} } } },
      rows: [{ id: 'dragon', fields: { title: 'Drake', art: `asset:${hash}`, antal: 1 } }],
      icons: {},
      setup: { zones, seats, floor, deckZone: 'draw' },
    }
    const created = await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ id: 'p1', ...doc }) })
    expect(created.status).toBe(201)
    const started = await fetch(`${run.http}/projects/p1/sessions`, { method: 'POST', headers: { cookie } })
    expect(started.status).toBe(201)
    const { id } = (await started.json()) as { id: string }
    const session = await run.store.loadSession(id)
    expect(session?.deck?.rows['dragon']?.['art']).toBe(`data:image/png;base64,${Buffer.from(PNG).toString('base64')}`)
  })
})

describe('symbols in a project (E4): the icon set is assets too, and the licence follows', () => {
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

  const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')

  it('resolves an icon set that points at assets, so a compiled card carries its symbols', async () => {
    const store = new MemoryAssetStore()
    const hash = await store.put(SVG, 'image/svg+xml')
    const icons = await resolveIcons({ 'sköld': `asset:${hash}`, 'egen': 'https://example.test/x.svg' }, store)
    expect(icons['sköld']).toBe(`data:image/svg+xml;base64,${Buffer.from(SVG).toString('base64')}`)
    // Anything that is not an asset reference is left as it stands.
    expect(icons['egen']).toBe('https://example.test/x.svg')
  })

  it('keeps the credits with the project and hands them to the print export, so the licences reach the printer', async () => {
    const up = await fetch(`${run.http}/assets`, { method: 'POST', headers: { 'content-type': 'image/svg+xml', cookie }, body: SVG })
    const { hash } = (await up.json()) as { hash: string }
    const { zones, seats, floor } = twoSeatSetup()
    const doc = {
      name: 'Skogens herrar',
      template,
      rows: [{ id: 'dragon', fields: { title: 'Drake', body: 'Sköld {sköld}.', antal: 1 } }],
      icons: { 'sköld': `asset:${hash}` },
      credits: { 'sköld': { licence: 'CC0-1.0', by: 'build-your-deck', source: 'skold' } },
      fonts: { Rubrik: { stack: '"Rubrik", Georgia, serif', asset: 'asset:' + '0'.repeat(64), licence: { licence: 'OFL-1.1', by: 'Typverket', source: 'rubrik.woff2' } } },
      setup: { zones, seats, floor, deckZone: 'draw' },
    }
    const created = await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ id: 'p1', ...doc }) })
    expect(created.status).toBe(201)
    const stored = await run.projects.load('p1')
    expect(stored?.credits).toEqual(doc.credits)

    const printed = await fetch(`${run.http}/projects/p1/print`, { method: 'POST', headers: { cookie } })
    expect(printed.status).toBe(202)
    const body = (await printed.json()) as { credits: { name: string; licence: string; by: string }[] }
    // A typeface is borrowed under a licence exactly as a symbol is, so it travels with the
    // print order too (B3, E4).
    expect(body.credits).toEqual([
      { name: 'sköld', licence: 'CC0-1.0', by: 'build-your-deck', source: 'skold' },
      { name: 'Rubrik', licence: 'OFL-1.1', by: 'Typverket', source: 'rubrik.woff2' },
    ])
  })
})

describe('the fonts a version is pinned to (B3)', () => {
  it('resolves a project font that carries a file, and leaves a stack alone', async () => {
    const store = new MemoryAssetStore()
    const bytes = new Uint8Array([119, 79, 70, 50])
    const hash = await store.put(bytes, 'font/woff2')
    const fonts = await resolveFonts(
      {
        Rubrik: { stack: '"Rubrik", Georgia, serif', asset: `asset:${hash}` },
        'Brödtext': { stack: 'Georgia, serif' },
      },
      store,
    )
    expect(fonts['Rubrik']).toEqual({ stack: '"Rubrik", Georgia, serif', src: `data:font/woff2;base64,${Buffer.from(bytes).toString('base64')}` })
    expect(fonts['Brödtext']).toEqual({ stack: 'Georgia, serif' })
  })
})

// What is drawn inside a picture (E1). The air a file carries around its motif is a property of
// the bytes, so it is measured once per hash and kept beside the type and the size — and the
// compiler is then handed it keyed by exactly the URL the rows carry, so the two cannot disagree.
const MOTIF = { w: 100, h: 80, trim: { left: 10, top: 5, right: 20, bottom: 5 } }

describe('the motif inside an asset (E1)', () => {
  it('keeps one measurement per hash, answers for many at once, and knows nothing of an asset it has not got', async () => {
    const store = new MemoryAssetStore()
    const hash = await store.put(PNG, 'image/png')

    expect(await store.motifs([hash])).toEqual({})
    expect(await store.setMotif(hash, MOTIF)).toBe(true)
    expect(await store.motifs([hash, '0'.repeat(64)])).toEqual({ [hash]: MOTIF })
    // The same bytes always hold the same motif, so the first measurement is the measurement:
    // a second one cannot quietly re-crop a picture ten other decks are already using.
    expect(await store.setMotif(hash, { w: 1, h: 1, trim: { left: 0, top: 0, right: 0, bottom: 0 } })).toBe(false)
    expect(await store.motifs([hash])).toEqual({ [hash]: MOTIF })
    expect(await store.setMotif('0'.repeat(64), MOTIF)).toBe(false)
  })

  it('hands the compiler the motifs keyed by the very URL the resolved rows carry', async () => {
    const store = new MemoryAssetStore()
    const hash = await store.put(PNG, 'image/png')
    await store.setMotif(hash, MOTIF)
    const { rows, motifs } = await resolveAssets([{ id: 'drake', fields: { art: `asset:${hash}` } }], store)

    expect(motifs).toEqual({ [rows[0]?.fields['art'] as string]: MOTIF })
  })
})

describe('the motif over HTTP (E1)', () => {
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

  const put = (hash: string, body: unknown, auth = cookie) =>
    fetch(`${run.http}/assets/${hash}/motif`, { method: 'PUT', headers: { 'content-type': 'application/json', ...(auth ? { cookie: auth } : {}) }, body: JSON.stringify(body) })

  it('takes a measurement of an asset it has, and hands it back with the others', async () => {
    const up = await fetch(`${run.http}/assets`, { method: 'POST', headers: { 'content-type': 'image/png', cookie }, body: PNG })
    const { hash } = (await up.json()) as { hash: string }

    expect((await put(hash, MOTIF, '')).status).toBe(401)
    expect((await put(hash, MOTIF)).status).toBe(204)
    expect((await put('0'.repeat(64), MOTIF)).status).toBe(404)

    const got = await fetch(`${run.http}/assets/motifs?of=${hash},${'0'.repeat(64)}`, { headers: { cookie } })
    expect(got.status).toBe(200)
    expect(await got.json()).toEqual({ [hash]: MOTIF })
  })

  it('refuses a measurement that cannot be of a picture, rather than cropping a card by it', async () => {
    const up = await fetch(`${run.http}/assets`, { method: 'POST', headers: { 'content-type': 'image/png', cookie }, body: PNG })
    const { hash } = (await up.json()) as { hash: string }

    // A border that eats the whole picture, a negative one, and one that is not a number at all.
    expect((await put(hash, { w: 10, h: 10, trim: { left: 6, top: 0, right: 6, bottom: 0 } })).status).toBe(400)
    expect((await put(hash, { w: 10, h: 10, trim: { left: -1, top: 0, right: 0, bottom: 0 } })).status).toBe(400)
    expect((await put(hash, { w: 0, h: 10, trim: { left: 0, top: 0, right: 0, bottom: 0 } })).status).toBe(400)
    expect((await put(hash, { w: 'stor', h: 10, trim: { left: 0, top: 0, right: 0, bottom: 0 } })).status).toBe(400)
    expect(await (await fetch(`${run.http}/assets/motifs?of=${hash}`, { headers: { cookie } })).json()).toEqual({})
  })

  it('draws a card by the motif when the template asks for it, so the render worker needs nothing but the page', async () => {
    const up = await fetch(`${run.http}/assets`, { method: 'POST', headers: { 'content-type': 'image/png', cookie }, body: PNG })
    const { hash } = (await up.json()) as { hash: string }
    await put(hash, MOTIF)
    const { zones, seats, floor } = twoSeatSetup()
    const doc = {
      name: 'Skogens herrar',
      template: { faces: { ...template.faces, front: { base: [...template.faces['front']!.base, { kind: 'image', id: 'art', x: 4, y: 4, w: 55, h: 36, bind: { field: 'art' }, fit: 'contain', trim: true }], variants: {} } } },
      rows: [{ id: 'dragon', fields: { title: 'Drake', art: `asset:${hash}`, antal: 1 } }],
      icons: {},
      setup: { zones, seats, floor, deckZone: 'draw' },
    }
    expect((await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ id: 'p1', ...doc }) })).status).toBe(201)
    expect((await fetch(`${run.http}/projects/p1/print`, { method: 'POST', headers: { cookie } })).status).toBe(202)
    // What was actually put on the render queue, which is the page the worker will draw.
    const queued: string[] = []
    for (let job = await run.renders.claim(0); job; job = await run.renders.claim(0)) queued.push(job.compiled.css)

    // 70 × 70 of the file is drawing; fitted whole into a 55 × 36 frame that is 36 × 36 mm, and
    // the file around it 51.43 × 41.14, hung 4.36 mm in and 2.57 mm above the frame's own corner.
    // Without the measurement the picture would simply have been the file.
    expect(queued.join('\n')).toContain('[data-element="art"] .byd-art{left:4.3571mm;top:-2.5714mm;width:51.4286mm;height:41.1429mm;}')
  })
})
