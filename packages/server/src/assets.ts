import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { Motif, RuleDoc } from '@byd/template'
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
  // What is drawn inside the picture (E1): the file's pixel size and the uniform border it
  // carries around its motif, so a template can fit the motif rather than the file. It is a
  // property of the bytes, so it is measured once and kept — and the first measurement is the
  // measurement, since a second one would silently re-crop a picture other decks already use.
  // False when there is no such asset, or when it has been measured already.
  setMotif(hash: string, motif: Motif): Promise<boolean>
  motifs(hashes: readonly string[]): Promise<Record<string, Motif>>
  // A URL a browser may fetch the asset from directly for `ttlSeconds`; null when the bytes
  // have to come through the server.
  link(hash: string, ttlSeconds: number): Promise<string | null>
}

export const ASSET_PREFIX = 'asset:'
export const assetKey = (hash: string): string => `assets/${hash}`
export const assetHash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')
// A measurement as it arrives from outside (E1). Nothing here can check it against the bytes
// without decoding them, so what is checked is that it could be of a picture at all: whole
// pixels, a picture with extent, and a border that leaves some of the picture. An implausible
// one is refused rather than stored, because a stored one crops every card that uses the file.
const Whole = z.number().int().nonnegative()
export const MotifBody = z
  .object({ w: z.number().int().positive(), h: z.number().int().positive(), trim: z.object({ left: Whole, top: Whole, right: Whole, bottom: Whole }) })
  .refine((m) => m.trim.left + m.trim.right < m.w && m.trim.top + m.trim.bottom < m.h, 'the border leaves no picture')

export const isAssetRef = (value: unknown): value is string => typeof value === 'string' && value.startsWith(ASSET_PREFIX) && /^[0-9a-f]{64}$/.test(value.slice(ASSET_PREFIX.length))

export class MemoryAssetStore implements AssetStore {
  private readonly types = new Map<string, string>()
  private readonly drawn = new Map<string, Motif>()
  constructor(private readonly objects: ObjectStore = new MemoryObjectStore()) {}

  async setMotif(hash: string, motif: Motif): Promise<boolean> {
    if (!this.types.has(hash) || this.drawn.has(hash)) return false
    this.drawn.set(hash, motif)
    return true
  }
  async motifs(hashes: readonly string[]): Promise<Record<string, Motif>> {
    const out: Record<string, Motif> = {}
    for (const hash of hashes) {
      const motif = this.drawn.get(hash)
      if (motif) out[hash] = motif
    }
    return out
  }

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

  async setMotif(hash: string, motif: Motif): Promise<boolean> {
    // "motif is null" is what makes the first measurement the measurement, and makes an asset
    // nobody has uploaded answer the same way as one measured already: nothing was written.
    const done = await this.sql`update assets set motif = ${this.sql.json(motif as never)} where hash = ${hash} and motif is null`
    return done.count > 0
  }
  async motifs(hashes: readonly string[]): Promise<Record<string, Motif>> {
    if (hashes.length === 0) return {}
    const rows = await this.sql<{ hash: string; motif: Motif }[]>`select hash, motif from assets where hash in ${this.sql(hashes as string[])} and motif is not null`
    return Object.fromEntries(rows.map((r) => [r.hash, r.motif]))
  }

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

// The pictures a rulebook holds, as the booklet needs them (#173, B7): every `asset:<hash>` a
// picture block points at, resolved to the bytes behind it, keyed by the reference the block
// carries. It is the icon set's treatment for the same reason — the render worker is handed a page
// and nothing else — and a picture whose bytes are gone is left out of the map, so the booklet is
// printed without it rather than with an empty frame.
export async function resolveRuleImages(rules: RuleDoc, assets: AssetStore): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const block of rules.blocks) {
    if (block.kind !== 'image' || out[block.asset] !== undefined) continue
    const url = await dataUrlOf(block.asset.slice(ASSET_PREFIX.length), assets)
    if (url) out[block.asset] = url
  }
  return out
}

// The bytes of an asset as a data URL; empty when the asset is gone, so a card loses a picture
// rather than carrying a broken reference.
async function dataUrlOf(hash: string, assets: AssetStore): Promise<string> {
  const got = await assets.get(hash)
  return got ? `data:${got.contentType};base64,${Buffer.from(got.bytes).toString('base64')}` : ''
}

// The fonts as the compiler needs them (B3): a project font that carries a file is handed over
// with the file inlined, so the compiled page renders from what the version pinned rather than
// from whatever the machine happens to have. A font that is only a stack is passed as it is.
export async function resolveFonts(fonts: Record<string, { stack: string; asset?: string | undefined }>, assets: AssetStore): Promise<Record<string, { stack: string; src?: string }>> {
  const out: Record<string, { stack: string; src?: string }> = {}
  for (const [name, font] of Object.entries(fonts)) {
    if (!isAssetRef(font.asset)) {
      out[name] = { stack: font.stack }
      continue
    }
    const src = await dataUrlOf(font.asset.slice(ASSET_PREFIX.length), assets)
    out[name] = src ? { stack: font.stack, src } : { stack: font.stack }
  }
  return out
}

// The rows as the compiler needs them: every asset reference swapped for a data URL, so the
// compiled page carries its images and the render worker needs nothing but the page. An asset
// that is gone leaves the field empty rather than a broken reference on the card.
//
// The motifs come back beside the rows rather than on their own, keyed by the URL the rows now
// carry (E1). One walk and one keying: nothing downstream can disagree about which measurement
// belongs to which picture.
export async function resolveAssets(rows: readonly ProjectRow[], assets: AssetStore): Promise<{ rows: ProjectRow[]; motifs: Record<string, Motif> }> {
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
  const motifs: Record<string, Motif> = {}
  for (const [hash, motif] of Object.entries(await assets.motifs([...urls.keys()]))) {
    const url = urls.get(hash)
    if (url) motifs[url] = motif
  }
  return { rows: out, motifs }
}
