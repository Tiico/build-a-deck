import { createHash } from 'node:crypto'
import { z } from 'zod'
import { croppedMotif, type Element, type Motif, type RuleDoc, type Template } from '@byd/template'
import { ASSET_PREFIX, MemoryObjectStore, assetFromPostgres, assetKey, type ObjectStore } from '@byd/render'
import type { Sql } from 'postgres'
import { svgRefusal, type Picture } from '@byd/protocol'
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
  // Which of these the store has, without reading a byte of any of them (#1028).
  known(hashes: readonly string[]): Promise<Set<string>>
  // How many bytes each of these weighs, for the ones the store has (#1197): what storage is
  // summed out of. A hash the store does not have is left out, and weighs nothing.
  sizes(hashes: readonly string[]): Promise<Record<string, number>>
  // A URL a browser may fetch the asset from directly for `ttlSeconds`; null when the bytes
  // have to come through the server.
  link(hash: string, ttlSeconds: number): Promise<string | null>
}

export { ASSET_PREFIX, assetKey }
export const assetHash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

// Why a drawing's bytes may not be stored (#1087), asked by every door into the store: an upload
// and an export brought back. They are read as UTF-8 and nothing else, strictly: bytes that are not
// UTF-8 would be read by the browser as some other text than the one `svgRefusal` was asked about.
export function svgBytesRefusal(bytes: Uint8Array): string | null {
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return 'it is not UTF-8 text'
  }
  return svgRefusal(text)
}
// A measurement as it arrives from outside (E1). Nothing here can check it against the bytes
// without decoding them, so what is checked is that it could be of a picture at all: whole
// pixels, a picture with extent, and a border that leaves some of the picture. An implausible
// one is refused rather than stored, because a stored one crops every card that uses the file.
const Whole = z.number().int().nonnegative()
export const MotifBody = z
  .object({ w: z.number().int().positive(), h: z.number().int().positive(), trim: z.object({ left: Whole, top: Whole, right: Whole, bottom: Whole }) })
  .refine((m) => m.trim.left + m.trim.right < m.w && m.trim.top + m.trim.bottom < m.h, 'the border leaves no picture')

export { assetHashesOf } from './asset-refs.js'

export const isAssetRef = (value: unknown): value is string => typeof value === 'string' && value.startsWith(ASSET_PREFIX) && /^[0-9a-f]{64}$/.test(value.slice(ASSET_PREFIX.length))

export class MemoryAssetStore implements AssetStore {
  private readonly types = new Map<string, string>()
  private readonly lengths = new Map<string, number>()
  private readonly drawn = new Map<string, Motif>()
  constructor(private readonly objects: ObjectStore = new MemoryObjectStore()) {}

  async sizes(hashes: readonly string[]): Promise<Record<string, number>> {
    const out: Record<string, number> = {}
    for (const hash of hashes) {
      const size = this.lengths.get(hash)
      if (size !== undefined) out[hash] = size
    }
    return out
  }

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
  async known(hashes: readonly string[]): Promise<Set<string>> {
    return new Set(hashes.filter((hash) => this.types.has(hash)))
  }

  async put(bytes: Uint8Array, contentType: string): Promise<string> {
    const hash = assetHash(bytes)
    if (!this.types.has(hash)) {
      await this.objects.put(assetKey(hash), bytes, contentType)
      this.types.set(hash, contentType)
      this.lengths.set(hash, bytes.byteLength)
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
  async known(hashes: readonly string[]): Promise<Set<string>> {
    if (hashes.length === 0) return new Set()
    const rows = await this.sql<{ hash: string }[]>`select hash from assets where hash in ${this.sql(hashes as string[])}`
    return new Set(rows.map((r) => r.hash))
  }
  async sizes(hashes: readonly string[]): Promise<Record<string, number>> {
    if (hashes.length === 0) return {}
    const rows = await this.sql<{ hash: string; size: number }[]>`select hash, size from assets where hash in ${this.sql(hashes as string[])}`
    return Object.fromEntries(rows.map((r) => [r.hash, r.size]))
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
  // The render worker reads through the same function (#1028), so the two agree on where it is.
  get(hash: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
    return assetFromPostgres(this.sql, this.objects, hash)
  }
  async link(hash: string, ttlSeconds: number): Promise<string | null> {
    if (!this.objects) return null
    const [row] = await this.sql`select 1 from assets where hash = ${hash}`
    return row ? this.objects.link(assetKey(hash), ttlSeconds) : null
  }
}

// Every resolver below hands the compiler `asset:<hash>` as it found it (#1028, DRIFT §4): the
// page names the picture or the typeface, and the render worker reads the bytes behind the name.
// A deck of 308 illustrated cards carried them as data URLs, once per card, and was ~100 MB in the
// app, in Postgres and again in every page on the queue (DRIFT §1). What is asked of the store
// here is only which of the names it has, in one question and without a byte: a reference to an
// asset that is gone becomes nothing, so a card loses a picture rather than carrying a reference
// no worker can follow, exactly as it did when the bytes were read here.
async function knownRefs(refs: Iterable<unknown>, assets: AssetStore): Promise<Set<string>> {
  const hashes = new Set<string>()
  for (const ref of refs) if (isAssetRef(ref)) hashes.add(ref.slice(ASSET_PREFIX.length))
  const known = await assets.known([...hashes])
  return new Set([...known].map((hash) => `${ASSET_PREFIX}${hash}`))
}

// The icon set as the compiler needs it (E4): a symbol taken from the library is one of the
// project's assets, so `{namn}` resolves the same way a card's image does. A URL that is not an
// asset reference is left as it stands.
export async function resolveIcons(icons: Record<string, string>, assets: AssetStore): Promise<Record<string, string>> {
  const known = await knownRefs(Object.values(icons), assets)
  const out: Record<string, string> = {}
  for (const [name, url] of Object.entries(icons)) out[name] = !isAssetRef(url) || known.has(url) ? url : ''
  return out
}

// The pictures a rulebook holds, as the booklet needs them (#173, B7): every `asset:<hash>` a
// picture block points at, keyed by the reference the block carries. It is the icon set's
// treatment for the same reason, and a picture that is gone is left out of the map, so the
// booklet is printed without it rather than with an empty frame.
export async function resolveRuleImages(rules: RuleDoc, assets: AssetStore): Promise<Record<string, string>> {
  const known = await knownRefs(rules.blocks.map((b) => (b.kind === 'image' ? b.asset : undefined)), assets)
  return Object.fromEntries([...known].map((ref) => [ref, ref]))
}

// The template as the compiler needs it (#320): a picture an image element carries by itself is
// `asset:<hash>` written into the element, and it is treated exactly as a row's is, with its crop
// keyed by the reference. A face with no such element is handed back as the very object it was.
// A picture that is gone leaves the frame empty, as a cell would.
export async function resolveTemplate(template: Template, assets: AssetStore, pictures: Record<string, Picture> = {}): Promise<{ template: Template; motifs: Record<string, Motif> }> {
  const refs: string[] = []
  const gather = (els: readonly Element[]): void => {
    for (const el of els) {
      if (el.kind === 'image' && 'literal' in el.bind && isAssetRef(el.bind.literal)) refs.push(el.bind.literal)
      else if (el.kind === 'if' || el.kind === 'group') gather(el.children)
    }
  }
  for (const face of Object.values(template.faces)) {
    gather(face.base)
    for (const v of Object.values(face.variants)) if (v.override) gather(v.override)
  }
  const known = await knownRefs(refs, assets)
  let changed = false
  const walk = (els: readonly Element[]): Element[] =>
    els.map((el) => {
      if (el.kind === 'image' && 'literal' in el.bind && isAssetRef(el.bind.literal) && !known.has(el.bind.literal)) {
        changed = true
        return { ...el, bind: { literal: '' } }
      }
      return el.kind === 'if' || el.kind === 'group' ? { ...el, children: walk(el.children) } : el
    })
  const faces: Template['faces'] = {}
  for (const [id, face] of Object.entries(template.faces)) {
    changed = false
    const base = walk(face.base)
    const variants: typeof face.variants = {}
    for (const [name, v] of Object.entries(face.variants)) variants[name] = v.override ? { ...v, override: walk(v.override) } : v
    faces[id] = changed ? { ...face, base, variants } : face
  }
  return { template: { ...template, faces }, motifs: await motifsOf(known, assets, pictures) }
}

// What is drawn inside each picture (E1), keyed by the reference the page carries, with the
// designer's own crop where she made one.
async function motifsOf(refs: ReadonlySet<string>, assets: AssetStore, pictures: Record<string, Picture>): Promise<Record<string, Motif>> {
  const motifs: Record<string, Motif> = {}
  for (const [hash, motif] of Object.entries(await assets.motifs([...refs].map((ref) => ref.slice(ASSET_PREFIX.length))))) {
    // The crop is the designer's own answer to what the measurement was guessing at, so where
    // there is one it is what the compiler is handed. A picture nothing has measured has no size
    // to turn shares into pixels against, and is drawn as a file, exactly as it was before.
    const crop = pictures[hash]?.crop
    motifs[`${ASSET_PREFIX}${hash}`] = crop ? croppedMotif(motif, crop) : motif
  }
  return motifs
}

// The fonts as the compiler needs them (B3): a project font that carries a file is handed over
// with the file named, so the compiled page renders from what the version pinned rather than from
// whatever the machine happens to have. A font that is only a stack is passed as it is.
export async function resolveFonts(fonts: Record<string, { stack: string; asset?: string | undefined }>, assets: AssetStore): Promise<Record<string, { stack: string; src?: string }>> {
  const known = await knownRefs(Object.values(fonts).map((f) => f.asset), assets)
  const out: Record<string, { stack: string; src?: string }> = {}
  for (const [name, font] of Object.entries(fonts)) out[name] = font.asset !== undefined && known.has(font.asset) ? { stack: font.stack, src: font.asset } : { stack: font.stack }
  return out
}

// The rows as the compiler needs them: every asset reference the store has kept as it is, and
// one it has not got emptied, so the field is blank rather than a broken reference on the card.
//
// The motifs come back beside the rows rather than on their own, keyed by the reference the rows
// carry (E1). One walk and one keying: nothing downstream can disagree about which measurement
// belongs to which picture.
export async function resolveAssets(
  rows: readonly ProjectRow[],
  assets: AssetStore,
  // What the game says about its own pictures (#222, L22): the window each one is looked at
  // through, under the hash of its bytes. It arrives here rather than beside the measurement,
  // because the measurement is of the bytes and is the same in everyone's deck while the crop is
  // this document's — and it is applied here, where the deck's pictures are gathered anyway, so
  // that one crop reaches every card drawn from the picture without anything visiting a card.
  pictures: Record<string, Picture> = {},
): Promise<{ rows: ProjectRow[]; motifs: Record<string, Motif> }> {
  const known = await knownRefs(
    rows.flatMap((row) => Object.values(row.fields)),
    assets,
  )
  const out = rows.map((row) => {
    if (!Object.values(row.fields).some((v) => isAssetRef(v) && !known.has(v))) return row
    const fields: ProjectRow['fields'] = {}
    for (const [k, v] of Object.entries(row.fields)) fields[k] = isAssetRef(v) && !known.has(v) ? '' : v
    return { id: row.id, fields }
  })
  return { rows: out, motifs: await motifsOf(known, assets, pictures) }
}
