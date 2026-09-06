import { z } from 'zod'
import { CARD_STANDARD_63x88, type SetupDef } from '@byd/engine'
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
})
export const ProjectSetup = z.object({
  zones: z.array(ZoneDef),
  seats: z.array(z.string().min(1)),
  floor: z.string().min(1),
  // Where every card starts, face down.
  deckZone: z.string().min(1),
})
const Cell = z.union([z.string(), z.number(), z.boolean(), z.null()])
// Rows are an ordered list: their order is the deck's order until the first shuffle, and the
// table's order in the editor. An object would lose it in storage and for numeric-looking ids.
export const ProjectRow = z.object({ id: z.string().min(1), fields: z.record(z.string(), Cell) })
export type ProjectRow = z.infer<typeof ProjectRow>
export const ProjectDoc = z.object({
  name: z.string().min(1),
  template: Template,
  rows: z.array(ProjectRow),
  icons: z.record(z.string(), z.string()),
  setup: ProjectSetup,
})
export type ProjectDoc = z.infer<typeof ProjectDoc>
export type ProjectRecord = ProjectDoc & { id: string; rev: number }

export type ProjectStore = {
  create(id: string, doc: ProjectDoc): Promise<ProjectRecord>
  load(id: string): Promise<ProjectRecord | null>
  // Replaces the document if `expectedRev` is current; 'conflict' otherwise (optimistic concurrency).
  replace(id: string, expectedRev: number, doc: ProjectDoc): Promise<ProjectRecord | 'conflict' | 'missing'>
}

export class MemoryProjectStore implements ProjectStore {
  private readonly docs = new Map<string, ProjectRecord>()

  async create(id: string, doc: ProjectDoc): Promise<ProjectRecord> {
    if (this.docs.has(id)) throw new Error(`project ${id} already exists`)
    const rec = { ...structuredClone(doc), id, rev: 1 }
    this.docs.set(id, rec)
    return structuredClone(rec)
  }

  async load(id: string): Promise<ProjectRecord | null> {
    const rec = this.docs.get(id)
    return rec ? structuredClone(rec) : null
  }

  async replace(id: string, expectedRev: number, doc: ProjectDoc): Promise<ProjectRecord | 'conflict' | 'missing'> {
    const rec = this.docs.get(id)
    if (!rec) return 'missing'
    if (rec.rev !== expectedRev) return 'conflict'
    const next = { ...structuredClone(doc), id, rev: rec.rev + 1 }
    this.docs.set(id, next)
    return structuredClone(next)
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
  // Optional keys that are present but undefined are dropped: the engine's types are exact.
  const zones: SetupDef['zones'] = doc.setup.zones.map((z) => ({
    id: z.id,
    kind: z.kind,
    name: z.name,
    visibility: z.visibility,
    geometry: z.geometry,
    ...(z.owner !== undefined ? { owner: z.owner } : {}),
    ...(z.returnTo !== undefined ? { returnTo: z.returnTo } : {}),
  }))
  return { zones, seats: doc.setup.seats, floor: doc.setup.floor, components }
}

export function deckFromProject(doc: ProjectDoc): Deck {
  const rows: Record<string, Row> = {}
  for (const { id, fields } of doc.rows) rows[id] = fields
  return { template: doc.template, rows, icons: doc.icons }
}
