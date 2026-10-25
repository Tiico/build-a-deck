import { z } from 'zod'
import { strToU8, zipSync } from 'fflate'
import { canSeeFace, initialState, replay, type TypeRegistry } from '@byd/engine'
import type { Applied } from '@byd/protocol'
import { titleOfFields } from './names.js'
import type { SessionInfo } from './store.js'
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
const FlaggedCard = z.union([z.object({ name: z.string() }), z.object({ name: z.null(), why: z.enum(['face-down', 'untitled', 'unknown']) })])
type FlaggedCard = z.infer<typeof FlaggedCard>
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
      // A flag about a card (#1142) names it as the table had it (#1350), beside the id it had
      // there. A card that lay face down for her is not named, since its name is what was hidden
      // (B6); nor one the table no longer knows. Either is said, and never left a bare id.
      flags: z.array(z.object({ at: When, note: z.string().optional(), component: z.string().optional(), card: FlaggedCard.optional() })),
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

// What she reads first (#1350, art. 15): a line for every part of uppgifter.json and a word for
// every field in it, in her language. The keys are the format's and stay as they are; a test reads
// them out of the schema, so a part added without a line here is red.
export function personalReadme(lang: Lang, data: PersonalData): string {
  const day = new Date(data.exportedAt).toLocaleDateString(lang === 'en' ? 'en-GB' : 'sv-SE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  if (lang === 'en') {
    return `# Your data in Deckster

The file \`uppgifter.json\` holds everything Deckster kept about your account on ${day}, in the format \`schema.json\` describes.
Nothing in it is about another account.
A game's own cards and rules are not here: you download a game as an export under ⋯ in My games.
Times are in UTC, written like \`2026-10-25T14:03:00.000Z\`, and \`null\` means there is nothing to say.

## What each part is

- \`format\`: what the file is, always \`${PERSONAL_DATA_FORMAT}\`.
- \`formatVersion\`: which version of the format the file follows.
- \`exportedAt\`: when the extract was made.
- \`release\`: which release of Deckster made it.
- \`account\`: the account itself.
  \`id\` is its id in Deckster, \`email\` the address you log in with, \`name\` the name the others see you by, and \`createdAt\` when it was made.
  \`plan\` is the account's tier: \`plan\` its name, \`since\` since when, and \`source\` who set it.
  \`terms\` is every version of the terms you accepted (\`version\`) and when (\`acceptedAt\`).
- \`passkeys\`: your passkeys, without the key itself.
  \`device\` is the device it was made on, \`aaguid\` which kind of passkey it is, \`transports\` how the browser reaches it, \`createdAt\` when it was made and \`lastUsedAt\` when it was last used.
- \`logins\`: the browsers logged in to your account, with \`expiresAt\`, when each login lapses.
- \`loginLinks\`: the login links sent to your address, with \`expiresAt\`, when each stops working, and \`usedAt\`, when it was used.
- \`aiKey\`: your own AI key, without the key itself.
  \`provider\` is whose key it is, \`last4\` its last four characters, \`model\` the model you chose and \`verifiedAt\` when it was last tried.
- \`games\`: the games you own or are a member of.
  \`id\` and \`name\` are the game's, \`role\` is yours in it (\`owner\`, \`editor\`, \`tester\` or \`viewer\`), \`versionsSaved\` the versions you saved, each by number (\`rev\`) and when (\`at\`), and \`edits\` how many changes you made.
- \`invitesSent\`: the invitations you sent.
  \`game\` is the game's name, \`email\` the address you invited, \`role\` the role offered, \`sentAt\` when, \`expiresAt\` when it lapses and \`acceptedAt\` when it was accepted.
- \`invitesReceived\`: the invitations sent to your address, with the same fields: \`game\`, \`email\`, \`role\`, \`sentAt\`, \`expiresAt\` and \`acceptedAt\`. Who sent them is not said.
- \`tables\`: the tables you sat at or watched and then claimed to your account.
  \`session\` is the table's id, \`game\` the game's name, \`version\` the version it was played in, \`kind\` whether you had a seat (\`seat\`) or watched (\`observer\`), \`seat\` which seat, \`name\` the name you went by there, \`at\` when you came in and \`ended\` whether the table has ended.
  \`flags\` are the moments you flagged: \`at\` when, \`note\` what you wrote, \`component\` the card's id at the table and \`card\` which card it was.
  \`card\` has the card's \`name\`; when it is \`null\`, \`why\` says why: \`face-down\` when the card lay face down for you, so its name stayed hidden, \`untitled\` when the card has no name in the game, and \`unknown\` when the table no longer knows the card.
  \`notes\` are the lines you wrote on the table's notepad: \`at\` when and \`text\` what.
  \`survey\` is your survey after the game: \`at\` when you answered and \`answers\` what, from 1 to 5 for \`fun\`, \`clarity\` and \`balance\`, and in your own words for \`change\`.
  The moves themselves belong to the table and its game's owner, and are not here.
- \`borne\`: what your account bears: \`tables\`, how many tables were started from your games or by you, and \`renders\`, how many card pictures were rendered for you.
`
  }
  return `# Dina uppgifter i Deckster

Filen \`uppgifter.json\` innehåller allt Deckster hade sparat om ditt konto den ${day}, i det format som \`schema.json\` beskriver.
Ingenting i den handlar om ett annat konto.
Ett spels egna kort och regler finns inte här: ett spel laddar du ner som export under ⋯ i Mina spel.
Tider står i UTC, skrivna som \`2026-10-25T14:03:00.000Z\`, och \`null\` betyder att det inte finns något att säga.

## Vad varje del är

- \`format\`: vad filen är, alltid \`${PERSONAL_DATA_FORMAT}\`.
- \`formatVersion\`: vilken version av formatet filen följer.
- \`exportedAt\`: när utdraget gjordes.
- \`release\`: vilken version av Deckster som gjorde det.
- \`account\`: själva kontot.
  \`id\` är dess id i Deckster, \`email\` adressen du loggar in med, \`name\` namnet de andra ser dig under och \`createdAt\` när det skapades.
  \`plan\` är kontots nivå: \`plan\` vad den heter, \`since\` sedan när och \`source\` vem som satte den.
  \`terms\` är varje version av villkoren du har godkänt (\`version\`) och när (\`acceptedAt\`).
- \`passkeys\`: dina passkeys, utan själva nyckeln.
  \`device\` är enheten den skapades på, \`aaguid\` vilken sorts passkey det är, \`transports\` hur webbläsaren når den, \`createdAt\` när den skapades och \`lastUsedAt\` när den senast användes.
- \`logins\`: webbläsarna som är inloggade på ditt konto, med \`expiresAt\`, när varje inloggning går ut.
- \`loginLinks\`: inloggningslänkarna som skickats till din adress, med \`expiresAt\`, när varje slutar gälla, och \`usedAt\`, när den användes.
- \`aiKey\`: din egen AI-nyckel, utan själva nyckeln.
  \`provider\` är vems nyckel det är, \`last4\` dess fyra sista tecken, \`model\` modellen du valde och \`verifiedAt\` när den senast prövades.
- \`games\`: spelen du äger eller är med i.
  \`id\` och \`name\` är spelets, \`role\` din roll i det (\`owner\` ägare, \`editor\` redigerare, \`tester\` testare eller \`viewer\` läsare), \`versionsSaved\` versionerna du sparade, var och en med nummer (\`rev\`) och när (\`at\`), och \`edits\` hur många ändringar du gjorde.
- \`invitesSent\`: inbjudningarna du har skickat.
  \`game\` är spelets namn, \`email\` adressen du bjöd in, \`role\` rollen du erbjöd, \`sentAt\` när, \`expiresAt\` när den går ut och \`acceptedAt\` när den togs emot.
- \`invitesReceived\`: inbjudningarna som skickats till din adress, med samma fält: \`game\`, \`email\`, \`role\`, \`sentAt\`, \`expiresAt\` och \`acceptedAt\`. Vem som skickade dem står inte med.
- \`tables\`: borden du satt vid eller tittade på och sedan knöt till ditt konto.
  \`session\` är bordets id, \`game\` spelets namn, \`version\` versionen det spelades i, \`kind\` om du hade en plats (\`seat\`) eller tittade på (\`observer\`), \`seat\` vilken plats, \`name\` namnet du hade där, \`at\` när du kom in och \`ended\` om bordet är avslutat.
  \`flags\` är stunderna du flaggade: \`at\` när, \`note\` vad du skrev, \`component\` kortets id vid bordet och \`card\` vilket kort det var.
  \`card\` har kortets namn i \`name\`; när det är \`null\` säger \`why\` varför: \`face-down\` när kortet låg med baksidan upp för dig, så att namnet förblev dolt, \`untitled\` när kortet inte har något namn i spelet och \`unknown\` när bordet inte längre känner kortet.
  \`notes\` är raderna du skrev i bordets anteckningar: \`at\` när och \`text\` vad.
  \`survey\` är din enkät efter spelet: \`at\` när du svarade och \`answers\` vad, från 1 till 5 för \`fun\` (roligt), \`clarity\` (tydligt) och \`balance\` (jämnt), och med egna ord för \`change\` (vad du skulle ändra).
  Själva dragen hör till bordet och spelets ägare och står inte här.
- \`borne\`: vad ditt konto står för: \`tables\`, hur många bord som startats från dina spel eller av dig, och \`renders\`, hur många kortbilder som renderats åt dig.
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
    const flags = lines.flatMap((l) =>
      l.intent.v === 'flag'
        ? [{ at: l.at, ...(l.intent.note !== undefined ? { note: l.intent.note } : {}), ...(l.intent.component !== undefined ? { component: l.intent.component, card: flaggedCard(session, log, l, l.intent.component, opts.registry) } : {}) }]
        : [],
    )
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

// The card a flag is about, as the table had it just before the flag (#1350): the log is replayed
// from the table's start, as the designer's reading of the same flag does (`playtest.ts`). The name
// is the row's title in the deck the table was playing, which the table keeps for itself, so a card
// since taken out of the game is still named; a counter or a die is named by what it is. Only a
// card she could see the face of is named: the name of one lying face down for her is what the
// table kept from her (B6), and an extract is no way round that.
function flaggedCard(session: SessionInfo, log: readonly Applied[], flag: Applied, id: string, registry: TypeRegistry): FlaggedCard {
  try {
    const state = replay(initialState(session.version, session.setup, registry), registry, log.filter((l) => l.seq < flag.seq))
    const component = state.components[id]
    if (!component) return { name: null, why: 'unknown' }
    const observer = flag.by === null && flag.intent.v === 'flag' && flag.intent.observer !== undefined
    if (!canSeeFace(state, registry, component, flag.by, observer)) return { name: null, why: 'face-down' }
    const fields = state.setup.cards?.[component.cardRef]
    const name = fields ? titleOfFields(fields) : component.cardRef
    return name ? { name } : { name: null, why: 'untitled' }
  } catch {
    return { name: null, why: 'unknown' }
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
