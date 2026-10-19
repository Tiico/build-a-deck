import { createHash } from 'node:crypto'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { S3ObjectStore } from '@byd/render'
import { TableHost, createServer, MemoryAssetStore, MemoryLogStore, type ServerOptions } from '../src/index.js'
import { listenInBand, registry } from './fixture.js'

// The page's Content-Security-Policy (#1008, DRIFT §14): sent by the server with the built app, so
// it goes wherever the app goes — the box, the E2E stack, a port opened straight to the world —
// and does not rest on whatever proxy happens to stand in front.
let stop: (() => Promise<void>) | null = null
afterEach(async () => {
  await stop?.()
  stop = null
})

// The built index.html in miniature: an inline script in the head, one in the body, the entry by
// address, and an inline sheet.
const SHELL_LANG = "document.documentElement.lang='sv'"
const SHELL_FILL = 'window.__filled=1'
const INDEX = `<!doctype html><html><head><style>html{margin:0}</style><script id="byd-shell-lang">${SHELL_LANG}</script><script type="module" crossorigin src="/assets/index-abc.js"></script></head><body><div id="root"><script id="byd-shell-fill">${SHELL_FILL}</script></div></body></html>`
const sha = (code: string) => `'sha256-${createHash('sha256').update(code, 'utf8').digest('base64')}'`

async function serve(extra: Partial<ServerOptions> = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'byd-csp-'))
  await writeFile(join(dir, 'index.html'), INDEX)
  const store = new MemoryLogStore()
  const server = createServer({ host: new TableHost(registry, store), store, registry, staticDir: dir, ...extra })
  const port = await listenInBand(server)
  stop = () => new Promise((resolve) => server.close(() => resolve()))
  return `http://127.0.0.1:${port}`
}

// The policy as a map from directive to its sources.
function directives(header: string | null): Map<string, string[]> {
  expect(header, 'the page came without a Content-Security-Policy').not.toBeNull()
  const out = new Map<string, string[]>()
  for (const part of (header ?? '').split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/)
    if (name) out.set(name, sources)
  }
  return out
}

describe('the page carries a Content-Security-Policy (#1008)', () => {
  it('limits scripts, connections, images and framing, with the inline scripts allowed by their hashes', async () => {
    const http = await serve()
    const res = await fetch(`${http}/editor?project=x`, { headers: { accept: 'text/html' } })
    expect(res.status).toBe(200)
    const csp = directives(res.headers.get('content-security-policy'))

    const script = csp.get('script-src') ?? []
    expect(script).toContain("'self'")
    expect(script).toContain(sha(SHELL_LANG))
    expect(script).toContain(sha(SHELL_FILL))
    // Every source, not only the absence of the obvious one: anything but our own origin and the
    // two hashes would be a door the policy says it closes.
    expect(script.sort()).toEqual(["'self'", sha(SHELL_LANG), sha(SHELL_FILL)].sort())

    const connect = csp.get('connect-src') ?? []
    expect(connect).toContain("'self'")
    // The table's socket, said outright: older Safari does not count ws: as 'self'.
    expect(connect.some((s) => s.startsWith('ws://127.0.0.1:'))).toBe(true)
    expect(connect).toContain('https://fonts.googleapis.com')
    expect(connect).toContain('https://fonts.gstatic.com')

    const img = csp.get('img-src') ?? []
    expect(img).toContain("'self'")
    expect(img).toContain('data:')

    expect(csp.get('frame-ancestors')).toEqual(["'none'"])
    expect(csp.get('object-src')).toEqual(["'none'"])
    expect(csp.get('base-uri')).toEqual(["'none'"])
    expect(csp.get('default-src')).toEqual(["'self'"])
  })

  it('lets images and connections reach the object store the redirects point at, read from the same configuration', async () => {
    const objects = new S3ObjectStore({ endpoint: 'https://acct.r2.cloudflarestorage.com/', bucket: 'b', region: 'auto', accessKeyId: 'k', secretAccessKey: 's' })
    const http = await serve({ objects })
    const csp = directives((await fetch(`${http}/`, { headers: { accept: 'text/html' } })).headers.get('content-security-policy'))
    expect(csp.get('img-src')).toContain('https://acct.r2.cloudflarestorage.com')
    expect(csp.get('connect-src')).toContain('https://acct.r2.cloudflarestorage.com')
    // And nowhere it is not needed: a script from the bucket is still a foreign script.
    expect(csp.get('script-src')).not.toContain('https://acct.r2.cloudflarestorage.com')
  })

  it('names the socket by the scheme the page was reached by, and never by a host it cannot vouch for', async () => {
    const http = await serve()
    // `fetch` will not set Host, which is the header a proxy in front of the box hands on.
    const policyFor = (headers: Record<string, string>) =>
      new Promise<string | null>((resolve, reject) => {
        const req = request(`${http}/`, { headers: { accept: 'text/html', ...headers } }, (res) => {
          res.resume()
          resolve((res.headers['content-security-policy'] as string | undefined) ?? null)
        })
        req.on('error', reject)
        req.end()
      })
    expect(directives(await policyFor({ 'x-forwarded-proto': 'https', host: 'deck.example' })).get('connect-src')).toContain('wss://deck.example')
    // A Host that is not a host name is not written into a header that other sources sit in.
    const forged = directives(await policyFor({ host: "deck.example;script-src*" }))
    expect(forged.get('script-src')?.every((s) => s === "'self'" || s.startsWith("'sha256-"))).toBe(true)
    expect(forged.get('connect-src')?.some((s) => s.includes('deck.example'))).toBe(false)
  })

  // Without an object store a creator's upload is served from this origin (DRIFT §4), and an SVG
  // opened on its own address is a document of ours: its script would run beside the account's
  // cookie. The page's policy is not the one for it — that one lets `'self'` run — so it gets one
  // in which nothing runs at all.
  it('serves an uploaded picture from this origin under a policy in which nothing runs', async () => {
    const assets = new MemoryAssetStore()
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.cookie)</script></svg>'
    const hash = await assets.put(new TextEncoder().encode(svg), 'image/svg+xml')
    const http = await serve({ assets })
    for (const path of [`/assets/${hash}`, `/assets/${hash}/bytes`]) {
      const res = await fetch(`${http}${path}`)
      expect(res.status).toBe(200)
      const csp = directives(res.headers.get('content-security-policy'))
      expect(csp.get('default-src'), path).toEqual(["'none'"])
      expect(csp.has('script-src'), path).toBe(false)
      expect(csp.has('sandbox'), path).toBe(true)
    }
  })
})
