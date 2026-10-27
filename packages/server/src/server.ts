import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { compressible, encodedBytes, encodedCopy, precompressed, typeOf } from './compress.js'
import { sharedPage } from './share.js'
import { WebSocketServer, type WebSocket } from 'ws'
import { z } from 'zod'
import { ASSET_MAX_BYTES, assetFormatsNamed, assetKindDeclared, ClientMessage, PHYSICAL_VERBS, REDACTED, SEATINGS, TABLE_PROTOCOL, hostKeyOfProtocols, offersTableProtocol, sniffAsset, tokenOfProtocols, type Applied, type Seating, type ServerMessage } from '@byd/protocol'
import { CARD_STANDARD_63x88, validateSetup, type DeckFacts, type SetupDef, type TypeRegistry } from '@byd/engine'
import { renderRules, Template, validateCard, type Issue } from '@byd/template'
import { A5, bookletOf } from './booklet.js'
import { contentHash, contentTypeOf, type ObjectStore, type RenderKind, type RenderRequest, type RenderStore } from '@byd/render/queue'
import type { Subscriber, TableActor, TableHost } from './actor.js'
import type { Deck, LogStore, SessionRecord } from './store.js'
import { ProjectDoc, deckFromProject, liftDoc, type Ceilings, type ProjectCredit, type ProjectRecord, type ProjectStore, type RuleDoc } from './projects.js'
import { playable, setupFromProject } from './setup.js'
import { changeOf, diffProjects, type DocDiff, type VersionChange } from './diff.js'
import { ProjectHost, type EditorMessage, type Saved } from './project-actor.js'
import { checkedName, type EditIntent } from './edits.js'
import { arrangementOf, fanFaces, namesOfProject, peekFace, type CardFace } from './names.js'
import { coverOf, showsCover } from './box.js'
import { SurveyAsk, SurveyBody, sameSender, type SurveyAnswer, type SurveyStanding, type SurveyStore } from './surveys.js'
import { playtestOf, type PlaytestSource } from './playtest.js'
import { playtestWaiting, WAITING_VERBS, type GameWaiting, type Waiting, type WaitingTable } from './waiting.js'
import { COOKIE, LoginBody, LoginLimiter, SESSION_TTL_MS, TOKEN_TTL_MS, accountOf, hash, langOf, loginMail, safeNext, splitFragment, token, type Account, type AuthStore, type Mailer } from './auth.js'
import { CODE_TTL_MS, GUEST_PENDING_TTL_MS, codeExpiry, newCode, newSecret, normaliseCode } from './rooms.js'
import { canDelete, canEdit, canRead, canShare, canStartTables, INVITE_TTL_MS, roleWord, ROLES, type Role } from './roles.js'
import { inviteMail } from './invite-mail.js'
import { NAME_MAX, nameOf } from './account-name.js'
import { printExportOf, queueFaces } from './faces.js'
import { printFileJobsOf, printManifestOf, type PrintFileJob } from './print-files.js'
import { boxFactsOf, boxPrintOf } from './box-print.js'
import { Country, routeOrder, widestBleedMm, type PrintManifest, type PrintProvider, type Route } from '@byd/print'
import { PRINT_PACKAGE_FORMAT, PRINT_PACKAGE_FORMAT_VERSION, packPrintPackage, printPackageDisposition, printPackageReadme, printPathOf, type PrintPackageBox, type PrintPackageManifest } from './print-package.js'
import { EXPORT_FORMAT, EXPORT_FORMAT_VERSION, EXPORT_SUMMARY_HEADER, ProjectExport, RULEBOOK_FILE, assetFileOf, assetHashesOf, duplicatedName, exportDisposition, exportSummaryOf, importedName, packExport, printFileOf, readExport, readmeOf, type ImportProblem } from './export.js'
import { BlockedAsset, ReportBody, type ReportStore } from './reports.js'
import { REPORT_SECTION, operatorMail, receiptMail } from './report-mail.js'
import { MotifBody, assetHash, svgBytesRefusal, resolveAssets, resolveFonts, resolveIcons, resolveRuleImages, resolveTemplate, type AssetStore } from './assets.js'
import { TEXTURE_DPI } from './actor.js'
import { AI_PROVIDERS, KeyTryLimiter, type AiKeyDescription, type AiKeyVault } from './ai-keys.js'
import { AiProviderError, type AiProviders } from './ai-providers.js'
import type { Corpus } from './corpus.js'
import { screenOnUpload, type ScreeningOnUpload } from './screening.js'
import { AI_CAPS, ASK_MAX_BYTES, AiFlight, AskBody, answerQuestion, type AiCaps } from './ai-ask.js'
import { PasskeyChallenges, login as passkeyLogin, loginOptions, register, registrationOptions, siteOf, viewOf, type Answer, type Ceremonies } from './passkeys.js'
import { REFERRER_POLICY, UPLOAD_POLICY, pageNonce, pagePolicy, scriptHashesOf, socketOrigin } from './csp.js'
import { DEFAULT_PLANS, QuotaReached, YOU, growth, limitOf, tableWindowFrom, type Bearer, type Limit, type Measure, type Plans, type QuotaMet, type TableCeilings } from './quotas.js'
import { planOf, usageOf, type AccountPlanStore } from './account-plans.js'
import { NO_CARDS, cardGrowth, cardsUsed, type CardMeasure } from './quota-cards.js'
import { checkRegister, openToTheDue, termsInForce, termsStanding, type TermsRegister, type TermsStanding } from './terms.js'
import { entry, isMasked, type ErasureStore } from './erase.js'
import { deletionOf, packPersonalData, personalDataDisposition, personalDataOf } from './account-data.js'
import { erasedMail } from './erased-mail.js'

// `staticDir`: the built web app, served from the same origin as the API (README, DRIFT §1).
// `auth` and `mailer` turn on accounts (G1): projects then belong to whoever made them.
// `publicOrigin` is what login links point at; without it the request's origin is used.
export type ServerOptions = {
  host: TableHost
  store: LogStore
  registry: TypeRegistry
  renders?: RenderStore
  // The object store the outputs live in (DRIFT §4), asked by /health (§2).
  objects?: ObjectStore
  // The project's images (E1): uploaded by creators, served by hash.
  assets?: AssetStore
  projects?: ProjectStore
  surveys?: SurveyStore
  staticDir?: string
  auth?: AuthStore
  mailer?: Mailer
  publicOrigin?: string
  // Where the browser lands after the link (the web app); defaults to a path on this origin. In
  // development the web app is served from another port than the API.
  appOrigin?: string
  // Explicit local/test escape hatch: create the session on POST /auth/login instead of mailing.
  // Never infer this from missing mail configuration; production must opt in deliberately.
  authBypass?: boolean
  // One per server: how many login links an address may get per hour.
  limiter?: LoginLimiter
  // One per server: the passkey ceremonies' one-use challenges (#1180).
  passkeyChallenges?: PasskeyChallenges
  // The print partners the platform prepares orders for (F2), each through the same contract. None
  // by default; the print package (#1208) is where the first one, a fake, is registered.
  printProviders?: readonly PrintProvider[]
  // The clock, for tests: what codes and tokens expire against.
  now?: () => Date
  // The release this process is running, named in /health so the box can be asked what it is
  // (DRIFT §7, §8): the box is otherwise mute about its own version.
  release?: string
  // Where a beta tester turns (#757, DRIFT): the box's own setting (`BYD_CONTACT`), named in
  // /health so the login card and Mina spel can say it, and in the foot of the login mail. Never an
  // address in the code; nothing is said when the box was given none.
  contact?: string
  // The designer's own key for the editor's AI help (#999, E4): sealed in the vault, proved and
  // listed through the providers, tried a handful of times an hour per account. Without it the
  // profile has no key to keep. `caps` are the ceilings on the editor's questions (#1001, `AI_CAPS`).
  ai?: { vault: AiKeyVault; providers: AiProviders; limiter?: KeyTryLimiter; caps?: Partial<AiCaps> }
  // The replay corpus's door (#1011, DRIFT §7): the operator, and the accounts that said yes in
  // their invitation, whose tables' exports the operator may read. Read from the box's settings
  // at start (`corpusFromEnv`); without it no account reads another's tables.
  corpus?: Corpus
  // The tiers (#1193, A2): read from `BYD_PLANS` at start (`plansAtStart`), and without them the
  // built-in standard, where nothing is limited. `accountPlans` says which tier each account has;
  // without it every account has the default. Only with accounts on (`auth`) is anything asked:
  // without accounts nobody bears anything.
  plans?: Plans
  accountPlans?: AccountPlanStore
  // The terms' versions (#1270, `terms.ts`): the box runs with `TERMS` (`main.ts`), and a test with
  // its own. Without one no terms apply, as without `auth` there are no accounts.
  terms?: TermsRegister
  // The erasure (#1279, G6): a game taken away masks its tables with it. Without it a game's tables
  // are masked by the sweeper's next round, which finds the tables of every game that is gone.
  erasures?: ErasureStore
  // Screening in shadow mode (F4, beslut 10; #1273): every new picture uploaded is queued to be
  // screened by this classifier, in the background, and nothing waits for it or is told of it. The
  // box screens with `CURRENT_CLASSIFIER`; without it nothing is queued, as in a test about
  // something else, or a server whose renders go nowhere.
  screening?: ScreeningOnUpload
  // Reports and blocks (#1274): `POST /reports` keeps what was reported and sends the receipt, and the
  // owners and co-editors of a game ask which of its pictures are blocked. The asset store the server is
  // handed is already the one that treats a blocked hash as not there (`blocking`). Without it nobody
  // can report anything here.
  reports?: ReportStore
}
const BOOKLET: RenderKind = { kind: 'booklet' }
const clock = (opts: ServerOptions): Date => (opts.now ?? (() => new Date()))()

// The contract when a ceiling is met (#1192): 402, a code and the numbers, and nothing written.
// `bearer` is `you` when the one asking bears the cost and `owner` when the game's owner does, with
// `ownerName` beside it (#1198, the account's own name since #1254); the owner's address and tier are never said to anyone else. 402 because no other door uses it: 401 and
// 403 are login and role in the clients, 409 a taken seat or a conflict, and 429 rate limiting. The
// client says it in the reader's words (A4), never as the status.
function quotaRefused(res: ServerResponse, met: QuotaMet, bearer: Bearer): void {
  json(res, 402, { error: 'quota', quota: { ...met, ...bearer } })
}
// The owner as the contract says her to someone else (#1198): by the name she gave her account
// (#1254), and never by the address nor by the word the address suggests (beslut 2). An owner the
// box has no account for, or who has given no name, is said without one.
async function ownerBearer(opts: ServerOptions, owner: string | undefined): Promise<Bearer> {
  const ownerName = owner === undefined ? null : ((await opts.auth?.accountById(owner))?.name ?? null)
  return ownerName === null ? { bearer: 'owner' } : { bearer: 'owner', ownerName }
}
// Who bears a game's cost, in the words of the contract: the one asking, or its owner.
const bearerOf = async (opts: ServerOptions, asking: Account | null, owner: string | undefined): Promise<Bearer> => (asking && asking.id === owner ? YOU : await ownerBearer(opts, owner))

// An account's ceiling on a measure (#1193, #1197), out of its tier. Undefined when nobody bears the
// cost — accounts off, or a game from before accounts — so the store is asked nothing.
async function ceilingOf(opts: ServerOptions, owner: string | undefined, measure: Measure): Promise<Limit | undefined> {
  if (!opts.auth || owner === undefined) return undefined
  const plans = opts.plans ?? DEFAULT_PLANS
  return limitOf(plans, await planOf(opts.accountPlans, plans, owner), measure)
}
// The owner's ceiling on storage as the store takes it (#1197): nothing when there is none to hold.
async function storageCeiling(opts: ServerOptions, owner: string | undefined): Promise<Pick<Ceilings, 'storageBytes'>> {
  const limit = await ceilingOf(opts, owner, 'storageBytes')
  return limit === undefined ? {} : { storageBytes: limit }
}

// Whether naming `hashes` in one of the owner's games would take it over its ceiling on storage
// (#1197): the ceiling met, or null. Storage is what the owner's games use, so only what no version
// of any of its games names yet weighs anything, and an asset the box does not have weighs nothing.
// `carried` weighs what is not on the box yet — an import's pictures — before any of it is written.
// Asked at the door, before anything is written; the store asks again in the step that writes the
// version, so two writes racing for the last bytes still give exactly one.
async function storageMet(opts: ServerOptions, projects: ProjectStore, owner: string | undefined, hashes: readonly string[], carried: Record<string, number> = {}): Promise<QuotaMet | null> {
  const limit = await ceilingOf(opts, owner, 'storageBytes')
  if (owner === undefined || limit === undefined || limit === null || hashes.length === 0) return null
  const borne = await projects.borne(owner, hashes)
  const fresh = [...new Set(hashes)].filter((hash) => !borne.has(hash))
  if (fresh.length === 0) return null
  const here = opts.assets ? await opts.assets.sizes(fresh.filter((hash) => carried[hash] === undefined)) : {}
  const added = fresh.reduce((n, hash) => n + (carried[hash] ?? here[hash] ?? 0), 0)
  return growth('storageBytes', limit, await projects.stored(owner), added)
}

// The ceilings on the tables an account bears (#1196): its tier's on open tables and on tables
// started in the rolling window, which ends at the server's clock. Asked only with accounts on, and
// only of a table somebody bears; a table from a game from before accounts has nobody to ask.
async function tableCeilings(opts: ServerOptions, bearer: string | undefined): Promise<TableCeilings | undefined> {
  if (!opts.auth || bearer === undefined) return undefined
  const plans = opts.plans ?? DEFAULT_PLANS
  const plan = await planOf(opts.accountPlans, plans, bearer)
  return { openTables: limitOf(plans, plan, 'openTables'), tablesPer30Days: limitOf(plans, plan, 'tablesPer30Days'), since: tableWindowFrom(clock(opts)) }
}

// A table opened within its bearer's ceilings (#1196): true when it was, and false when a ceiling
// was met and the 402 has said so. The store counts and writes in one step, so nothing is written
// on a refusal — no session and no code — and the caller, which loads the table only after this,
// queues no texture. Starting a table is the one thing a ceiling on tables is asked at: joining,
// playing, a new code, «Uppdatera» (C7), a kick and ending it never ask, and neither does a replay.
async function openTable(opts: ServerOptions, res: ServerResponse, record: SessionRecord, bearer: () => Promise<Bearer>): Promise<boolean> {
  try {
    await opts.store.createSession(record, await tableCeilings(opts, record.accountId))
    return true
  } catch (e) {
    if (!(e instanceof QuotaReached)) throw e
    quotaRefused(res, e.quota, await bearer())
    return false
  }
}

// A fresh code and host key for a new session (DRIFT §9); the key is shown once and kept hashed.
function admission(opts: ServerOptions): { code: string; hostKey: string; record: { code: string; codeExpiresAt: string; hostKeyHash: string } } {
  const code = newCode()
  const hostKey = newSecret()
  return { code, hostKey, record: { code, codeExpiresAt: codeExpiry(clock(opts)), hostKeyHash: hash(hostKey) } }
}

// What the door says about every code that opens nothing (#675): one status and one body, so that
// nothing in the answer tells whether a code once existed.
const UNKNOWN_CODE = { error: 'unknown or expired code' }

// The table a room code opens (DRIFT §9), or nothing. A code that never was, one that has gone out
// or been rotated away, and one whose table has ended all open nothing, and are told apart nowhere
// (beställarens beslut 2026-10-07, #938): an ended table is locked (C9) and its door hands out no
// token (#485), and saying 410 for it said that the code had been real.
async function openRoom(opts: ServerOptions, typed: string): Promise<{ id: string; actor: TableActor } | null> {
  const code = normaliseCode(decodeURIComponent(typed))
  const found = code ? await opts.store.sessionByCode(code) : null
  if (!found || Date.parse(found.codeExpiresAt) <= clock(opts).getTime()) return null
  const actor = await opts.host.get(found.id)
  if (!actor || actor.ended) return null
  return { id: found.id, actor }
}

const DeckBody = z.object({
  template: Template,
  rows: z.record(z.string(), z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))),
  icons: z.record(z.string(), z.string()),
})

// Buying admission (DRIFT §9): a name, and a seat to sit at or none to watch.
// What a game's table is started with (#1286): how the people at it sit, when the host was asked.
// The body may be empty, as it was before the question.
const StartBody = z.object({ seating: z.enum(SEATINGS).optional() })

// The placeholder a masked name says (#1276) is nobody's name, at a seat or watching.
const JoinBody = z.object({ name: z.string().trim().min(1).max(64).refine((name) => name !== REDACTED, 'the placeholder of a masked name is nobody’s name'), seat: z.string().min(1).optional() })
const KickBody = z.object({ seat: z.string().min(1) })
const ClaimBody = z.object({ token: z.string().min(1) })
// The guest's own erasure (#1281): the token her phone was given, and nothing else.
const EraseBody = z.object({ token: z.string().min(1) })

// The tables an account sat at (G1), newest first, each with what came of it: the game's name,
// whether it ended, whether the survey was answered from that seat, how many moments were flagged
// from it, the code to come back by while the table is open and the code lives, and whether its
// game has been taken away since (#676). `untouched`: the table runs and nothing was ever done on
// it, which the Bord tab files as «Startade, aldrig spelade» and which is not running (#1376).
export type Played = { session: string; seat: string | null; name: string; kind: 'seat' | 'observer'; at: string; game: string | null; version: string; ended: boolean; untouched?: true; surveyed: boolean; flags: number; code?: string; deleted?: true }
async function playedBy(opts: ServerOptions, accountId: string): Promise<Played[]> {
  const out: Played[] = []
  for (const g of await opts.store.guestsOf(accountId)) {
    const session = await opts.store.loadSession(g.sessionId)
    if (!session) continue
    const project = session.project && opts.projects ? await opts.projects.load(session.project) : null
    const log = await opts.store.read(g.sessionId)
    const ended = log.some((l) => l.intent.v === 'session.end')
    const untouched = !ended && !log.some((l) => PHYSICAL_VERBS.includes(l.intent.v))
    const flags = log.filter((l) => l.intent.v === 'flag' && (g.kind === 'seat' ? l.by === g.seat : l.intent.observer === g.name)).length
    const surveyed = opts.surveys ? (await opts.surveys.list(g.sessionId)).some((s) => (g.kind === 'seat' ? s.seat === g.seat : s.observer === true && s.who === g.name)) : false
    const codeLives = session.code !== undefined && session.codeExpiresAt !== undefined && Date.parse(session.codeExpiresAt) > clock(opts).getTime()
    // A table whose game was taken away (#676) says so, rather than passing for «a table».
    const deleted = session.project !== undefined && opts.projects !== undefined && project === null
    out.push({ session: g.sessionId, seat: g.seat, name: g.name, kind: g.kind, at: g.issuedAt, game: project?.name ?? null, version: session.version, ended, ...(untouched ? { untouched: true as const } : {}), surveyed, flags, ...(!ended && codeLives && session.code ? { code: session.code } : {}), ...(deleted ? { deleted: true as const } : {}) })
  }
  return out
}

// Who may control a table (DRIFT §9): whoever holds the host key, or an account whose role on the
// project it was started from may start tables (D3). The role is the same question the editor's
// own gate asks, so a game cannot be editable while its own table is shut.
// 'unknown' has shown nothing; 'wrong' has shown a key, or a role, that is not it.
async function hostOf(opts: ServerOptions, req: IncomingMessage, session: SessionRecord): Promise<'host' | 'unknown' | 'wrong'> {
  const bearer = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? '')?.[1]
  if (bearer !== undefined) return session.hostKeyHash !== undefined && hash(bearer) === session.hostKeyHash ? 'host' : 'wrong'
  if (!opts.auth || !opts.projects || !session.project) return 'unknown'
  const project = await opts.projects.load(session.project)
  if (!project) return 'unknown'
  // A project from before accounts belongs to nobody and is open to anyone, exactly as the
  // editor's own gate has it (D3). Asked before the login, because there is nothing to log in to.
  if (project.owner === undefined) return 'host'
  const account = await accountOf(opts.auth, req)
  if (!account) return 'unknown'
  // The role decides, as it does everywhere else (D3): whoever may start a table may open the one
  // they started. A viewer may not, because `owner=1` can take a seat and play.
  const role = await opts.projects.roleOf(session.project, account.id)
  return role !== null && canStartTables(role) ? 'host' : 'wrong'
}

// Who may read a session's whole log and its survey answers (D3, C8, G3): the project's playtest
// data, not the table's. The log carries every hand, the guests' names and what a flag said, and a
// session's id travels in every player's link — so it is the project's test leaders and nobody
// else: whoever may open its tables as host, who may already watch every hand (`owner=1`). A
// table screen's host key is not enough, since the table sees only what is public; and a table
// with no project has no one to read it once accounts are on. Without accounts, as everywhere
// else in this server, the door is open.
async function playtestReader(opts: ServerOptions, req: IncomingMessage, session: SessionRecord): Promise<'yes' | 'login' | 'no'> {
  if (!opts.auth) return 'yes'
  if (/^Bearer\s/i.test(req.headers.authorization ?? '')) return 'no'
  if (!opts.projects || !session.project) return 'no'
  const project = await opts.projects.load(session.project)
  if (!project) return 'no'
  // A project from before accounts belongs to nobody and is open to anyone (D3).
  if (project.owner === undefined) return 'yes'
  const account = await accountOf(opts.auth, req)
  if (!account) return 'login'
  const role = await opts.projects.roleOf(session.project, account.id)
  return role !== null && canStartTables(role) ? 'yes' : 'no'
}
// The replay corpus's door (#1011, DRIFT §7): the operator, by login, reading a table in a game
// whose owner said yes in her invitation. Never with a key, and never a game from before accounts,
// which has no owner to have said yes. It opens the export and nothing else; the caller is the one
// route that asks it.
async function corpusReader(opts: ServerOptions, req: IncomingMessage, session: SessionRecord): Promise<boolean> {
  const corpus = opts.corpus
  if (!corpus || !opts.auth || !opts.projects || !session.project) return false
  if (/^Bearer\s/i.test(req.headers.authorization ?? '')) return false
  const reader = await accountOf(opts.auth, req)
  if (reader?.email.toLowerCase() !== corpus.operator) return false
  const project = await opts.projects.load(session.project)
  if (project?.owner === undefined) return false
  const owner = await opts.auth.accountById(project.owner)
  return owner !== null && corpus.accounts.includes(owner.email.toLowerCase())
}
// Answers a refused reader and says whether the caller may go on.
async function mayReadPlaytest(opts: ServerOptions, req: IncomingMessage, res: ServerResponse, session: SessionRecord): Promise<boolean> {
  const may = await playtestReader(opts, req, session)
  if (may === 'yes') return true
  json(res, may === 'login' ? 401 : 403, { error: may === 'login' ? 'log in' : 'not yours to read' })
  return false
}

const CreateSession = z.object({
  id: z.string().min(1).optional(),
  version: z.string().min(1),
  setup: z.custom<SetupDef>((v) => typeof v === 'object' && v !== null),
  deck: DeckBody.optional(),
})

// How long an idle keep-alive connection is kept open from this end (#986, DRIFT §2).
//
// The proxy in front — the box's traefik, or cloudflared on a box without one — pools its idle
// connection to this server for 90 s by default and sends the next request on it. Node's own
// default hangs up after 5 s, and a request the proxy sends in that same moment goes out on a
// socket that is just closing: a 502 for nothing. Longer than the proxy, it is always the proxy
// that lets go first, and it never sends on a connection it has already given up. Thirty seconds
// of margin, so that a proxy tuned a little longer than its default does not bring the race back.
const KEEP_ALIVE_MS = 120_000
// Just above the idle timer, the way Node asks for it: a request whose first byte arrives at the
// last moment of an idle connection is not cut off waiting for the rest of its headers. Still
// inside the whole request's limit (Node's 300 s), which Node refuses to have the other way round.
const HEADERS_TIMEOUT_MS = KEEP_ALIVE_MS + 1_000

// HTTP for the few things that are not a table (health, creating a session), and one
// WebSocket per connection at `/sessions/:id?seat=A` — omit `seat` for a table view.
export function createServer(given: ServerOptions): Server {
  // A register that cannot say which version is in force stops the start, rather than a request.
  checkRegister(given.terms ?? [])
  const opts: ServerOptions = { ...given, limiter: given.limiter ?? new LoginLimiter(), passkeyChallenges: given.passkeyChallenges ?? new PasskeyChallenges(), ...(given.ai ? { ai: { limiter: new KeyTryLimiter(), ...given.ai } } : {}) }
  const http = createHttpServer({ keepAliveTimeout: KEEP_ALIVE_MS, headersTimeout: HEADERS_TIMEOUT_MS }, (req, res) => {
    // A closing server lets go of a connection as soon as it goes quiet. Node hangs up the idle
    // ones when `close` is called, but one still answering then becomes idle a moment later and
    // would sit out the whole keep-alive timer above, with `close` waiting on it.
    res.once('finish', () => {
      if (!http.listening) setImmediate(() => http.closeIdleConnections())
    })
    void route(opts, req, res)
  })
  // A client that offers the table's protocol is answered with it (#1278): one that offers protocols
  // and hears none back is hung up on by the browser. The token beside it is read at the door.
  const wss = new WebSocketServer({ noServer: true, handleProtocols: (offered) => (offered.has(TABLE_PROTOCOL) ? TABLE_PROTOCOL : false) })

  http.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    // Editing a project together (D3): the same actor pattern as a table, on its own path.
    const editing = /^\/projects\/([^/]+)\/edit$/.exec(url.pathname)
    if (editing && opts.projects) {
      const projectId = decodeURIComponent(editing[1] ?? '')
      const name = url.searchParams.get('name') ?? 'Någon'
      wss.handleUpgrade(req, socket, head, (ws) => void attachEditor(opts, req, ws, projectId, name))
      return
    }
    const match = /^\/sessions\/([^/]+)$/.exec(url.pathname)
    if (!match) {
      socket.destroy()
      return
    }
    const sessionId = decodeURIComponent(match[1] ?? '')
    const q = url.searchParams
    // The token rides in the protocol header (#1278), and the host key beside it (#1306); an address
    // with either is a page loaded before that, which still gets in.
    const offered = req.headers['sec-websocket-protocol']
    const ask: Admission = {
      seat: q.get('seat'),
      role: q.get('role') === 'observer' ? 'observer' : q.get('role') === 'lobby' ? 'lobby' : null,
      name: q.get('name'),
      token: tokenOfProtocols(offered) ?? q.get('token'),
      host: hostKeyOfProtocols(offered) ?? q.get('host'),
      owner: q.get('owner') === '1',
      fresh: offersTableProtocol(offered),
    }
    wss.handleUpgrade(req, socket, head, (ws) => void attach(opts, req, ws, sessionId, ask))
  })

  // `close` waits for every connection to end, and WebSockets never end on their own:
  // terminate them as part of closing, or a drain waits forever. Say goodbye first
  // (TableHost.drain) if clients should learn why.
  const close = http.close.bind(http)
  http.close = (callback?: (err?: Error) => void) => {
    for (const client of wss.clients) client.terminate()
    wss.close()
    return close(callback)
  }
  return http
}

// Play is capability-based (room codes, face hashes); the creator's account rides in a cookie.
// Cookie-bearing requests are accepted only from this server or the configured development app.
const CORS_BASE: Record<string, string> = {
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization',
  'access-control-max-age': '86400',
  // A zip is saved under the name the server gives it (#542, #1280), which a page on another
  // origin, as in development, can read only when it is exposed; and the export's summary beside
  // it (#1356), which the window says when it hands the zip over; and when the next sign-in link
  // may go (#1360), which the receipt on the login card says.
  'access-control-expose-headers': 'content-disposition, x-byd-export, retry-after',
}

function originOf(value: string | undefined): string | null {
  if (!value) return null
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

// The scheme the browser reached us by: what the proxy in front says, else what the public origin is.
function schemeOf(opts: ServerOptions, req: IncomingMessage): string {
  const forwarded = String(req.headers['x-forwarded-proto'] ?? '').split(',')[0]?.trim()
  return forwarded || (originOf(opts.publicOrigin)?.startsWith('https:') ? 'https' : 'http')
}

function browserOriginAllowed(opts: ServerOptions, req: IncomingMessage): boolean {
  const origin = originOf(req.headers.origin)
  if (!origin) return false
  const own = req.headers.host ? `${schemeOf(opts, req)}://${req.headers.host}` : null
  return [opts.publicOrigin, opts.appOrigin, own].some((candidate) => originOf(candidate ?? undefined) === origin)
}

function corsHeaders(opts: ServerOptions, req: IncomingMessage): Record<string, string> {
  const origin = req.headers.origin
  if (!origin) return { ...CORS_BASE, 'access-control-allow-origin': '*' }
  if (!browserOriginAllowed(opts, req)) return { ...CORS_BASE, vary: 'origin' }
  return { ...CORS_BASE, 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', vary: 'origin' }
}

async function route(opts: ServerOptions, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  for (const [name, value] of Object.entries(corsHeaders(opts, req))) res.setHeader(name, value)
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }
  if (opts.auth && url.pathname.startsWith('/auth/')) {
    await routeAuth(opts, opts.auth, req, res, url)
    return
  }
  try {
    // The closed ways (#1272, F4 beslut 5): an account that has not accepted the terms in force writes
    // nothing but what `OPEN_WRITES` leaves open, whichever way it knocks on, a way added later
    // included. Asked before any body is read, so a refusal writes nothing. Nobody signed in is not
    // asked here: the way itself says whether it wants an account.
    if (!openToTheDue(req.method ?? 'GET', url.pathname)) {
      const current = await termsDueFor(opts, req)
      if (current) return json(res, 403, { error: 'terms', current })
    }
    if (req.method === 'GET' && url.pathname === '/health') {
      // Health means the store answers (DRIFT §2), not just that the process is up.
      const loaded = await opts.host.loaded()
      // Every answer carries it, the 503s included: which version is broken is the first thing
      // asked back, and the box has nowhere else to say it (DRIFT §8).
      const who = { ...(opts.release ? { release: opts.release } : {}), ...(opts.contact ? { contact: opts.contact } : {}), tables: loaded.length }
      try {
        await opts.store.staleSessions(new Date(0))
      } catch (err) {
        return json(res, 503, { ok: false, ...who, store: err instanceof Error ? err.message : String(err) })
      }
      if (opts.objects) {
        try {
          await opts.objects.check()
        } catch (err) {
          return json(res, 503, { ok: false, ...who, store: 'ok', assets: err instanceof Error ? err.message : String(err) })
        }
      }
      return json(res, 200, { ok: true, ...who, store: 'ok', ...(opts.objects ? { assets: 'ok' } : {}) })
    }
    // The raw door: a table from any setup and deck, with no game behind it. The web app never
    // uses it (a table is started from a game, below); the end-to-end suite and the seed script do.
    // With accounts on it opens nothing for nobody (#1194): a table is always borne by an account,
    // so that it can be counted against someone (A2), and so that nobody can put Chromium work on
    // the box without being someone. Asked before the body is read, so a refusal writes nothing,
    // starts no table and queues no texture. Without accounts (a server started without them) the
    // door stands as it always did, and the table is borne by nobody.
    if (req.method === 'POST' && url.pathname === '/sessions') {
      const bearer = opts.auth ? await accountOf(opts.auth, req) : null
      if (opts.auth && !bearer) return json(res, 401, { error: 'log in first' })
      const body = CreateSession.parse(JSON.parse(await readBody(req)))
      validateSetup(body.setup, opts.registry)
      const id = body.id ?? randomUUID()
      const deck: Deck | undefined = body.deck
      const room = admission(opts)
      // Held to the ceilings of the account that knocks, which bears the table.
      if (!(await openTable(opts, res, { id, version: body.version, setup: body.setup, ...(deck ? { deck } : {}), ...(bearer ? { accountId: bearer.id } : {}), ...room.record }, async () => YOU))) return
      // Textures start rendering now rather than when the first screen connects.
      if (deck) await opts.host.get(id)
      return json(res, 201, { id, code: room.code, hostKey: room.hostKey })
    }
    // A code resolves to a session while it lives (DRIFT §9): what the join page asks first.
    const room = /^\/rooms\/([^/]+)$/.exec(url.pathname)
    if (req.method === 'GET' && room) {
      const found = await openRoom(opts, room[1] ?? '')
      if (!found) return json(res, 404, UNKNOWN_CODE)
      // The game's name, which the join card is headed with (#675). It is what `GET /sessions/:id`
      // already says to whoever holds the id this answer hands out, so it tells nobody anything
      // new — and the project it came from stays out of it.
      const session = await opts.store.loadSession(found.id)
      const named = session?.project && opts.projects ? await opts.projects.load(session.project) : null
      // How the people at it sit (#1286), which picks the one way in the join page offers.
      return json(res, 200, { session: found.id, ...(named ? { name: named.name } : {}), ...(session?.seating ? { seating: session.seating } : {}) })
    }
    // A code and a name buy a token (DRIFT §9): for a free seat, or for watching (C8).
    const join = /^\/rooms\/([^/]+)\/join$/.exec(url.pathname)
    if (req.method === 'POST' && join) {
      // The code before the body: a code that opens nothing gets the same answer whatever was sent.
      const found = await openRoom(opts, join[1] ?? '')
      if (!found) return json(res, 404, UNKNOWN_CODE)
      const { actor } = found
      const body = JoinBody.parse(JSON.parse(await readBody(req)))
      if (body.seat !== undefined) {
        const seat = actor.seats().find((s) => s.id === body.seat)
        if (!seat) return json(res, 404, { error: `unknown seat ${body.seat}` })
        if (seat.name !== null) return json(res, 409, { error: `seat ${body.seat} is taken` })
      }
      const guestToken = newSecret()
      const issuedAt = clock(opts)
      const issued = await opts.store.issueGuest(found.id, {
        tokenHash: hash(guestToken),
        kind: body.seat !== undefined ? 'seat' : 'observer',
        seat: body.seat ?? null,
        name: body.name,
        issuedAt: issuedAt.toISOString(),
        expiresAt: new Date(issuedAt.getTime() + GUEST_PENDING_TTL_MS).toISOString(),
      })
      if (!issued) return json(res, 409, { error: `seat ${body.seat} is reserved` })
      return json(res, 201, { session: found.id, token: guestToken })
    }
    // Claiming a guest session to an account afterwards (G1): the admission the phone played under
    // becomes the account's, and with it the seat, the name, the flags and the survey.
    if (req.method === 'POST' && url.pathname === '/guests/claim') {
      if (!opts.auth) return json(res, 404, { error: 'accounts are off' })
      const account = await accountOf(opts.auth, req)
      if (!account) return json(res, 401, { error: 'log in first' })
      const { token: guestToken } = ClaimBody.parse(JSON.parse(await readBody(req)))
      const claimed = await opts.store.claimGuest(hash(guestToken), account.id)
      if (claimed === null) return json(res, 404, { error: 'unknown token' })
      if (claimed === 'other') return json(res, 409, { error: 'another account has this session' })
      return json(res, 200, { session: claimed.sessionId, seat: claimed.seat, name: claimed.name })
    }
    // The terms in force (#1270): which version, and whether it changed anything material. Public,
    // since the terms are read before anyone accepts them; null while there are none.
    if (req.method === 'GET' && url.pathname === '/terms') return json(res, 200, { current: termsInForce(registerOf(opts), clock(opts)) })
    // A report (#1274, DSA art. 16): open to everyone, since whoever saw a picture need not have an
    // account. The receipt goes to the address given, if one was, and the note to Kontakt when Kontakt is
    // an address. Neither waits on the other, and a mail that fails is said in the log, not to the
    // reporter: the report is kept, and the operator reads every one.
    if (req.method === 'POST' && url.pathname === '/reports') {
      if (!opts.reports) return json(res, 404, { error: 'reports are off' })
      let raw: unknown
      try {
        raw = JSON.parse(await readBody(req))
      } catch {
        return json(res, 400, { error: 'not JSON' })
      }
      const body = ReportBody.safeParse(raw)
      if (!body.success) return json(res, 400, { error: 'not a report', fields: [...new Set(body.error.issues.map((i) => String(i.path[0] ?? '')))] })
      const { lang, ...said } = body.data
      const report = await opts.reports.add({ ...said, lang: lang ?? 'sv', at: clock(opts).toISOString() })
      const link = `${opts.appOrigin ?? opts.publicOrigin ?? ''}${REPORT_SECTION}`
      const sends: Promise<void>[] = []
      if (report.email !== '' && opts.mailer) sends.push(opts.mailer.send(receiptMail(report, link, opts.contact)))
      if (opts.contact && /^[^@\s]+@[^@\s]+$/.test(opts.contact) && opts.mailer) sends.push(opts.mailer.send(operatorMail(opts.contact, report)))
      for (const done of await Promise.allSettled(sends)) if (done.status === 'rejected') console.error(JSON.stringify({ msg: 'report-mail', report: report.id, error: (done.reason as Error).message }))
      return json(res, 201, { id: report.id })
    }
    // Accepting the terms (#1270): only the version in force, so a tab opened before a change never
    // accepts what its reader has not read. 409 says which version that is, null when there is none.
    if (req.method === 'POST' && url.pathname === '/me/terms') {
      if (!opts.auth) return json(res, 404, { error: 'accounts are off' })
      const account = await accountOf(opts.auth, req)
      if (!account) return json(res, 401, { error: 'log in first' })
      const { version } = TermsBody.parse(JSON.parse(await readBody(req)))
      const now = clock(opts)
      const current = termsInForce(registerOf(opts), now)?.version ?? null
      if (version !== current) return json(res, 409, { error: 'not the terms in force', current })
      await opts.auth.acceptTerms(account.id, current, now.toISOString())
      res.writeHead(204)
      res.end()
      return
    }
    if (url.pathname === '/me/ai-key' || url.pathname.startsWith('/me/ai-key/')) return await routeAiKey(opts, req, res, url)
    // The account's own name (#1254): read with who the account is (`/auth/me`), written here. A name,
    // or none, is the answer to the welcome step's question, and it is not put again.
    if (req.method === 'PUT' && url.pathname === '/me/name') {
      if (!opts.auth) return json(res, 404, { error: 'accounts are off' })
      const account = await accountOf(opts.auth, req)
      if (!account) return json(res, 401, { error: 'log in first' })
      let raw: unknown
      try {
        raw = (JSON.parse(await readBody(req)) as { name?: unknown }).name
      } catch {
        return json(res, 400, { error: 'that is not a name' })
      }
      const named = nameOf(raw)
      if (!named.ok) return json(res, 400, { error: `a name is text of at most ${NAME_MAX} characters on one line` })
      await opts.auth.setName(account.id, named.name)
      return json(res, 200, { name: named.name })
    }
    // «Ladda ner mina uppgifter» (#1280, G6, art. 15 och 20): everything kept about the account, as
    // a zip in the form of a game's export (`account-data.ts`).
    if (req.method === 'GET' && url.pathname === '/me/data') {
      if (!opts.auth) return json(res, 404, { error: 'accounts are off' })
      const account = await accountOf(opts.auth, req)
      if (!account) return json(res, 401, { error: 'log in first' })
      const at = clock(opts)
      const data = await personalDataOf(opts, opts.auth, account, at)
      const zip = packPersonalData(data, langOf(url.searchParams.get('lang')))
      res.writeHead(200, { 'content-type': 'application/zip', 'content-disposition': personalDataDisposition(at), 'cache-control': 'no-store', 'content-length': zip.byteLength })
      res.end(zip)
      return
    }
    // The games gone from her Mina spel (#1334): each a band there until she closes it, and closing
    // it is the notice gone.
    if (url.pathname === '/me/gone' || url.pathname.startsWith('/me/gone/')) {
      if (!opts.auth) return json(res, 404, { error: 'accounts are off' })
      const account = await accountOf(opts.auth, req)
      if (!account) return json(res, 401, { error: 'log in first' })
      if (req.method === 'GET' && url.pathname === '/me/gone') return json(res, 200, opts.projects ? await opts.projects.goneFor(account.id) : [])
      const one = /^\/me\/gone\/([^/]+)$/.exec(url.pathname)
      if (req.method === 'DELETE' && one) {
        if (!(await opts.projects?.dismissGone(account.id, decodeURIComponent(one[1] ?? '')))) return json(res, 404, { error: 'no such notice' })
        res.writeHead(204)
        res.end()
        return
      }
      return json(res, 405, { error: 'method not allowed' })
    }
    // What «Radera kontot…» asks about (#1280, variant A): each game that goes with the account, who
    // else loses it and whether a table at it is playing, the games it leaves, and how many tables
    // it claimed. The question names every game, so it is asked of the server and not guessed.
    if (req.method === 'GET' && url.pathname === '/me/deletion') {
      if (!opts.auth) return json(res, 404, { error: 'accounts are off' })
      const account = await accountOf(opts.auth, req)
      if (!account) return json(res, 401, { error: 'log in first' })
      return json(res, 200, await deletionOf(opts, account))
    }
    // «Ja, radera kontot» (#1280, G6, art. 17): the account and everything that says it, in one
    // transaction (`ErasureStore`, kind `account`). Its games go as «Ta bort spelet» takes one: the
    // tables are ended first, so their codes open nothing and the phones are told, and then masked
    // (`game`). Every browser it was logged in on is logged out with the sessions, this one by its
    // cookie too, and the last letter says what went.
    if (req.method === 'DELETE' && url.pathname === '/me') {
      if (!opts.auth) return json(res, 404, { error: 'accounts are off' })
      const account = await accountOf(opts.auth, req)
      if (!account) return json(res, 401, { error: 'log in first' })
      if (!opts.erasures) return json(res, 503, { error: 'erasure unavailable' })
      const now = clock(opts)
      const projects = opts.projects
      const owned = projects ? await projects.ownedIds(account.id) : []
      const names: string[] = []
      for (const id of owned) {
        names.push((await projects?.load(id))?.name ?? id)
        for (const table of await opts.store.sessionsOf(id)) await opts.host.end(table.id)
      }
      const shared = projects ? (await projects.list(account.id)).filter((p) => !owned.includes(p.id)).map((p) => p.id) : []
      const done = await opts.erasures.erase([entry({ kind: 'account', account: account.id }, 'request', now), ...owned.map((project) => entry({ kind: 'game', project }, 'removed', now))])
      await opts.host.reload(done.sessions)
      if (projects) {
        const host = editors(opts, projects)
        for (const id of owned) {
          ;(await host.running(id))?.shutDown()
          host.forget(id)
        }
        for (const id of shared) (await host.running(id))?.dismiss(account.id)
      }
      try {
        await opts.mailer?.send(erasedMail(account.email, langOf(url.searchParams.get('lang')), { at: now, games: names, site: opts.publicOrigin ?? `http://${req.headers.host ?? 'localhost'}`, contact: opts.contact }))
      } catch (err) {
        console.error(JSON.stringify({ msg: 'erased-mail-failed', error: err instanceof Error ? err.message : String(err) }))
      }
      console.log(JSON.stringify({ msg: 'account-erased', games: owned.length, tables: done.sessions.length, lines: done.lines, guests: done.guests }))
      res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` })
      res.end(JSON.stringify({ ok: true }))
      return
    }
    if (req.method === 'GET' && url.pathname === '/me/played') {
      if (!opts.auth) return json(res, 404, { error: 'accounts are off' })
      const account = await accountOf(opts.auth, req)
      if (!account) return json(res, 401, { error: 'log in first' })
      return json(res, 200, await playedBy(opts, account.id))
    }
    // «Tillbaka till bordet» (#690, beslut 2026-10-06): the guest goes back to her own seat and
    // hand, not to the picker as a newcomer. The server keeps only a token's hash, so the account's
    // admission is handed a new token in place of the old one — the seat, the name and the history
    // stay as they were. An ended table hands out nothing, as its door does not (#485).
    const back = /^\/me\/played\/([^/]+)\/return$/.exec(url.pathname)
    if (req.method === 'POST' && back) {
      if (!opts.auth) return json(res, 404, { error: 'accounts are off' })
      const account = await accountOf(opts.auth, req)
      if (!account) return json(res, 401, { error: 'log in first' })
      const sessionId = decodeURIComponent(back[1] ?? '')
      const actor = (await opts.store.loadSession(sessionId)) ? await opts.host.get(sessionId) : null
      if (!actor) return json(res, 404, { error: 'unknown session' })
      if (actor.ended) return json(res, 410, { error: 'session ended', session: sessionId })
      const guestToken = newSecret()
      const guest = await opts.store.returnGuest(sessionId, account.id, hash(guestToken), clock(opts).toISOString())
      if (!guest) return json(res, 404, { error: 'no seat of yours at this table' })
      return json(res, 200, { session: sessionId, token: guestToken, kind: guest.kind, seat: guest.seat, name: guest.name })
    }
    // The host's controls (DRIFT §9): a new code (and with it a new host key, #820), a kick, and the
    // end (#1422). With the host key, or the owner's cookie.
    const control = /^\/sessions\/([^/]+)\/(code|kick|end)$/.exec(url.pathname)
    if (req.method === 'POST' && control) {
      const sessionId = decodeURIComponent(control[1] ?? '')
      const session = await opts.store.loadSession(sessionId)
      if (!session) return json(res, 404, { error: 'unknown session' })
      const who = await hostOf(opts, req, session)
      if (who !== 'host') return json(res, who === 'wrong' ? 403 : 401, { error: who === 'wrong' ? 'wrong host key' : 'the host key or the owner\'s login is needed' })
      const actor = await opts.host.get(sessionId)
      if (control[2] === 'code') {
        const expiresAt = codeExpiry(clock(opts))
        let code = newCode()
        for (let tries = 0; (await opts.store.sessionByCode(code)) !== null && tries < 5; tries++) code = newCode()
        // The host key goes with the code (#820): whoever saw the screen saw both. The screens that
        // are open are handed the new key over their own connection — the table's, never a guest's.
        const hostKey = newSecret()
        await opts.store.rotateAdmission(sessionId, code, expiresAt, hash(hostKey))
        actor?.tellTable({ t: 'room', code, expiresAt, hostKey })
        return json(res, 200, { code, expiresAt, hostKey })
      }
      // The end goes the way the table itself ends (C9): the log is locked and every screen at it
      // is told. Ending a table that is over is nothing, said as such and not as a fault.
      if (control[2] === 'end') return json(res, 200, { ok: true, ended: await opts.host.end(sessionId) })
      const { seat } = KickBody.parse(JSON.parse(await readBody(req)))
      if (!session.setup.seats.includes(seat)) return json(res, 404, { error: `unknown seat ${seat}` })
      const revoked = await opts.store.revokeGuests(sessionId, seat, clock(opts).toISOString())
      await actor?.kick(seat)
      return json(res, 200, { ok: true, revoked })
    }
    // Following an invitation (D3): whoever is signed in when they follow it joins the project
    // with the role it names. The link is good once. While it can still be followed it names the
    // game it leads to (#691) — the name the mail already carried, for the login card the link
    // lands on — and nothing more; a used, withdrawn or made-up link says nothing at all.
    const invite = /^\/invites\/([A-Za-z0-9_-]+)$/.exec(url.pathname)
    // A browser following the link asks for the page, and gets the app (`PAGE_PATHS`), not this.
    const pageWanted = Boolean(opts.staticDir) && (req.headers['accept'] ?? '').includes('text/html')
    if (invite && req.method === 'GET' && opts.projects && !pageWanted) {
      const project = await opts.projects.inviteTo(hash(decodeURIComponent(invite[1] ?? '')), clock(opts).toISOString())
      const rec = project ? await opts.projects.load(project) : null
      if (!rec) return json(res, 404, { error: 'unknown or spent invitation' })
      return json(res, 200, { name: rec.name })
    }
    if (invite && req.method === 'POST' && opts.projects) {
      const account = opts.auth ? await accountOf(opts.auth, req) : null
      if (!account) return json(res, 401, { error: 'log in first' })
      const accepted = await opts.projects.acceptInvite(hash(decodeURIComponent(invite[1] ?? '')), clock(opts).toISOString())
      if (!accepted) return json(res, 404, { error: 'unknown or spent invitation' })
      await opts.projects.share(accepted.project, account.id, accepted.role)
      return json(res, 200, { project: accepted.project, role: accepted.role })
    }
    if (opts.assets) {
      const handled = await routeAssets(opts, opts.assets, req, res, url)
      if (handled) return
    }
    if (opts.projects) {
      const handled = await routeProjects(opts, opts.projects, req, res, url)
      if (handled) return
    }
    // What a texture's smallest text was fitted to (#523), so a surface can hold the card up large
    // enough to read. Answered here and never through the object store, whose link carries nothing a
    // page can read; the hash is the capability, as it is for the picture itself.
    const fitted = /^\/faces\/([0-9a-f]{64})\/fit$/.exec(url.pathname)
    if (req.method === 'GET' && fitted && opts.renders) {
      const hash = fitted[1] ?? ''
      const fit = await opts.renders.fitOf(hash)
      if (fit) {
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'public, max-age=31536000, immutable' })
        res.end(JSON.stringify(fit))
        return
      }
      const status = await opts.renders.status(hash)
      if (status && status.state !== 'failed') return json(res, 202, { state: status.state })
      return json(res, 404, { error: 'unknown face' })
    }
    const face = /^\/faces\/([0-9a-f]{64})$/.exec(url.pathname)
    if (req.method === 'GET' && face && opts.renders) {
      // The hash is the capability: only a seat that may see a face was ever told its hash.
      const hash = face[1] ?? ''
      // In R2 (DRIFT §4): a short-lived link the browser follows and keeps for most of its
      // life, so a texture is one round trip to the house and then none.
      // A booklet is opened by name (#678): the reader's tab and the file she saves say what it
      // is. A face of a card is fetched by nobody's name and carries none.
      const name = url.searchParams.get('name')
      const disposition = name ? inlineDisposition(name) : undefined
      const link = await opts.renders.link(hash, FACE_LINK_TTL_S, disposition)
      if (link) {
        res.writeHead(302, { location: link, 'cache-control': `private, max-age=${FACE_LINK_TTL_S - FACE_LINK_SLACK_S}` })
        res.end()
        return
      }
      const bytes = await opts.renders.output(hash)
      if (bytes) {
        // The type is the file's own (#678): a booklet is a PDF, and answered as a picture it
        // opened as a broken one.
        res.writeHead(200, {
          'content-type': renderedTypeOf(bytes),
          'cache-control': 'public, max-age=31536000, immutable',
          ...(disposition ? { 'content-disposition': disposition } : {}),
        })
        res.end(Buffer.from(bytes))
        return
      }
      const status = await opts.renders.status(hash)
      if (status && (status.state === 'queued' || status.state === 'running')) return json(res, 202, { state: status.state })
      if (status?.state === 'failed') {
        // "Försök igen" on the card (#10). A dead job cannot be revived by fetching it again,
        // so the ask reaches the queue: the same page is rendered once more. The hash is the
        // capability, and asking twice costs one render, not two — a queued job is left alone.
        if (url.searchParams.get('retry') === '1' && (await opts.renders.requeue(hash))) return json(res, 202, { state: 'queued' })
        return json(res, 500, { error: status.error ?? 'render failed' })
      }
      return json(res, 404, { error: 'unknown face' })
    }
    if (opts.staticDir && (req.method === 'GET' || req.method === 'HEAD')) {
      const policy = (scriptHashes: readonly string[]) => pagePolicy({ scriptHashes, nonce: pageNonce(), socket: socketOrigin(req.headers.host, schemeOf(opts, req) === 'https'), objects: opts.objects?.origin ?? null })
      if (await serveStatic(opts.staticDir, url.pathname, req.headers['accept'], req.headers['accept-encoding'], res, policy, originOf(opts.publicOrigin))) return
    }
    json(res, 404, { error: 'not found' })
  } catch (err) {
    json(res, 400, { error: err instanceof Error ? err.message : String(err) })
  }
}

// What a rendering is, read off its first bytes: the queue renders PNG textures, and PDFs for
// print and for the booklet. Anything else is bytes and is said to be.
export function renderedTypeOf(bytes: Uint8Array): string {
  const starts = (sig: number[]) => sig.every((b, i) => bytes[i] === b)
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf'
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  return 'application/octet-stream'
}

// `inline` with the name the file is to have (RFC 6266): the name in full as UTF-8, and a plain
// ASCII stand-in for a reader that knows only the old form. Whatever the name holds, it never
// leaves the quoted string, so a name cannot write a header of its own.
export function inlineDisposition(name: string): string {
  const plain = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/[^\x20-\x7e]|["\\]/g, '_')
  const full = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
  return `inline; filename="${plain}"; filename*=UTF-8''${full}`
}

// A face link lives an hour; the browser may reuse it for all but the last ten minutes, so a
// cached link is never one that has just expired.
const FACE_LINK_TTL_S = 3600
const FACE_LINK_SLACK_S = 600

// The built web app: hashed assets forever, everything else briefly, and the app's own routes
// (/table, /play, …) fall back to index.html so the client can pick the page. Never a byte
// outside the directory.
const API_PREFIXES = ['/sessions', '/projects', '/faces', '/health', '/rooms', '/guests', '/me', '/invites', '/terms']
// The one API path that is also a page: the invitation link in the mail (D3, #475). A browser
// following it asks for HTML and gets the app, which accepts the invitation with a POST to the
// same path; anything else asking gets the API's answer.
const PAGE_PATHS = [/^\/invites\/[A-Za-z0-9_-]+$/]
async function serveStatic(dir: string, pathname: string, wants: string | undefined, accept: string | undefined, res: ServerResponse, policy: (scriptHashes: readonly string[]) => string, publicOrigin: string | null): Promise<boolean> {
  const page = PAGE_PATHS.some((p) => p.test(pathname)) && (wants ?? '').includes('text/html')
  // The API never falls back to the app, whatever is or is not mounted.
  if (!page && API_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) return false
  const root = resolve(dir)
  const wanted = resolve(root, '.' + normalize(decodeURIComponent(pathname)))
  if (wanted !== root && !wanted.startsWith(root + sep)) return false
  const candidate = await fileAt(wanted)
  const file = candidate ?? (extname(wanted) === '' ? await fileAt(join(root, 'index.html')) : null)
  if (!file) return false
  const type = typeOf(file)
  const hashed = file.includes(`${sep}assets${sep}`)
  const head: Record<string, string> = { 'content-type': type, 'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache' }
  // The page's policy goes with the page (#1008, DRIFT §14), its inline scripts allowed by the
  // hashes of the file being sent, and the edge's by a nonce made for this response (#1043).
  if (type.startsWith('text/html')) {
    head['content-security-policy'] = policy(await scriptHashesOf(file))
    head['referrer-policy'] = REFERRER_POLICY
  }
  // The box compresses what it serves (DRIFT §13, #372): the blocking stylesheet uncompressed is
  // the single largest item in the first painting's price. `Vary` goes on everything that *could*
  // have been compressed rather than on what was, because a cache between here and the browser
  // must not hand an identity answer to a client that would have taken brotli — or the other way
  // about, which is worse.
  if (compressible(type)) head['vary'] = 'accept-encoding'
  // A page names the picture a shared link shows at the public origin (#1084, share.ts).
  if (type.startsWith('text/html') && publicOrigin) {
    const page = await sharedPage(file, publicOrigin)
    const encoded = await encodedBytes(page.identity, page.bytes, type, accept)
    const bytes = encoded?.bytes ?? page.bytes
    res.writeHead(200, { ...head, ...(encoded ? { 'content-encoding': encoded.encoding } : {}), 'content-length': String(bytes.length) })
    res.end(bytes)
    return true
  }
  // What the build compressed goes out as the build made it, from disk (DRIFT §13).
  const ready = await precompressed(file, type, accept)
  if (ready) {
    res.writeHead(200, { ...head, 'content-encoding': ready.encoding, 'content-length': String(ready.size) })
    await new Promise<void>((resolve, reject) => createReadStream(ready.path).on('error', reject).on('end', () => resolve()).pipe(res))
    return true
  }
  const encoded = await encodedCopy(file, type, accept)
  if (encoded) {
    res.writeHead(200, { ...head, 'content-encoding': encoded.encoding, 'content-length': String(encoded.bytes.length) })
    res.end(encoded.bytes)
    return true
  }
  res.writeHead(200, head)
  await new Promise<void>((resolve, reject) => createReadStream(file).on('error', reject).on('end', () => resolve()).pipe(res))
  return true
}

async function fileAt(path: string): Promise<string | null> {
  try {
    const s = await stat(path)
    return s.isFile() ? path : null
  } catch {
    return null
  }
}

// What a connection asks to be (DRIFT §9), from its query string and the protocols it offers.
// `fresh` is a client that offers the table's protocol, and so knows `admitted` (#1278, #1306).
type Admission = { seat: string | null; role: 'observer' | 'lobby' | null; name: string | null; token: string | null; host: string | null; owner: boolean; fresh: boolean }
// Who it is allowed to be: the table (with the host key), a seat or an observer (with a token
// bought for that), or a lobby that only looks. Anything else is refused.
// `host` marks the project owner's own seat or watch (L77): not the table's screen, but hers.
// `told` is the name the connection is told it sits as: a guest's, on the admission her token bought
// (#1278), and the owner's own seat's, the name she gave her account (#1306).
// `admission` is the guest's, by the moment it was given, so the table can ask whether it is still hers (#1348).
type Admitted = { seat: string | null; observer?: string; lobby?: true; host?: true; told?: string; admission?: { issuedAt: string } }
async function admit(opts: ServerOptions, req: IncomingMessage, session: SessionRecord, ask: Admission): Promise<Admitted | { refused: string }> {
  if (ask.role === 'lobby') return { seat: null, lobby: true }
  // An editor marks its project-owner connection explicitly. Accounts verify the cookie; when
  // accounts are disabled, projects are intentionally open and the same development flow works.
  if (ask.owner) {
    // A table whose game was taken away (#676) is not someone else's table: it is told so, and
    // never «the host key or its owner», which sent the owner looking for another account.
    if (session.project && opts.projects && !(await opts.projects.load(session.project))) return { refused: 'the game was deleted' }
    if (!session.project || (opts.auth && (!browserOriginAllowed(opts, req) || (await hostOf(opts, req, session)) !== 'host'))) return { refused: 'the table needs the host key or its owner' }
    if (ask.seat !== null && !session.setup.seats.includes(ask.seat)) return { refused: `unknown seat ${ask.seat}` }
    if (ask.role === 'observer') {
      const name = ask.name?.trim()
      if (!name || name.length > 64) return { refused: 'an observer needs a name of at most 64 characters' }
      // The owner who watches is said by the name she gave her account (#1254), whatever word the
      // editor sent; without one, by that word, as before — never by her address.
      const own = opts.auth ? (await accountOf(opts.auth, req))?.name : null
      return { seat: null, observer: own ?? name, host: true }
    }
    if (ask.seat === null) return { seat: null }
    // Her seat sits down under a name her page knows, the one she gave «Hur sitter ni?» (L77); where
    // it knows none, under the name she gave her account (#1254). Never one from the address.
    const named = opts.auth ? (await accountOf(opts.auth, req))?.name : null
    return { seat: ask.seat, host: true, ...(named ? { told: named } : {}) }
  }
  // The table's own view (DRIFT §9): the host key opens it, and so does the login of whoever may
  // open the game's tables (#748) — the server already knows who she is, so an owner who arrives
  // without the key is not sent to log in to the account she is already in. A key that does not
  // fit is no reason to shut her out either. The cookie is believed only from the app's own pages.
  if (ask.host !== null || (ask.seat === null && ask.role === null && ask.token === null)) {
    if (ask.host !== null && session.hostKeyHash && hash(ask.host) === session.hostKeyHash) return { seat: null }
    if (opts.auth && session.project && opts.projects) {
      if (!(await opts.projects.load(session.project))) return { refused: 'the game was deleted' }
      if (browserOriginAllowed(opts, req) && (await hostOf(opts, req, session)) === 'host') return { seat: null }
    }
    return { refused: 'the table needs the host key' }
  }
  const now = clock(opts)
  const live = ask.token !== null
    ? await opts.store.activateGuest(session.id, hash(ask.token), now.toISOString(), new Date(now.getTime() + CODE_TTL_MS).toISOString())
    : null
  if (ask.role === 'observer') return live?.kind === 'observer' ? { seat: null, observer: live.name, told: live.name, admission: { issuedAt: live.issuedAt } } : { refused: 'an observer needs a token' }
  if (ask.seat !== null) return live?.kind === 'seat' && live.seat === ask.seat ? { seat: ask.seat, told: live.name, admission: { issuedAt: live.issuedAt } } : { refused: 'a seat needs its token' }
  return { refused: 'the table needs the host key' }
}

// Who is answering the survey (G3, #1021), or null for nobody this table admitted. A guest is
// her admission: the token is tried the way the door tries it, and the name and the seat are the
// admission's. Without a token it is first an admission the account has claimed (G1) — the way
// Mina spel answers for a table that is over and has no way in (#1143) — and otherwise the
// project's host, from the editor's own ways in, by the same login the door lets her sit down
// with — never the table screen's key, which sits nowhere.
async function surveySender(opts: ServerOptions, req: IncomingMessage, session: SessionRecord, actor: TableActor, body: SurveyAsk): Promise<Omit<SurveyAnswer, 'answers'> | null> {
  const observer = body.observer === true
  const seat = body.seat ?? null
  const as = (guest: { kind: 'seat' | 'observer'; seat: string | null; name: string }): Omit<SurveyAnswer, 'answers'> | null =>
    guest.kind === 'observer' ? (observer && seat === null ? { who: guest.name, seat: null, observer: true } : null) : !observer && seat === guest.seat ? { who: guest.name, seat: guest.seat } : null
  if (body.token !== undefined) {
    const now = clock(opts)
    const guest = await opts.store.activateGuest(session.id, hash(body.token), now.toISOString(), new Date(now.getTime() + CODE_TTL_MS).toISOString())
    return guest ? as(guest) : null
  }
  const account = opts.auth && !/^Bearer\s/i.test(req.headers.authorization ?? '') ? await accountOf(opts.auth, req) : null
  if (account) {
    // A claimed admission is the account's for good, so it does not expire as a token does; one
    // that was kicked is not, as at the door.
    const mine = (await opts.store.guestsOf(account.id)).filter((g) => g.sessionId === session.id && g.revokedAt === undefined).map(as).find((sender) => sender !== null)
    if (mine) return mine
  }
  if (!session.project) return null
  if (opts.auth && (/^Bearer\s/i.test(req.headers.authorization ?? '') || (await hostOf(opts, req, session)) !== 'host')) return null
  if (observer) return seat === null && body.who ? { who: body.who, seat: null, observer: true } : null
  if (seat === null || !session.setup.seats.includes(seat)) return null
  return { who: actor.seats().find((s) => s.id === seat)?.name ?? seat, seat }
}

// Whether the one asking has answered the survey (#1355), or null for nobody this table admitted. A
// guest's token is looked up and not tried, as her erasure looks it up: a guest whose table is over
// is still the one it was given to, and one who erased herself (#1281) is told so, since her answers
// went with her name (#1353). Without a token it is the account or the host, as `surveySender` says.
async function surveyStanding(opts: ServerOptions, surveys: SurveyStore, req: IncomingMessage, session: SessionRecord, actor: TableActor, body: SurveyAsk): Promise<SurveyStanding | null> {
  let sender: Omit<SurveyAnswer, 'answers'> | null
  if (body.token !== undefined) {
    const guest = await opts.store.guestByToken(session.id, hash(body.token))
    if (!guest) return null
    const observer = body.observer === true
    const seat = body.seat ?? null
    if (guest.kind === 'observer' ? !observer || seat !== null : observer || seat !== guest.seat) return null
    if (isMasked(guest.name)) return { answered: false, forgotten: true }
    sender = guest.kind === 'observer' ? { who: guest.name, seat: null, observer: true } : { who: guest.name, seat: guest.seat }
  } else sender = await surveySender(opts, req, session, actor, body)
  if (!sender) return null
  const mine = { sessionId: session.id, ...sender }
  return { answered: (await surveys.list(session.id)).some((r) => sameSender(r, mine)), forgotten: false }
}

// `POST /sessions/:id/erase` (#1281): what the guest's own erasure answers, and does.
async function eraseGuest(opts: ServerOptions, erasures: ErasureStore, sessionId: string, raw: string): Promise<[number, unknown]> {
  if (!(await opts.store.loadSession(sessionId))) return [404, { error: 'unknown session' }]
  let given: unknown
  try {
    given = JSON.parse(raw || '{}')
  } catch {
    given = null
  }
  const parsed = EraseBody.safeParse(given)
  if (!parsed.success) return [400, { error: 'a token is needed' }]
  const guest = await opts.store.guestByToken(sessionId, hash(parsed.data.token))
  if (!guest) return [403, { error: 'the token admits nobody at this table' }]
  const done = await erasures.erase([entry({ kind: 'guest', session: sessionId, seat: guest.seat, issuedAt: guest.issuedAt }, 'request', clock(opts))])
  await opts.host.reload(done.sessions)
  return [200, { ok: true }]
}

// One editor on one project (D3). Only the account that owns the project may edit it; roles for
// co-editors and testers are a model of their own and come later.

// A door holds the socket still while it asks its questions (#109).
//
// The socket is open from the moment the upgrade finishes, and whoever is at the other end may
// write straight away: a browser that was already being typed into sends its first edit on
// `onopen`, and a seat taps the table as it comes up. But a door has to ask the store who is
// knocking and what they are knocking on before it has anywhere to put a message, and a
// WebSocket with no `message` listener does not keep what it receives — it emits it to nobody,
// and the frame is gone without a word. No refusal, no error, nothing to notice: an editor lost
// the edit and the `save` that followed then made a version without it, and the designer had
// been told the save succeeded.
//
// The window is as wide as the store is slow, which on a real database is a network away and
// under load is wider still. So the socket is paused before the first question is asked and let
// go the moment there is something to receive with. What arrived meanwhile waited in the
// socket's own buffer, and it is delivered in the order it was sent — which is the order
// everything downstream already stands on.
//
// Letting go is idempotent, and it is done in a `finally` so that it happens on every way out —
// let in, turned away, or a question that threw. A door that turns someone away has to let go
// too: a paused socket never reads the other end's reply to the close frame, and the connection
// would sit there until the close timeout rather than hanging up. A socket left paused for good
// is worse still: a connection that never speaks again and never says why.
function holdFrames(ws: WebSocket): () => void {
  ws.pause()
  let delivered = false
  return () => {
    if (delivered) return
    delivered = true
    ws.resume()
  }
}

async function attachEditor(opts: ServerOptions, req: IncomingMessage, ws: WebSocket, projectId: string, name: string): Promise<void> {
  const deliver = holdFrames(ws)
  try {
    await openEditorDoor(opts, req, ws, projectId, name)
  } finally {
    // Whatever happened — let in, turned away, or a question that threw — the socket is let go.
    // A socket left paused is a connection that never speaks again and never says why.
    deliver()
  }
}

async function openEditorDoor(opts: ServerOptions, req: IncomingMessage, ws: WebSocket, projectId: string, name: string): Promise<void> {
  const send = (message: EditorMessage) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message))
  }
  const projects = opts.projects
  const account = opts.auth ? await accountOf(opts.auth, req) : null
  const rec = projects ? await projects.load(projectId) : null
  if (!projects || !rec) {
    // Nobody logged in learns nothing of which games exist (#754): an unknown id is told to log
    // in, the same as a game that is somebody's.
    if (!account && opts.auth) ws.close(4401, 'log in')
    else ws.close(4004, 'unknown project')
    return
  }
  const role = rec.owner === undefined ? 'owner' : account ? await projects.roleOf(projectId, account.id) : null
  if (!role) {
    // Nobody logged in is not «someone else's game» (#485): the editor is told to log in again,
    // with a code of its own, rather than that the game belongs to somebody else.
    if (!account && opts.auth) ws.close(4401, 'log in')
    else ws.close(4003, 'not your project')
    return
  }
  const actor = await editors(opts, projects).get(projectId)
  if (!actor) {
    ws.close(4004, 'unknown project')
    return
  }
  // Whose ceiling an edit of this editor's meets (#1195): the owner's whoever edits, and only the
  // owner is told it is her own; anyone else is told whose it is, by name (#1198).
  const bears: Bearer = role === 'owner' ? YOU : await ownerBearer(opts, rec.owner)
  // Who the others see (#1254): an account is said by the name it gave, and otherwise by its address,
  // as the header always said it, and the address rides beside it so a face keeps its colour when the
  // name changes. The page's own word is only for a game from before accounts, where nobody is anyone.
  const said = account ? { name: account.name ?? account.email, email: account.email } : { name }
  const editor = { id: randomUUID(), ...said, role, ...(account ? { account: account.id } : {}), send, close: () => ws.close(4003, 'gone'), gone: () => ws.close(4004, 'unknown project') }
  const leave = actor.subscribe(editor)
  // Whether the account is clear of the terms on this line (#1272), asked once as the line opens. While
  // it is not, its messages are handled one after another, since each asks the store first and an
  // edit must never overtake the save or the edit sent before it (#988, #993); once it is, they go
  // straight to the actor as they always did, with nothing awaited before it.
  let termsCleared = (await termsDueFor(opts, req, account)) === null
  let behind: Promise<void> | null = null
  ws.on('close', leave)
  ws.on('message', (data) => {
    if (termsCleared && !behind) return void handle(data)
    const run = (behind ?? Promise.resolve()).then(() => handle(data))
    behind = run
    void run.finally(() => {
      if (behind === run) behind = null
    })
  })
  const handle = async (data: WebSocket.RawData): Promise<void> => {
    {
      // Which of the editor's requests a refusal answers (#991): an edit and a save can both be on
      // the line at once, and the editor ends only the wait the refusal is about. A request that
      // cannot be read is neither, and its refusal names none. A refused edit is named by the
      // number its editor gave it (#993), when it gave one.
      let to: 'edit' | 'save' | undefined
      let ask: number | undefined
      const refuse = (why: string, quota?: QuotaMet) => send({ v: 'refused', why, ...(to ? { to } : {}), ...(ask === undefined ? {} : { ask }), ...(quota ? { quota: { ...quota, ...bears } } : {}) })
      try {
        const raw: unknown = JSON.parse(data.toString())
        const msg = EditorRequest.parse(raw)
        to = msg.t
        // A viewer watches the project change and does not change it (D3).
        if (!canEdit(role)) {
          refuse(`en ${roleWord(role)} kan bara titta`)
          return
        }
        // The terms (#1272): an account that has not accepted them changes nothing on this line
        // either, and is told so in a refusal of its own, so that the editor holds the edit for the
        // dialog rather than taking it off. Asked until the account has accepted, and then no more on
        // this line: a version that comes into force while the editor is open asks at the next one.
        if (msg.t === 'edit') ask = msg.ask
        if (!termsCleared) {
          const current = await termsDueFor(opts, req, account)
          if (current) {
            send({ v: 'refused', why: 'terms', to: msg.t, ...(ask === undefined ? {} : { ask }), current })
            if (msg.t === 'edit') actor.resync(editor)
            return
          }
          termsCleared = true
        }
        if (msg.t === 'save') {
          // Held to the owner's ceiling on storage (#1197), whoever saves: a refusal for it says the
          // ceiling, as an edit refused for a ceiling does (#1192), and no version is made.
          const saved = await actor.save(editor.id, () => storageCeiling(opts, rec.owner))
          if (!saved.ok && saved.quota) send({ v: 'refused', why: 'quota', to: 'save', quota: { ...saved.quota, ...(await bearerOf(opts, account, rec.owner)) } })
          else if (!saved.ok) refuse(saved.reason)
          return
        }
        ask = msg.ask
        await actor.edit(msg.intent as EditIntent, account?.id, editor.id, ask)
      } catch (err) {
        // The owner's ceiling on the game's cards (#1195): a refusal like any other, with the
        // ceiling's numbers beside it. It is the owner's whoever edits, and only the owner is
        // told it is their own.
        if (err instanceof QuotaReached) refuse('quota', err.quota)
        else refuse(err instanceof Error ? err.message : String(err))
        actor.resync(editor)
      }
    }
  }
}

// The AI answers in flight on this server (#1001), counted against its ceilings.
const FLIGHTS = new WeakMap<ServerOptions, AiFlight>()
function flightOf(opts: ServerOptions, caps: Partial<AiCaps> | undefined): AiFlight {
  const existing = FLIGHTS.get(opts)
  if (existing) return existing
  const flight = new AiFlight({ ...AI_CAPS, ...caps })
  FLIGHTS.set(opts, flight)
  return flight
}

// What an owner's tier allows of a game's cards (#1195): asked only with accounts on, since without
// them nobody bears anything. The tier is read as the edit is decided, so one the operator changes
// holds from the next edit, whoever has the game open.
function cardCeilings(opts: ServerOptions): ((owner: string, measure: CardMeasure) => Promise<Limit>) | undefined {
  if (!opts.auth) return undefined
  const plans = opts.plans ?? DEFAULT_PLANS
  return async (owner, measure) => limitOf(plans, await planOf(opts.accountPlans, plans, owner), measure)
}

// The editing actors of this server, made on first use so a server without projects has none.
const HOSTS = new WeakMap<ServerOptions, ProjectHost>()
function editors(opts: ServerOptions, projects: ProjectStore): ProjectHost {
  const existing = HOSTS.get(opts)
  if (existing) return existing
  const host = new ProjectHost(projects, cardCeilings(opts))
  HOSTS.set(opts, host)
  return host
}

// What an editor may send: an edit, or an ask to make a version of what stands now. An edit may
// carry the number its editor gave it (#993), which is how the editor knows what answers it; a
// page from before the number sends none.
const EditorRequest = z.union([z.object({ t: z.literal('edit'), intent: z.record(z.string(), z.unknown()), ask: z.number().int().optional() }), z.object({ t: z.literal('save') })])

async function attach(opts: ServerOptions, req: IncomingMessage, ws: WebSocket, sessionId: string, ask: Admission): Promise<void> {
  const deliver = holdFrames(ws)
  try {
    await openTableDoor(opts, req, ws, sessionId, ask)
  } finally {
    // As at the editor's door: let in, turned away or thrown out of, the socket is let go.
    deliver()
  }
}

async function openTableDoor(opts: ServerOptions, req: IncomingMessage, ws: WebSocket, sessionId: string, ask: Admission): Promise<void> {
  const send = (message: ServerMessage) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message))
  }
  const session = await opts.store.loadSession(sessionId)
  const actor = session ? await opts.host.get(sessionId) : null
  if (!session || !actor) {
    send({ t: 'error', id: null, message: `unknown session ${sessionId}` })
    ws.close(4004, 'unknown session')
    return
  }
  const who = await admit(opts, req, session, ask)
  if ('refused' in who) {
    send({ t: 'refused', reason: who.refused })
    ws.close(4003, who.refused)
    return
  }
  const seat = who.seat
  // Told before the snapshot, so the page has its name by the time it sees the seat it sits down in.
  if (ask.fresh && who.told !== undefined) send({ t: 'admitted', name: who.told })
  // The door shuts once this turn's answers have gone out. A seat that asks for its own way out
  // (#31) is emptied as part of that very commit, and is still owed the ack for it; `ws.close`
  // puts the socket into CLOSING at once, where `send` drops every later frame. Waiting a macro
  // tick costs nothing and hangs up on nobody mid-sentence — the actor has already taken the
  // subscriber off the table, so the wait carries no frames of its own.
  const sub: Subscriber = { seat, id: randomUUID(), send, close: () => setImmediate(() => ws.close(4003, 'gone')), ...(who.observer !== undefined ? { observer: who.observer } : {}), ...(who.lobby ? { lobby: true } : {}), ...(who.host ? { host: true } : {}), ...(who.admission ? { admission: who.admission } : {}) }
  actor.subscribe(sub)
  // A connection keeps the code alive for another few hours (DRIFT §9); the host's screen is
  // told the code, since it is what the room is joined by.
  if (session.code) {
    const expiresAt = codeExpiry(clock(opts))
    await opts.store.setCode(sessionId, session.code, expiresAt)
    // So is the owner's own seat (L77): she sends the address on from wherever she sits.
    if ((seat === null && who.observer === undefined && !who.lobby) || who.host) send({ t: 'room', code: session.code, expiresAt })
  }
  ws.on('close', () => actor.unsubscribe(sub))

  ws.on('message', (data) => {
    let id: string | null = null
    try {
      const raw: unknown = JSON.parse(data.toString())
      if (typeof raw === 'object' && raw !== null && 'envelope' in raw) {
        const env = (raw as { envelope?: { id?: unknown } }).envelope
        if (typeof env?.id === 'string') id = env.id
      }
      const msg = ClientMessage.parse(raw)
      // A lobby looks at the seats and does nothing — including no ephemeral presence.
      if (sub.lobby) {
        if (msg.t === 'envelope') send({ t: 'reject', id: msg.envelope.id, reason: 'a lobby may only look' })
        return
      }
      if (msg.t === 'presence') {
        actor.relay(sub, msg.presence)
        return
      }
      // The connection's seat is authoritative; a client cannot speak for another seat.
      if (msg.envelope.seat !== seat) {
        send({ t: 'reject', id: msg.envelope.id, reason: 'envelope seat does not match connection seat' })
        return
      }
      // An observer may only flag (C8), and a flag says who flagged it: only the server stamps that.
      if (sub.observer !== undefined && msg.envelope.intents.some((it) => it.v !== 'flag')) {
        send({ t: 'reject', id: msg.envelope.id, reason: 'an observer can only flag' })
        return
      }
      const envelope = {
        ...msg.envelope,
        intents: msg.envelope.intents.map((it) => {
          if (it.v !== 'flag') return it
          const flag = { v: 'flag' as const, ...(it.component !== undefined ? { component: it.component } : {}), ...(it.note !== undefined ? { note: it.note } : {}) }
          return sub.observer !== undefined ? { ...flag, observer: sub.observer } : flag
        }),
      }
      void actor.submit(envelope, sub).then(
        (decision) => {
          if (decision.ok) send({ t: 'ack', id: msg.envelope.id, seqs: decision.applied.map((l) => l.seq) })
          else send({ t: 'reject', id: msg.envelope.id, reason: decision.reason })
        },
        (err: unknown) => send({ t: 'error', id: msg.envelope.id, message: err instanceof Error ? err.message : String(err) }),
      )
    } catch (err) {
      send({ t: 'error', id, message: err instanceof Error ? err.message : String(err) })
    }
  })
}

// Projects (L4, L5): a revisioned document, and "start a table" which expands the rows into a
// session with its deck so textures start rendering at once.
// The deck a table or a print is made from: the project's rows with their pictures and typefaces
// named by hash (E1, #1028). The compiled page says which bytes it is drawn from, and the render
// worker reads them from the store the app put them in (DRIFT §4).
async function deckOf(opts: ServerOptions, rec: ProjectRecord): Promise<Deck> {
  if (!opts.assets) return deckFromProject(rec)
  const { rows, motifs } = await resolveAssets(rec.rows, opts.assets, rec.pictures ?? {})
  // The template's own pictures too (#320), keyed beside the rows' under the URL each now carries.
  const own = await resolveTemplate(rec.template, opts.assets, rec.pictures ?? {})
  const doc = deckFromProject({ ...rec, rows, template: own.template, icons: await resolveIcons(rec.icons, opts.assets) })
  return { ...doc, motifs: { ...motifs, ...own.motifs }, fonts: await resolveFonts(rec.fonts ?? {}, opts.assets) }
}

// What a deck knows about its cards — texture hashes, titles and printed text — without queueing a
// render: the textures were queued when the table was dealt them.
async function factsOf(deck: Deck, setup: SetupDef, registry: TypeRegistry): Promise<DeckFacts> {
  const { faces, titles, texts } = await queueFaces(deck, setup, registry, TEXTURE_DPI, Date.now(), () => Promise.resolve())
  return { faces, titles, texts }
}

// The decks of the versions a table raised a flag about a card on (#1142), each with the cards the
// table dealt on that version: a refreshed table's setup is the one its `version.change` carried.
async function flaggedDecksOf(opts: ServerOptions, id: string, session: SessionRecord, log: readonly Applied[]): Promise<Record<string, DeckFacts>> {
  const decks: Record<string, DeckFacts> = {}
  let version = session.version
  let setup = session.setup
  for (const line of log) {
    const it = line.intent
    if (it.v === 'version.change') {
      version = it.to
      if (it.cards !== undefined) setup = { ...setup, cards: it.cards }
    } else if (it.v === 'flag' && it.component !== undefined && !(version in decks)) {
      const deck = await opts.store.deckOf(id, version)
      if (deck) decks[version] = await factsOf(deck, setup, opts.registry)
    }
  }
  return decks
}

// Every card of the project through the physical checks (E5), once per face, named by the card
// the reader would hold. The row is what the card actually says, so a check reads the same thing
// the compiler does.
//
// The bleed is the one that will be printed (#1207): the provider's when one is asked, and when none
// is, the widest any registered provider asks for, so a game that passes passes every one of them;
// the type's own where no provider prints it.
function checkedCards(rec: ProjectRecord, opts: Pick<ServerOptions, 'registry' | 'printProviders'>, provider?: PrintProvider): (Issue & { cardRef: string; face: string })[] {
  const ref = { id: CARD_STANDARD_63x88.id, version: CARD_STANDARD_63x88.version }
  const type = opts.registry.get(ref)
  const bleedMm = widestBleedMm(provider ? [provider] : (opts.printProviders ?? []), ref) ?? type.print.bleedMm
  const out: (Issue & { cardRef: string; face: string })[] = []
  for (const row of rec.rows) {
    for (const [face, template] of Object.entries(rec.template.faces)) {
      for (const issue of validateCard({ type, face: template, row: row.fields, bleedMm, ...(rec.fonts ? { fonts: rec.fonts } : {}) })) out.push({ ...issue, cardRef: row.id, face })
    }
  }
  return out
}

// The project's credits as a list: the symbols first, in the icon set's order, then the
// typefaces the version is pinned to (B3). Both are borrowed under a licence, and both travel
// with a print order (E4).
// The rulebook as a print job (B7): the rules as they stand, through the same worker that renders
// every card, keyed by what is on the page so the same rules asked for twice are one rendering.
async function bookletJobOf(opts: ServerOptions, rec: ProjectRecord, rules: RuleDoc, lang: ReturnType<typeof langOf>): Promise<RenderRequest> {
  const compiled = bookletOf({
    rules: renderRules(rules, namesOfProject(rec), arrangementOf(rec)),
    icons: opts.assets ? await resolveIcons(rec.icons, opts.assets) : rec.icons,
    // The pictures the book holds travel with it (#173), named by hash as a card's are (#1028):
    // the worker reads the bytes from the store, and a picture that is gone is left out.
    images: opts.assets ? await resolveRuleImages(rules, opts.assets) : {},
    pageMm: A5,
    credits: creditsOf(rec),
    // The one heading the tool contributes follows the language the order was placed in (A4).
    lang,
  })
  return { hash: contentHash(compiled, BOOKLET), kind: BOOKLET, priority: 'print', compiled, requestedAt: clock(opts).getTime() }
}

// The print files of a version for its export (G5, #527): every face of every card with bleed, by
// the file it gets in the zip, and the rulebook. A version the physical checks stop (E5) has no
// card files — the game is exported all the same, and why stands in the manifest — while its
// rulebook, which the checks do not read, still goes.
async function printPlanOf(opts: ServerOptions, rec: ProjectRecord, lang: ReturnType<typeof langOf>) {
  const found = checkedCards(rec, opts)
  const errors = found.filter((f) => f.severity === 'error')
  const warnings = found.filter((f) => f.severity === 'warning')
  const jobs: { file: string; job: RenderRequest }[] = []
  const cards: { cardRef: string; faces: Record<string, string> }[] = []
  if (errors.length === 0) {
    const printed = printExportOf(await deckOf(opts, rec), setupFromProject(rec), opts.registry, clock(opts).getTime())
    const byHash = new Map(printed.jobs.map((j) => [j.hash, j]))
    const used = new Set<string>()
    for (const card of printed.cards) {
      // Copies of a card are one card to print: the manifest names each card once.
      if (cards.some((c) => c.cardRef === card.cardRef)) continue
      const faces: Record<string, string> = {}
      // Two cards whose ids fold to the same file name are numbered apart.
      let nth = 1
      while (Object.keys(card.faces).some((face) => used.has(printFileOf(card.cardRef, face, nth)))) nth++
      for (const [face, hash] of Object.entries(card.faces)) {
        const file = printFileOf(card.cardRef, face, nth)
        used.add(file)
        faces[face] = file
        const job = byHash.get(hash)
        if (job) jobs.push({ file, job })
      }
      cards.push({ cardRef: card.cardRef, faces })
    }
  }
  const rulebook = rec.rules ? RULEBOOK_FILE : undefined
  if (rec.rules) jobs.push({ file: RULEBOOK_FILE, job: await bookletJobOf(opts, rec, rec.rules, lang) })
  // The box's faces (#1418), drawn or neutral, whatever the checks say of the cards: the checks read
  // the cards, and the box is the designer's data as much as they are (G5).
  const assets = opts.assets
  const box = await boxPrintOf(rec, await deckOf(opts, rec), clock(opts).getTime(), assets ? (template) => resolveTemplate(template, assets, rec.pictures ?? {}) : undefined)
  jobs.push(...box.jobs)
  return { cards, rulebook, warnings, errors, jobs, box: box.box }
}

// The print package of a version for one provider (F1, F2, #1207): the order it would get, prepared
// without a word to it, the files that order names as the jobs that draw them after the provider's
// own requirements, and the rulebook beside them in our A5 (no partner's booklet format is built).
// A version the physical checks stop at this provider's bleed (E5) has no card files, as its export
// has none (G5, #1208); the order is still prepared, so what would be sent can be shown.
//
// Which provider is the caller's question: one asked for by name, or the one an order to an address
// would be routed to (F2, #1208), which is how the page asks, so what it shows is what the routing
// would choose. No provider is a reason, never a quiet choice of another.
async function printPackageOf(opts: ServerOptions, rec: ProjectRecord, choose: (manifest: PrintManifest) => Route, lang: ReturnType<typeof langOf>) {
  const deck = await deckOf(opts, rec)
  const manifest = printManifestOf(deck, setupFromProject(rec), opts.registry)
  const route = choose(manifest)
  if (route.kind === 'none') return { refused: route.reason }
  const provider = route.provider
  const found = checkedCards(rec, opts, provider)
  const errors = found.filter((f) => f.severity === 'error')
  const warnings = found.filter((f) => f.severity === 'warning')
  const order = provider.prepare(manifest)
  const files: PrintFileJob[] = errors.length === 0 ? printFileJobsOf(deck, opts.registry, order, clock(opts).getTime()) : []
  const rulebook: PrintFileJob | undefined = rec.rules ? { name: PACKAGE_RULEBOOK, job: await bookletJobOf(opts, rec, rec.rules, lang) } : undefined
  // What the provider asks of each kind of thing in the order, in the order's own order: the
  // requirements the files are made after, which the page says in words.
  const types = [...new Map([...order.cards, ...order.hardware].map((c) => [`${c.type.id}@${c.type.version}`, c.type])).values()]
  const requirements = types.map((type) => provider.requirements(type))
  // The box as part 3 (#1418): its measure and whether it is drawn, and no file until a partner is.
  const box: PrintPackageBox = { ...boxFactsOf(rec), files: [] }
  return { provider, manifest, order, requirements, files, rulebook, errors, warnings, box }
}
const PACKAGE_RULEBOOK = 'regelhafte.pdf'

function creditsOf(rec: ProjectRecord): (ProjectCredit & { name: string })[] {
  const icons = Object.entries(rec.credits ?? {}).map(([name, c]) => ({ name, ...c }))
  const fonts = Object.entries(rec.fonts ?? {}).flatMap(([name, f]) => (f.licence ? [{ name, ...f.licence }] : []))
  return [...icons, ...fonts]
}

// What a project may carry — the pictures a card is drawn from (E1) and the type it is set in
// (B3) — is `ASSET_FORMATS` in `@byd/protocol`, written once for the editor and this gate both.
// How many pictures one question may ask about. A deck of a few hundred cards asks in one go;
// past that the question is somebody else's.
const MOTIFS_AT_ONCE = 500
// How large an export may be brought back (#528): a few hundred pictures at the upload limit.
const IMPORT_MAX_BYTES = 256 * 1024 * 1024
const ASSET_LINK_TTL_S = 3600

// Images (E1, DRIFT §4): POST /assets takes one from a logged-in creator and answers with its
// hash; GET /assets/:hash serves it to whoever knows the hash, from R2 when there is one.
async function routeAssets(opts: ServerOptions, assets: AssetStore, req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  if (req.method === 'POST' && url.pathname === '/assets') {
    const account = opts.auth ? await accountOf(opts.auth, req) : null
    if (opts.auth && !account) {
      json(res, 401, { error: 'log in first' })
      return true
    }
    // The declared type says which kind of file is being handed over — a picture, a drawing, a
    // typeface — and nothing more than that (#204).
    const kind = assetKindDeclared((req.headers['content-type'] ?? '').split(';')[0]?.trim() ?? '')
    if (!kind) {
      json(res, 415, { error: 'not an image or a font' })
      return true
    }
    const bytes = await readBytes(req, ASSET_MAX_BYTES)
    if (!bytes) {
      json(res, 413, { error: 'too big' })
      return true
    }
    // What the file actually is (#204): the bytes decide, and what is stored is what was read, so
    // `/assets/<hash>` vouches for what is there rather than for what the upload said. A file of
    // the wrong kind is refused as firmly as a file of no kind at all — a typeface offered as a
    // picture is not a picture — and the refusal names the formats that kind is missing.
    const format = sniffAsset(bytes)
    if (format?.kind !== kind) {
      json(res, 415, { error: `the bytes are not ${assetFormatsNamed(kind)}` })
      return true
    }
    // A drawing is a document that runs (#1087), so opening with `<svg` is not enough: the whole
    // of it is read against the allowlist the editor cleaned it to. The file is refused rather
    // than cleaned here, because the document names these bytes by their hash and a cleaned copy
    // would be stored under a name nothing refers to. 422 rather than 415: the bytes are an SVG,
    // and it is what the SVG holds that is refused.
    if (format.type === 'image/svg+xml') {
      const reason = svgBytesRefusal(bytes)
      if (reason) {
        json(res, 422, { error: `the SVG is not safe to draw: ${reason}` })
        return true
      }
    }
    // An upload that names the game it is for (#1197) is held to that game's owner's ceiling on
    // storage, before a byte is stored: the picture is about to be in one of the owner's games, and
    // the designer hears it now rather than at the next save. Bytes the owner's games name already
    // cost nothing again. Naming a game is asking about its owner, so only someone who may edit it
    // may name it. An upload that names no game is stored as it always was: no game names it yet,
    // and the save that first does is asked then.
    const into = url.searchParams.get('project')
    if (into !== null) {
      const rec = opts.projects ? await opts.projects.load(into) : null
      if (!opts.projects || !rec) {
        json(res, 404, { error: 'unknown project' })
        return true
      }
      const role = rec.owner === undefined ? 'owner' : account ? await opts.projects.roleOf(into, account.id) : null
      if (!role || !canEdit(role)) {
        json(res, 403, { error: 'not your project' })
        return true
      }
      const fresh = assetHash(bytes)
      const met = await storageMet(opts, opts.projects, rec.owner, [fresh], { [fresh]: bytes.byteLength })
      if (met) {
        quotaRefused(res, met, await bearerOf(opts, account, rec.owner))
        return true
      }
    }
    let hash: string
    try {
      hash = await assets.put(bytes, format.type)
    } catch (e) {
      // A picture blocked after a report (#1274) is not stored again. 451, as for content withheld
      // for legal reasons: the uploader is told this picture cannot be in Deckster, and nothing more.
      if (e instanceof BlockedAsset) {
        json(res, 451, { error: 'blocked' })
        return true
      }
      throw e
    }
    // Queued after the answer is decided and never waited for (#1273): an upload is never slower
    // for being screened, and a queue that is down or slow stops nothing.
    if (opts.screening && opts.renders) screenOnUpload(opts.renders, opts.screening, hash, format.type, clock(opts).getTime())
    json(res, 201, { hash })
    return true
  }
  // What is drawn inside a picture (E1). The measurement is of the bytes, so it belongs to the
  // hash and not to a project: it is taken once, by whoever first uploads or first opens the
  // file, and every deck that uses those bytes is drawn by it afterwards. Which is also why it
  // is written once and never again — see `setMotif`.
  const measured = /^\/assets\/([0-9a-f]{64})\/motif$/.exec(url.pathname)
  if (measured && req.method === 'PUT') {
    const account = opts.auth ? await accountOf(opts.auth, req) : null
    if (opts.auth && !account) {
      json(res, 401, { error: 'log in first' })
      return true
    }
    const motif = MotifBody.safeParse(JSON.parse(await readBody(req)) as unknown)
    if (!motif.success) {
      json(res, 400, { error: 'not a measurement of a picture' })
      return true
    }
    if (!(await assets.get(measured[1] ?? ''))) {
      json(res, 404, { error: 'unknown asset' })
      return true
    }
    // An asset measured already keeps its measurement, and says so the same way as one that
    // took this one: the caller asked for the file to be measured, and it is.
    await assets.setMotif(measured[1] ?? '', motif.data)
    res.writeHead(204)
    res.end()
    return true
  }
  // Many at once, because a deck asks about every picture it holds at once. A hash is the
  // capability here as it is for the bytes: whoever knows one may ask what is drawn in it.
  if (req.method === 'GET' && url.pathname === '/assets/motifs') {
    const asked = (url.searchParams.get('of') ?? '').split(',').filter((h) => /^[0-9a-f]{64}$/.test(h))
    json(res, 200, await assets.motifs(asked.slice(0, MOTIFS_AT_ONCE)))
    return true
  }
  // The bytes themselves, through the server, for whoever has to *read* them rather than show
  // them (#469).
  //
  // `/assets/<hash>` answers with a redirect to the object store as soon as there is one, which is
  // the whole point of DRIFT §4: the pictures are not to go through the box. But a measurement is
  // a canvas read, a canvas read needs CORS along the entire redirect chain, and R2's final
  // response carries no `access-control-allow-origin`. So the measurement could never be taken in
  // production — and because none could be taken, every card was drawn by its file instead of by
  // its motif (#222). It fails only there: without an object store the route above already serves
  // the bytes, which is why every test and every development machine is green.
  //
  // This is not a second way to look at a picture. It is the one way to read one, and what it
  // costs is a read per content hash in the whole life of the service, since a measurement is
  // stored and never taken again — not a read per viewing, which is what §4 exists to avoid.
  const bytes = /^\/assets\/([0-9a-f]{64})\/bytes$/.exec(url.pathname)
  if (bytes && req.method === 'GET') {
    const got = await assets.get(bytes[1] ?? '')
    if (!got) {
      json(res, 404, { error: 'unknown asset' })
      return true
    }
    res.writeHead(200, { 'content-type': got.contentType, 'cache-control': 'public, max-age=31536000, immutable', 'content-security-policy': UPLOAD_POLICY })
    res.end(Buffer.from(got.bytes))
    return true
  }
  const one = /^\/assets\/([0-9a-f]{64})$/.exec(url.pathname)
  if (one && req.method === 'GET') {
    const hash = one[1] ?? ''
    const link = await assets.link(hash, ASSET_LINK_TTL_S)
    if (link) {
      res.writeHead(302, { location: link, 'cache-control': `private, max-age=${ASSET_LINK_TTL_S - FACE_LINK_SLACK_S}` })
      res.end()
      return true
    }
    const got = await assets.get(hash)
    if (!got) {
      json(res, 404, { error: 'unknown asset' })
      return true
    }
    res.writeHead(200, { 'content-type': got.contentType, 'cache-control': 'public, max-age=31536000, immutable', 'content-security-policy': UPLOAD_POLICY })
    res.end(Buffer.from(got.bytes))
    return true
  }
  return false
}

async function routeProjects(opts: ServerOptions, projects: ProjectStore, req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  // Who is asking (G1): with accounts on, creating needs one, and an owned project answers only
  // its owner. A project without an owner is from before accounts and stays open.
  const account = opts.auth ? await accountOf(opts.auth, req) : null
  // What this account may do with a project (D3): the role decides, and every route asks the
  // role rather than remembering the rules. A project from before accounts belongs to nobody and
  // is open to anyone, as it always was.
  const allowed = async (id: string, may: (role: Role) => boolean): Promise<{ rec: ProjectRecord; role: Role } | { status: number; error: string }> => {
    const rec = await projects.load(id)
    // Whether a game exists is its owner's to know (G1, #754): ids are short readable slugs, so
    // nobody logged in is told to log in whether the id names a game or nothing at all. Only an
    // account learns that there is no such game. A game from before accounts is open to anyone,
    // so its existence was never a secret.
    if (!rec) return opts.auth && !account ? { status: 401, error: 'log in first' } : { status: 404, error: 'unknown project' }
    if (rec.owner === undefined) return { rec, role: 'owner' }
    if (!account) return { status: 401, error: 'log in first' }
    const role = await projects.roleOf(id, account.id)
    if (!role) return { status: 403, error: 'not your project' }
    if (!may(role)) return { status: 403, error: `a ${role} may not do that` }
    return { rec, role }
  }
  const owned = (id: string) => allowed(id, canRead)
  // The ceiling on the games the asking account owns (#1193): the measure `projects`, borne by
  // whoever makes the game, since they own it — a duplicate or an import as much as a new one. Asked
  // only with accounts on; without them nothing is borne, and undefined asks the store for nothing.
  const plans = opts.plans ?? DEFAULT_PLANS
  const gamesLimit = async (): Promise<Limit | undefined> => (account ? limitOf(plans, await planOf(opts.accountPlans, plans, account.id), 'projects') : undefined)
  // Every ceiling a game the asking account makes is held to (#1193, #1197): the games it owns, and
  // what they name, since the new game is its own.
  const ownCeilings = async (): Promise<Ceilings> => {
    const games = await gamesLimit()
    return { ...(games !== undefined ? { projects: games } : {}), ...(await storageCeiling(opts, account?.id)) }
  }
  // A game written within that ceiling, or the 402 that says it was met. The store counts and writes
  // in one step, so the last place under the ceiling goes to exactly one of two at once.
  const within = async <T>(write: () => Promise<T>): Promise<T | null> => {
    try {
      return await write()
    } catch (e) {
      if (!(e instanceof QuotaReached)) throw e
      quotaRefused(res, e.quota, YOU)
      return null
    }
  }
  // A new game's cards, held to the ceiling of whoever makes it (#1195): a game sent whole, an
  // import and a duplicate grow from nothing, and are borne by the account that will own them.
  const cardsMet = async (doc: Pick<ProjectDoc, 'rows'>): Promise<QuotaMet | null> => {
    const ceilings = cardCeilings(opts)
    return account && ceilings ? cardGrowth(NO_CARDS, doc, (measure) => ceilings(account.id, measure)) : null
  }
  // What the account uses and its ceilings (#1193, #1192): its tier and, per measure that is built,
  // the use and the ceiling, `null` for unlimited; cards per game for every game it owns, counted out
  // of the game as it stands (#1195). How the web says it is slice 6 (#1198).
  if (req.method === 'GET' && url.pathname === '/me/usage') {
    if (!opts.auth) json(res, 404, { error: 'accounts are off' })
    else if (!account) json(res, 401, { error: 'log in first' })
    else {
      const host = editors(opts, projects)
      json(res, 200, await usageOf({ projects, tables: opts.store, live: (id) => host.live(id), ...(opts.accountPlans ? { accountPlans: opts.accountPlans } : {}), ...(opts.renders ? { renders: opts.renders } : {}) }, plans, account.id, clock(opts)))
    }
    return true
  }
  if (req.method === 'GET' && url.pathname === '/projects') {
    if (!account) {
      json(res, 401, { error: 'log in first' })
      return true
    }
    // Every game with how many tables it has and when one was last played at (G1). The tables
    // are the log's, not something the list keeps of its own.
    // The name is the live document's (#909, beslut C): a game renamed from here or from an editor
    // is an edit in the log and not yet a version, and the list says what the log says (D3).
    const mine = await projects.list(account.id)
    const host = editors(opts, projects)
    const played = await Promise.all(
      mine.map(async (p) => {
        const sessions = await opts.store.sessionsOf(p.id)
        const last = sessions.map((s) => s.lastAt).filter((at): at is string => at !== null)
        const live = await host.live(p.id)
        // What the workbench says of a game (#1204) is the live document's, as the name is.
        const about = live ? { cards: cardsUsed(live).cardCopiesPerProject, players: live.setup.seats.length } : {}
        const savedAt = (await projects.versions(p.id))[0]?.at ?? null
        // Whether the hero shows the game's box (#1416), said in the list so the hero's place is the
        // box's from the first screen and nothing changes shape when the drawing lands.
        const { boxOpened, ...game } = p
        const cover = showsCover(live ?? { box: undefined }, boxOpened === true) ? { cover: true } : {}
        return { ...game, name: live?.name ?? p.name, ...about, savedAt, tables: sessions.length, lastPlayed: last.sort().at(-1) ?? null, ...cover }
      }),
    )
    json(res, 200, played)
    return true
  }
  // What it takes to draw each game's first card (G1, #231), for the whole list in one answer.
  //
  // It is a route of its own rather than part of `/projects` on purpose. The list is the first
  // screen: it must draw on one answer, without waiting for every game's template, fonts and
  // pictures. And it is one answer for all the games rather than one per game, because a game in
  // the list must not cost a round trip. Each card then lands for itself as the browser draws it,
  // in a place the list reserved from the start, so nothing jumps.
  if (req.method === 'GET' && url.pathname === '/me/cards') {
    if (!account) {
      json(res, 401, { error: 'log in first' })
      return true
    }
    const mine = await projects.list(account.id)
    const faces: Record<string, CardFace | null> = {}
    for (const p of mine) {
      const rec = await projects.load(p.id)
      faces[p.id] = rec ? peekFace(rec) : null
    }
    json(res, 200, faces)
    return true
  }
  // «Väntar på dig» (#1225, #1204 beslut B): per game, the players' survey answers and the new
  // flags — for whoever may read the game's playtest (#524) — and the newest version when someone
  // else saved it. Its own answer after the list, as the cards are, because it reads every table of
  // every game; and of each table only its flags and version changes (`readVerbs`), never its moves.
  if (req.method === 'GET' && url.pathname === '/me/waiting') {
    if (!account) {
      json(res, 401, { error: 'log in first' })
      return true
    }
    const out: Waiting = {}
    // Who saved it, by the name she gave her account (#1254), and nobody's address nor its word.
    const names = new Map<string, Promise<string | null>>()
    const calledBy = (id: string): Promise<string | null> => {
      const known = names.get(id)
      if (known) return known
      const asked = opts.auth ? opts.auth.accountById(id).then((a) => a?.name ?? null) : Promise.resolve(null)
      names.set(id, asked)
      return asked
    }
    for (const p of await projects.list(account.id)) {
      const newest = (await projects.versions(p.id))[0]
      if (!newest) continue
      const about: GameWaiting = { rev: newest.rev }
      if (canStartTables(p.role ?? 'owner')) {
        const tables: WaitingTable[] = []
        for (const { id } of await opts.store.sessionsOf(p.id)) {
          const session = await opts.store.loadSession(id)
          if (!session) continue
          const [lines, surveys] = await Promise.all([opts.store.readVerbs(id, WAITING_VERBS), opts.surveys ? opts.surveys.list(id) : []])
          tables.push({ version: session.version, lines, surveys })
        }
        about.playtest = playtestWaiting(newest.rev, tables)
      }
      if (newest.by !== undefined && newest.by !== account.id) about.other = { name: await calledBy(newest.by), at: newest.at }
      out[p.id] = about
    }
    json(res, 200, out)
    return true
  }
  // The fan the page leads with (#1204): three of one game's cards, asked for after the list and
  // the first cards, so the first screen never waits for it.
  const fan = /^\/projects\/([^/]+)\/fan$/.exec(url.pathname)
  if (req.method === 'GET' && fan) {
    const gate = await owned(decodeURIComponent(fan[1] ?? ''))
    if (!('rec' in gate)) json(res, gate.status, { error: gate.error })
    else json(res, 200, fanFaces((await editors(opts, projects).live(gate.rec.id)) ?? gate.rec))
    return true
  }
  // The hero's box (#1416, L91): its front, right side and lid as `boxFaceOf` draws them, asked for
  // after the list as the fan is, so the first screen never waits for it.
  const cover = /^\/projects\/([^/]+)\/cover$/.exec(url.pathname)
  if (req.method === 'GET' && cover) {
    const gate = await owned(decodeURIComponent(cover[1] ?? ''))
    if (!('rec' in gate)) json(res, gate.status, { error: gate.error })
    else json(res, 200, coverOf((await editors(opts, projects).live(gate.rec.id)) ?? gate.rec))
    return true
  }
  // A designer opened the game's box (#1416): the hero shows it from then on. Whoever may edit the
  // game is its designer; a tester or a viewer looking at the tab draws no box for her. No edit
  // and no version: it is kept on the game beside its document.
  const opened = /^\/projects\/([^/]+)\/box\/opened$/.exec(url.pathname)
  if (req.method === 'POST' && opened) {
    const gate = await allowed(decodeURIComponent(opened[1] ?? ''), canEdit)
    if (!('rec' in gate)) json(res, gate.status, { error: gate.error })
    else {
      await projects.openBox(gate.rec.id)
      res.writeHead(204).end()
    }
    return true
  }
  // A game brought back from an export (G5, #528): a new project owned by whoever brings it, with
  // the history it had and every asset it uses. Nothing is written until everything has been read
  // and found to hold — the manifest, each asset against its hash and kind, the current version's
  // setup — and an asset the zip does not carry must already be here. A game is never written over.
  if (req.method === 'POST' && url.pathname === '/projects/import') {
    if (opts.auth && !account) {
      json(res, 401, { error: 'log in first' })
      return true
    }
    const bytes = await readBytes(req, IMPORT_MAX_BYTES)
    if (!bytes) {
      json(res, 413, { error: 'too big' })
      return true
    }
    const read = readExport(bytes)
    if (!read.ok) {
      json(res, 422, { error: 'not an export that can be read', problems: read.problems })
      return true
    }
    const missing: ImportProblem[] = []
    for (const hash of read.unlisted) if (!(opts.assets && (await opts.assets.get(hash)))) missing.push({ code: 'asset-unknown', values: { hash } })
    try {
      checkedName(read.current.name)
      validateSetup(setupFromProject(read.current), opts.registry)
    } catch (e) {
      missing.push({ code: 'unplayable', values: { message: (e as Error).message } })
    }
    if (missing.length > 0) {
      json(res, 422, { error: 'not an export that can be read', problems: missing })
      return true
    }
    // The ceiling is asked before anything is written, the pictures too (#1193): a game refused
    // leaves nothing behind. The restore below asks again in the step that writes the game, so two
    // imports at the last place still give exactly one.
    const limit = await gamesLimit()
    const met = account && limit !== undefined ? growth('projects', limit, await projects.owned(account.id), 1) : null
    // And the cards of the version that becomes current, against the same account's ceiling (#1195).
    const over = met ?? (await cardsMet(read.current))
    if (over) {
      quotaRefused(res, over, YOU)
      return true
    }
    // And so is the ceiling on storage (#1197): every picture any version names, weighed by the
    // bytes the zip carries or by what the box already has, and only what the account's games do
    // not name already.
    const carried = Object.fromEntries([...read.assets].map(([hash, asset]) => [hash, asset.bytes.byteLength]))
    const heavy = await storageMet(opts, projects, account?.id, read.manifest.versions.flatMap((v) => assetHashesOf(v.doc)), carried)
    if (heavy) {
      quotaRefused(res, heavy, YOU)
      return true
    }
    if (opts.assets) {
      for (const [hash, asset] of read.assets) {
        // A picture blocked after a report (#1274) is left out, and the game comes in without it.
        if (opts.reports?.blocked().has(hash)) continue
        if ((await opts.assets.put(asset.bytes, asset.contentType)) !== hash) throw new Error(`asset ${hash} stored under another name`)
        if (asset.motif) await opts.assets.setMotif(hash, asset.motif as never)
      }
    }
    // A copy beside its original says it is one (#529), in the language it was brought in in.
    const taken = account ? (await projects.list(account.id)).map((p) => p.name) : []
    const name = importedName(read.current.name, taken, langOf(url.searchParams.get('lang')))
    const versions = read.manifest.versions.map((v, i, all) => ({ rev: v.rev, at: v.at, ...(v.label !== undefined ? { label: v.label } : {}), doc: i === all.length - 1 ? { ...v.doc, name } : v.doc }))
    // The edit log is not exported, so how far it had come (`atSeq`) says nothing here.
    const rec = await within(async () => projects.restore(randomUUID(), versions, account?.id, await ownCeilings()))
    if (rec) json(res, 201, { id: rec.id, rev: rec.rev })
    return true
  }
  if (req.method === 'POST' && url.pathname === '/projects') {
    if (opts.auth && !account) {
      json(res, 401, { error: 'log in first' })
      return true
    }
    const body = z.object({ id: z.string().min(1).optional() }).and(ProjectDoc).parse(liftDoc(JSON.parse(await readBody(req))))
    const { id: wanted, ...doc } = body
    checkedName(doc.name)
    validateSetup(setupFromProject(doc), opts.registry)
    const cards = await cardsMet(doc)
    if (cards) {
      quotaRefused(res, cards, YOU)
      return true
    }
    const ceilings = await ownCeilings()
    const rec = await within(() => projects.create(wanted ?? randomUUID(), doc, account?.id, ceilings))
    if (rec) json(res, 201, { id: rec.id, rev: rec.rev })
    return true
  }
  // A question to the AI about the game (#1001, E4): whoever may edit the game asks, with her own
  // key, about the game as it stands in the editor right now — the live document, unsaved edits and
  // all, since that is what she is looking at. The answer streams back (`ai-ask.ts`).
  const asking = /^\/projects\/([^/]+)\/ai\/ask$/.exec(url.pathname)
  if (asking && req.method === 'POST') {
    if (!opts.ai || !opts.auth) {
      json(res, 404, { error: 'not found' })
      return true
    }
    // The key is the account's, so a game from before accounts is asked about by an account too.
    if (!account) {
      json(res, 401, { error: 'log in first' })
      return true
    }
    const gate = await allowed(decodeURIComponent(asking[1] ?? ''), canEdit)
    if (!('rec' in gate)) {
      json(res, gate.status, { error: gate.error })
      return true
    }
    // Forty turns of twenty thousand characters is the most a conversation can be; a body past that
    // is not kept.
    const bytes = await readBytes(req, ASK_MAX_BYTES)
    if (!bytes) {
      json(res, 413, { error: 'too big' })
      return true
    }
    const ask = AskBody.parse(JSON.parse(Buffer.from(bytes).toString('utf8')))
    const doc = (await editors(opts, projects).live(gate.rec.id)) ?? gate.rec
    await answerQuestion({ vault: opts.ai.vault, providers: opts.ai.providers, flight: flightOf(opts, opts.ai.caps) }, res, account.id, doc, ask)
    return true
  }
  const one = /^\/projects\/([^/]+)$/.exec(url.pathname)
  if (one && req.method === 'GET') {
    const got = await owned(decodeURIComponent(one[1] ?? ''))
    if ('rec' in got) json(res, 200, got.rec)
    else json(res, got.status, { error: got.error })
    return true
  }
  if (one && req.method === 'PUT') {
    const gate = await allowed(decodeURIComponent(one[1] ?? ''), canEdit)
    if (!('rec' in gate)) {
      json(res, gate.status, { error: gate.error })
      return true
    }
    const body = z.object({ rev: z.number().int() }).and(ProjectDoc).parse(liftDoc(JSON.parse(await readBody(req))))
    // Only a name that is being changed is held to the limit, so a game named before it existed
    // can still be saved as it is.
    if (body.name !== gate.rec.name) checkedName(body.name)
    const { rev, ...doc } = body
    validateSetup(setupFromProject(doc), opts.registry)
    // Through the project's actor and never past it (D3, #768): the actor is the one writer, so
    // a document written here is in its log, on every open editor's screen, and in the rev the
    // next editor is handed — not only in the store, behind an actor that goes on saying rev 1.
    // A version that names more than the owner has room for is refused before it reaches the log
    // (#1197), and borne by the owner whoever saves it.
    const heavy = await storageMet(opts, projects, gate.rec.owner, assetHashesOf(doc))
    if (heavy) {
      quotaRefused(res, heavy, await bearerOf(opts, account, gate.rec.owner))
      return true
    }
    const actor = await editors(opts, projects).get(gate.rec.id)
    // The owner's ceiling on the game's cards stands in the actor's decide step (#1195), so a
    // document over it is refused before it is in the log, and no version is made of it. The
    // ceiling on storage is asked again where the version is written (#1197), and the document goes
    // into the log in that same step, so one refused there is in no log either (#1233).
    let result: Saved
    try {
      result = actor ? await actor.put(rev, doc, account?.id, () => storageCeiling(opts, gate.rec.owner)) : { ok: false, reason: 'unknown project' }
    } catch (e) {
      if (!(e instanceof QuotaReached)) throw e
      quotaRefused(res, e.quota, await bearerOf(opts, account, gate.rec.owner))
      return true
    }
    if (!result.ok && result.quota) quotaRefused(res, result.quota, await bearerOf(opts, account, gate.rec.owner))
    else if (!result.ok && result.reason === 'conflict') json(res, 409, { error: 'project changed since rev ' + rev })
    else if (!result.ok) json(res, 404, { error: 'unknown project' })
    else json(res, 200, { id: gate.rec.id, rev: result.rev })
    return true
  }
  // «Byt namn» from the start page's ⋯ (#909, beställarens beslut C): the same `rename` edit the
  // editor sends (#738), through the same actor, so it is in the log, on every open editor's screen
  // and undoable — and no version is made of it, so nobody's unsaved work is saved for them.
  const renaming = /^\/projects\/([^/]+)\/name$/.exec(url.pathname)
  if (renaming && req.method === 'PUT') {
    const gate = await allowed(decodeURIComponent(renaming[1] ?? ''), canEdit)
    if (!('rec' in gate)) {
      json(res, gate.status, { error: gate.error })
      return true
    }
    const { name } = z.object({ name: z.string() }).parse(JSON.parse(await readBody(req)))
    const actor = await editors(opts, projects).get(gate.rec.id)
    if (!actor) {
      json(res, 404, { error: 'unknown project' })
      return true
    }
    const entry = await actor.edit({ v: 'rename', name }, account?.id)
    json(res, 200, { id: gate.rec.id, name: actor.doc.name, seq: entry.seq })
    return true
  }
  // The history (B4): every save is a version, none of them is ever rewritten. It is presented
  // as versions with a date and, for the ones that meant something, a name — never as commits.
  const versions = /^\/projects\/([^/]+)\/versions$/.exec(url.pathname)
  if (versions && req.method === 'GET') {
    const gate = await owned(decodeURIComponent(versions[1] ?? ''))
    if (!('rec' in gate)) {
      json(res, gate.status, { error: gate.error })
      return true
    }
    // Who saved each version (#1225) is an account's number, and the history has no use for it.
    json(res, 200, (await projects.versions(gate.rec.id)).map(({ by: _by, ...v }) => v))
    return true
  }
  // What every version changed, in one answer (#177). A row in the history says what its save
  // changed, and the history is read as a whole — fifteen rows in the granskning's measurement,
  // and more every working day — so asking that a version at a time would be a request per row.
  //
  // It is derived here rather than written down at save time, because the information is already
  // in the documents: every version is kept whole (B4), so the difference between two of them is
  // a reading and not a record. That is also what gives a history written before this existed the
  // same rows as one written after it.
  //
  // The walk goes oldest first and keeps the version it just read as the next one's `before`, so
  // it loads each document once and never holds more than two at a time — a history of a
  // 308-card deck must not be a history-sized allocation.
  //
  // What that costs is measured and not judged (#177, #175–#179). Against a real Postgres, a
  // 308-card deck whose every version is 59 KB: 14 ms at five versions, 35 at fifteen, 63–94 at
  // thirty, 178 at sixty, 313 at a hundred — three milliseconds a version, flat, and the answer
  // itself 2.7 KB at thirty. It is a summary of a history and never a download of one, which is
  // what `VersionChange` is for and what `history.test.ts` holds it to.
  //
  // Three milliseconds a version is comfortable at the depth a project reaches in its first year
  // and stops being comfortable after it: a designer who saves on every working day passes a
  // hundred versions inside five months, and the box this runs on is a shared one with far less
  // to spare than the machine those numbers came off. The upgrade path is to write the summary
  // down when the version is made, which turns the walk into a single read — worth doing when a
  // real history first passes a hundred versions, and not before, because a summary written down
  // is a summary that can disagree with the documents it was taken from.
  const changes = /^\/projects\/([^/]+)\/versions\/changes$/.exec(url.pathname)
  if (changes && req.method === 'GET') {
    const gate = await owned(decodeURIComponent(changes[1] ?? ''))
    if (!('rec' in gate)) {
      json(res, gate.status, { error: gate.error })
      return true
    }
    const listed = await projects.versions(gate.rec.id)
    const out: VersionChange[] = []
    let before: ProjectRecord | null = null
    for (const { rev } of [...listed].sort((a, b) => a.rev - b.rev)) {
      const after = await projects.at(gate.rec.id, rev)
      if (!after) continue
      out.push(before ? changeOf(rev, diffProjects(before, after)) : { rev, added: 0, removed: 0, changed: 0, parts: [], reordered: false, columns: false, first: true })
      before = after
    }
    json(res, 200, out.reverse())
    return true
  }
  const oneVersion = /^\/projects\/([^/]+)\/versions\/(\d+)$/.exec(url.pathname)
  if (oneVersion && req.method === 'GET') {
    const gate = await owned(decodeURIComponent(oneVersion[1] ?? ''))
    if (!('rec' in gate)) {
      json(res, gate.status, { error: gate.error })
      return true
    }
    const rec = await projects.at(gate.rec.id, Number(oneVersion[2]))
    if (!rec) json(res, 404, { error: 'unknown version' })
    else json(res, 200, rec)
    return true
  }
  const naming = /^\/projects\/([^/]+)\/versions\/(\d+)\/label$/.exec(url.pathname)
  if (naming && req.method === 'PUT') {
    const gate = await owned(decodeURIComponent(naming[1] ?? ''))
    if (!('rec' in gate)) {
      json(res, gate.status, { error: gate.error })
      return true
    }
    const body = z.object({ label: z.string().min(1).max(80).nullable() }).parse(JSON.parse(await readBody(req)))
    const named = await projects.label(gate.rec.id, Number(naming[2]), body.label)
    if (named === 'missing') json(res, 404, { error: 'unknown version' })
    else json(res, 200, named)
    return true
  }
  // What changed between two versions, as changes in the card table. Without `from`, against
  // the version just before this one.
  const diffing = /^\/projects\/([^/]+)\/versions\/(\d+)\/diff$/.exec(url.pathname)
  if (diffing && req.method === 'GET') {
    const gate = await owned(decodeURIComponent(diffing[1] ?? ''))
    if (!('rec' in gate)) {
      json(res, gate.status, { error: gate.error })
      return true
    }
    const to = Number(diffing[2])
    const asked = url.searchParams.get('from')
    const before = await projects.at(gate.rec.id, asked === null ? to - 1 : Number(asked))
    const after = await projects.at(gate.rec.id, to)
    if (!after) json(res, 404, { error: 'unknown version' })
    // Nothing came before it, so everything in it came with it. Said as a `DocDiff` and not as a
    // literal that happens to look like one: a part added to the shape has to be answered for
    // here too, and only the type asks.
    else if (!before)
      json(res, 200, {
        rows: after.rows.map((r) => ({ kind: 'added', cardRef: r.id })),
        reordered: false,
        columns: false,
        template: true,
        setup: true,
        icons: true,
        rules: after.rules !== undefined,
      } satisfies DocDiff)
    else json(res, 200, diffProjects(before, after))
    return true
  }
  // Sharing a project (D3): the owner mails an invitation to an address, good once. Whoever
  // follows it while signed in joins with the role it names.
  const inviting = /^\/projects\/([^/]+)\/invites$/.exec(url.pathname)
  if (inviting && req.method === 'POST') {
    const gate = await allowed(decodeURIComponent(inviting[1] ?? ''), canShare)
    if (!('rec' in gate)) {
      json(res, gate.status, { error: gate.error })
      return true
    }
    const body = z.object({ email: z.string().email().max(254), role: z.enum(ROLES), lang: z.string().max(8).optional() }).parse(JSON.parse(await readBody(req)))
    const lang = langOf(body.lang)
    // An invitation nobody could use is not sent (#477): to someone who already has the game —
    // the owner included — or to an address whose invitation is still open. `why` says which, so
    // the panel can say it in its own words.
    const same = (a: string) => a.toLowerCase() === body.email.toLowerCase()
    const members = await Promise.all((await projects.members(gate.rec.id)).map(async (m) => (await opts.auth?.accountById(m.account))?.email ?? m.account))
    if (members.some(same)) {
      json(res, 409, { error: 'already shared with them', why: 'member' })
      return true
    }
    if ((await projects.openInvites(gate.rec.id, clock(opts).toISOString())).some((i) => same(i.email))) {
      json(res, 409, { error: 'already invited', why: 'invited' })
      return true
    }
    const token = newSecret()
    const expiresAt = new Date(clock(opts).getTime() + INVITE_TTL_MS).toISOString()
    await projects.invite({ tokenHash: hash(token), project: gate.rec.id, email: body.email, role: body.role, ...(account ? { by: account.id } : {}), expiresAt })
    const where = opts.appOrigin ?? opts.publicOrigin ?? ''
    // In the login mail's bands (#1107, L72), with the foot it had never had (#757).
    await opts.mailer?.send(inviteMail(body.email, { from: account?.email, fromName: account?.name, game: gate.rec.name, role: body.role, link: `${where}/invites/${token}`, lang, contact: opts.contact }))
    json(res, 201, { ok: true })
    return true
  }
  // What is waiting (beslut 2026-09-27, #477 fynd 10): the invitations nobody has followed yet, to
  // whoever may share, and a way to take one back.
  if (inviting && req.method === 'GET') {
    const gate = await allowed(decodeURIComponent(inviting[1] ?? ''), canShare)
    if (!('rec' in gate)) {
      json(res, gate.status, { error: gate.error })
      return true
    }
    json(res, 200, await projects.openInvites(gate.rec.id, clock(opts).toISOString()))
    return true
  }
  const withdrawing = /^\/projects\/([^/]+)\/invites\/([^/]+)$/.exec(url.pathname)
  if (withdrawing && req.method === 'DELETE') {
    const gate = await allowed(decodeURIComponent(withdrawing[1] ?? ''), canShare)
    if (!('rec' in gate)) {
      json(res, gate.status, { error: gate.error })
      return true
    }
    const gone = await projects.withdrawInvites(gate.rec.id, decodeURIComponent(withdrawing[2] ?? ''))
    json(res, gone > 0 ? 200 : 404, gone > 0 ? { ok: true } : { error: 'no invitation waiting' })
    return true
  }
  const members = /^\/projects\/([^/]+)\/members$/.exec(url.pathname)
  if (members && req.method === 'GET') {
    const gate = await allowed(decodeURIComponent(members[1] ?? ''), canRead)
    if (!('rec' in gate)) {
      json(res, gate.status, { error: gate.error })
      return true
    }
    const rows = await projects.members(gate.rec.id)
    // Each by the name they gave their account beside the address (#1254), which Dela has always shown.
    const named = await Promise.all(
      rows.map(async (m) => {
        const who = await opts.auth?.accountById(m.account)
        return { email: who?.email ?? m.account, ...(who?.name ? { name: who.name } : {}), role: m.role }
      }),
    )
    json(res, 200, named)
    return true
  }
  const member = /^\/projects\/([^/]+)\/members\/([^/]+)$/.exec(url.pathname)
  if (member && req.method === 'DELETE') {
    const gate = await allowed(decodeURIComponent(member[1] ?? ''), canShare)
    if (!('rec' in gate)) {
      json(res, gate.status, { error: gate.error })
      return true
    }
    const email = decodeURIComponent(member[2] ?? '')
    const rows = await projects.members(gate.rec.id)
    const found = await Promise.all(rows.map(async (m) => ({ ...m, email: (await opts.auth?.accountById(m.account))?.email ?? m.account })))
    const leaving = found.find((m) => m.email === email)
    if (!leaving || leaving.role === 'owner') {
      json(res, 404, { error: 'not shared with them' })
      return true
    }
    await projects.unshare(gate.rec.id, leaving.account)
    ;(await editors(opts, projects).running(gate.rec.id))?.dismiss(leaving.account)
    json(res, 200, { ok: true })
    return true
  }
  // The rulebook as a booklet for print (B7): the rules as they stand, through the same worker
  // that renders every card. The same rules asked for twice are one rendering, since the queue
  // is keyed by what is on the page.
  const rulebook = /^\/projects\/([^/]+)\/rulebook$/.exec(url.pathname)
  if (rulebook && req.method === 'POST') {
    const gate = await allowed(decodeURIComponent(rulebook[1] ?? ''), canRead)
    if (!('rec' in gate)) {
      json(res, gate.status, { error: gate.error })
      return true
    }
    if (!opts.renders) {
      json(res, 503, { error: 'render queue unavailable' })
      return true
    }
    const rec = gate.rec
    if (!rec.rules) {
      json(res, 404, { error: 'no rules' })
      return true
    }
    const job = await bookletJobOf(opts, rec, rec.rules, langOf(url.searchParams.get('lang')))
    const hash = job.hash
    // Borne by the game's owner, whoever asked (#1197, A2).
    await opts.renders.enqueue(job, rec.owner)
    json(res, 202, { hash })
    return true
  }
  // The project's current revision as print work (#14): one manifest entry per physical card,
  // with every face compiled from that same row. The response is safe metadata only; compiled
  // HTML/CSS stays inside the render queue, where the existing Chromium worker consumes it.
  // Taking a game away (G1): the owner's alone, and it takes the whole history with it.
  if (one && req.method === 'DELETE') {
    const gate = await allowed(decodeURIComponent(one[1] ?? ''), canDelete)
    if (!('rec' in gate)) {
      json(res, gate.status, { error: gate.error })
      return true
    }
    // And its tables go with it (#676), as the question promised: each is ended as the table ends
    // one (C9), so its code opens no door, the phones at it are told, and no seat plays on a game
    // that no longer exists. Ended before the game goes, so a table is never left behind.
    for (const table of await opts.store.sessionsOf(gate.rec.id)) await opts.host.end(table.id)
    const removed = await projects.remove(gate.rec.id)
    // And the people at them with it (G6, F4, #1279): every table's names, words and answers are
    // masked as the game goes, while the tables themselves stay for the quotas (#1196). After the
    // game, so that a masking that fails leaves a game that is gone, which the sweeper's next round
    // finds and masks; never a game that is there with its tables masked.
    if (opts.erasures && removed) {
      try {
        await opts.host.reload((await opts.erasures.erase([entry({ kind: 'game', project: gate.rec.id }, 'removed', clock(opts))])).sessions)
      } catch (err) {
        console.error(JSON.stringify({ msg: 'erase-failed', project: gate.rec.id, error: err instanceof Error ? err.message : String(err) }))
      }
    }
    // Everyone who has the game open is told it is gone, and the actor goes with it (#485).
    const host = editors(opts, projects)
    ;(await host.running(gate.rec.id))?.shutDown()
    host.forget(gate.rec.id)
    json(res, 200, { ok: removed })
    return true
  }
  const print = /^\/projects\/([^/]+)\/print$/.exec(url.pathname)
  if (print && req.method === 'POST') {
    const gate = await owned(decodeURIComponent(print[1] ?? ''))
    if (!('rec' in gate)) {
      json(res, gate.status, { error: gate.error })
      return true
    }
    if (!opts.renders) {
      json(res, 503, { error: 'render queue unavailable' })
      return true
    }
    // Whoever orders may leave the hardware out (#1140): many partners will not pack a die. An
    // order with no body asks for everything, as every order did before.
    const order = PrintBody.safeParse(parsedOrNull(await readBody(req)) ?? {})
    if (!order.success) {
      json(res, 400, { error: 'malformed' })
      return true
    }
    const rec = gate.rec
    // Physical validation (E5): warnings live in the editor, errors stop an order. A card that
    // would come back unreadable is cheaper to catch here than in five hundred printed copies.
    const found = checkedCards(rec, opts)
    const errors = found.filter((f) => f.severity === 'error')
    if (errors.length > 0) {
      json(res, 422, { project: rec.id, rev: rec.rev, errors })
      return true
    }
    const printed = printExportOf(await deckOf(opts, rec), setupFromProject(rec), opts.registry, clock(opts).getTime(), { hardware: order.data.hardware !== false })
    // Borne by the game's owner, whoever ordered (#1197, A2).
    for (const job of printed.jobs) await opts.renders.enqueue(job, rec.owner)
    // The licences of every symbol the game uses go with the order (E4): the printer is handed
    // what the deck is made of, not only how it looks.
    json(res, 202, { project: rec.id, rev: rec.rev, cards: printed.cards, hardware: printed.hardware, credits: creditsOf(rec), warnings: found })
    return true
  }
  // The print package (#1207, the page and the download are #1208): GET says what the provider would
  // be sent and how far its files have come, and asks for any not yet drawn; `files/<name>` hands
  // one over once it is, and `zip` hands over the whole package once every file is. Nothing is held
  // between the calls: each works it out of the document and the render store, as the export does.
  // The owner's and the co-editors', whose work it is.
  //
  // The provider is named (`provider=<id>`), or it is the one an order to an address would be routed
  // to (`to=<country>`, F2), which is how the page asks; then the provider's quote for that address
  // comes with it, and an address no provider may print for says why (409, «no EU print»).
  const packaging = /^\/projects\/([^/]+)\/print-package(?:\/files\/([^/]+)|\/(zip))?$/.exec(url.pathname)
  if (packaging && req.method === 'GET') {
    const gate = await allowed(decodeURIComponent(packaging[1] ?? ''), canEdit)
    if (!('rec' in gate)) {
      json(res, gate.status, { error: gate.error })
      return true
    }
    if (!opts.renders) {
      json(res, 503, { error: 'render queue unavailable' })
      return true
    }
    const providers = opts.printProviders ?? []
    const named = url.searchParams.get('provider')
    const to = url.searchParams.get('to')
    const country = to === null ? null : Country.safeParse(to)
    if (country && !country.success) {
      json(res, 400, { error: 'to is a country code' })
      return true
    }
    const provider = named === null ? undefined : providers.find((p) => p.id === named)
    const dest = country?.success ? { country: country.data } : null
    const choose = provider ? (): Route => ({ kind: 'routed', provider }) : named === null && dest ? (manifest: PrintManifest) => routeOrder(providers, manifest, dest) : null
    if (!choose) {
      json(res, 404, { error: 'no such print provider' })
      return true
    }
    const rec = gate.rec
    const lang = langOf(url.searchParams.get('lang'))
    const pkg = await printPackageOf(opts, rec, choose, lang)
    if ('refused' in pkg) {
      json(res, 409, { error: pkg.refused })
      return true
    }
    const all = pkg.rulebook ? [...pkg.files, pkg.rulebook] : pkg.files
    if (packaging[2] !== undefined) {
      const name = decodeURIComponent(packaging[2])
      const wanted = all.find((f) => f.name === name)
      if (!wanted) {
        json(res, 404, { error: 'no such file' })
        return true
      }
      const bytes = await opts.renders.output(wanted.job.hash)
      if (!bytes) {
        json(res, 202, { state: (await opts.renders.status(wanted.job.hash))?.state ?? 'queued' })
        return true
      }
      res.writeHead(200, { 'content-type': contentTypeOf(wanted.job.kind), 'content-length': String(bytes.length), 'cache-control': 'no-store' })
      res.end(bytes)
      return true
    }
    const renders = opts.renders
    const stateOf = async ({ name, job }: PrintFileJob) => {
      if ((await renders.output(job.hash)) !== null) return { name, state: 'done' }
      const state = (await renders.status(job.hash))?.state
      // Asked for here too, so a GET alone gets there, and a job reaped since is asked again.
      // Borne by the game's owner, whoever asked, as the export's are (#1197, A2).
      if (state !== 'queued' && state !== 'running' && state !== 'failed') await renders.enqueue(job, rec.owner)
      return { name, state: state === 'failed' ? 'failed' : state === 'running' ? 'running' : 'queued' }
    }
    const files = []
    for (const file of pkg.files) files.push(await stateOf(file))
    const rulebook = pkg.rulebook ? await stateOf(pkg.rulebook) : null
    const states = rulebook ? [...files, rulebook] : files
    const total = states.length
    const done = states.filter((f) => f.state === 'done').length
    const failed = states.filter((f) => f.state === 'failed').map((f) => f.name)
    const providerFacts = { id: pkg.provider.id, label: pkg.provider.label, manufacturesIn: pkg.provider.manufacturesIn }
    if (packaging[3] !== undefined) {
      // The zip waits for every file, as the export does; a file the renderer gave up on is named in
      // the manifest rather than holding the package back for ever.
      if (done + failed.length < total) {
        json(res, 202, { project: rec.id, rev: rec.rev, total, done, failed: failed.length })
        return true
      }
      const contents = new Map<string, Uint8Array>()
      for (const { name, job } of all) {
        const bytes = await renders.output(job.hash)
        if (bytes) contents.set(printPathOf(name), bytes)
      }
      const manifest: PrintPackageManifest = {
        format: PRINT_PACKAGE_FORMAT,
        formatVersion: PRINT_PACKAGE_FORMAT_VERSION,
        createdAt: clock(opts).toISOString(),
        ...(opts.release ? { release: opts.release } : {}),
        project: { id: rec.id, name: rec.name },
        rev: rec.rev,
        provider: providerFacts,
        requirements: pkg.requirements,
        order: pkg.order,
        files: pkg.files.map((f) => printPathOf(f.name)).filter((path) => contents.has(path)),
        rulebook: pkg.rulebook && contents.has(printPathOf(pkg.rulebook.name)) ? printPathOf(pkg.rulebook.name) : null,
        errors: pkg.errors,
        warnings: pkg.warnings,
        failed,
        credits: creditsOf(rec),
        box: pkg.box,
      }
      const zip = packPrintPackage({ manifest, readme: printPackageReadme(lang, manifest), files: contents })
      res.writeHead(200, { 'content-type': 'application/zip', 'content-length': String(zip.length), 'content-disposition': printPackageDisposition(rec.name, rec.rev, lang), 'cache-control': 'no-store' })
      res.end(zip)
      return true
    }
    json(res, 200, {
      project: rec.id,
      rev: rec.rev,
      provider: providerFacts,
      requirements: pkg.requirements,
      // What the provider would answer for one copy sent to the address (F3), made up by a fake and
      // marked so (`basis`); only when the package was asked for an address.
      ...(dest && !provider ? { to: dest.country, quote: await pkg.provider.quote(pkg.manifest, dest) } : {}),
      order: pkg.order,
      files,
      rulebook,
      errors: pkg.errors,
      warnings: pkg.warnings,
      total,
      done,
      failed: failed.length,
      box: pkg.box,
    })
    return true
  }
  // The whole game for the designer to keep (G5, #527): POST asks for the print files to be made,
  // GET says how far they have come (202) and then hands over the zip. Nothing is held between the
  // two: both work the plan out of the document and the render store, so a restart loses nothing
  // and asking twice is asking once. The owner's and the co-editors', whose work it is.
  const exporting = /^\/projects\/([^/]+)\/export$/.exec(url.pathname)
  if (exporting && (req.method === 'POST' || req.method === 'GET')) {
    const gate = await allowed(decodeURIComponent(exporting[1] ?? ''), canEdit)
    if (!('rec' in gate)) {
      json(res, gate.status, { error: gate.error })
      return true
    }
    if (!opts.renders) {
      json(res, 503, { error: 'render queue unavailable' })
      return true
    }
    const rec = gate.rec
    const lang = langOf(url.searchParams.get('lang'))
    const plan = await printPlanOf(opts, rec, lang)
    let done = 0
    const failed: string[] = []
    for (const { file, job } of plan.jobs) {
      if ((await opts.renders.output(job.hash)) !== null) {
        done++
        continue
      }
      const state = (await opts.renders.status(job.hash))?.state
      if (state === 'failed') failed.push(file)
      // Asked for here too, so a GET alone gets there, and a job reaped since is asked again.
      // Borne by the game's owner, whoever asked (#1197, A2).
      else if (state !== 'queued' && state !== 'running') await opts.renders.enqueue(job, rec.owner)
    }
    const total = plan.jobs.length
    if (req.method === 'POST' || done + failed.length < total) {
      json(res, 202, { project: rec.id, rev: rec.rev, total, done, failed: failed.length })
      return true
    }
    const summaries = [...(await projects.versions(rec.id))].reverse()
    const versions = []
    for (const v of summaries) {
      const at = await projects.at(rec.id, v.rev)
      if (!at) continue
      const { id: _id, rev: _rev, owner: _owner, ...doc } = at
      versions.push({ rev: v.rev, at: v.at, ...(v.label !== undefined ? { label: v.label } : {}), ...(v.atSeq !== undefined ? { atSeq: v.atSeq } : {}), doc })
    }
    const hashes = [...new Set(versions.flatMap((v) => assetHashesOf(v.doc)))].sort()
    const motifs = opts.assets ? await opts.assets.motifs(hashes) : {}
    const assetFiles = new Map<string, Uint8Array>()
    const assets = []
    const absent: string[] = []
    // A picture blocked after a report (#1274) is not in the zip, and the manifest says so: which, since
    // when, and that it is the reason it is missing, so it is never mistaken for one the box lost.
    const blocked = opts.reports ? await opts.reports.blocksOf(hashes) : []
    const withheld = new Set(blocked.map((b) => b.hash))
    for (const hash of hashes) {
      if (withheld.has(hash)) continue
      const got = opts.assets ? await opts.assets.get(hash) : null
      if (!got) {
        absent.push(hash)
        continue
      }
      const file = assetFileOf(hash, got.contentType)
      assetFiles.set(file, got.bytes)
      assets.push({ hash, file, contentType: got.contentType, size: got.bytes.length, ...(motifs[hash] ? { motif: motifs[hash] } : {}) })
    }
    const prints = new Map<string, Uint8Array>()
    for (const { file, job } of plan.jobs) {
      const bytes = await opts.renders.output(job.hash)
      if (bytes) prints.set(file, bytes)
    }
    const manifest = ProjectExport.parse({
      format: EXPORT_FORMAT,
      formatVersion: EXPORT_FORMAT_VERSION,
      exportedAt: clock(opts).toISOString(),
      ...(opts.release ? { release: opts.release } : {}),
      project: { id: rec.id, name: rec.name },
      current: { rev: rec.rev },
      versions,
      assets,
      absent,
      ...(blocked.length > 0 ? { blocked: blocked.map((b) => ({ hash: b.hash, since: b.at })) } : {}),
      print: { rev: rec.rev, cards: plan.cards, ...(plan.rulebook && prints.has(plan.rulebook) ? { rulebook: plan.rulebook } : {}), credits: creditsOf(rec), warnings: plan.warnings, errors: plan.errors, failed, box: plan.box },
    })
    const zip = packExport({ manifest, readme: readmeOf(lang, manifest), assets: assetFiles, prints })
    res.writeHead(200, { 'content-type': 'application/zip', 'content-length': String(zip.length), 'content-disposition': exportDisposition(rec.name, rec.rev), [EXPORT_SUMMARY_HEADER]: exportSummaryOf(manifest), 'cache-control': 'no-store' })
    res.end(zip)
    return true
  }
  // Which of a game's pictures are blocked after a report (#1274), and why: for the owner and the
  // co-editors, who see «Spärrad» in Tabell and the reasons behind it (beslut 1). A tester, a reader
  // and a guest are never told; for them a blocked picture is one that is not there.
  const blockedOf = /^\/projects\/([^/]+)\/blocked$/.exec(url.pathname)
  if (blockedOf && req.method === 'GET') {
    const gate = await allowed(decodeURIComponent(blockedOf[1] ?? ''), canEdit)
    if (!('rec' in gate)) {
      json(res, gate.status, { error: gate.error })
      return true
    }
    const blocks = opts.reports ? await opts.reports.blocksOf(assetHashesOf(gate.rec)) : []
    json(res, 200, { blocked: blocks.map((b) => ({ hash: b.hash, reason: b.reason, at: b.at })) })
    return true
  }
  // «Dubblera» (#738): a second game made of the first, the duplicating account's own. It is taken by
  // those who may take the game with them (G5), as an export is. What is copied is the game as it
  // stands in the editor, saved or not — the copy is of what the designer is looking at — and it
  // starts a history of its own: the versions are the first game's story, not the copy's.
  const duplicating = /^\/projects\/([^/]+)\/duplicate$/.exec(url.pathname)
  if (duplicating && req.method === 'POST') {
    const gate = await allowed(decodeURIComponent(duplicating[1] ?? ''), canEdit)
    if (!('rec' in gate)) {
      json(res, gate.status, { error: gate.error })
      return true
    }
    // What the log says, whether or not anyone has the game open now (D3, #909).
    const { id: _id, rev: _rev, owner: _owner, ...saved } = gate.rec
    const doc = (await editors(opts, projects).live(gate.rec.id)) ?? saved
    const taken = account ? (await projects.list(account.id)).map((p) => p.name) : []
    const name = duplicatedName(doc.name, taken, langOf(url.searchParams.get('lang')))
    // The copy is the duplicating account's, and so is its place under the ceiling: a co-editor's
    // copy is held to the co-editor's tier and never to the owner's (A2, #1192).
    const cards = await cardsMet(doc)
    if (cards) {
      quotaRefused(res, cards, YOU)
      return true
    }
    const ceilings = await ownCeilings()
    const rec = await within(() => projects.create(randomUUID(), { ...structuredClone(doc), name }, account?.id, ceilings))
    if (rec) json(res, 201, { id: rec.id, rev: rec.rev, name })
    return true
  }
  const start = /^\/projects\/([^/]+)\/sessions$/.exec(url.pathname)
  // The tables this game has (#19): the editor's Bord tab reads them here. The version and
  // whether the log is locked come from the actor, the same source `GET /sessions/:id` answers
  // from, so a refreshed table says the rev it actually runs.
  if (start && req.method === 'GET') {
    const gate = await owned(decodeURIComponent(start[1] ?? ''))
    if (!('rec' in gate)) {
      json(res, gate.status, { error: gate.error })
      return true
    }
    const summaries = await opts.store.sessionsOf(gate.rec.id)
    // The code guests join by comes along for whoever may start a table (#477): it is what lets the
    // editor pick up the table it started after a reload. It is admission, so a viewer is not shown
    // it, and a table that has ended has none to show.
    const admits = canStartTables(gate.role)
    const now = clock(opts).getTime()
    const tables: { id: string; version: string; ended: boolean; startedAt: string; lastAt: string | null; code?: string; seating?: Seating }[] = []
    for (const summary of summaries) {
      const actor = await opts.host.get(summary.id)
      if (!actor) continue
      // How it was started to be sat at (#1286) says which view «Öppna bordet» opens.
      const session = await opts.store.loadSession(summary.id)
      const code = admits && !actor.ended && session?.code !== undefined && session.codeExpiresAt !== undefined && Date.parse(session.codeExpiresAt) > now ? session.code : undefined
      tables.push({ id: summary.id, version: actor.version, ended: actor.ended, startedAt: summary.startedAt, lastAt: summary.lastAt, ...(code ? { code } : {}), ...(session?.seating ? { seating: session.seating } : {}) })
    }
    json(res, 200, tables)
    return true
  }
  // What the game's playtests said (#1010, G3): every table's answers, flags and people, and every
  // version's sums, in one answer rather than a survey and a whole log per table. It is the same
  // playtest data a table's log and surveys are (#524), so it is read by the same people: whoever
  // may start the game's tables. Read from the store and never from the actors — an ended table
  // has nothing left to load, and the answer is the log's.
  const playtest = /^\/projects\/([^/]+)\/playtest$/.exec(url.pathname)
  if (playtest && req.method === 'GET') {
    const gate = await allowed(decodeURIComponent(playtest[1] ?? ''), canStartTables)
    if (!('rec' in gate)) {
      json(res, gate.status, { error: gate.error })
      return true
    }
    const sources: PlaytestSource[] = []
    for (const { id } of await opts.store.sessionsOf(gate.rec.id)) {
      const session = await opts.store.loadSession(id)
      if (!session) continue
      const [log, surveys, admissions] = await Promise.all([opts.store.read(id), opts.surveys ? opts.surveys.list(id) : [], opts.store.guestsAt(id)])
      sources.push({ id, session, log, surveys, admissions, decks: await flaggedDecksOf(opts, id, session, log) })
    }
    // A flag about a card (#1142) is held against the game as it is now, which only costs a compile
    // when some table has one.
    const aboutCards = sources.some((s) => Object.keys(s.decks ?? {}).length > 0)
    const now = aboutCards ? await factsOf(await deckOf(opts, gate.rec), setupFromProject(gate.rec), opts.registry) : undefined
    json(res, 200, playtestOf(sources, { registry: opts.registry, ...(now ? { now } : {}) }))
    return true
  }
  if (start && req.method === 'POST') {
    // Running a playtest is the test leader's whole purpose (D3); a viewer only looks.
    const gate = await allowed(decodeURIComponent(start[1] ?? ''), canStartTables)
    if (!('rec' in gate)) {
      json(res, gate.status, { error: gate.error })
      return true
    }
    const rec = gate.rec
    // A deck with no card is not a game yet (#1415, L91): the page does not offer the start, so a
    // refusal here is a page that had not heard, and nothing is opened, borne or queued for it.
    if (!playable(rec)) {
      json(res, 409, { error: 'the deck has no cards' })
      return true
    }
    const raw = await readBody(req)
    const { seating } = StartBody.parse(raw.trim() === '' ? {} : JSON.parse(raw))
    const id = randomUUID()
    const room = admission(opts)
    // Borne by the game's owner, whoever pressed (A2: the creator bears the cost of her own
    // testers, #1194). A game from before accounts has no owner, and its table no bearer.
    // And held to the owner's ceilings on tables (#1196): a test leader or a co-editor who presses
    // is told it is the owner's ceiling, never whose or which tier.
    const record = { id, version: `rev-${rec.rev}`, setup: setupFromProject(rec), deck: await deckOf(opts, rec), project: rec.id, ...(rec.owner !== undefined ? { accountId: rec.owner } : {}), ...room.record, ...(seating ? { seating } : {}) }
    if (!(await openTable(opts, res, record, () => bearerOf(opts, account, rec.owner)))) return true
    await opts.host.get(id)
    // The host of a table of computers sits down at its first seat (L77), which every seat is
    // free to be when it starts; it is said here so that a page without the game's setup at hand,
    // as Mina spel is, can seat her.
    const hostSeat = seating === 'computer' ? record.setup.seats[0] : undefined
    json(res, 201, { id, version: `rev-${rec.rev}`, code: room.code, hostKey: room.hostKey, ...(hostSeat ? { hostSeat } : {}) })
    return true
  }
  // The whole log for the replay corpus (DRIFT §7): version, setup and every line with its
  // outcome. Never the deck: textures are not the point, and the corpus is anonymised after.
  const exportOne = /^\/sessions\/([^/]+)\/export$/.exec(url.pathname)
  if (exportOne && req.method === 'GET') {
    const sessionId = decodeURIComponent(exportOne[1] ?? '')
    const session = await opts.store.loadSession(sessionId)
    if (!session) {
      json(res, 404, { error: 'unknown session' })
      return true
    }
    // Read through the corpus's door (#1011), the export says so: the script takes only the
    // owner's own tables (#540), and this is the one other kind it may take.
    const consented = await corpusReader(opts, req, session)
    if (!consented && !(await mayReadPlaytest(opts, req, res, session))) return true
    json(res, 200, { id: sessionId, version: session.version, setup: session.setup, log: await opts.store.read(sessionId), ...(consented ? { consented: true } : {}) })
    return true
  }
    // A session as a record (C9): which version runs, whether the log is locked.
  const sessionOne = /^\/sessions\/([^/]+)$/.exec(url.pathname)
  if (sessionOne && req.method === 'GET') {
    const sessionId = decodeURIComponent(sessionOne[1] ?? '')
    const actor = await opts.host.get(sessionId)
    const session = await opts.store.loadSession(sessionId)
    if (!actor || !session) {
      json(res, 404, { error: 'unknown session' })
      return true
    }
    // The game's name comes from the project the table was started from (L5): a screen shows it
    // as its title, and there is no second place a name could live.
    const named = session.project ? await projects.load(session.project) : null
    json(res, 200, { id: sessionId, version: actor.version, ended: actor.ended, ...(session.project ? { project: session.project } : {}), ...(named ? { name: named.name } : {}) })
    return true
  }
  // The rules a table plays by (B7): rendered against the very version the session is locked to
  // (B4), so a game in progress is never rewritten under the players by an edit. «Uppdatera»
  // moves that lock (C7), and the version it moved to is the log's, which the actor holds: the
  // session row keeps the version the table *started* on, because that is where replay begins
  // (#677). References are resolved here — the table and the phone read names, never ids.
  const sessionRules = /^\/sessions\/([^/]+)\/rules$/.exec(url.pathname)
  if (sessionRules && req.method === 'GET') {
    const sessionId = decodeURIComponent(sessionRules[1] ?? '')
    const session = await opts.store.loadSession(sessionId)
    const actor = session ? await opts.host.get(sessionId) : null
    const rev = Number(/^rev-(\d+)$/.exec(actor?.version ?? '')?.[1])
    const rec = session?.project && Number.isFinite(rev) ? await projects.at(session.project, rev) : null
    // A table nobody has written rules for is most tables, and every phone at one asks this on
    // the way in: the answer is nothing, not an error, or every ordinary session leaves a red
    // line in its players' consoles and a real error has somewhere to hide.
    if (!session) {
      json(res, 404, { error: 'no table' })
      return true
    }
    if (!rec?.rules) {
      res.writeHead(204).end()
      return true
    }
    // The setup the players are shown is this very version's (B5, B7, #270): the book and the
    // table it draws come out of the one document the session was locked to, so a table cannot be
    // handed a book whose setup is a later draft's.
    json(res, 200, renderRules(rec.rules, namesOfProject(rec), arrangementOf(rec)))
    return true
  }
  // The survey after a session (G3): one structured answer per participant, once the log is
  // locked, tied to the version it ended on.
  const survey = /^\/sessions\/([^/]+)\/survey$/.exec(url.pathname)
  if (survey && req.method === 'POST' && opts.surveys) {
    const sessionId = decodeURIComponent(survey[1] ?? '')
    const actor = await opts.host.get(sessionId)
    const session = await opts.store.loadSession(sessionId)
    if (!actor || !session) {
      json(res, 404, { error: 'unknown session' })
      return true
    }
    if (!actor.ended) {
      json(res, 409, { error: 'the session has not ended' })
      return true
    }
    const body = SurveyBody.parse(JSON.parse(await readBody(req)))
    const sender = await surveySender(opts, req, session, actor, body)
    if (!sender) {
      json(res, 403, { error: 'an answer needs the admission it was given at this table' })
      return true
    }
    await opts.surveys.put({ sessionId, version: actor.version, at: clock(opts).toISOString(), ...sender, answers: body.answers })
    json(res, 201, { ok: true })
    return true
  }
  // Whether the phone's seat or watch has answered (#1355): asked before the survey is shown, so a
  // new tab or another phone shows the thanks with «Svara igen» rather than the first question. A
  // POST, so the token travels in the body and never in an address.
  const standing = /^\/sessions\/([^/]+)\/survey\/mine$/.exec(url.pathname)
  if (standing && req.method === 'POST' && opts.surveys) {
    const sessionId = decodeURIComponent(standing[1] ?? '')
    const actor = await opts.host.get(sessionId)
    const session = await opts.store.loadSession(sessionId)
    if (!actor || !session) {
      json(res, 404, { error: 'unknown session' })
      return true
    }
    const asked = SurveyAsk.safeParse(JSON.parse((await readBody(req)) || '{}'))
    const said = asked.success ? await surveyStanding(opts, opts.surveys, req, session, actor, asked.data) : null
    if (!said) {
      json(res, 403, { error: 'only the admission given at this table is told' })
      return true
    }
    json(res, 200, said)
    return true
  }
  // A guest erases herself (#1281, G6, F5): her phone asks with the token her seat or her watch was
  // bought with, and that admission is erased as the operator's script erases one through Kontakt
  // (#1279) — her name, what she wrote from it and her survey answers. The token is looked up and
  // not tried as the door tries it: a guest who has left, was kicked, or whose table is over is still
  // the one the token was given to, and her way to be forgotten does not close with the door. A
  // token is nobody at any other table, so it erases nothing there.
  const erase = /^\/sessions\/([^/]+)\/erase$/.exec(url.pathname)
  if (erase && req.method === 'POST' && opts.erasures) {
    const [status, body] = await eraseGuest(opts, opts.erasures, decodeURIComponent(erase[1] ?? ''), await readBody(req))
    json(res, status, body)
    return true
  }
  const surveys = /^\/sessions\/([^/]+)\/surveys$/.exec(url.pathname)
  if (surveys && req.method === 'GET' && opts.surveys) {
    const sessionId = decodeURIComponent(surveys[1] ?? '')
    const session = await opts.store.loadSession(sessionId)
    if (!session) {
      json(res, 404, { error: 'unknown session' })
      return true
    }
    if (!(await mayReadPlaytest(opts, req, res, session))) return true
    json(res, 200, await opts.surveys.list(sessionId))
    return true
  }
  // How far the textures of a table have come (L5): the editor shows a table only once its
  // cards can be seen.
  const textures = /^\/sessions\/([^/]+)\/textures$/.exec(url.pathname)
  if (textures && req.method === 'GET') {
    const actor = await opts.host.get(decodeURIComponent(textures[1] ?? ''))
    if (!actor) {
      json(res, 404, { error: 'unknown session' })
      return true
    }
    json(res, 200, await progress(opts, actor.textureHashes(), frontsOf(actor.faceHashes())))
    return true
  }
  // Before "Uppdatera bordet" (L5): queue the textures of the project's current rev without
  // touching the table, and say how far they have come. The editor refreshes once all are done,
  // so the switch is atomic for the players.
  const prepare = /^\/sessions\/([^/]+)\/prepare$/.exec(url.pathname)
  if (prepare && req.method === 'POST') {
    const session = await opts.store.loadSession(decodeURIComponent(prepare[1] ?? ''))
    const rec = session?.project ? await projects.load(session.project) : null
    if (!session || !rec) {
      json(res, 404, { error: session ? 'unknown project' : 'unknown session' })
      return true
    }
    // A job that failed for good stays failed here (#10): enqueueing it again would put it back
    // in the queue and the editor would poll a dead render forever, never learning it was dead.
    // `?retry=1` is the one place that says "try it anyway", and it comes from a person asking.
    const retryFailed = url.searchParams.get('retry') === '1'
    const renders = opts.renders
    const compiled = await queueFaces(await deckOf(opts, rec), setupFromProject(rec), opts.registry, TEXTURE_DPI, Date.now(), async (job) => {
      if (!renders) return
      if (!retryFailed && (await renders.status(job.hash))?.state === 'failed') return
      // Borne by the table, as everything it renders is (#1197, #1194): whoever pressed «Uppdatera».
      await renders.enqueue(job, session.accountId)
    })
    json(res, 200, await progress(opts, compiled.hashes, frontsOf(compiled.faces)))
    return true
  }
  // "Uppdatera bordet" on a running table (C7, L5): the project's current rev becomes a
  // version.change line, with the piles as that rev defines them, and the actor gets the new textures.
  const refresh = /^\/sessions\/([^/]+)\/refresh$/.exec(url.pathname)
  if (refresh && req.method === 'POST') {
    const sessionId = decodeURIComponent(refresh[1] ?? '')
    const session = await opts.store.loadSession(sessionId)
    if (!session) {
      json(res, 404, { error: 'unknown session' })
      return true
    }
    if (!session.project) {
      json(res, 409, { error: 'session was not started from a project' })
      return true
    }
    const rec = await projects.load(session.project)
    const actor = rec ? await opts.host.get(sessionId) : null
    if (!rec || !actor) {
      json(res, 404, { error: 'unknown project' })
      return true
    }
    const setup = setupFromProject(rec)
    const deck = await deckOf(opts, rec)
    const version = `rev-${rec.rev}`
    // A table already on this version has nothing to move to, and a line saying it moved would
    // tell every phone «Spelet uppdaterades» about no change at all (#706).
    if (actor.version === version) {
      json(res, 200, { version, seqs: [] })
      return true
    }
    // The deck is kept under its version before the line that moves the table there is committed
    // (#677): the session row keeps the start deck, and an actor reloaded after a restart takes
    // its faces from the version its log says it plays. A refusal below leaves a deck no line
    // names, which is never read.
    await opts.store.addDeck(sessionId, version, deck)
    await actor.refreshDeck(deck, setup)
    const decision = await actor.submit({ id: randomUUID(), seat: null, intents: [{ v: 'version.change', to: version, components: setup.components, zones: setup.zones, ...(setup.cards ? { cards: setup.cards } : {}) }] })
    if (!decision.ok) json(res, 409, { error: decision.reason })
    else json(res, 200, { version, seqs: decision.applied.map((l) => l.seq) })
    return true
  }
  return false
}

// `fronts`: each card's front texture, by row (#523). A rendered front says what its smallest text
// was fitted to, so the editor can say, once a table is up, which cards a phone cannot read.
async function progress(opts: ServerOptions, hashes: readonly string[], fronts: Record<string, string>): Promise<{ total: number; done: number; failed: string[]; smallest: Record<string, number> }> {
  let done = 0
  const failed: string[] = []
  for (const hash of hashes) {
    const status = opts.renders ? await opts.renders.status(hash) : null
    if (status?.state === 'done') done++
    else if (status?.state === 'failed') failed.push(hash)
  }
  const smallest: Record<string, number> = {}
  for (const [row, hash] of Object.entries(fronts)) {
    const pt = opts.renders ? (await opts.renders.fitOf(hash))?.smallestPt : null
    if (typeof pt === 'number') smallest[row] = pt
  }
  return { total: hashes.length, done, failed, smallest }
}

const frontsOf = (faces: Record<string, Record<string, string>>): Record<string, string> =>
  Object.fromEntries(Object.entries(faces).flatMap(([row, perFace]) => (perFace['front'] ? [[row, perFace['front']]] : [])))

// The key on the profile page (#999, E4). GET describes it — the provider, the last four, the model
// and when it was proved, never the key — and says whether this box can keep one at all. PUT asks the
// provider for the key's models, and only a key the provider accepts is sealed; the answer carries
// the models, so the page has its picker without asking twice. A refusal is one of the provider's
// closed set of words (`AiFailure`), and nothing is kept. PUT …/model chooses a model, null being the
// provider's standard; GET …/models lists them anew; DELETE forgets the key.
// A body that is not a key is refused without a word of what it held, and nothing here logs.
const PrintBody = z.object({ hardware: z.boolean().optional() })
const AiKeyBody = z.object({ provider: z.enum(AI_PROVIDERS), key: z.string().trim().min(8).max(512).regex(/^[\x21-\x7e]+$/) })
const AiModelBody = z.object({ model: z.string().min(1).max(200).regex(/^[A-Za-z0-9._:/-]+$/).nullable() })
const parsedOrNull = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
async function routeAiKey(opts: ServerOptions, req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const ai = opts.ai
  if (!ai || !opts.auth) return json(res, 404, { error: 'not found' })
  const account = await accountOf(opts.auth, req)
  if (!account) return json(res, 401, { error: 'log in first' })
  const said = (key: AiKeyDescription | null) => (key ? { ...key, defaultModel: ai.providers[key.provider].defaultModel } : null)
  const asked = async <T>(attempt: () => Promise<T>): Promise<T | { refused: string }> => {
    try {
      return await attempt()
    } catch (err) {
      if (err instanceof AiProviderError) return { refused: err.kind }
      throw err
    }
  }
  if (url.pathname === '/me/ai-key' && req.method === 'GET') return json(res, 200, { key: said(await ai.vault.describe(account.id)), sealing: ai.vault.sealing })
  if (url.pathname === '/me/ai-key' && req.method === 'DELETE') {
    await ai.vault.remove(account.id)
    return json(res, 200, { key: null })
  }
  if (url.pathname === '/me/ai-key' && req.method === 'PUT') {
    const body = AiKeyBody.safeParse(parsedOrNull(await readBody(req)))
    if (!body.success) return json(res, 400, { error: 'malformed' })
    if (!ai.vault.sealing) return json(res, 503, { error: 'unavailable' })
    if (ai.limiter?.allow(account.id, Date.now()) === false) return json(res, 429, { error: 'too-many' })
    const { provider, key } = body.data
    const models = await asked(() => ai.providers[provider].models(key))
    if ('refused' in models) return json(res, 422, { error: models.refused })
    // A new key from the same provider keeps the model chosen before it, as long as the key can use
    // it; a key from the other provider starts on its standard model.
    const before = await ai.vault.describe(account.id)
    const kept = before?.provider === provider && before.model !== null && models.some((m) => m.id === before.model) ? before.model : null
    return json(res, 200, { key: said(await ai.vault.save(account.id, provider, key, kept)), models })
  }
  if (url.pathname === '/me/ai-key/model' && req.method === 'PUT') {
    const body = AiModelBody.safeParse(parsedOrNull(await readBody(req)))
    if (!body.success) return json(res, 400, { error: 'malformed' })
    const key = await ai.vault.setModel(account.id, body.data.model)
    return key ? json(res, 200, { key: said(key) }) : json(res, 404, { error: 'no key' })
  }
  if (url.pathname === '/me/ai-key/models' && req.method === 'GET') {
    const opened = await ai.vault.open(account.id)
    if (!opened) return json(res, 404, { error: 'no key' })
    const models = await asked(() => ai.providers[opened.provider].models(opened.key))
    if ('refused' in models) return json(res, 422, { error: models.refused })
    return json(res, 200, { models, defaultModel: ai.providers[opened.provider].defaultModel })
  }
  json(res, 404, { error: 'not found' })
}

// Magic links (G1, DRIFT §11). POST /auth/login mails a link and always answers 200 — never a
// word about whether the address is known. GET /auth/verify redeems it once, sets the session
// cookie and sends the browser on. GET /auth/me says who you are, or `null`; POST /auth/logout forgets.
async function routeAuth(opts: ServerOptions, auth: AuthStore, req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const now = () => new Date()
  if (req.method === 'POST' && url.pathname === '/auth/login') {
    const parsed = LoginBody.safeParse(JSON.parse(await readBody(req)))
    if (!parsed.success) return json(res, 400, { error: 'that is not an address' })
    const email = parsed.data.email.trim().toLowerCase()
    const allowance = opts.limiter?.allow(email, Date.now()) ?? { ok: true }
    if (!allowance.ok) {
      res.writeHead(429, { 'content-type': 'application/json', 'retry-after': String(allowance.retryAfter) })
      res.end(JSON.stringify({ error: 'too many links; try again later' }))
      return
    }
    if (opts.authBypass) {
      res.writeHead(200, {
        'content-type': 'application/json',
        'set-cookie': (await createLoginSession(opts, auth, email)).cookie,
      })
      res.end(JSON.stringify({ ok: true, loggedIn: true }))
      return
    }
    const t = token()
    await auth.issueToken(hash(t), email, new Date(Date.now() + TOKEN_TTL_MS).toISOString())
    // The link must come back to this API, where the cookie lives: never the page's origin.
    const base = opts.publicOrigin ?? `http://${req.headers.host ?? 'localhost'}`
    // A fragment on `next` — the claim's, which holds a guest's token (#1278) — becomes the link's
    // own: it is in the mail, never in the request the link makes, and the browser keeps it through
    // the redirect below, which names no fragment of its own (RFC 9110 §10.2.2).
    const [path, fragment] = splitFragment(safeNext(parsed.data.next))
    const link = `${base}/auth/verify?token=${t}&next=${encodeURIComponent(path)}${fragment}`
    await opts.mailer?.send(loginMail(email, link, langOf(parsed.data.lang), opts.contact))
    return json(res, 200, { ok: true })
  }
  if (req.method === 'GET' && url.pathname === '/auth/verify') {
    const t = url.searchParams.get('token') ?? ''
    const email = t ? await auth.redeemToken(hash(t), now().toISOString()) : null
    if (!email) return json(res, 400, { error: 'the link is spent or too old; ask for a new one' })
    const { cookie, account } = await createLoginSession(opts, auth, email)
    // The fragment stays the browser's (#1278): it rides on to the page the redirect lands on.
    const next = splitFragment(safeNext(url.searchParams.get('next') ?? undefined))[0]
    // An account that has not been asked what the others should call it is asked first, in a step
    // of its own, and goes on to where the link was going after it (#1254, variant C).
    res.writeHead(302, {
      'set-cookie': cookie,
      location: `${opts.appOrigin ?? ''}${account.asked ? next : `/login?step=name&next=${encodeURIComponent(next)}`}`,
    })
    res.end()
    return
  }
  if (req.method === 'GET' && url.pathname === '/auth/me') {
    const account = await accountOf(auth, req)
    // Nobody is an answer and not a failure (#744): every guest page asks, a guest is never logged
    // in (G1), and a 401 is written in the browser's console as an error on each of those pages.
    if (!account) return json(res, 200, { email: null })
    // The account's own name and whether it has been asked for one (#1254), and where it stands
    // against the terms (#1270): what the welcome step asks from, and what #1272 adds to it.
    return json(res, 200, { email: account.email, name: account.name ?? null, asked: account.asked === true, terms: await standingOf(opts, auth, account.id) })
  }
  if (url.pathname.startsWith('/auth/passkeys')) return routePasskeys(opts, auth, req, res, url)
  if (req.method === 'POST' && url.pathname === '/auth/logout') {
    const sid = req.headers.cookie?.match(new RegExp(`${COOKIE}=([^;]+)`))?.[1]
    if (sid) await auth.deleteSession(hash(sid))
    res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` })
    res.end(JSON.stringify({ ok: true }))
    return
  }
  json(res, 404, { error: 'not found' })
}

const registerOf = (opts: ServerOptions): TermsRegister => opts.terms ?? []
const TermsBody = z.object({ version: z.string().max(32) })
async function standingOf(opts: ServerOptions, auth: AuthStore, accountId: string): Promise<TermsStanding> {
  return termsStanding(registerOf(opts), (await auth.termsAccepted(accountId)).map((a) => a.version), clock(opts))
}
// The version an account has to accept before it may write again (#1272), or null when it need not —
// no terms in force, nobody signed in, or accepted already. Asks the store nothing while no terms
// are in force, which is a server without a register.
async function termsDueFor(opts: ServerOptions, req: IncomingMessage, known?: Account | null): Promise<string | null> {
  if (!opts.auth || termsInForce(registerOf(opts), clock(opts)) === null) return null
  const account = known === undefined ? await accountOf(opts.auth, req) : known
  if (!account) return null
  const standing = await standingOf(opts, opts.auth, account.id)
  return standing.due ? standing.current : null
}

// Passkeys (#1180): saving one needs the session the link made; logging in with one makes a
// session as the link does. The ceremonies themselves are `passkeys.ts`'s.
async function routePasskeys(opts: ServerOptions, auth: AuthStore, req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  // The site is the page the browser says it stands on, when that page is this service's (the API's
  // own host, or the web app's in development); otherwise the web app's, then the public name.
  const own = req.headers.host ? `${schemeOf(opts, req)}://${req.headers.host}` : null
  const page = req.headers.origin && browserOriginAllowed(opts, req) ? req.headers.origin : null
  const c: Ceremonies = { auth, challenges: opts.passkeyChallenges ?? new PasskeyChallenges(), site: siteOf([page, opts.appOrigin, opts.publicOrigin, own]), now: clock(opts) }
  const answer = (a: Answer) => json(res, a.status, a.body)
  // A page on another site may not start or finish a ceremony here: it could otherwise post its own
  // account's signed answer and log a visitor into that account. Browsers always say where a POST
  // comes from; a request without an origin is not a browser's.
  if (req.method !== 'GET' && req.headers.origin && !browserOriginAllowed(opts, req)) return json(res, 403, { error: 'not from this site' })
  if (req.method === 'POST' && url.pathname === '/auth/passkeys/login/options') return answer(await loginOptions(c))
  if (req.method === 'POST' && url.pathname === '/auth/passkeys/login') {
    const a = await passkeyLogin(c, await bodyOf(req))
    if (!a.login) return answer(a)
    res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': (await createLoginSession(opts, auth, a.login.email)).cookie })
    res.end(JSON.stringify(a.body))
    return
  }
  const account = await accountOf(auth, req)
  if (!account) return json(res, 401, { error: 'log in' })
  if (req.method === 'POST' && url.pathname === '/auth/passkeys/register/options') return answer(await registrationOptions(c, account))
  if (req.method === 'POST' && url.pathname === '/auth/passkeys/register') return answer(await register(c, account, await bodyOf(req), req.headers['user-agent']))
  if (req.method === 'GET' && url.pathname === '/auth/passkeys') return json(res, 200, { passkeys: (await auth.passkeysOf(account.id)).map(viewOf) })
  const one = /^\/auth\/passkeys\/([^/]+)$/.exec(url.pathname)
  if (req.method === 'DELETE' && one) {
    const removed = await auth.removePasskey(account.id, decodeURIComponent(one[1] ?? ''))
    return json(res, removed ? 200 : 404, removed ? { ok: true } : { error: 'no such passkey' })
  }
  json(res, 404, { error: 'not found' })
}

// A body that is not JSON, or is larger than any passkey's answer, is a body that is not a passkey,
// and the ceremony says so.
const PASSKEY_BODY_MAX = 64 * 1024
async function bodyOf(req: IncomingMessage): Promise<unknown> {
  const bytes = await readBytes(req, PASSKEY_BODY_MAX)
  try {
    return bytes ? JSON.parse(new TextDecoder().decode(bytes)) : null
  } catch {
    return null
  }
}

async function createLoginSession(opts: ServerOptions, auth: AuthStore, email: string): Promise<{ cookie: string; account: Account }> {
  const account: Account = await auth.ensureAccount(email)
  const sid = token()
  const expires = new Date(Date.now() + SESSION_TTL_MS)
  await auth.createSession(hash(sid), account.id, expires.toISOString())
  const secure = (opts.publicOrigin ?? '').startsWith('https://') ? '; Secure' : ''
  return { cookie: `${COOKIE}=${sid}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires.toUTCString()}${secure}`, account }
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

// The body as bytes, or null once it grows past `max`.
function readBytes(req: IncomingMessage, max: number): Promise<Uint8Array | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size <= max) chunks.push(c)
    })
    req.on('end', () => resolve(size > max ? null : new Uint8Array(Buffer.concat(chunks))))
    req.on('error', reject)
  })
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}
