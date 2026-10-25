import type postgres from 'postgres'
import { langOf } from './auth.js'
import { reportId, type Block, type BlockReason, type Report, type ReportOutcome, type ReportStore } from './reports.js'

// The channel a block and an unblock are told on when they commit (#1274), as an erasure is told on
// its own (#1279): the operator's script runs in another process, and the app reads the set again.
export const BLOCKED_CHANNEL = 'byd_blocked'

type ReportRow = { n: string | number; at: Date; what: string; place: string; why: string; name: string; email: string; lang: string; outcome: ReportOutcome | null; decided_at: Date | null }
const reportOf = (r: ReportRow): Report => ({
  id: reportId(Number(r.n)),
  at: r.at.toISOString(),
  what: r.what,
  where: r.place,
  why: r.why,
  name: r.name,
  email: r.email,
  lang: langOf(r.lang),
  ...(r.outcome && r.decided_at ? { decision: { outcome: r.outcome, at: r.decided_at.toISOString() } } : {}),
})
type BlockRow = { hash: string; at: Date; reason: BlockReason; report: string | null; purged: boolean }
const blockOf = (r: BlockRow): Block => ({ hash: r.hash, at: r.at.toISOString(), reason: r.reason, report: r.report, purged: r.purged })
const numberOf = (id: string): number | null => (/^A-\d+$/.test(id) ? Number(id.slice(2)) : null)

export class PostgresReportStore implements ReportStore {
  private set = new Set<string>()
  constructor(private readonly sql: postgres.Sql) {}

  async add(report: Omit<Report, 'id' | 'decision'>): Promise<Report> {
    const [row] = await this.sql<ReportRow[]>`
      insert into reports (at, what, place, why, name, email, lang)
      values (${report.at}, ${report.what}, ${report.where}, ${report.why}, ${report.name}, ${report.email}, ${report.lang})
      returning *
    `
    if (!row) throw new Error('the insert made no report')
    return reportOf(row)
  }
  async get(id: string): Promise<Report | null> {
    const n = numberOf(id)
    if (n === null) return null
    const [row] = await this.sql<ReportRow[]>`select * from reports where n = ${n}`
    return row ? reportOf(row) : null
  }
  async list(): Promise<Report[]> {
    return (await this.sql<ReportRow[]>`select * from reports order by n`).map(reportOf)
  }
  async decide(id: string, outcome: ReportOutcome, at: string): Promise<Report | null> {
    const n = numberOf(id)
    if (n === null) return null
    const [row] = await this.sql<ReportRow[]>`update reports set outcome = ${outcome}, decided_at = ${at} where n = ${n} returning *`
    return row ? reportOf(row) : null
  }
  async block(b: Block): Promise<void> {
    await this.sql.begin(async (tx) => {
      await tx`
        insert into asset_blocks (hash, at, reason, report, purged) values (${b.hash}, ${b.at}, ${b.reason}, ${b.report}, ${b.purged})
        on conflict (hash) do update set at = excluded.at, reason = excluded.reason, report = excluded.report, purged = asset_blocks.purged or excluded.purged
      `
      await tx`select pg_notify(${BLOCKED_CHANNEL}, ${b.hash})`
    })
    await this.refresh()
  }
  async unblock(hash: string): Promise<boolean> {
    const gone = await this.sql.begin(async (tx) => {
      const rows = await tx`delete from asset_blocks where hash = ${hash} and not purged returning 1`
      if (rows.length > 0) await tx`select pg_notify(${BLOCKED_CHANNEL}, ${hash})`
      return rows.length > 0
    })
    await this.refresh()
    return gone
  }
  async blocks(): Promise<Block[]> {
    return (await this.sql<BlockRow[]>`select * from asset_blocks order by at, hash`).map(blockOf)
  }
  async blocksOf(hashes: readonly string[]): Promise<Block[]> {
    if (hashes.length === 0) return []
    return (await this.sql<BlockRow[]>`select * from asset_blocks where hash in ${this.sql(hashes as string[])} order by at, hash`).map(blockOf)
  }
  blocked(): ReadonlySet<string> {
    return this.set
  }
  // Reads the set again: when the app starts, after its own writes, and when another process's commit
  // is told about.
  async refresh(): Promise<void> {
    this.set = new Set((await this.sql<{ hash: string }[]>`select hash from asset_blocks`).map((r) => r.hash))
  }
  async listen(fn: () => void): Promise<() => Promise<void>> {
    const { unlisten } = await this.sql.listen(BLOCKED_CHANNEL, () => void this.refresh().then(fn, (e: unknown) => console.error(JSON.stringify({ msg: 'blocked', error: (e as Error).message }))))
    await this.refresh()
    return unlisten
  }
}
