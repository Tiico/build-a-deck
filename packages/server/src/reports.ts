import { z } from 'zod'
import { ASSET_PREFIX } from '@byd/render'
import type { Motif } from '@byd/template'
import { assetHash, type AssetStore } from './assets.js'
import { LANGS, type Lang } from './auth.js'
import type { Deck } from './faces.js'

// Reports and blocks (#1274, F4 beslut 12, DSA art. 16–18). Anyone may report a picture on
// `/villkor/anmal`: what it is, where it is, why it must not be there, who reports and that they do
// so in good faith. The operator reads each one and decides with `report` over Tailscale (DRIFT §10,
// §12); a picture that has to go is blocked by the hash of its bytes, in every game that uses it.
//
// A blocked hash is treated as if it were not there (DRIFT §4): the asset store does not know it, so
// `/assets` and the render worker hand nothing out, a new table, a texture, a print and an export draw
// the reference empty, and a table that is already standing reads its deck again with it empty. The
// history stays as it was and draws the picture empty. The bytes stay too, unless the content is
// illegal; then `report purge` takes them out of the object store and Postgres.
//
// Only pictures are reported through the form in the beta (beslut 5): text goes through Kontakt, and
// nothing blocks text.

const Field = (max: number) => z.string().trim().min(1).max(max)
export const ReportBody = z.object({
  what: Field(2000),
  where: Field(2000),
  why: Field(4000),
  // Name and address may be left out: a report of sexual content involving children needs neither
  // (DSA art. 16.2 c), and the form cannot tell one report from another. Without an address there is
  // no receipt and no decision to send.
  name: z.string().trim().max(200).default(''),
  email: z.union([z.literal(''), z.string().trim().email().max(254)]).default(''),
  goodFaith: z.literal(true),
  lang: z.enum(LANGS).optional(),
})
export type ReportBody = z.infer<typeof ReportBody>

export type ReportOutcome = 'held' | 'rejected'
export type Report = { id: string; at: string; what: string; where: string; why: string; name: string; email: string; lang: Lang; decision?: { outcome: ReportOutcome; at: string } }
// Why a picture is blocked, as the owner's mail says it (DSA art. 17): someone else's rights, the
// law, or the terms' list of what may never be there (section 7).
export const BLOCK_REASONS = ['rights', 'illegal', 'terms'] as const
export type BlockReason = (typeof BLOCK_REASONS)[number]
export type Block = { hash: string; at: string; reason: BlockReason; report: string | null; purged: boolean }

export type ReportStore = {
  // Writes the report and numbers it: A-0001, A-0002, … in the order they came.
  add(report: Omit<Report, 'id' | 'decision'>): Promise<Report>
  get(id: string): Promise<Report | null>
  // Every report, oldest first.
  list(): Promise<Report[]>
  // The operator's decision; null for a report that is not there.
  decide(id: string, outcome: ReportOutcome, at: string): Promise<Report | null>
  // Blocks a hash, or says again why it is blocked; `purged` once set stays set.
  block(block: Block): Promise<void>
  // Lets a hash go again (an objection that held); false when it was not blocked. A purged hash has
  // no bytes to come back to, and stays blocked.
  unblock(hash: string): Promise<boolean>
  // Every block, oldest first.
  blocks(): Promise<Block[]>
  // The blocks among these hashes.
  blocksOf(hashes: readonly string[]): Promise<Block[]>
  // What is blocked, as this process last read it: asked on every request and every texture, so it
  // is a set in memory and never a query. A block written elsewhere — the operator's script in another
  // process — is read again when Postgres tells about it.
  blocked(): ReadonlySet<string>
  // Told after every block and unblock that changed something, wherever it was written; by then
  // `blocked()` says the new set. Resolves with the way to stop.
  listen(fn: () => void): Promise<() => Promise<void>>
}

export const reportId = (n: number): string => `A-${String(n).padStart(4, '0')}`

export class MemoryReportStore implements ReportStore {
  private readonly reports: Report[] = []
  private readonly held = new Map<string, Block>()
  private readonly set = new Set<string>()
  private readonly listeners = new Set<() => void>()

  async add(report: Omit<Report, 'id' | 'decision'>): Promise<Report> {
    const kept = { ...report, id: reportId(this.reports.length + 1) }
    this.reports.push(kept)
    return structuredClone(kept)
  }
  async get(id: string): Promise<Report | null> {
    const found = this.reports.find((r) => r.id === id)
    return found ? structuredClone(found) : null
  }
  async list(): Promise<Report[]> {
    return structuredClone(this.reports)
  }
  async decide(id: string, outcome: ReportOutcome, at: string): Promise<Report | null> {
    const found = this.reports.find((r) => r.id === id)
    if (!found) return null
    found.decision = { outcome, at }
    return structuredClone(found)
  }
  async block(block: Block): Promise<void> {
    const before = this.held.get(block.hash)
    this.held.set(block.hash, { ...block, purged: block.purged || before?.purged === true })
    this.set.add(block.hash)
    this.tell()
  }
  async unblock(hash: string): Promise<boolean> {
    const before = this.held.get(hash)
    if (!before || before.purged) return false
    this.held.delete(hash)
    this.set.delete(hash)
    this.tell()
    return true
  }
  async blocks(): Promise<Block[]> {
    return [...this.held.values()].map((b) => ({ ...b }))
  }
  async blocksOf(hashes: readonly string[]): Promise<Block[]> {
    return hashes.flatMap((h) => {
      const b = this.held.get(h)
      return b ? [{ ...b }] : []
    })
  }
  blocked(): ReadonlySet<string> {
    return this.set
  }
  async listen(fn: () => void): Promise<() => Promise<void>> {
    this.listeners.add(fn)
    return async () => void this.listeners.delete(fn)
  }
  private tell(): void {
    for (const fn of this.listeners) fn()
  }
}

// A picture that is blocked may not be stored again (#1274): the same bytes give the same hash, and
// an upload of them would otherwise put back what a purge took out.
export class BlockedAsset extends Error {
  constructor(readonly hash: string) {
    super(`asset ${hash} is blocked`)
  }
}

// The asset store as everything but the operator sees it: a blocked hash is not there. Whatever asks
// the store — the routes, the resolvers that write a deck, the export and the render worker — is told
// the same about it as about a hash nobody ever uploaded, so nothing on the wire can tell the two apart.
export function blocking(inner: AssetStore, blocked: () => ReadonlySet<string>): AssetStore {
  const open = (hash: string) => !blocked().has(hash)
  const only = <T>(record: Record<string, T>): Record<string, T> => Object.fromEntries(Object.entries(record).filter(([hash]) => open(hash)))
  return {
    async put(bytes, contentType) {
      const hash = assetHash(bytes)
      if (!open(hash)) throw new BlockedAsset(hash)
      return inner.put(bytes, contentType)
    },
    get: async (hash) => (open(hash) ? inner.get(hash) : null),
    setMotif: async (hash, motif: Motif) => (open(hash) ? inner.setMotif(hash, motif) : false),
    motifs: async (hashes) => only(await inner.motifs(hashes.filter(open))),
    known: async (hashes) => inner.known(hashes.filter(open)),
    sizes: (hashes) => inner.sizes(hashes),
    contentTypes: async (hashes) => only(await inner.contentTypes(hashes)),
    pictures: async () => (await inner.pictures()).filter(open),
    link: async (hash, ttl) => (open(hash) ? inner.link(hash, ttl) : null),
    ...(inner.purge ? { purge: inner.purge.bind(inner) } : {}),
  }
}

// A deck a table already holds, with every reference to a blocked hash emptied (#1274), as
// `resolveAssets` empties a reference to a hash that is gone: the field is blank, the template's own
// picture leaves its frame empty, a symbol draws nothing, and the measurement keyed by the reference
// goes with it. A deck with nothing blocked in it is handed back as the very object it was, so a table
// whose deck did not change compiles the same pages and keeps every texture.
//
// Decks from before #1028 carry their pictures as data URLs and name no hash; they are not changed.
export function withoutBlocked(deck: Deck, blocked: ReadonlySet<string>): Deck {
  if (blocked.size === 0) return deck
  const isBlocked = (v: unknown): boolean => typeof v === 'string' && v.startsWith(ASSET_PREFIX) && blocked.has(v.slice(ASSET_PREFIX.length))
  let changed = false
  const walk = (v: unknown): unknown => {
    if (isBlocked(v)) {
      changed = true
      return ''
    }
    if (Array.isArray(v)) return v.map(walk)
    if (v !== null && typeof v === 'object') {
      const out: Record<string, unknown> = {}
      for (const [k, inner] of Object.entries(v)) {
        if (isBlocked(k)) {
          changed = true
          continue
        }
        out[k] = walk(inner)
      }
      return out
    }
    return v
  }
  const next = walk(deck) as Deck
  return changed ? next : deck
}
