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
    const rows = await resolveAssets([{ id: 'drake', fields: { title: 'Drake', art: `asset:${hash}`, cost: 5 } }, { id: 'torn', fields: { title: 'Torn', art: 'asset:' + '0'.repeat(64) } }], store)
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
