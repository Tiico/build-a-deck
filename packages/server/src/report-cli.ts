import type { RenderStore } from '@byd/render/queue'
import { assetHashesOf, type AssetStore } from './assets.js'
import type { AuthStore, Mailer } from './auth.js'
import { titleOfFields } from './names.js'
import type { ProjectStore } from './projects.js'
import { decisionMail, ownerMail } from './report-mail.js'
import { BLOCK_REASONS, type BlockReason, type ReportStore } from './reports.js'

// The operator's side of a report (#1274, RUNBOOK §8): run by hand over Tailscale against the box's
// database, as `plan` and `erase` are (DRIFT §10, §12). A report is answered within two working days,
// and so is an objection, which comes as a reply to the owner's mail and is tried again by the
// operator (beslut 2 and 3).
//
//   report list                                  every report: its id, when, and whether it is decided
//   report show <A-0001>                         one report as it was written
//   report pictures <spel>                       the pictures a game uses: the hash, and which cards
//   report block <hash> <rights|illegal|terms> [--report <A-0001>]
//                                                blocks a picture in every game that uses it, takes what
//                                                was drawn from it out of the render queue, and mails
//                                                every owner the reasons (DSA art. 17)
//   report purge <hash>                          takes a blocked picture's bytes out of the bucket and
//                                                Postgres, for good; only for illegal content
//   report unblock <hash>                        lets a picture go again, when an objection held
//   report decide <A-0001> <held|rejected>       the decision, mailed to whoever reported (art. 16.5)
//
// Every verb writes one line of JSON that says what it did. `show` is the one that says what somebody
// wrote: it is the operator's to read.
export const REPORT_USAGE = 'usage: report list | report show <id> | report pictures <spel> | report block <hash> <rights|illegal|terms> [--report <id>] | report purge <hash> | report unblock <hash> | report decide <id> <held|rejected>   (DATABASE_URL, RESEND_API_KEY, PUBLIC_ORIGIN, BYD_CONTACT)'

export type ReportStores = {
  reports: ReportStore
  projects: ProjectStore
  auth: Pick<AuthStore, 'accountById'>
  // The raw store: the operator's script sees what is blocked, since it is the one that purges it.
  assets: AssetStore
  renders: Pick<RenderStore, 'forgetPagesNaming'>
  mailer: Mailer
  // Where the owner's button and the reporter's link lead, and the foot's contact.
  origin: string
  contact?: string | undefined
}
type Io = { out(line: string): void; err(line: string): void; now?: () => Date }

const HASH = /^[0-9a-f]{64}$/

// Which cards of a game's current version name the picture, by their titles.
async function cardsUsing(projects: ProjectStore, game: string, hash: string): Promise<{ name: string; cards: string[] } | null> {
  const rec = await projects.load(game)
  if (!rec) return null
  const cards = rec.rows.filter((row) => assetHashesOf(row.fields).includes(hash)).map((row) => titleOfFields(row.fields) || row.id)
  return { name: rec.name, cards }
}

export async function runReport(args: readonly string[], stores: ReportStores, io: Io): Promise<number> {
  const [verb, target, arg, flag, value, ...rest] = args
  const now = io.now?.() ?? new Date()
  const say = (line: Record<string, unknown>) => io.out(JSON.stringify({ msg: 'report', verb, ...line }))
  if (verb === 'list' && target === undefined) {
    for (const r of await stores.reports.list()) say({ id: r.id, at: r.at, ...(r.decision ? { decision: r.decision.outcome } : {}) })
    return 0
  }
  if (verb === 'show' && target && arg === undefined) {
    const r = await stores.reports.get(target)
    if (!r) {
      say({ id: target, error: 'no such report' })
      return 1
    }
    io.out(JSON.stringify(r, null, 2))
    return 0
  }
  if (verb === 'pictures' && target && arg === undefined) {
    const rec = await stores.projects.load(target)
    if (!rec) {
      say({ project: target, error: 'no such game' })
      return 1
    }
    const blocked = new Set((await stores.reports.blocksOf(assetHashesOf(rec))).map((b) => b.hash))
    for (const hash of assetHashesOf(rec)) {
      const cards = rec.rows.filter((row) => assetHashesOf(row.fields).includes(hash)).map((row) => titleOfFields(row.fields) || row.id)
      say({ project: target, hash, type: (await stores.assets.contentTypes([hash]))[hash] ?? null, cards, ...(blocked.has(hash) ? { blocked: true } : {}) })
    }
    return 0
  }
  if (verb === 'block' && target && HASH.test(target) && BLOCK_REASONS.includes(arg as BlockReason) && (flag === undefined || (flag === '--report' && value !== undefined && rest.length === 0))) {
    const report = flag === '--report' ? await stores.reports.get(value ?? '') : null
    if (flag === '--report' && !report) {
      say({ hash: target, report: value, error: 'no such report' })
      return 1
    }
    const reason = arg as BlockReason
    const at = now.toISOString()
    await stores.reports.block({ hash: target, at, reason, report: report?.id ?? null, purged: false })
    const forgotten = await stores.renders.forgetPagesNaming(target)
    // Every owner whose game uses the picture is told (beslut 4), once per game: a game is what the
    // owner opens to see it.
    let mailed = 0
    const games = await stores.projects.using(target)
    for (const game of games) {
      if (game.owner === undefined) continue
      const account = await stores.auth.accountById(game.owner)
      const found = await cardsUsing(stores.projects, game.id, target)
      if (!account || !found) continue
      await stores.mailer.send(ownerMail(account.email, { game: found.name, cards: found.cards, reason, at, purged: false, link: `${stores.origin}/editor?project=${encodeURIComponent(game.id)}`, contact: stores.contact }))
      mailed++
    }
    say({ hash: target, reason, ...(report ? { report: report.id } : {}), games: games.length, owners: mailed, renders: forgotten.length })
    return 0
  }
  if (verb === 'purge' && target && HASH.test(target) && arg === undefined) {
    const [block] = await stores.reports.blocksOf([target])
    if (!block) {
      say({ hash: target, error: 'not blocked; block it first' })
      return 1
    }
    if (!stores.assets.purge) {
      say({ hash: target, error: 'this asset store cannot purge' })
      return 1
    }
    const purged = await stores.assets.purge(target)
    await stores.reports.block({ ...block, purged: true })
    say({ hash: target, purged })
    return 0
  }
  if (verb === 'unblock' && target && HASH.test(target) && arg === undefined) {
    const [block] = await stores.reports.blocksOf([target])
    if (block?.purged) {
      say({ hash: target, error: 'purged; there are no bytes to come back to' })
      return 1
    }
    say({ hash: target, unblocked: await stores.reports.unblock(target) })
    return 0
  }
  if (verb === 'decide' && target && (arg === 'held' || arg === 'rejected') && flag === undefined) {
    const r = await stores.reports.decide(target, arg, now.toISOString())
    if (!r) {
      say({ id: target, error: 'no such report' })
      return 1
    }
    if (r.email !== '') await stores.mailer.send(decisionMail(r, arg, `${stores.origin}/villkor#villkor`, stores.contact))
    say({ id: r.id, decision: arg, mailed: r.email !== '' })
    return 0
  }
  io.err(REPORT_USAGE)
  return 2
}
