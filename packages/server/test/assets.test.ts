import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryObjectStore } from '@byd/render'
import { MemoryAssetStore, assetHash, resolveAssets } from '../src/assets.js'
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
