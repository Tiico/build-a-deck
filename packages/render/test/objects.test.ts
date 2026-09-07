import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MemoryObjectStore, S3ObjectStore, assetsFromEnv, signV4, type ObjectStore } from '../src/objects.js'

// Assets in R2 (DRIFT §4): an S3-compatible object store spoken to without an SDK. The
// signing is checked against the worked examples in AWS's own documentation of Signature
// Version 4, and the store against a small S3 stand-in that speaks the same few requests.
const example = {
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  region: 'us-east-1',
  at: new Date('2013-05-24T00:00:00Z'),
}

describe('Signature Version 4', () => {
  it('signs a GET with headers exactly as the documented example does', () => {
    const signed = signV4({
      ...example,
      method: 'GET',
      url: new URL('https://examplebucket.s3.amazonaws.com/test.txt'),
      headers: { range: 'bytes=0-9' },
      payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    })
    expect(signed.headers['authorization']).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
    )
  })

  it('presigns a GET in the query string exactly as the documented example does', () => {
    const url = signV4({ ...example, method: 'GET', url: new URL('https://examplebucket.s3.amazonaws.com/test.txt'), headers: {}, presignSeconds: 86400 }).url
    expect(url.searchParams.get('X-Amz-Signature')).toBe('aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404')
    expect(url.searchParams.get('X-Amz-Credential')).toBe('AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request')
    expect(url.searchParams.get('X-Amz-Expires')).toBe('86400')
  })
})

// An S3 stand-in: path-style buckets, PUT stores, GET returns, a listing answers, and every
// request must carry a signature — in a header or in the query.
function fakeS3(): { server: Server; objects: Map<string, { bytes: Buffer; type: string }>; requests: string[] } {
  const objects = new Map<string, { bytes: Buffer; type: string }>()
  const requests: string[] = []
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x')
    requests.push(`${req.method} ${url.pathname}${url.search}`)
    const signed = (req.headers['authorization'] ?? '').startsWith('AWS4-HMAC-SHA256') || url.searchParams.get('X-Amz-Algorithm') === 'AWS4-HMAC-SHA256'
    if (!signed) {
      res.writeHead(403)
      return res.end('<Error><Code>AccessDenied</Code></Error>')
    }
    if (url.searchParams.has('list-type')) {
      res.writeHead(200, { 'content-type': 'application/xml' })
      return res.end('<ListBucketResult><KeyCount>0</KeyCount></ListBucketResult>')
    }
    if (req.method === 'PUT') {
      const chunks: Buffer[] = []
      req.on('data', (c: Buffer) => chunks.push(c))
      req.on('end', () => {
        objects.set(url.pathname, { bytes: Buffer.concat(chunks), type: String(req.headers['content-type'] ?? '') })
        res.writeHead(200)
        res.end()
      })
      return
    }
    const o = objects.get(url.pathname)
    if (!o) {
      res.writeHead(404)
      return res.end('<Error><Code>NoSuchKey</Code></Error>')
    }
    res.writeHead(200, { 'content-type': o.type, 'content-length': o.bytes.length })
    res.end(o.bytes)
  })
  return { server, objects, requests }
}

describe('S3ObjectStore', () => {
  const fake = fakeS3()
  let store: S3ObjectStore
  beforeAll(async () => {
    await new Promise<void>((resolve) => fake.server.listen(0, '127.0.0.1', resolve))
    const { port } = fake.server.address() as AddressInfo
    store = new S3ObjectStore({ endpoint: `http://127.0.0.1:${port}`, bucket: 'byd-assets', region: 'auto', accessKeyId: 'k', secretAccessKey: 's' })
  })
  afterAll(() => new Promise<void>((resolve) => fake.server.close(() => resolve())))

  it('puts under the bucket and key with its content type, gets it back, and answers null for a missing key', async () => {
    await store.put('renders/abc', new Uint8Array([1, 2, 3]), 'image/png')
    expect(fake.objects.get('/byd-assets/renders/abc')).toEqual({ bytes: Buffer.from([1, 2, 3]), type: 'image/png' })
    expect(await store.get('renders/abc')).toEqual(new Uint8Array([1, 2, 3]))
    expect(await store.get('renders/nope')).toBeNull()
  })

  it('puts exactly the bytes it was given, also when they are a view into a larger Node buffer', async () => {
    // A Buffer from Chromium is often a slice of Node's buffer pool; its underlying ArrayBuffer
    // is the whole pool, and a PUT of that would fail the content hash — or worse, pass it.
    const pool = Buffer.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    const view = pool.subarray(3, 7)
    view.set([4, 5, 6, 7])
    await store.put('renders/view', view, 'image/png')
    expect(fake.objects.get('/byd-assets/renders/view')).toEqual({ bytes: Buffer.from([4, 5, 6, 7]), type: 'image/png' })
  })

  it('links to a presigned URL a browser can fetch directly, valid for the given time', async () => {
    const url = await store.link('renders/abc', 600)
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/byd-assets\/renders\/abc\?X-Amz-Algorithm=AWS4-HMAC-SHA256/)
    expect(new URL(url!).searchParams.get('X-Amz-Expires')).toBe('600')
    const res = await fetch(url!)
    expect(res.status).toBe(200)
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('check() lists the bucket and throws when the store is unreachable', async () => {
    await expect(store.check()).resolves.toBeUndefined()
    expect(fake.requests.at(-1)).toMatch(/^GET \/byd-assets\/\?list-type=2/)
    const gone = new S3ObjectStore({ endpoint: 'http://127.0.0.1:1', bucket: 'b', region: 'auto', accessKeyId: 'k', secretAccessKey: 's' })
    await expect(gone.check()).rejects.toThrow()
  })
})

describe('R2 from the environment', () => {
  it('is off without credentials, and on R2 under the account with them', async () => {
    expect(assetsFromEnv({})).toBeUndefined()
    expect(assetsFromEnv({ R2_ACCOUNT_ID: 'acc', R2_ACCESS_KEY_ID: 'k' })).toBeUndefined()
    const r2 = assetsFromEnv({ R2_ACCOUNT_ID: 'acc', R2_ACCESS_KEY_ID: 'k', R2_SECRET_ACCESS_KEY: 's' })!
    expect(await r2.link('renders/x', 60)).toMatch(/^https:\/\/acc\.r2\.cloudflarestorage\.com\/byd-assets\/renders\/x\?X-Amz-Algorithm=/)
    const local = assetsFromEnv({ R2_ACCOUNT_ID: 'acc', R2_ACCESS_KEY_ID: 'k', R2_SECRET_ACCESS_KEY: 's', R2_ENDPOINT: 'http://127.0.0.1:9000', R2_ASSETS_BUCKET: 'dev' })!
    expect(await local.link('renders/x', 60)).toMatch(/^http:\/\/127\.0\.0\.1:9000\/dev\/renders\/x\?/)
  })
})

describe('MemoryObjectStore', () => {
  it('holds bytes in the process and has no link to hand out: the bytes go through the server', async () => {
    const store: ObjectStore = new MemoryObjectStore()
    await store.put('a', new Uint8Array([7]), 'image/png')
    expect(await store.get('a')).toEqual(new Uint8Array([7]))
    expect(await store.link('a', 60)).toBeNull()
    await store.check()
  })
})
