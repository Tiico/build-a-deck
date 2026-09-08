import { createHash, createHmac } from 'node:crypto'

// Assets in R2 (DRIFT §4): rendered textures and print files live in an S3-compatible bucket
// outside the house, and a browser fetches them straight from there through a short-lived
// signed URL. The bytes never cross the home fibre twice. Spoken to without an SDK: the four
// requests needed are a PUT, a GET, a listing and a presigned GET, all Signature Version 4.

export type ObjectStore = {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>
  get(key: string): Promise<Uint8Array | null>
  // A URL a browser may fetch the object from directly for `ttlSeconds`; null when the bytes
  // have to come through the server instead.
  link(key: string, ttlSeconds: number): Promise<string | null>
  // Throws when the store cannot be reached: what /health asks (DRIFT §2).
  check(): Promise<void>
}

// In the process, for development and tests: nothing to link to.
export class MemoryObjectStore implements ObjectStore {
  private readonly objects = new Map<string, { bytes: Uint8Array; contentType: string }>()
  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    this.objects.set(key, { bytes: new Uint8Array(bytes), contentType })
  }
  async get(key: string): Promise<Uint8Array | null> {
    return this.objects.get(key)?.bytes ?? null
  }
  async link(): Promise<string | null> {
    return null
  }
  async check(): Promise<void> {
    return undefined
  }
}

export type S3Options = {
  // For R2: https://<account id>.r2.cloudflarestorage.com, with region 'auto'.
  endpoint: string
  bucket: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  now?: () => Date
}

// Path-style addressing: <endpoint>/<bucket>/<key>, which R2 and MinIO both speak.
export class S3ObjectStore implements ObjectStore {
  constructor(private readonly o: S3Options) {}

  private url(key: string): URL {
    return new URL(`${this.o.endpoint.replace(/\/$/, '')}/${this.o.bucket}/${key}`)
  }

  private signed(method: string, url: URL, headers: Record<string, string>, payloadHash: string) {
    return signV4({ ...this.o, at: this.o.now?.() ?? new Date(), method, url, headers, payloadHash })
  }

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    const s = this.signed('PUT', this.url(key), { 'content-type': contentType }, sha256Hex(bytes))
    // A copy into its own buffer: a Buffer's `.buffer` is the whole pool it was sliced from.
    const res = await fetch(s.url, { method: 'PUT', headers: s.headers, body: new Uint8Array(bytes).buffer })
    if (!res.ok) throw new Error(`put ${key}: ${res.status} ${await res.text()}`)
  }

  async get(key: string): Promise<Uint8Array | null> {
    const s = this.signed('GET', this.url(key), {}, EMPTY_SHA256)
    const res = await fetch(s.url, { headers: s.headers })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`get ${key}: ${res.status} ${await res.text()}`)
    return new Uint8Array(await res.arrayBuffer())
  }

  async link(key: string, ttlSeconds: number): Promise<string | null> {
    return signV4({ ...this.o, at: this.o.now?.() ?? new Date(), method: 'GET', url: this.url(key), headers: {}, presignSeconds: ttlSeconds }).url.toString()
  }

  async check(): Promise<void> {
    const url = new URL(`${this.o.endpoint.replace(/\/$/, '')}/${this.o.bucket}/`)
    url.searchParams.set('list-type', '2')
    url.searchParams.set('max-keys', '0')
    const s = this.signed('GET', url, {}, EMPTY_SHA256)
    const res = await fetch(s.url, { headers: s.headers })
    if (!res.ok) throw new Error(`bucket ${this.o.bucket}: ${res.status}`)
  }
}

// R2 from the environment (DRIFT §4), for the app and the render worker alike: R2_ACCOUNT_ID,
// R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY switch it on; R2_ASSETS_BUCKET names the bucket
// (default byd-assets); R2_ENDPOINT overrides the endpoint, for an S3 stand-in in development.
export function assetsFromEnv(env: Record<string, string | undefined>): S3ObjectStore | undefined {
  const account = env['R2_ACCOUNT_ID']
  const accessKeyId = env['R2_ACCESS_KEY_ID']
  const secretAccessKey = env['R2_SECRET_ACCESS_KEY']
  if (!account || !accessKeyId || !secretAccessKey) return undefined
  return new S3ObjectStore({
    endpoint: env['R2_ENDPOINT'] ?? `https://${account}.r2.cloudflarestorage.com`,
    bucket: env['R2_ASSETS_BUCKET'] ?? 'byd-assets',
    region: 'auto',
    accessKeyId,
    secretAccessKey,
  })
}

// Signature Version 4 for S3. With `presignSeconds` the signature goes into the query string
// (a URL anyone may use until it expires); otherwise into an Authorization header.
export type SignInput = {
  method: string
  url: URL
  headers: Record<string, string>
  payloadHash?: string
  presignSeconds?: number
  accessKeyId: string
  secretAccessKey: string
  region: string
  at?: Date
}
export function signV4(input: SignInput): { url: URL; headers: Record<string, string> } {
  const at = input.at ?? new Date()
  const amzDate = at.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const date = amzDate.slice(0, 8)
  const scope = `${date}/${input.region}/s3/aws4_request`
  const url = new URL(input.url.toString())
  const presign = input.presignSeconds !== undefined
  const payloadHash = presign ? 'UNSIGNED-PAYLOAD' : (input.payloadHash ?? EMPTY_SHA256)

  const headers: Record<string, string> = {}
  for (const [k, v] of Object.entries(input.headers)) headers[k.toLowerCase()] = v.trim()
  const canonicalHeaders: Record<string, string> = { host: url.host, ...headers }
  if (!presign) {
    canonicalHeaders['x-amz-date'] = amzDate
    canonicalHeaders['x-amz-content-sha256'] = payloadHash
  }
  const signedHeaders = Object.keys(canonicalHeaders).sort().join(';')

  if (presign) {
    url.searchParams.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256')
    url.searchParams.set('X-Amz-Credential', `${input.accessKeyId}/${scope}`)
    url.searchParams.set('X-Amz-Date', amzDate)
    url.searchParams.set('X-Amz-Expires', String(input.presignSeconds))
    url.searchParams.set('X-Amz-SignedHeaders', signedHeaders)
  }
  const query = [...url.searchParams.entries()]
    .map(([k, v]) => [encode(k), encode(v)] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
  const canonicalRequest = [
    input.method,
    url.pathname.split('/').map(encode).join('/'),
    query,
    ...Object.keys(canonicalHeaders)
      .sort()
      .map((k) => `${k}:${canonicalHeaders[k]}`),
    '',
    signedHeaders,
    payloadHash,
  ].join('\n')
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n')
  const kDate = hmac(`AWS4${input.secretAccessKey}`, date)
  const kRegion = hmac(kDate, input.region)
  const kService = hmac(kRegion, 's3')
  const kSigning = hmac(kService, 'aws4_request')
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex')

  if (presign) {
    url.searchParams.set('X-Amz-Signature', signature)
    return { url, headers: {} }
  }
  const out: Record<string, string> = { ...headers, 'x-amz-date': amzDate, 'x-amz-content-sha256': payloadHash }
  out['authorization'] = `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  return { url, headers: out }
}

const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
const sha256Hex = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex')
const hmac = (key: string | Buffer, data: string) => createHmac('sha256', key).update(data).digest()
// RFC 3986 as SigV4 wants it: unreserved characters bare, everything else %XX in upper case.
const encode = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
