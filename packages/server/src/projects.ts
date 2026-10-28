import { z } from 'zod'
import { BoxFace } from '@byd/engine'
import { CardQuery, FaceId, Picture, TypeRef, ZoneAction, ZoneBeside } from '@byd/protocol'
import { FaceTemplate, RuleDoc, Template, liftTemplate, type Row } from '@byd/template'
import type { Deck } from './faces.js'
import type { AppliedEdit } from './project-actor.js'
import type { Role } from './roles.js'
import { peekCard, type CardPeek } from './names.js'
import { QuotaReached, growth, type Limit } from './quotas.js'
import type { AssetStore } from './assets.js'
import { assetHashesOf } from './asset-refs.js'
import { liftBoxGrounds } from './box.js'

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
// Where in its zone a piece of material lies (#1292): the middle of the piece, in the zone's own
// millimetres. In an area each seat has, it is said from seat A's chair — along the rim from the
// seat's left, and inwards from the far side — and turned to face every other seat's edge.
export const MaterialAt = z.object({ x: z.number(), y: z.number() })
export type MaterialAt = z.infer<typeof MaterialAt>
// One line of the game's dice (K5, #1136): which kind, how many, and where. Its own schema because
// the editor's `setDice` holds a list to it as well as the stored document does (#1139).
export const ProjectDie = z
  .object({
    faces: z.union([z.literal(4), z.literal(6), z.literal(8), z.literal(10), z.literal(12), z.literal(20)]),
    count: z.number().int().min(1).max(20),
    perSeat: z.boolean().optional(),
    zone: z.string().min(1).optional(),
    role: z.string().min(1).optional(),
    // The point the designer dragged the line to (#1292); without one the row lies where the
    // recipe finds room, as every die written before there were points does.
    at: MaterialAt.optional(),
  })
  .refine((d) => (d.zone === undefined) !== (d.role === undefined), { message: 'a die lies in a zone or in a role, and only one' })
export type ProjectDie = z.infer<typeof ProjectDie>
export const ProjectDice = z.array(ProjectDie)
export const ProjectSetup = z.object({
  zones: z.array(ZoneDef),
  seats: z.array(z.string().min(1)),
  floor: z.string().min(1),
  // Where every card starts, face down.
  deckZone: z.string().min(1),
  // What every seat keeps count of (C4): one counter token per entry in the seat's counters zone.
  // `id` is what a rule names it by (#708, B7), so a rule follows the counter when it is renamed.
  // A counter written before it had one is known by its name (`counterId`).
  // Where a counter lies is material like a die's (#1292): `role` is an area each seat has, the
  // counters zone when it says none, and `at` the point in it; without a point the counters zone
  // lays its chips along the rim as it always has.
  counters: z
    .array(
      z.object({
        id: z.string().regex(/^[\p{L}\p{N}_:-]{1,64}$/u).optional(),
        name: z.string().min(1).max(24),
        start: z.number().int(),
        role: z.string().min(1).optional(),
        at: MaterialAt.optional(),
      }),
    )
    .optional(),
  // Whether the game goes in turns, and which way round the table (K30). Absent is a game without
  // turns, which is every game written before there were turns.
  turns: z.enum(['clockwise', 'counterclockwise']).optional(),
  // The game's dice (K5, #1136): which kinds, how many, and where they lie when the table is laid.
  // A die is named by its sides, the way a table says it, and only the kinds the registry has
  // (`DICE`). Where is one of two things (#1139): `zone`, an area every seat shares, or `role`, an
  // area each seat has (`front` is `front:A`, `front:B` …), which gives every seat `count` of its
  // own. `perSeat` on a shared area makes the count follow the players: `count` for each seat.
  dice: ProjectDice.optional(),
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

// Spelets låda (#1412, L91). `type` är lådtypen spelet pinnar (B3), i steg 1 alltid tuckboxen.
// Måtten står inte här, för de räknas fram ur leken (`boxOf`). Det som står här är designerns svar
// på dem:
// - `clearance` är luften runt kortet och i djupet, när den inte är typens.
// - `locked` är de mått hon har låst, vart och ett på det värde det hade när det låstes.
// - `faces` är ytornas mallar, en per sida av lådan, ritade med samma mallsystem som korten (E2).
// Ett spel som aldrig rört lådan har ingen post, och dess låda är typens och följer leken. Därför är
// posten valfri: varje dokument skrivet före lådan läser tillbaka precis som det alltid gjort.
export const BOX_CLEARANCE_MAX_MM = 10
export const BOX_SIDE_MAX_MM = 500
const clearanceMm = z.number().min(0).max(BOX_CLEARANCE_MAX_MM)
const sideMm = z.number().positive().max(BOX_SIDE_MAX_MM)
export const ProjectBox = z.object({
  type: TypeRef,
  clearance: z.object({ around: clearanceMm.optional(), depth: clearanceMm.optional() }).optional(),
  locked: z.object({ width: sideMm.optional(), height: sideMm.optional(), depth: sideMm.optional() }).optional(),
  faces: z.partialRecord(BoxFace, FaceTemplate).optional(),
})
export type ProjectBox = z.infer<typeof ProjectBox>

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
  // Vilka kolumner som är bildkolumner, där designern har sagt det (#1085). Samma regel som
  // `prose`: ett bildlager i mallen föreslår, och det som står här väger över — `true` när hon
  // gjorde kolumnen till bild, `false` när hon valde text eller prosa för en kolumn mallen ritar
  // som bild. Bredvid `prose` och inte i stället för det, så att varje dokument och varje
  // `setProse` i loggen läser tillbaka som det alltid gjort, och så att en kolumn som var prosa
  // och gjordes till bild är prosa igen när den blir text.
  images: z.record(z.string(), z.boolean()).optional(),
  rules: RuleDoc.optional(),
  fonts: z.record(z.string(), ProjectFont).optional(),
  theme: ProjectTheme.optional(),
  box: ProjectBox.optional(),
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
//
// A face of the box taken over before #1459 keeps the neutral ground of its day, which stopped at the
// trim; it is lifted here to the ground a face gets today (#1463, `liftBoxGrounds`).
export const liftDoc = <T>(doc: T): T => liftBoxGrounds(withoutFraming(liftTemplate(doc)))
const withoutFraming = <T>(doc: T): T => {
  if (typeof doc !== 'object' || doc === null || !('framing' in doc)) return doc
  const { framing: _framing, ...rest } = doc as Record<string, unknown>
  return rest as T
}
// A game as "Mina spel" lists it (G1): what it is called, where its history stands, how many
// tables have been started from it and when one of them was last played at. `card` is the game's
// own first card (G1, #231) — its id and its title, which is what the list needs to know that
// there is a card at all and what to call it. What it takes to draw the card travels apart.
// `cards`, `players` and `savedAt` are what the workbench says of a game (#1204): the copies the
// table deals (#1195), the seats it is set for, and when its newest version was saved.
// `boxOpened` is that a designer has opened the game's box (#1416), only when one has.
export type ProjectSummary = { id: string; name: string; rev: number; tables?: number; lastPlayed?: string | null; role?: Role; card?: CardPeek | null; cards?: number; players?: number; savedAt?: string | null; boxOpened?: boolean }

// A version in the history (B4): every save is one, and none of them is ever written again.
// `label` is the name a designer gave the versions that meant something — a blind test, a print
// order — and nothing else needs naming: the user never has to commit.
// `atSeq` is how far the edit log had come when the version was made (D3), so an actor knows
// which edits are already in it.
// `by` is the account that saved it (#1225), so «Väntar på dig» can say that a co-editor saved a
// version. A version without it has nobody known: one brought in with an import, one saved without
// an account, and most of those saved before the field — none is ever guessed at.
export type VersionSummary = { rev: number; at: string; label?: string; atSeq?: number; by?: string }
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

// The owner's ceilings a write that makes a version is held to (A2, #1192): `projects` on the games
// it owns (#1193), `storageBytes` on what its games name (#1197). Each is counted and written in one
// step, so two writes asked for at a ceiling's last place give exactly one, and the other throws
// `QuotaReached` with nothing written. A ceiling absent or null is unlimited.
export type Ceilings = { projects?: Limit; storageBytes?: Limit }

export type ProjectStore = {
  create(id: string, doc: ProjectDoc, owner?: string, ceilings?: Ceilings): Promise<ProjectRecord>
  // A new project with a history it already had (G5, #528): brought back from an export, each
  // version at its own revision, date and name. The revisions are one save after another from 1,
  // as the history always is; an id that is taken is refused and nothing is written. `ceilings`
  // as for `create`, with what every version names counted.
  restore(id: string, versions: RestoredVersion[], owner?: string, ceilings?: Ceilings): Promise<ProjectRecord>
  // How many games an account owns (#1193): the measure `projects`, counted out of `owner`.
  owned(owner: string): Promise<number>
  // What an account's games use (#1197, #1192 question 4): the measure `storageBytes`, the sum of
  // the sizes of the distinct assets some version of some game it owns names. Derived out of the
  // versions, so a game taken away frees what no other game of the account names, and the history
  // counts as long as it is kept. A name no asset answers to weighs nothing.
  stored(owner: string): Promise<number>
  // Which of these hashes some version of some game the account owns names already (#1197): what
  // costs it nothing again.
  borne(owner: string, hashes: readonly string[]): Promise<Set<string>>
  // Every game some version of which names this asset (#1274): whose owners a block is told to. In
  // id order, with the owner where the game has one.
  using(hash: string): Promise<{ id: string; owner?: string }[]>
  // The games an account owns, by id and in id order (#1195): the ones its cards per game are
  // counted over. Never the ones shared with it, nor a game that belongs to nobody.
  ownedIds(owner: string): Promise<string[]>
  load(id: string): Promise<ProjectRecord | null>
  list(owner: string): Promise<ProjectSummary[]>
  // That a designer has opened the game's box (#1416, L91): the hero in Mina spel shows the box from
  // then on, and the link's picture follows the hero (#1417). Kept on the game and not in its
  // document: it is no change to the game, so it makes no version and no step back, a version
  // taken back does not take it with it, and it holds on every screen and for whoever sees the
  // link. Once is enough and it is never taken back. False when there is no such game.
  openBox(id: string): Promise<boolean>
  boxOpened(id: string): Promise<boolean>
  // Replaces the document if `expectedRev` is current; 'conflict' otherwise (optimistic concurrency).
  // A document that is already the stored one is not a saving (B4): the record comes back at the
  // revision it already had, and the history gains nothing. The history is meant to be read, and
  // a version that changed nothing is a line in it that says nothing. Every way into the history
  // goes through here, so this is where the rule holds rather than at each of the doors.
  // `ceilings.storageBytes` is the owner's ceiling on what its games name (#1197), held as for
  // `create`; a version that names nothing new is never refused.
  // `by` is the account that saves (#1225), kept with the version and never asked for again.
  // `edits` go into the log in the same step as the version, after the ceiling is asked (#1233):
  // the document a `PUT` restores is in the log exactly when its version is answered, so one
  // refused for the ceiling, or as a conflict, has left no trace. A document that is already the
  // stored one makes no version, but its edits are still logged: they are what the log says now.
  replace(id: string, expectedRev: number, doc: ProjectDoc, atSeq?: number, ceilings?: Pick<Ceilings, 'storageBytes'>, edits?: readonly AppliedEdit[], by?: string): Promise<ProjectRecord | 'conflict' | 'missing'>
  // The history, newest first. The first version is the one who made the game's (#1225).
  versions(id: string): Promise<VersionSummary[]>
  // The project as it stood at a revision; null when there is no such version.
  at(id: string, rev: number): Promise<ProjectRecord | null>
  // Names a version, or takes the name back with null.
  label(id: string, rev: number, label: string | null): Promise<VersionSummary | 'missing'>
  // Takes a game away with its whole history; false when there was no such game. Every member but
  // the owner is told it went (#1334), in the same step: by the game's name, `why` and when.
  remove(id: string, why?: GoneWhy): Promise<boolean>
  // The games gone from an account's Mina spel that it has not closed the band of (#1334), oldest
  // first.
  goneFor(account: string): Promise<GoneGame[]>
  // Closes one: the notice goes. False when it is not the account's, or already gone.
  dismissGone(account: string, id: string): Promise<boolean>
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
  // The project an invitation that can still be followed at `now` leads to (#691), without using it.
  inviteTo(tokenHash: string, now: string): Promise<string | null>
  // The invitations used, or run out unused, before `before` (#1277, G6): a third person's address
  // kept for nothing. Dela lists only the ones still waiting. How many went.
  sweepInvites(before: string): Promise<number>
  // The invitations an account sent and the ones sent to its address, whatever became of them
  // (#1280, art. 15): what its extract says of them.
  invitesOf(account: string, email: string): Promise<{ sent: InviteRecord[]; received: InviteRecord[] }>
}

// Why a game went from a member's Mina spel (#1334): its owner took it away, or deleted her account.
export type GoneWhy = 'removed' | 'account'
// What a member is told of it: the game's name, why and when, and never who the owner was (G6).
export type GoneGame = { id: string; name: string; why: GoneWhy; at: string }

// An invitation as the extract tells it: to which game and address, as what, when, and whether it
// was followed.
export type InviteRecord = { project: string; email: string; role: Role; sentAt: string; expiresAt: string; acceptedAt: string | null }

export class MemoryProjectStore implements ProjectStore {
  private readonly docs = new Map<string, ProjectRecord>()
  // The history (B4), by project: one entry per save, appended and never rewritten.
  private readonly history = new Map<string, { rev: number; at: string; label?: string; atSeq?: number; by?: string; doc: ProjectDoc }[]>()
  // The edit log between saves (D3), by project.
  private readonly edits = new Map<string, AppliedEdit[]>()
  // Who else a project is shared with (D3), by project.
  private readonly shared = new Map<string, Map<string, Role>>()
  private readonly invites = new Map<string, { project: string; email: string; role: Role; expiresAt: string; by?: string; sentAt: string; used?: boolean; usedAt?: string }>()
  // The games gone from each member's Mina spel (#1334), by account.
  private readonly gone = new Map<string, GoneGame[]>()
  // The games whose box a designer has opened (#1416).
  private readonly opened = new Set<string>()
  // The writes held to a ceiling on storage, one after another (#1197): weighing asks the asset
  // store, which is a wait, and no other such write may come in between the count and the write.
  private turn: Promise<unknown> = Promise.resolve()

  // `assets` is where the pictures the games name are weighed (#1197); without it every picture
  // weighs nothing, as an asset the store has never seen does.
  constructor(private readonly assets?: Pick<AssetStore, 'sizes'>) {}

  // Counted and written with no wait between them, so no other request can come in between.
  async create(id: string, doc: ProjectDoc, owner?: string, ceilings?: Ceilings): Promise<ProjectRecord> {
    return this.storing(
      owner,
      ceilings?.storageBytes,
      [doc],
      () => {
        if (this.docs.has(id)) throw new Error(`project ${id} already exists`)
        this.within(owner, ceilings?.projects)
        return null
      },
      () => {
        const rec: ProjectRecord = { ...structuredClone(doc), id, rev: 1, ...(owner !== undefined ? { owner } : {}) }
        this.docs.set(id, rec)
        this.history.set(id, [{ rev: 1, at: new Date().toISOString(), ...(owner !== undefined ? { by: owner } : {}), doc: structuredClone(doc) }])
        return structuredClone(rec)
      },
    )
  }

  async restore(id: string, versions: RestoredVersion[], owner?: string, ceilings?: Ceilings): Promise<ProjectRecord> {
    const last = checkedHistory(versions)
    return this.storing(
      owner,
      ceilings?.storageBytes,
      versions.map((v) => v.doc),
      () => {
        if (this.docs.has(id)) throw new Error(`project ${id} already exists`)
        this.within(owner, ceilings?.projects)
        return null
      },
      () => {
        const rec: ProjectRecord = { ...structuredClone(last.doc), id, rev: last.rev, ...(owner !== undefined ? { owner } : {}) }
        this.docs.set(id, rec)
        this.history.set(
          id,
          versions.map((v) => ({ rev: v.rev, at: v.at, ...(v.label !== undefined ? { label: v.label } : {}), doc: structuredClone(v.doc) })),
        )
        return structuredClone(rec)
      },
    )
  }

  // A write that makes versions naming `docs`, held to the owner's ceiling on storage (#1197).
  // `early` is everything the write answers without writing — a refusal it throws, or an answer
  // it returns — and `write` the write itself. With no ceiling it is what it always was, the two
  // with no wait between them. With one it waits its turn behind every other such write, asks
  // `early` in that turn, weighs what the documents name that the owner does not bear yet, and
  // only then checks and writes: still with no wait between the count and the write.
  private async storing<T>(owner: string | undefined, limit: Limit | undefined, docs: readonly ProjectDoc[], early: () => T | null, write: () => T): Promise<T> {
    if (owner === undefined || limit === undefined || limit === null) return early() ?? write()
    const turn = this.turn.then(async () => {
      const answered = early()
      if (answered !== null) return answered
      const mine = this.named(owner)
      const fresh = [...new Set(docs.flatMap(assetHashesOf))].filter((hash) => !mine.has(hash))
      const sizes = await this.weigh([...mine, ...fresh])
      const met = growth('storageBytes', limit, weight([...mine], sizes), weight(fresh, sizes))
      if (met) throw new QuotaReached(met)
      return early() ?? write()
    })
    this.turn = turn.catch(() => undefined)
    return turn
  }

  // Every asset some version of some game the account owns names.
  private named(owner: string): Set<string> {
    const out = new Set<string>()
    for (const [id, rec] of this.docs) {
      if (rec.owner !== owner) continue
      for (const v of this.history.get(id) ?? []) for (const hash of assetHashesOf(v.doc)) out.add(hash)
    }
    return out
  }

  private async weigh(hashes: readonly string[]): Promise<Record<string, number>> {
    return this.assets && hashes.length > 0 ? this.assets.sizes(hashes) : {}
  }

  async stored(owner: string): Promise<number> {
    const mine = [...this.named(owner)]
    return weight(mine, await this.weigh(mine))
  }

  async using(hash: string): Promise<{ id: string; owner?: string }[]> {
    const out: { id: string; owner?: string }[] = []
    for (const [id, rec] of [...this.docs].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
      if ((this.history.get(id) ?? []).some((v) => assetHashesOf(v.doc).includes(hash))) out.push({ id, ...(rec.owner !== undefined ? { owner: rec.owner } : {}) })
    }
    return out
  }

  async borne(owner: string, hashes: readonly string[]): Promise<Set<string>> {
    const mine = this.named(owner)
    return new Set(hashes.filter((hash) => mine.has(hash)))
  }

  async load(id: string): Promise<ProjectRecord | null> {
    const rec = this.docs.get(id)
    return rec ? liftDoc(structuredClone(rec)) : null
  }

  async owned(owner: string): Promise<number> {
    return this.count(owner)
  }

  async ownedIds(owner: string): Promise<string[]> {
    return [...this.docs.values()].filter((rec) => rec.owner === owner).map((rec) => rec.id).sort()
  }

  private count(owner: string): number {
    let n = 0
    for (const rec of this.docs.values()) if (rec.owner === owner) n++
    return n
  }

  private within(owner: string | undefined, limit: Limit | undefined): void {
    if (owner === undefined || limit === undefined) return
    const met = growth('projects', limit, this.count(owner), 1)
    if (met) throw new QuotaReached(met)
  }

  // Every project the account can see: its own, and the ones shared with it.
  async list(account: string): Promise<ProjectSummary[]> {
    const out: ProjectSummary[] = []
    for (const rec of this.docs.values()) {
      const role = await this.roleOf(rec.id, account)
      if (role) out.push({ id: rec.id, name: rec.name, rev: rec.rev, role, card: peekCard(rec.rows), ...(this.opened.has(rec.id) ? { boxOpened: true } : {}) })
    }
    return out
  }

  async openBox(id: string): Promise<boolean> {
    if (!this.docs.has(id)) return false
    this.opened.add(id)
    return true
  }

  async boxOpened(id: string): Promise<boolean> {
    return this.docs.has(id) && this.opened.has(id)
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
    this.invites.set(invite.tokenHash, { project: invite.project, email: invite.email, role: invite.role, expiresAt: invite.expiresAt, ...(invite.by ? { by: invite.by } : {}), sentAt: new Date().toISOString() })
  }

  async invitesOf(account: string, email: string): Promise<{ sent: InviteRecord[]; received: InviteRecord[] }> {
    const all = [...this.invites.values()].sort((a, b) => a.sentAt.localeCompare(b.sentAt))
    const told = (i: (typeof all)[number]): InviteRecord => ({ project: i.project, email: i.email, role: i.role, sentAt: i.sentAt, expiresAt: i.expiresAt, acceptedAt: i.used ? (i.usedAt ?? null) : null })
    return { sent: all.filter((i) => i.by === account).map(told), received: all.filter((i) => i.email.toLowerCase() === email.toLowerCase()).map(told) }
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

  async inviteTo(tokenHash: string, now: string): Promise<string | null> {
    const found = this.invites.get(tokenHash)
    return !found || found.used || found.expiresAt < now ? null : found.project
  }

  async acceptInvite(tokenHash: string, now: string): Promise<{ project: string; email: string; role: Role } | null> {
    const found = this.invites.get(tokenHash)
    if (!found || found.used || found.expiresAt < now) return null
    found.used = true
    found.usedAt = now
    return { project: found.project, email: found.email, role: found.role }
  }

  async sweepInvites(before: string): Promise<number> {
    let n = 0
    for (const [hash, i] of this.invites) if ((i.used ? (i.usedAt ?? '') : i.expiresAt) < before) n += Number(this.invites.delete(hash))
    return n
  }

  async replace(id: string, expectedRev: number, doc: ProjectDoc, atSeq?: number, ceilings?: Pick<Ceilings, 'storageBytes'>, edits: readonly AppliedEdit[] = [], by?: string): Promise<ProjectRecord | 'conflict' | 'missing'> {
    return this.storing<ProjectRecord | 'conflict' | 'missing'>(
      this.docs.get(id)?.owner,
      ceilings?.storageBytes,
      [doc],
      () => {
        const rec = this.docs.get(id)
        if (!rec) return 'missing'
        if (rec.rev !== expectedRev) return 'conflict'
        const { id: _id, rev: _rev, owner: _owner, ...held } = rec
        if (stamp(held) !== stamp(doc)) return null
        // Answered without a version, and so with no ceiling to ask: the edits are logged here.
        this.logged(id, edits)
        return structuredClone(rec)
      },
      () => {
        // `early` has just found it, with no wait since.
        const rec = this.docs.get(id)
        if (!rec) return 'missing'
        this.logged(id, edits)
        const next: ProjectRecord = { ...structuredClone(doc), id, rev: rec.rev + 1, ...(rec.owner !== undefined ? { owner: rec.owner } : {}) }
        this.docs.set(id, next)
        this.history.get(id)?.push({ rev: next.rev, at: new Date().toISOString(), ...(atSeq !== undefined ? { atSeq } : {}), ...(by !== undefined ? { by } : {}), doc: structuredClone(doc) })
        return structuredClone(next)
      },
    )
  }

  async appendEdits(id: string, edits: AppliedEdit[]): Promise<void> {
    this.logged(id, edits)
  }
  private logged(id: string, edits: readonly AppliedEdit[]): void {
    if (edits.length > 0) this.edits.set(id, [...(this.edits.get(id) ?? []), ...structuredClone(edits)])
  }

  async readEdits(id: string, sinceSeq: number): Promise<AppliedEdit[]> {
    return structuredClone((this.edits.get(id) ?? []).filter((e) => e.seq > sinceSeq))
  }

  async versions(id: string): Promise<VersionSummary[]> {
    return [...(this.history.get(id) ?? [])]
      .sort((a, b) => b.rev - a.rev)
      .map((v) => ({ rev: v.rev, at: v.at, ...(v.label !== undefined ? { label: v.label } : {}), ...(v.atSeq !== undefined ? { atSeq: v.atSeq } : {}), ...(v.by !== undefined ? { by: v.by } : {}) }))
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

  async remove(id: string, why: GoneWhy = 'removed'): Promise<boolean> {
    const rec = this.docs.get(id)
    if (rec?.owner !== undefined) {
      const at = new Date().toISOString()
      // The web bundle reads this module too, so the id is Web Crypto's and not `node:crypto`'s.
      for (const account of this.shared.get(id)?.keys() ?? []) {
        if (account !== rec.owner) this.gone.set(account, [...(this.gone.get(account) ?? []), { id: crypto.randomUUID(), name: rec.name, why, at }])
      }
    }
    const had = this.docs.delete(id)
    this.opened.delete(id)
    this.history.delete(id)
    this.edits.delete(id)
    this.shared.delete(id)
    for (const [hash, i] of this.invites) if (i.project === id) this.invites.delete(hash)
    return had
  }

  async goneFor(account: string): Promise<GoneGame[]> {
    return structuredClone(this.gone.get(account) ?? [])
  }

  async dismissGone(account: string, id: string): Promise<boolean> {
    const all = this.gone.get(account) ?? []
    const kept = all.filter((g) => g.id !== id)
    this.gone.set(account, kept)
    return kept.length < all.length
  }

  // An account that deleted itself (#1280), as Postgres forgets it: its games go, each member told
  // why (#1334), and the versions and edits it made in other games, its memberships, the invitations
  // it sent or was sent and the games gone from its own Mina spel no longer say it.
  forgetAccount(account: string, email: string): void {
    for (const [id, rec] of this.docs) if (rec.owner === account) void this.remove(id, 'account')
    this.gone.delete(account)
    for (const versions of this.history.values()) for (const v of versions) if (v.by === account) delete v.by
    for (const edits of this.edits.values()) for (const e of edits) if (e.by === account) delete e.by
    for (const members of this.shared.values()) members.delete(account)
    for (const [hash, i] of this.invites) if (i.by === account || i.email.toLowerCase() === email.toLowerCase()) this.invites.delete(hash)
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

// What these weigh together, a hash the store does not have weighing nothing.
const weight = (hashes: readonly string[], sizes: Record<string, number>): number => hashes.reduce((n, hash) => n + (sizes[hash] ?? 0), 0)
