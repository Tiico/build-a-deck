import { z } from 'zod'
import { CardQuery, FaceId, Picture, ZoneAction, ZoneBeside } from '@byd/protocol'
import { RuleDoc, Template, liftTemplate, type Row } from '@byd/template'
import type { Deck } from './faces.js'
import type { AppliedEdit } from './project-actor.js'
import type { Role } from './roles.js'
import { peekCard, type CardPeek } from './names.js'

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
  // Which side of a pile is "beside it" (K21): where Dra 1, Dela på hälften and an action that
  // lays cards beside the pile put them. A pile that says nothing means its left (#87).
  beside: ZoneBeside.optional(),
  // Which cards start here, as a question about the deck's own columns. A zone without one takes
  // no cards, and what no zone asks for lies in the deck's pile as it always has.
  fill: CardQuery.optional(),
  // What a player may ask this zone for when they click it (K14). The tool ships none and knows
  // none; the recipe suggests one — a shuffle on the draw pile (#453) — the way it suggests the
  // pile itself, and the designer takes it away like anything else it laid.
  actions: z.array(ZoneAction).optional(),
  // The one row of the deck that lies last in this pile, and on which side (K23): a shuffle
  // leaves it there, and back in this pile it lies last again. Piles only.
  bottom: z.object({ cardRef: z.string().min(1), face: FaceId }).optional(),
})
export const ProjectSetup = z.object({
  zones: z.array(ZoneDef),
  seats: z.array(z.string().min(1)),
  floor: z.string().min(1),
  // Where every card starts, face down.
  deckZone: z.string().min(1),
  // What every seat keeps count of (C4): one counter token per entry in the seat's counters zone.
  // `id` is what a rule names it by (#708, B7), so a rule follows the counter when it is renamed.
  // A counter written before it had one is known by its name (`counterId`).
  counters: z.array(z.object({ id: z.string().regex(/^[\p{L}\p{N}_:-]{1,64}$/u).optional(), name: z.string().min(1).max(24), start: z.number().int() })).optional(),
})
const Cell = z.union([z.string(), z.number(), z.boolean(), z.null()])
export type Cell = z.infer<typeof Cell>
// Rows are an ordered list: their order is the deck's order until the first shuffle, and the
// table's order in the editor. An object would lose it in storage and for numeric-looking ids.
export const ProjectRow = z.object({ id: z.string().min(1), fields: z.record(z.string(), Cell) })
export type ProjectRow = z.infer<typeof ProjectRow>
// Where a symbol in the icon set came from and under what licence (E4). It is kept beside the
// set rather than inside it, so the compiler's `icons` stays a plain name → URL map, and it
// travels into the print hand-off, which is what the licences are for.
export const ProjectCredit = z.object({ licence: z.string().min(1), by: z.string().min(1), source: z.string().optional() })
export type ProjectCredit = z.infer<typeof ProjectCredit>
// The rulebook (B7) is declared once, in `@byd/template` beside the renderer that reads it (#183):
// the schema validating a document here and the type the editor writes against are the same thing,
// so a field cannot be added to one side and forgotten on the other. It is passed on from here
// because the project document is where everything else looks for it.
export { RuleBlock, RuleDoc, RuleSource } from '@byd/template'

// What the game knows about one of its pictures (#222, L22), declared once in `@byd/protocol`
// where the editor that writes a crop, the compiler that draws through it and the document that
// stores it can all reach the same schema. Passed on from here for the same reason the rulebook
// is: the project document is where everything else looks for it.
export { AssetCrop, Picture, PictureName } from '@byd/protocol'

// A font the version is pinned to (B3). `stack` is what the CSS says; `asset` is the file the
// project carries, so a locked version renders the same tomorrow as it did when it was tested.
// A font without a file is whatever the machine has, which is a warning at print time (E5).
// `source` is how the family came into the game (#329, L27). Only the catalog says so, and it
// says so because the list has to tell the two apart: a catalog entry wears the badge «Katalog»
// and its licence fields stand filled in and struck through, while an uploaded file carries no
// licence at all and has two empty boxes the designer is expected to be able to answer. Absent
// is an uploaded file, which is every font written before there was a catalog.
export const ProjectFont = z.object({ stack: z.string().min(1), asset: z.string().optional(), licence: ProjectCredit.optional(), source: z.literal('catalog').optional() })
export type ProjectFont = z.infer<typeof ProjectFont>

// Vilket färdigt tema spelet utgår från (L57, #632). Bara namnet: vad temat är står i editorns
// galleri, och det spelet bär av det står där det alltid har stått — i `fonts`, `palette`,
// `icons` och mallens text. Posten är vad som låter Speltema säga vad som avviker från temat och
// ta spelet tillbaka till det. Ett spel som aldrig valt ett tema har ingen post, vilket är varför
// den är valfri: varje dokument skrivet före galleriet läser tillbaka precis som det alltid gjort.
export const ProjectTheme = z.object({ from: z.string().min(1) })
export type ProjectTheme = z.infer<typeof ProjectTheme>

export const ProjectDoc = z.object({
  name: z.string().min(1),
  template: Template,
  rows: z.array(ProjectRow),
  // The order the table shows the columns in (#46). Deliberately an order and not a list of the
  // columns there are: which columns a project has is derived from what the template draws and
  // what the cards carry, and that stays the truth — `columnsOf` reads this over the derivation,
  // keeping the names it knows in the order it names them and leaving everything else where the
  // derivation put it. A project nobody has reordered has no key here at all, which is why it is
  // optional: every document written before the designer could move a column is still this
  // document, and reads back at exactly the order it always had.
  columns: z.array(z.string()).optional(),
  icons: z.record(z.string(), z.string()),
  credits: z.record(z.string(), ProjectCredit).optional(),
  // What the game's meanings are painted in (E4): the name a card writes after the bar, and the
  // colour it stands for. The role is written on the cards and the colour only here, so a deck
  // repaints every card that says a meaning by changing one line — and there is one place to
  // check the colour against the card it will sit on, and one place to find two meanings that
  // become one for a colour-blind reader (E5).
  palette: z.record(z.string(), z.string().min(1)).optional(),
  // What the game knows about each of its pictures (#222, L22), under the hash of the picture's
  // own bytes. The crop lives here and not beside the cell, because it is the picture's and not
  // the card's: cropped once, it is obeyed by every card drawn from that file — which is the
  // whole reason for having a library rather than a hundred and fifty-four drags.
  //
  // A picture that has nothing to say is simply absent, so every document written before there
  // was a crop reads back as the document it always was.
  pictures: z.record(z.string().regex(/^[0-9a-f]{64}$/, 'a picture is named by the hash of its bytes'), Picture).optional(),
  // Vilka kolumner som skrivs som prosa och vilka som skrivs som vanlig text (L43, #362),
  // under kolumnens egen nyckel. Rutans höjd i mallen föreslår — det är `bodyFieldsOf`, och det
  // är vad den här posten inte är — men vad kolumnen *är* står skrivet här när designern har
  // sagt det. En kolumn som aldrig fått ett val står inte här alls, vilket är varför posten är
  // valfri: varje dokument skrivet innan valet fanns läser tillbaka precis som det alltid gjort,
  // och varje befintlig lek följer höjden som i dag.
  //
  // Den ligger här och inte på mallens element, fastän det är elementets höjd som föreslår, av
  // två skäl: valet är kolumnens och inte en rutas — samma kolumn kan ritas på både fram- och
  // baksida — och en kolumn som mallen inte ritar alls måste ändå gå att välja åt. Den är
  // dokumentdata som `columns` och `palette`: den sparas, versioneras och följer med
  // projektet precis som de.
  prose: z.record(z.string(), z.boolean()).optional(),
  rules: RuleDoc.optional(),
  fonts: z.record(z.string(), ProjectFont).optional(),
  theme: ProjectTheme.optional(),
  setup: ProjectSetup,
})
export type ProjectDoc = z.infer<typeof ProjectDoc>
// `owner` is the account that made it (G1); a project from before accounts has none and stays open.
export type ProjectRecord = ProjectDoc & { id: string; rev: number; owner?: string }

// A stored document read into today's shape (#221, L22, beslut 3). `anchor` is gone from the
// schema, which now refuses it rather than dropping it quietly, so a project written before the
// retirement has to come through here — and a store is exactly where a stored document becomes a
// live one, for the editor, the table's textures and the print PDF alike.
//
// Lifted on the way out rather than rewritten in the database, because a project's history is
// written once and never rewritten (B4): a migration that touched only the newest row would leave
// every older version of the same project unopenable.
//
// Each card's own departure from the measure, `framing`, was retired the same way (#607): it was
// set only from «Bildernas mått» on the wall, and once a picture carried its own crop (L22) that
// surface had nothing left to say. A stored one is taken off here rather than left to crop cards
// nobody can uncrop, and a card that wants another cut uses a picture cropped for it.
export const liftDoc = <T>(doc: T): T => withoutFraming(liftTemplate(doc))
const withoutFraming = <T>(doc: T): T => {
  if (typeof doc !== 'object' || doc === null || !('framing' in doc)) return doc
  const { framing: _framing, ...rest } = doc as Record<string, unknown>
  return rest as T
}
// A game as "Mina spel" lists it (G1): what it is called, where its history stands, how many
// tables have been started from it and when one of them was last played at. `card` is the game's
// own first card (G1, #231) — its id and its title, which is what the list needs to know that
// there is a card at all and what to call it. What it takes to draw the card travels apart.
export type ProjectSummary = { id: string; name: string; rev: number; tables?: number; lastPlayed?: string | null; role?: Role; card?: CardPeek | null }

// A version in the history (B4): every save is one, and none of them is ever written again.
// `label` is the name a designer gave the versions that meant something — a blind test, a print
// order — and nothing else needs naming: the user never has to commit.
// `atSeq` is how far the edit log had come when the version was made (D3), so an actor knows
// which edits are already in it.
export type VersionSummary = { rev: number; at: string; label?: string; atSeq?: number }
export type RestoredVersion = { rev: number; at: string; label?: string; doc: ProjectDoc }

// A history is one save after another from 1 (B4); what would read otherwise is refused whole.
export function checkedHistory<T extends { rev: number }>(versions: readonly T[]): T {
  versions.forEach((v, i) => {
    if (v.rev !== i + 1) throw new Error(`a restored history runs 1, 2, 3…; found rev ${v.rev} at ${i + 1}`)
  })
  const last = versions[versions.length - 1]
  if (!last) throw new Error('a restored history needs at least one version')
  return last
}

export type ProjectStore = {
  create(id: string, doc: ProjectDoc, owner?: string): Promise<ProjectRecord>
  // A new project with a history it already had (G5, #528): brought back from an export, each
  // version at its own revision, date and name. The revisions are one save after another from 1,
  // as the history always is; an id that is taken is refused and nothing is written.
  restore(id: string, versions: RestoredVersion[], owner?: string): Promise<ProjectRecord>
  load(id: string): Promise<ProjectRecord | null>
  list(owner: string): Promise<ProjectSummary[]>
  // Replaces the document if `expectedRev` is current; 'conflict' otherwise (optimistic concurrency).
  // A document that is already the stored one is not a saving (B4): the record comes back at the
  // revision it already had, and the history gains nothing. The history is meant to be read, and
  // a version that changed nothing is a line in it that says nothing. Every way into the history
  // goes through here, so this is where the rule holds rather than at each of the doors.
  replace(id: string, expectedRev: number, doc: ProjectDoc, atSeq?: number): Promise<ProjectRecord | 'conflict' | 'missing'>
  // The history, newest first.
  versions(id: string): Promise<VersionSummary[]>
  // The project as it stood at a revision; null when there is no such version.
  at(id: string, rev: number): Promise<ProjectRecord | null>
  // Names a version, or takes the name back with null.
  label(id: string, rev: number, label: string | null): Promise<VersionSummary | 'missing'>
  // Takes a game away with its whole history; false when there was no such game.
  remove(id: string): Promise<boolean>
  // The edit log between saves (D3): committed before an edit is applied, read back on load.
  appendEdits(id: string, edits: AppliedEdit[]): Promise<void>
  readEdits(id: string, sinceSeq: number): Promise<AppliedEdit[]>
  // Who a project is shared with (D3). The owner is the project's own; the rest are members.
  // A project from before accounts belongs to nobody, so anyone is its owner, as it always was.
  roleOf(id: string, account: string): Promise<Role | null>
  members(id: string): Promise<{ account: string; role: Role }[]>
  share(id: string, account: string, role: Role): Promise<void>
  unshare(id: string, account: string): Promise<void>
  // An invitation (D3): kept hashed like every other secret, good once, and gone when used.
  invite(invite: { tokenHash: string; project: string; email: string; role: Role; by?: string; expiresAt: string }): Promise<void>
  // The invitations to a project that can still be followed at `now` (#477).
  openInvites(project: string, now: string): Promise<{ email: string; role: Role; expiresAt: string }[]>
  // Takes back every open invitation to an address (#477): its link opens nothing after this.
  withdrawInvites(project: string, email: string): Promise<number>
  acceptInvite(tokenHash: string, now: string): Promise<{ project: string; email: string; role: Role } | null>
}

export class MemoryProjectStore implements ProjectStore {
  private readonly docs = new Map<string, ProjectRecord>()
  // The history (B4), by project: one entry per save, appended and never rewritten.
  private readonly history = new Map<string, { rev: number; at: string; label?: string; atSeq?: number; doc: ProjectDoc }[]>()
  // The edit log between saves (D3), by project.
  private readonly edits = new Map<string, AppliedEdit[]>()
  // Who else a project is shared with (D3), by project.
  private readonly shared = new Map<string, Map<string, Role>>()
  private readonly invites = new Map<string, { project: string; email: string; role: Role; expiresAt: string; used?: boolean }>()

  async create(id: string, doc: ProjectDoc, owner?: string): Promise<ProjectRecord> {
    if (this.docs.has(id)) throw new Error(`project ${id} already exists`)
    const rec: ProjectRecord = { ...structuredClone(doc), id, rev: 1, ...(owner !== undefined ? { owner } : {}) }
    this.docs.set(id, rec)
    this.history.set(id, [{ rev: 1, at: new Date().toISOString(), doc: structuredClone(doc) }])
    return structuredClone(rec)
  }

  async restore(id: string, versions: RestoredVersion[], owner?: string): Promise<ProjectRecord> {
    const last = checkedHistory(versions)
    if (this.docs.has(id)) throw new Error(`project ${id} already exists`)
    const rec: ProjectRecord = { ...structuredClone(last.doc), id, rev: last.rev, ...(owner !== undefined ? { owner } : {}) }
    this.docs.set(id, rec)
    this.history.set(
      id,
      versions.map((v) => ({ rev: v.rev, at: v.at, ...(v.label !== undefined ? { label: v.label } : {}), doc: structuredClone(v.doc) })),
    )
    return structuredClone(rec)
  }

  async load(id: string): Promise<ProjectRecord | null> {
    const rec = this.docs.get(id)
    return rec ? liftDoc(structuredClone(rec)) : null
  }

  // Every project the account can see: its own, and the ones shared with it.
  async list(account: string): Promise<ProjectSummary[]> {
    const out: ProjectSummary[] = []
    for (const rec of this.docs.values()) {
      const role = await this.roleOf(rec.id, account)
      if (role) out.push({ id: rec.id, name: rec.name, rev: rec.rev, role, card: peekCard(rec.rows) })
    }
    return out
  }

  async roleOf(id: string, account: string): Promise<Role | null> {
    const rec = this.docs.get(id)
    if (!rec) return null
    if (rec.owner === undefined) return 'owner'
    if (rec.owner === account) return 'owner'
    return this.shared.get(id)?.get(account) ?? null
  }

  async members(id: string): Promise<{ account: string; role: Role }[]> {
    const rec = this.docs.get(id)
    if (!rec) return []
    const owner = rec.owner === undefined ? [] : [{ account: rec.owner, role: 'owner' as Role }]
    return [...owner, ...[...(this.shared.get(id) ?? new Map())].map(([account, role]) => ({ account, role }))]
  }

  async share(id: string, account: string, role: Role): Promise<void> {
    const shared = this.shared.get(id) ?? new Map<string, Role>()
    shared.set(account, role)
    this.shared.set(id, shared)
  }

  async unshare(id: string, account: string): Promise<void> {
    if (this.docs.get(id)?.owner === account) throw new Error('the owner cannot be unshared')
    this.shared.get(id)?.delete(account)
  }

  async invite(invite: { tokenHash: string; project: string; email: string; role: Role; by?: string; expiresAt: string }): Promise<void> {
    this.invites.set(invite.tokenHash, { project: invite.project, email: invite.email, role: invite.role, expiresAt: invite.expiresAt })
  }

  async openInvites(project: string, now: string): Promise<{ email: string; role: Role; expiresAt: string }[]> {
    return [...this.invites.values()].filter((i) => i.project === project && !i.used && i.expiresAt > now).map(({ email, role, expiresAt }) => ({ email, role, expiresAt }))
  }

  async withdrawInvites(project: string, email: string): Promise<number> {
    let n = 0
    for (const [hash, i] of this.invites) {
      if (i.project !== project || i.used || i.email.toLowerCase() !== email.toLowerCase()) continue
      this.invites.delete(hash)
      n++
    }
    return n
  }

  async acceptInvite(tokenHash: string, now: string): Promise<{ project: string; email: string; role: Role } | null> {
    const found = this.invites.get(tokenHash)
    if (!found || found.used || found.expiresAt < now) return null
    found.used = true
    return { project: found.project, email: found.email, role: found.role }
  }

  async replace(id: string, expectedRev: number, doc: ProjectDoc, atSeq?: number): Promise<ProjectRecord | 'conflict' | 'missing'> {
    const rec = this.docs.get(id)
    if (!rec) return 'missing'
    if (rec.rev !== expectedRev) return 'conflict'
    const { id: _id, rev: _rev, owner: _owner, ...held } = rec
    if (stamp(held) === stamp(doc)) return structuredClone(rec)
    const next: ProjectRecord = { ...structuredClone(doc), id, rev: rec.rev + 1, ...(rec.owner !== undefined ? { owner: rec.owner } : {}) }
    this.docs.set(id, next)
    this.history.get(id)?.push({ rev: next.rev, at: new Date().toISOString(), ...(atSeq !== undefined ? { atSeq } : {}), doc: structuredClone(doc) })
    return structuredClone(next)
  }

  async appendEdits(id: string, edits: AppliedEdit[]): Promise<void> {
    this.edits.set(id, [...(this.edits.get(id) ?? []), ...structuredClone(edits)])
  }

  async readEdits(id: string, sinceSeq: number): Promise<AppliedEdit[]> {
    return structuredClone((this.edits.get(id) ?? []).filter((e) => e.seq > sinceSeq))
  }

  async versions(id: string): Promise<VersionSummary[]> {
    return [...(this.history.get(id) ?? [])]
      .sort((a, b) => b.rev - a.rev)
      .map((v) => ({ rev: v.rev, at: v.at, ...(v.label !== undefined ? { label: v.label } : {}), ...(v.atSeq !== undefined ? { atSeq: v.atSeq } : {}) }))
  }

  async at(id: string, rev: number): Promise<ProjectRecord | null> {
    const found = this.history.get(id)?.find((v) => v.rev === rev)
    const owner = this.docs.get(id)?.owner
    if (!found) return null
    return liftDoc({ ...structuredClone(found.doc), id, rev, ...(owner !== undefined ? { owner } : {}) })
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
    this.edits.delete(id)
    this.shared.delete(id)
    return had
  }
}

// Two documents said in one order, so "the same document" does not depend on the order the keys
// happened to be written in — a document that has been through JSON and back comes out of the
// database in whatever order the database kept it. A key with no value is no key at all.
export function stamp(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stamp).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined)
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stamp(v)}`).join(',')}}`
}

export function deckFromProject(doc: ProjectDoc): Deck {
  const rows: Record<string, Row> = {}
  for (const { id, fields } of doc.rows) rows[id] = fields
  return {
    template: doc.template,
    rows,
    icons: doc.icons,
    ...(doc.palette ? { palette: doc.palette } : {}),
    ...(doc.fonts ? { fonts: doc.fonts } : {}),
  }
}
