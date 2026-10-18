import type { CompiledLike } from './hash.js'

// The project's pictures and typefaces as a page points at them (#1028, DRIFT §4): `asset:<hash>`,
// the SHA-256 of the bytes. The page names them and the worker reads them, so a deck, a session
// and a render job carry kilobytes where they carried every picture once per card. An asset is
// never rewritten, so the hash on the page decides what is drawn as surely as the bytes would:
// the texture keyed by the page (`contentHash`) is still keyed by what it shows.
export type AssetBytes = { bytes: Uint8Array; contentType: string }
export type AssetSource = { get(hash: string): Promise<AssetBytes | null> }

export const ASSET_PREFIX = 'asset:'
export const assetKey = (hash: string): string => `assets/${hash}`
const REF = /asset:([0-9a-f]{64})/g

// A few pictures' worth, and both typefaces: every card of a game is drawn in the same fonts, and
// cards drawn after one another often share a picture. Small next to the worker's limit (DRIFT §1),
// and a miss costs one read of one file.
const CACHE_BYTES = 32 * 2 ** 20

// The bytes behind each hash as the page loads them, the most recently used kept up to a budget.
export class AssetCache {
  private readonly urls = new Map<string, string>()
  private held = 0
  constructor(
    private readonly source: AssetSource,
    private readonly budget = CACHE_BYTES,
  ) {}

  async dataUrl(hash: string): Promise<string> {
    const known = this.urls.get(hash)
    if (known !== undefined) {
      this.urls.delete(hash)
      this.urls.set(hash, known)
      return known
    }
    const got = await this.source.get(hash)
    // The app writes a reference only to an asset it has (`resolveAssets`), and an asset is never
    // deleted. One that is not there is a fault to see on the job, not a picture to leave out of a
    // texture that would then be kept under this page's hash for good.
    if (!got) throw new Error(`asset ${hash} is not in the store`)
    const url = `data:${got.contentType};base64,${Buffer.from(got.bytes).toString('base64')}`
    this.urls.set(hash, url)
    this.held += url.length
    for (const [old, kept] of this.urls) {
      if (this.held <= this.budget || old === hash) break
      this.urls.delete(old)
      this.held -= kept.length
    }
    return url
  }
}

export const pointsAtAssets = (page: CompiledLike): boolean => page.html.search(REF) >= 0 || page.css.search(REF) >= 0

// The page with every `asset:<hash>` swapped for the bytes it names, as Chromium loads them.
export async function inlineAssets(page: CompiledLike, cache: AssetCache | undefined): Promise<CompiledLike> {
  if (!pointsAtAssets(page)) return page
  if (!cache) throw new Error('the page points at assets and this worker has nowhere to read them from')
  const urls = new Map<string, string>()
  for (const text of [page.html, page.css]) for (const [, hash] of text.matchAll(REF)) if (hash && !urls.has(hash)) urls.set(hash, await cache.dataUrl(hash))
  const swap = (text: string) => text.replace(REF, (_, hash: string) => urls.get(hash) ?? '')
  return { html: swap(page.html), css: swap(page.css) }
}
