import { randomBytes } from 'node:crypto'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { request as httpRequest } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { brotliDecompressSync, gunzipSync } from 'node:zlib'
import { afterEach, describe, expect, it } from 'vitest'
import { TableHost, createServer, MemoryLogStore } from '../src/index.js'
import { listenInBand, registry } from './fixture.js'

// In production the web app and the API share one origin (README): the server serves the built
// web from STATIC_DIR, with the app's routes falling back to index.html.
let stop: (() => Promise<void>) | null = null
afterEach(async () => {
  await stop?.()
  stop = null
})

async function serve(staticDir?: string, store = new MemoryLogStore(), appOrigin?: string) {
  const host = new TableHost(registry, store)
  const server = createServer({ host, store, registry, ...(staticDir ? { staticDir } : {}), ...(appOrigin ? { appOrigin } : {}) })
  // Out of this package's block of the band, like every other server in this suite: a port asked
  // for as "any port at all" is one a neighbouring run can be handed at the same moment (#58, #289).
  const port = await listenInBand(server)
  stop = () => new Promise((resolve) => server.close(() => resolve()))
  return `http://127.0.0.1:${port}`
}

describe('serving the web app (DRIFT §1)', () => {
  it('allows the split development editor to send host authorization', async () => {
    const http = await serve(undefined, new MemoryLogStore(), 'http://127.0.0.1:5173')
    const res = await fetch(`${http}/sessions/example/code`, {
      method: 'OPTIONS',
      headers: { origin: 'http://127.0.0.1:5173', 'access-control-request-headers': 'authorization' },
    })
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('http://127.0.0.1:5173')
    expect(res.headers.get('access-control-allow-credentials')).toBe('true')
    expect(res.headers.get('access-control-allow-headers')).toContain('authorization')

    const foreign = await fetch(`${http}/health`, { headers: { origin: 'https://foreign.example' } })
    expect(foreign.headers.get('access-control-allow-origin')).toBeNull()
    expect(foreign.headers.get('access-control-allow-credentials')).toBeNull()
  })

  it('serves files from STATIC_DIR with their types, falls back to index.html for app routes, and keeps the API first', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'byd-static-'))
    await mkdir(join(dir, 'assets'))
    await writeFile(join(dir, 'index.html'), '<!doctype html><title>byd</title>')
    await writeFile(join(dir, 'assets', 'app.js'), 'console.log(1)')
    const http = await serve(dir)
    const index = await fetch(`${http}/`)
    expect(index.status).toBe(200)
    expect(index.headers.get('content-type')).toMatch(/text\/html/)
    expect(await index.text()).toContain('<title>byd</title>')
    const js = await fetch(`${http}/assets/app.js`)
    expect(js.headers.get('content-type')).toMatch(/javascript/)
    expect(js.headers.get('cache-control')).toMatch(/immutable/)
    expect(await (await fetch(`${http}/table?session=x`)).text()).toContain('<title>byd</title>')
    expect((await fetch(`${http}/sessions/nope/textures`)).status).toBe(404)
    // Dot segments never escape: the URL collapses them and the guard resolves inside the root.
    expect(await (await fetch(`${http}/%2e%2e/%2e%2e/etc/passwd`)).text()).toContain('<title>byd</title>')
    expect((await fetch(`${http}/assets/missing.js`)).status).toBe(404)
  })

  it('without STATIC_DIR unknown paths are 404 as before', async () => {
    const http = await serve()
    expect((await fetch(`${http}/`)).status).toBe(404)
  })
})

describe('health (DRIFT §2)', () => {
  it('reports the store and says so with 503 when the database cannot be reached', async () => {
    const http = await serve()
    expect(await (await fetch(`${http}/health`)).json()).toEqual({ ok: true, tables: 0, store: 'ok' })
    const broken = new MemoryLogStore()
    broken.staleSessions = async () => {
      throw new Error('connection refused')
    }
    const http2 = await serve(undefined, broken)
    const res = await fetch(`${http2}/health`)
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ ok: false, store: 'connection refused' })
  })
})

// The box compresses what it serves (DRIFT §13, #372).
//
// The gate that matters is in `packages/e2e`, where a real browser reads a real `Content-Encoding`
// off the real blocking stylesheet. What is asked here is the other half — the cases a browser on
// the felt would never show, and every one of which is a way to spend the box's CPU or its
// bandwidth for nothing: bytes that are already compressed, a file too small to be worth a header,
// and a client that asked for the thing as it is.
describe('compressing what is served (DRIFT §13, #372)', () => {
  /** One request with the bytes as they crossed: no decoding in the way, which is the point. */
  const ask = (origin: string, path: string, headers: Record<string, string>): Promise<{ headers: Record<string, string | undefined>; bytes: Buffer }> =>
    new Promise((resolve, reject) => {
      const req = httpRequest(new URL(path, origin), { headers }, (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => resolve({ headers: res.headers as Record<string, string | undefined>, bytes: Buffer.concat(chunks) }))
        res.on('error', reject)
      })
      req.on('error', reject)
      req.end()
    })

  // A stylesheet of the order the felt's own is, so the readings are about the same thing the
  // measurement in #366 was about rather than about a handful of bytes.
  const sheet = Array.from({ length: 400 }, (_, i) => `.byd-thing-${i}{--byd-gap:${i}px;padding:${i}px}`).join('\n')

  it('compresses text the client takes, keeps its hands off what is already compressed, and answers plainly when nothing is offered', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'byd-encoding-'))
    await mkdir(join(dir, 'assets'))
    await writeFile(join(dir, 'assets', 'app.css'), sheet)
    // A PNG's bytes do not compress — they are already deflated — and spending the box's CPU to
    // make them a little larger is the mistake this line exists to prevent.
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), randomBytes(4096)])
    await writeFile(join(dir, 'assets', 'card.png'), png)
    // Small, and *compressible* — four hundred bytes of the same rule over again, which brotli
    // would happily take to a fifth of itself. The reading is about the floor and not about a
    // string too short to compress at all, which would have passed with no floor there.
    const tiny = '.byd-a{color:red}\n'.repeat(25)
    await writeFile(join(dir, 'assets', 'tiny.css'), tiny)
    const http = await serve(dir)

    const br = await ask(http, '/assets/app.css', { 'accept-encoding': 'br, gzip' })
    expect(br.headers['content-encoding']).toBe('br')
    expect(br.headers['vary']).toMatch(/accept-encoding/i)
    expect(br.headers['content-length']).toBe(String(br.bytes.length))
    expect(br.bytes.length).toBeLessThan(sheet.length / 2)
    expect(brotliDecompressSync(br.bytes).toString()).toBe(sheet)

    // gzip for whatever does not speak brotli, and the sheet comes back whole.
    const gz = await ask(http, '/assets/app.css', { 'accept-encoding': 'gzip' })
    expect(gz.headers['content-encoding']).toBe('gzip')
    expect(gunzipSync(gz.bytes).toString()).toBe(sheet)

    // Offered nothing, or offered only what the box does not speak: the file as it is. And still
    // `Vary`, because a cache in front must not serve this answer to the browser above.
    for (const headers of [{}, { 'accept-encoding': 'identity' }, { 'accept-encoding': 'deflate' }]) {
      const plain = await ask(http, '/assets/app.css', headers)
      expect(plain.headers['content-encoding']).toBeUndefined()
      expect(plain.headers['vary']).toMatch(/accept-encoding/i)
      expect(plain.bytes.toString()).toBe(sheet)
    }

    // `q=0` is a refusal, not an offer.
    const refused = await ask(http, '/assets/app.css', { 'accept-encoding': 'br;q=0, gzip;q=0' })
    expect(refused.headers['content-encoding']).toBeUndefined()

    // Already-compressed bytes travel as they are, and say nothing about varying, because they
    // never would.
    const image = await ask(http, '/assets/card.png', { 'accept-encoding': 'br, gzip' })
    expect(image.headers['content-encoding']).toBeUndefined()
    expect(image.headers['vary']).toBeUndefined()
    expect(image.bytes.equals(png)).toBe(true)

    // And a file under one packet is left alone: the header would cost more than the saving.
    const small = await ask(http, '/assets/tiny.css', { 'accept-encoding': 'br, gzip' })
    expect(small.headers['content-encoding']).toBeUndefined()
    expect(small.bytes.toString()).toBe(tiny)
  })

  // Compressed once per deploy and not once per request is the whole reason brotli's most
  // expensive setting is affordable on a box that is not ours alone (DRIFT §1, §13). Said as a
  // behaviour rather than as a count of calls: the second answer is the same bytes, and a file
  // rewritten under a running server — which is what a development run does — is not answered from
  // the previous build's.
  it('answers from what it compressed before, and not after the file has changed', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'byd-encoding-'))
    await mkdir(join(dir, 'assets'))
    await writeFile(join(dir, 'assets', 'app.css'), sheet)
    const http = await serve(dir)

    const first = await ask(http, '/assets/app.css', { 'accept-encoding': 'br' })
    const again = await ask(http, '/assets/app.css', { 'accept-encoding': 'br' })
    expect(again.bytes.equals(first.bytes)).toBe(true)

    const rebuilt = sheet + '\n.byd-late{color:blue}'
    await writeFile(join(dir, 'assets', 'app.css'), rebuilt)
    const after = await ask(http, '/assets/app.css', { 'accept-encoding': 'br' })
    expect(brotliDecompressSync(after.bytes).toString()).toBe(rebuilt)
  })
})
