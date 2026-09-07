import { createHash } from 'node:crypto'
import { MemoryObjectStore, type ObjectStore } from '@byd/render'
import type { Sql } from 'postgres'
import type { ProjectRow } from './projects.js'

// The project's images (E1, DRIFT §4): uploaded once, named by the hash of their bytes, and
// pointed at from the rows as `asset:<hash>`. The bytes live in the object store under
// `assets/<hash>` — R2 on the box — and Postgres keeps that they exist and what type they are;
// without an object store the bytes stay in Postgres, as renders do. A hash is a capability:
// whoever knows it may fetch the image, which is how a card face reaches a browser too.
export type AssetStore = {
  // Stores the bytes and returns their hash; the same bytes give the same hash and cost nothing.
  put(bytes: Uint8Array, contentType: string): Promise<string>
  get(hash: string): Promise<{ bytes: Uint8Array; contentType: string } | null>
  // A URL a browser may fetch the asset from directly for `ttlSeconds`; null when the bytes
  // have to come through the server.
  link(hash: string, ttlSeconds: number): Promise<string | null>
}

export const ASSET_PREFIX = 'asset:'
export const assetKey = (hash: string): string => `assets/${hash}`
export const assetHash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')
export const isAssetRef = (value: unknown): value is string => typeof value === 'string' && value.startsWith(ASSET_PREFIX) && /^[0-9a-f]{64}$/.test(value.slice(ASSET_PREFIX.length))

export class MemoryAssetStore implements AssetStore {
  private readonly types = new Map<string, string>()
  constructor(private readonly objects: ObjectStore = new MemoryObjectStore()) {}

  async put(bytes: Uint8Array, contentType: string): Promise<string> {
    const hash = assetHash(bytes)
    if (!this.types.has(hash)) {
      await this.objects.put(assetKey(hash), bytes, contentType)
      this.types.set(hash, contentType)
    }
    return hash
  }
  async get(hash: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
    const contentType = this.types.get(hash)
    if (!contentType) return null
    const bytes = await this.objects.get(assetKey(hash))
    return bytes ? { bytes, contentType } : null
  }
  async link(hash: string, ttlSeconds: number): Promise<string | null> {
    return this.types.has(hash) ? this.objects.link(assetKey(hash), ttlSeconds) : null
  }
}

// With an object store the bytes go there and Postgres keeps only that they exist; without one
// the bytes stay in Postgres and are served through the app.
export class PostgresAssetStore implements AssetStore {
  constructor(
    private readonly sql: Sql,
    private readonly objects?: ObjectStore,
  ) {}

  async put(bytes: Uint8Array, contentType: string): Promise<string> {
    const hash = assetHash(bytes)
    const [known] = await this.sql`select 1 from assets where hash = ${hash}`
    if (known) return hash
    if (this.objects) await this.objects.put(assetKey(hash), bytes, contentType)
    const stored = this.objects ? null : Buffer.from(bytes)
    await this.sql`insert into assets (hash, content_type, size, bytes) values (${hash}, ${contentType}, ${bytes.byteLength}, ${stored}) on conflict (hash) do nothing`
    return hash
  }
  async get(hash: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
    const [row] = await this.sql<{ content_type: string; bytes: Uint8Array | null }[]>`select content_type, bytes from assets where hash = ${hash}`
    if (!row) return null
    if (row.bytes) return { bytes: new Uint8Array(row.bytes), contentType: row.content_type }
    const bytes = this.objects ? await this.objects.get(assetKey(hash)) : null
    return bytes ? { bytes, contentType: row.content_type } : null
  }
  async link(hash: string, ttlSeconds: number): Promise<string | null> {
    if (!this.objects) return null
    const [row] = await this.sql`select 1 from assets where hash = ${hash}`
    return row ? this.objects.link(assetKey(hash), ttlSeconds) : null
  }
}

// The icon set as the compiler needs it (E4): a symbol taken from the library is one of the
// project's assets, so `{namn}` resolves the same way a card's image does. A URL that is not an
// asset reference is left as it stands.
export async function resolveIcons(icons: Record<string, string>, assets: AssetStore): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const [name, url] of Object.entries(icons)) out[name] = isAssetRef(url) ? await dataUrlOf(url.slice(ASSET_PREFIX.length), assets) : url
  return out
}

// The bytes of an asset as a data URL; empty when the asset is gone, so a card loses a picture
// rather than carrying a broken reference.
async function dataUrlOf(hash: string, assets: AssetStore): Promise<string> {
  const got = await assets.get(hash)
  return got ? `data:${got.contentType};base64,${Buffer.from(got.bytes).toString('base64')}` : ''
}

// The rows as the compiler needs them: every asset reference swapped for a data URL, so the
// compiled page carries its images and the render worker needs nothing but the page. An asset
// that is gone leaves the field empty rather than a broken reference on the card.
export async function resolveAssets(rows: readonly ProjectRow[], assets: AssetStore): Promise<ProjectRow[]> {
  const urls = new Map<string, string>()
  const out: ProjectRow[] = []
  for (const row of rows) {
    const fields: ProjectRow['fields'] = {}
    for (const [k, v] of Object.entries(row.fields)) {
      if (!isAssetRef(v)) {
        fields[k] = v
        continue
      }
      const hash = v.slice(ASSET_PREFIX.length)
      if (!urls.has(hash)) urls.set(hash, await dataUrlOf(hash, assets))
      fields[k] = urls.get(hash) ?? ''
    }
    out.push({ id: row.id, fields })
  }
  return out
}
