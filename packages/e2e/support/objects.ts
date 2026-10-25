import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import { join } from 'node:path'
import { free } from './ports.js'

/**
 * R2 as the box has it (DRIFT §4), beside the stack: a bucket on an origin of its own.
 *
 * Without an object store every picture, texture and print file goes through the app, and a page
 * that reads one is green everywhere except where it matters — on the box, where `/assets/<hash>`
 * and `/faces/<hash>` answer with a redirect to another origin, and the page's policy (DRIFT §14)
 * and CORS both have that origin to reckon with. So the stack runs with one.
 *
 * It speaks the requests `S3ObjectStore` makes — a PUT, a GET, a DELETE (#1280), the empty listing `/health`
 * asks and the presigned GET a browser follows — and it answers the way R2 does where the page
 * can tell: on its own origin, with the object's type, and with no `access-control-allow-origin`
 * on anything. Signatures are not checked; what they say is `objects.test.ts`'s question in
 * `packages/render`, against AWS's own examples.
 *
 * The objects are kept in `dir`, on disk, because a bucket has to live exactly as long as the
 * database that says what is in it. A run against a `DATABASE_URL` that outlives it — a gate run
 * twice against the same container — finds its textures and booklets already marked as rendered,
 * and a bucket that forgot them would answer each with a 404 the box never gives.
 */
export async function objectStore(dir: string): Promise<{ endpoint: string; env: Record<string, string>; stop: () => Promise<void> }> {
  mkdirSync(dir, { recursive: true })
  const at = (key: string) => join(dir, encodeURIComponent(key))
  const objects = {
    set: (key: string, o: { bytes: Buffer; type: string }) => {
      writeFileSync(at(key), o.bytes)
      writeFileSync(`${at(key)}.type`, o.type)
    },
    get: (key: string): { bytes: Buffer; type: string } | undefined => {
      try {
        return { bytes: readFileSync(at(key)), type: readFileSync(`${at(key)}.type`, 'utf8') }
      } catch {
        return undefined
      }
    },
    delete: (key: string): void => {
      rmSync(at(key), { force: true })
      rmSync(`${at(key)}.type`, { force: true })
    },
  }
  const server: Server = createServer((req, res) => {
    void body(req).then((bytes) => {
      const url = new URL(req.url ?? '/', 'http://bucket')
      // Path-style: /<bucket>/<key>. The listing is the bucket with nothing after it.
      const key = decodeURIComponent(url.pathname.split('/').slice(2).join('/'))
      if (req.method === 'PUT' && key) {
        objects.set(key, { bytes, type: String(req.headers['content-type'] ?? 'application/octet-stream') })
        res.writeHead(200).end()
        return
      }
      if (req.method === 'DELETE' && key) {
        objects.delete(key)
        res.writeHead(204).end()
        return
      }
      if (req.method === 'GET' && key === '' && url.searchParams.get('list-type') === '2') {
        res.writeHead(200, { 'content-type': 'application/xml' }).end('<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><KeyCount>0</KeyCount></ListBucketResult>')
        return
      }
      const found = req.method === 'GET' || req.method === 'HEAD' ? objects.get(key) : undefined
      if (!found) {
        res.writeHead(404, { 'content-type': 'application/xml' }).end('<Error><Code>NoSuchKey</Code></Error>')
        return
      }
      const disposition = url.searchParams.get('response-content-disposition')
      res.writeHead(200, { 'content-type': found.type, 'content-length': String(found.bytes.length), ...(disposition ? { 'content-disposition': disposition } : {}) })
      res.end(req.method === 'HEAD' ? undefined : found.bytes)
    })
  })
  let port = await free()
  for (let attempt = 0; attempt < 8; attempt++) {
    const bound = await new Promise<boolean>((resolve) => {
      server.once('error', () => resolve(false))
      server.listen(port, '127.0.0.1', () => resolve(true))
    })
    if (bound) {
      // Another port is another origin, which is what the page has to reckon with: CORS and the
      // policy both go by origin, and neither by host.
      const endpoint = `http://127.0.0.1:${port}`
      const stop = () =>
        new Promise<void>((resolve) => {
          server.closeAllConnections()
          server.close(() => resolve())
        })
      // What the box's `.env` holds, and what `assetsFromEnv` reads for the app and the worker alike.
      const env = { R2_ACCOUNT_ID: 'e2e', R2_ACCESS_KEY_ID: 'e2e', R2_SECRET_ACCESS_KEY: 'e2e', R2_ASSETS_BUCKET: 'byd-e2e', R2_ENDPOINT: endpoint }
      return { endpoint, env, stop }
    }
    port = await free(port + 1)
  }
  throw new Error('the object store could not find a free port in eight tries')
}

function body(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}
