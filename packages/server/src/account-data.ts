import { z } from 'zod'
import { strToU8, zipSync } from 'fflate'
import type { Account, AuthStore, Lang } from './auth.js'
import type { ServerOptions } from './server.js'
import type { InviteRecord } from './projects.js'
import { answeredBy, ownLines } from './erase.js'

// The account's own extract (#1280, G6, art. 15 och 20): everything Deckster keeps about one
// account, as a zip she downloads straight from the Konto card (variant A). It has the form of a
// game's export (G5): the data as JSON, its JSON Schema out of the very zod schema that writes it,
// and a LASMIG.md in the language she asked in (A4). The names are a format and never translated,
// and ASCII, for the unzip macOS ships (`export.ts`).
//
//   uppgifter.json  the data below
//   schema.json     its JSON Schema
//   LASMIG.md       what each part is
//
// A game's own content is not here: that is the game's export, under ⋯ in Mina spel. And nothing
// here is about another account: a game is named with her role in it, never with its members.

export const PERSONAL_DATA_FORMAT = 'deckster-personal-data'
export const PERSONAL_DATA_FORMAT_VERSION = 1

const When = z.string()
const Role = z.enum(['owner', 'editor', 'tester', 'viewer'])
const Invite = z.object({ game: z.string().nullable(), email: z.string(), role: Role, sentAt: When, expiresAt: When, acceptedAt: When.nullable() })
export const PersonalData = z.object({
  format: z.literal(PERSONAL_DATA_FORMAT),
  formatVersion: z.literal(PERSONAL_DATA_FORMAT_VERSION),
  exportedAt: When,
  release: z.string().optional(),
  // The account itself: its address, the name the others call it by (#1254), when it was made, its
  // tier (A2) and every version of the terms it accepted, with when (#1270).
  account: z.object({
    id: z.string(),
    email: z.string(),
    name: z.string().nullable(),
    createdAt: When,
    plan: z.object({ plan: z.string(), since: When, source: z.string() }).nullable(),
    terms: z.array(z.object({ version: z.string(), acceptedAt: When })),
  }),
  // How it logs in: each passkey without its key (DRIFT §11), the browsers logged in by when each
  // lapses, and the login links sent to its address.
  passkeys: z.array(z.object({ aaguid: z.string(), device: z.string(), transports: z.array(z.string()), createdAt: When, lastUsedAt: When.nullable() })),
  logins: z.array(z.object({ expiresAt: When })),
  loginLinks: z.array(z.object({ expiresAt: When, usedAt: When.nullable() })),
  // Its own AI key (E4): which provider and the last four, never the key (DRIFT §5).
  aiKey: z.object({ provider: z.string(), last4: z.string(), model: z.string().nullable(), verifiedAt: When }).nullable(),
  // The games it owns or is a member of, with its role, the versions it saved and how many edits
  // it made between saves (D3). The game itself is its export (G5).
  games: z.array(z.object({ id: z.string(), name: z.string(), role: Role, versionsSaved: z.array(z.object({ rev: z.number().int(), at: When })), edits: z.number().int() })),
  // The invitations it sent, with the address it sent them to, and the ones sent to its address.
  invitesSent: z.array(Invite),
  invitesReceived: z.array(Invite),
  // The tables it claimed (G1): where it sat or watched, under which name, and what it wrote there:
  // the flags, the notes and its survey. The moves are the table's and its game's owner's.
  tables: z.array(
    z.object({
      session: z.string(),
      game: z.string().nullable(),
      version: z.string(),
      kind: z.enum(['seat', 'observer']),
      seat: z.string().nullable(),
      name: z.string(),
      at: When,
      ended: z.boolean(),
      flags: z.array(z.object({ at: When, note: z.string().optional(), component: z.string().optional() })),
      notes: z.array(z.object({ at: When, text: z.string() })),
      survey: z.object({ at: When, answers: z.record(z.string(), z.unknown()) }).nullable(),
    }),
  ),
  // What the account bears (A2): the tables started from its games or by it, and its renderings.
  borne: z.object({ tables: z.number().int(), renders: z.number().int() }),
})
export type PersonalData = z.infer<typeof PersonalData>

export function personalDataSchema(): unknown {
  return z.toJSONSchema(PersonalData, { io: 'input', unrepresentable: 'any' })
}

// What the zip is called when it is saved: the day it was made, which is what tells two apart.
export function personalDataDisposition(at: Date): string {
  return `attachment; filename="deckster-uppgifter-${at.toISOString().slice(0, 10)}.zip"`
}

export function packPersonalData(data: PersonalData, lang: Lang): Uint8Array {
  return zipSync({
    'uppgifter.json': strToU8(`${JSON.stringify(data, null, 2)}\n`),
    'schema.json': strToU8(`${JSON.stringify(personalDataSchema(), null, 2)}\n`),
    'LASMIG.md': strToU8(personalReadme(lang, data)),
  })
}

export function personalReadme(lang: Lang, data: PersonalData): string {
  const day = new Date(data.exportedAt).toLocaleDateString(lang === 'en' ? 'en-GB' : 'sv-SE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  if (lang === 'en') {
    return `# Your data in Deckster

The file uppgifter.json holds everything Deckster kept about your account on ${day}, in the format schema.json describes.

- account: your address and your name.
`
  }
  return `# Dina uppgifter i Deckster

Filen uppgifter.json innehåller allt Deckster hade sparat om ditt konto den ${day}, i det format som schema.json beskriver.

- account: din adress och ditt namn.
`
}

// Read out of every store the account leaves something in, as the server holds them.
export async function personalDataOf(opts: ServerOptions, auth: AuthStore, account: Account, at: Date): Promise<PersonalData> {
  const facts = await auth.accountFacts(account.id)
  const plan = (await opts.accountPlans?.planOf(account.id)) ?? null
  const key = (await opts.ai?.vault.describe(account.id)) ?? null
  const projects = opts.projects
  const gameName = async (id: string | undefined) => (id && projects ? ((await projects.load(id))?.name ?? null) : null)
  const games: PersonalData['games'] = []
  for (const summary of projects ? await projects.list(account.id) : []) {
    if (!projects) break
    // A game from before accounts is everybody's and so nobody's: it says nothing about her.
    const role = await projects.roleOf(summary.id, account.id)
    const rec = await projects.load(summary.id)
    if (!role || !rec || rec.owner === undefined) continue
    const versionsSaved = (await projects.versions(summary.id)).filter((v) => v.by === account.id).map((v) => ({ rev: v.rev, at: v.at }))
    const edits = (await projects.readEdits(summary.id, 0)).filter((e) => e.by === account.id).length
    games.push({ id: summary.id, name: summary.name, role, versionsSaved, edits })
  }
  const invites = projects ? await projects.invitesOf(account.id, account.email) : { sent: [], received: [] }
  const told = async (i: InviteRecord) => ({ game: await gameName(i.project), email: i.email, role: i.role, sentAt: i.sentAt, expiresAt: i.expiresAt, acceptedAt: i.acceptedAt })
  const tables: PersonalData['tables'] = []
  for (const g of await opts.store.guestsOf(account.id)) {
    const session = await opts.store.loadSession(g.sessionId)
    if (!session) continue
    const log = await opts.store.read(g.sessionId)
    // The admission as the table holds it, among the others there: whose a line is is read off
    // that list (`ownLines`).
    const guests = await opts.store.guestsAt(g.sessionId)
    const lines = ownLines(log, guests, guests.find((o) => o.tokenHash === g.tokenHash) ?? g)
    const flags = lines.flatMap((l) => (l.intent.v === 'flag' ? [{ at: l.at, ...(l.intent.note !== undefined ? { note: l.intent.note } : {}), ...(l.intent.component !== undefined ? { component: l.intent.component } : {}) }] : []))
    const notes = lines.flatMap((l) => (l.intent.v === 'note.add' || l.intent.v === 'note.edit' ? [{ at: l.at, text: l.intent.text }] : []))
    const answer = opts.surveys ? (await opts.surveys.list(g.sessionId)).find((s) => answeredBy(s, g)) : undefined
    tables.push({
      session: g.sessionId,
      game: await gameName(session.project),
      version: session.version,
      kind: g.kind,
      seat: g.seat,
      name: g.name,
      at: g.issuedAt,
      ended: log.some((l) => l.intent.v === 'session.end'),
      flags,
      notes,
      survey: answer ? { at: answer.at, answers: answer.answers } : null,
    })
  }
  return {
    format: PERSONAL_DATA_FORMAT,
    formatVersion: PERSONAL_DATA_FORMAT_VERSION,
    exportedAt: at.toISOString(),
    ...(opts.release ? { release: opts.release } : {}),
    account: {
      id: account.id,
      email: account.email,
      name: account.name ?? null,
      createdAt: facts?.createdAt ?? at.toISOString(),
      plan: plan ? { plan: plan.plan, since: plan.since, source: plan.source } : null,
      terms: (await auth.termsAccepted(account.id)).map((t) => ({ version: t.version, acceptedAt: t.at })),
    },
    passkeys: (await auth.passkeysOf(account.id)).map((p) => ({ aaguid: p.aaguid, device: p.device, transports: p.transports, createdAt: p.createdAt, lastUsedAt: p.lastUsedAt })),
    logins: facts?.sessions ?? [],
    loginLinks: facts?.loginLinks ?? [],
    aiKey: key ? { provider: key.provider, last4: key.last4, model: key.model, verifiedAt: key.verifiedAt } : null,
    games,
    invitesSent: await Promise.all(invites.sent.map(told)),
    invitesReceived: await Promise.all(invites.received.map(told)),
    tables,
    borne: { tables: (await opts.store.tablesOf(account.id, new Date(0))).started, renders: opts.renders ? await opts.renders.rendersBy(account.id, 0) : 0 },
  }
}

// What «Radera kontot…» names (#1280, variant A): every game that goes with the account, who else
// loses it — by the name they gave, or their address, as Dela says them to the owner — and how many
// of its tables are playing; every game it leaves, with the owner's name and never her address
// (#1198); and how many tables it claimed.
export type Deletion = {
  games: { id: string; name: string; others: string[]; playing: number }[]
  leaving: { id: string; name: string; owner: string | null }[]
  tables: number
}
export async function deletionOf(opts: ServerOptions, account: Account): Promise<Deletion> {
  const projects = opts.projects
  const auth = opts.auth
  const games: Deletion['games'] = []
  const leaving: Deletion['leaving'] = []
  for (const summary of projects ? await projects.list(account.id) : []) {
    if (!projects) break
    const rec = await projects.load(summary.id)
    if (!rec || rec.owner === undefined) continue
    if (rec.owner === account.id) {
      const others: string[] = []
      for (const m of await projects.members(summary.id)) {
        if (m.account === account.id) continue
        const who = await auth?.accountById(m.account)
        if (who) others.push(who.name ?? who.email)
      }
      let playing = 0
      for (const table of await opts.store.sessionsOf(summary.id)) if ((await opts.store.readVerbs(table.id, ['session.end'])).length === 0) playing++
      games.push({ id: summary.id, name: summary.name, others, playing })
    } else leaving.push({ id: summary.id, name: summary.name, owner: (await auth?.accountById(rec.owner))?.name ?? null })
  }
  return { games, leaving, tables: (await opts.store.guestsOf(account.id)).length }
}
