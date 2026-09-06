import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { TableHost, createServer, MemoryLogStore } from '../src/index.js'
import { registry } from './fixture.js'

// In production the web app and the API share one origin (README): the server serves the built
// web from STATIC_DIR, with the app's routes falling back to index.html.
let stop: (() => Promise<void>) | null = null
afterEach(async () => {
  await stop?.()
  stop = null
})

async function serve(staticDir?: string, store = new MemoryLogStore()) {
  const host = new TableHost(registry, store)
  const server = createServer({ host, store, registry, ...(staticDir ? { staticDir } : {}) })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  stop = () => new Promise((resolve) => server.close(() => resolve()))
  return `http://127.0.0.1:${port}`
}

describe('serving the web app (DRIFT §1)', () => {
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
