import { z } from 'zod'
import { CARD_STANDARD_63x88, TOKEN_COUNTER, type SetupDef } from '@byd/engine'
import { Template, type Row } from '@byd/template'
import type { Deck } from './faces.js'

// A project is what the editor edits: the template, the rows keyed by cardRef, the icon set and
// the table setup without its components — those come from the rows and their `antal` (L4).
// For the slice a project is a revisioned JSON document; the actor with a log (D3) comes later.

const Geometry = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number(), rot: z.number() })
const ZoneDef = z.object({
  id: z.string().min(1),
  kind: z.enum(['pile', 'area', 'hand']),
  name: z.string(),
  visibility: z.enum(['all', 'owner', 'none']),
  geometry: Geometry,
  owner: z.string().optional(),
  returnTo: z.string().optional(),
  // The verb the phone shows for playing here (C4), and where in a pile the card goes.
  shortcut: z.object({ label: z.string().min(1).max(40), at: z.enum(['top', 'bottom']) }).optional(),
})
export const ProjectSetup = z.object({
  zones: z.array(ZoneDef),
  seats: z.array(z.string().min(1)),
  floor: z.string().min(1),
  // Where every card starts, face down.
  deckZone: z.string().min(1),
  // What every seat keeps count of (C4): one counter token per entry in the seat's counters zone.
  counters: z.array(z.object({ name: z.string().min(1).max(24), start: z.number().int() })).optional(),
})
const Cell = z.union([z.string(), z.number(), z.boolean(), z.null()])
// Rows are an ordered list: their order is the deck's order until the first shuffle, and the
// table's order in the editor. An object would lose it in storage and for numeric-looking ids.
export const ProjectRow = z.object({ id: z.string().min(1), fields: z.record(z.string(), Cell) })
export type ProjectRow = z.infer<typeof ProjectRow>
// Where a symbol in the icon set came from and under what licence (E4). It is kept beside the
// set rather than inside it, so the compiler's `icons` stays a plain name → URL map, and it
// travels into the print hand-off, which is what the licences are for.
export const ProjectCredit = z.object({ licence: z.string().min(1), by: z.string().min(1), source: z.string().optional() })
export type ProjectCredit = z.infer<typeof ProjectCredit>
// The rulebook (B7): part of the document, so it is versioned in the same history as the cards
// (B4) and locked into a session at start like everything else. Its references are ids, never
// names, so renaming a zone rewrites every rule that mentions it.
const RuleBlock = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('heading'), id: z.string().min(1), level: z.union([z.literal(1), z.literal(2)]), text: z.string() }),
  z.object({ kind: z.literal('text'), id: z.string().min(1), text: z.string() }),
  z.object({ kind: z.literal('list'), id: z.string().min(1), items: z.array(z.string()), ordered: z.boolean().optional() }),
  z.object({ kind: z.literal('setup'), id: z.string().min(1), caption: z.string().optional() }),
])
export const RuleDoc = z.object({ title: z.string(), blocks: z.array(RuleBlock) })
export type RuleDoc = z.infer<typeof RuleDoc>
export type RuleBlock = RuleDoc['blocks'][number]

export const ProjectDoc = z.object({
  name: z.string().min(1),
  template: Template,
  rows: z.array(ProjectRow),
  icons: z.record(z.string(), z.string()),
  credits: z.record(z.string(), ProjectCredit).optional(),
  rules: RuleDoc.optional(),
  setup: ProjectSetup,
})
export type ProjectDoc = z.infer<typeof ProjectDoc>
// `owner` is the account that made it (G1); a project from before accounts has none and stays open.
export type ProjectRecord = ProjectDoc & { id: string; rev: number; owner?: string }
// A game as "Mina spel" lists it (G1): what it is called, where its history stands, how many
// tables have been started from it and when one of them was last played at.
export type ProjectSummary = { id: string; name: string; rev: number; tables?: number; lastPlayed?: string | null }

// A version in the history (B4): every save is one, and none of them is ever written again.
// `label` is the name a designer gave the versions that meant something — a blind test, a print
// order — and nothing else needs naming: the user never has to commit.
export type VersionSummary = { rev: number; at: string; label?: string }

export type ProjectStore = {
  create(id: string, doc: ProjectDoc, owner?: string): Promise<ProjectRecord>
  load(id: string): Promise<ProjectRecord | null>
  list(owner: string): Promise<ProjectSummary[]>
  // Replaces the document if `expectedRev` is current; 'conflict' otherwise (optimistic concurrency).
  replace(id: string, expectedRev: number, doc: ProjectDoc): Promise<ProjectRecord | 'conflict' | 'missing'>
  // The history, newest first.
  versions(id: string): Promise<VersionSummary[]>
  // The project as it stood at a revision; null when there is no such version.
  at(id: string, rev: number): Promise<ProjectRecord | null>
  // Names a version, or takes the name back with null.
  label(id: string, rev: number, label: string | null): Promise<VersionSummary | 'missing'>
  // Takes a game away with its whole history; false when there was no such game.
  remove(id: string): Promise<boolean>
}

export class MemoryProjectStore implements ProjectStore {
  private readonly docs = new Map<string, ProjectRecord>()
  // The history (B4), by project: one entry per save, appended and never rewritten.
  private readonly history = new Map<string, { rev: number; at: string; label?: string; doc: ProjectDoc }[]>()

  async create(id: string, doc: ProjectDoc, owner?: string): Promise<ProjectRecord> {
    if (this.docs.has(id)) throw new Error(`project ${id} already exists`)
    const rec: ProjectRecord = { ...structuredClone(doc), id, rev: 1, ...(owner !== undefined ? { owner } : {}) }
    this.docs.set(id, rec)
    this.history.set(id, [{ rev: 1, at: new Date().toISOString(), doc: structuredClone(doc) }])
    return structuredClone(rec)
  }

  async load(id: string): Promise<ProjectRecord | null> {
    const rec = this.docs.get(id)
    return rec ? structuredClone(rec) : null
  }

  async list(owner: string): Promise<ProjectSummary[]> {
    return [...this.docs.values()].filter((r) => r.owner === owner).map((r) => ({ id: r.id, name: r.name, rev: r.rev }))
  }

  async replace(id: string, expectedRev: number, doc: ProjectDoc): Promise<ProjectRecord | 'conflict' | 'missing'> {
    const rec = this.docs.get(id)
    if (!rec) return 'missing'
    if (rec.rev !== expectedRev) return 'conflict'
    const next: ProjectRecord = { ...structuredClone(doc), id, rev: rec.rev + 1, ...(rec.owner !== undefined ? { owner: rec.owner } : {}) }
    this.docs.set(id, next)
    this.history.get(id)?.push({ rev: next.rev, at: new Date().toISOString(), doc: structuredClone(doc) })
    return structuredClone(next)
  }

  async versions(id: string): Promise<VersionSummary[]> {
    return [...(this.history.get(id) ?? [])]
      .sort((a, b) => b.rev - a.rev)
      .map((v) => ({ rev: v.rev, at: v.at, ...(v.label !== undefined ? { label: v.label } : {}) }))
  }

  async at(id: string, rev: number): Promise<ProjectRecord | null> {
    const found = this.history.get(id)?.find((v) => v.rev === rev)
    const owner = this.docs.get(id)?.owner
    if (!found) return null
    return { ...structuredClone(found.doc), id, rev, ...(owner !== undefined ? { owner } : {}) }
  }

  async label(id: string, rev: number, label: string | null): Promise<VersionSummary | 'missing'> {
    const found = this.history.get(id)?.find((v) => v.rev === rev)
    if (!found) return 'missing'
    if (label === null) delete found.label
    else found.label = label
    return { rev, at: found.at, ...(found.label !== undefined ? { label: found.label } : {}) }
  }

  async remove(id: string): Promise<boolean> {
    const had = this.docs.delete(id)
    this.history.delete(id)
    return had
  }
}

// The table setup a project plays with: every row becomes `antal` copies (default 1) of the
// standard card, face down in the deck zone. Row order is deck order until the first shuffle.
export function setupFromProject(doc: ProjectDoc): SetupDef {
  const type = { id: CARD_STANDARD_63x88.id, version: CARD_STANDARD_63x88.version }
  const components: SetupDef['components'] = []
  for (const { id: cardRef, fields } of doc.rows) {
    const copies = Math.max(0, Math.floor(Number(fields['antal'] ?? 1)) || 0)
    for (let i = 0; i < copies; i++) components.push({ type, cardRef, zone: doc.setup.deckZone, face: 'back' })
  }
  // A seat's counters (C4) live in its counters zone, when the setup has one.
  const token = { id: TOKEN_COUNTER.id, version: TOKEN_COUNTER.version }
  for (const seat of doc.setup.seats) {
    const zone = doc.setup.zones.find((z) => z.id === `counters:${seat}`)
    if (!zone) continue
    ;(doc.setup.counters ?? []).forEach((c, i) => components.push({ type: token, cardRef: c.name, zone: zone.id, face: 'front', counter: c.start, x: 8 + (i % 3) * 32, y: 8 + Math.floor(i / 3) * 32 }))
  }
  // Optional keys that are present but undefined are dropped: the engine's types are exact.
  const zones: SetupDef['zones'] = doc.setup.zones.map((z) => ({
    id: z.id,
    kind: z.kind,
    name: z.name,
    visibility: z.visibility,
    geometry: z.geometry,
    ...(z.owner !== undefined ? { owner: z.owner } : {}),
    ...(z.returnTo !== undefined ? { returnTo: z.returnTo } : {}),
    ...(z.shortcut !== undefined ? { shortcut: z.shortcut } : {}),
  }))
  return { zones, seats: doc.setup.seats, floor: doc.setup.floor, components }
}

export function deckFromProject(doc: ProjectDoc): Deck {
  const rows: Record<string, Row> = {}
  for (const { id, fields } of doc.rows) rows[id] = fields
  return { template: doc.template, rows, icons: doc.icons }
}
