import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { Applied } from '@byd/protocol'
import type { SetupDef } from '@byd/engine'
import { SeqConflictError, type Deck, type LogStore, type SessionRecord } from './store.js'
import type { ProjectDoc, ProjectRecord, ProjectStore, ProjectSummary } from './projects.js'
import type { Account, AuthStore } from './auth.js'

export class PostgresAuthStore implements AuthStore {
  constructor(private readonly sql: postgres.Sql) {}
  async issueToken(tokenHash: string, email: string, expiresAt: string): Promise<void> {
    await this.sql`insert into login_tokens (token_hash, email, expires_at) values (${tokenHash}, ${email}, ${expiresAt})`
  }
  async redeemToken(tokenHash: string, now: string): Promise<string | null> {
    const rows = await this.sql<{ email: string }[]>`
      update login_tokens set used_at = ${now} where token_hash = ${tokenHash} and used_at is null and expires_at > ${now} returning email
    `
    return rows[0]?.email ?? null
  }
  async ensureAccount(email: string): Promise<Account> {
    const rows = await this.sql<{ id: string }[]>`
      insert into accounts (email) values (${email}) on conflict (email) do update set email = excluded.email returning id
    `
    return { id: String(rows[0]?.id), email }
  }
  async createSession(sessionHash: string, accountId: string, expiresAt: string): Promise<void> {
    await this.sql`insert into auth_sessions (session_hash, account_id, expires_at) values (${sessionHash}, ${accountId}, ${expiresAt})`
  }
  async sessionAccount(sessionHash: string, now: string): Promise<Account | null> {
    const rows = await this.sql<{ id: string; email: string }[]>`
      select a.id, a.email from auth_sessions s join accounts a on a.id = s.account_id where s.session_hash = ${sessionHash} and s.expires_at > ${now}
    `
    const row = rows[0]
    return row ? { id: String(row.id), email: row.email } : null
  }
  async deleteSession(sessionHash: string): Promise<void> {
    await this.sql`delete from auth_sessions where session_hash = ${sessionHash}`
  }
}
import type { SurveyRecord, SurveyStore } from './surveys.js'

export class PostgresSurveyStore implements SurveyStore {
  constructor(private readonly sql: postgres.Sql) {}

  async add(r: SurveyRecord): Promise<void> {
    await this.sql`
      insert into surveys (session_id, version, at, who, seat, observer, answers)
      values (${r.sessionId}, ${r.version}, ${r.at}, ${r.who}, ${r.seat}, ${r.observer ?? false}, ${this.sql.json(r.answers as never)})
    `
  }

  async list(sessionId: string): Promise<SurveyRecord[]> {
    const rows = await this.sql<{ session_id: string; version: string; at: Date; who: string; seat: string | null; observer: boolean; answers: SurveyRecord['answers'] }[]>`
      select session_id, version, at, who, seat, observer, answers from surveys where session_id = ${sessionId} order by at
    `
    return rows.map((r) => ({ sessionId: r.session_id, version: r.version, at: r.at.toISOString(), who: r.who, seat: r.seat, observer: r.observer, answers: r.answers }))
  }
}

export class PostgresLogStore implements LogStore {
  constructor(private readonly sql: postgres.Sql) {}

  static connect(url: string): PostgresLogStore {
    return new PostgresLogStore(postgres(url, { max: 5, onnotice: () => undefined }))
  }

  // Projects and surveys share the connection and the schema.
  projects(): PostgresProjectStore {
    return new PostgresProjectStore(this.sql)
  }

  surveys(): PostgresSurveyStore {
    return new PostgresSurveyStore(this.sql)
  }

  auth(): PostgresAuthStore {
    return new PostgresAuthStore(this.sql)
  }

  // Idempotent schema for the slice. DRIFT §7 moves this into a migration step before start.
  async migrate(): Promise<void> {
    const path = fileURLToPath(new URL('../sql/001-init.sql', import.meta.url))
    await this.sql.unsafe(await readFile(path, 'utf8'))
  }

  async close(): Promise<void> {
    await this.sql.end()
  }

  async createSession(record: SessionRecord): Promise<void> {
    await this.sql`
      insert into sessions (id, version, setup, deck, project)
      values (${record.id}, ${record.version}, ${this.sql.json(record.setup as never)}, ${record.deck ? this.sql.json(record.deck as never) : null}, ${record.project ?? null})
    `
  }

  async loadSession(id: string): Promise<SessionRecord | null> {
    const rows = await this.sql<{ id: string; version: string; setup: SetupDef; deck: Deck | null; project: string | null }[]>`
      select id, version, setup, deck, project from sessions where id = ${id}
    `
    const row = rows[0]
    if (!row) return null
    return { id: row.id, version: row.version, setup: row.setup, ...(row.deck ? { deck: row.deck } : {}), ...(row.project ? { project: row.project } : {}) }
  }

  async append(sessionId: string, lines: readonly Applied[]): Promise<void> {
    const first = lines[0]
    if (!first) return
    await this.sql.begin(async (tx) => {
      // One writer per session at a time, even if two processes ever race.
      await tx`select pg_advisory_xact_lock(hashtext(${sessionId}))`
      const [row] = await tx<{ max: number | null }[]>`
        select max(seq)::int as max from events where session_id = ${sessionId}
      `
      const expected = (row?.max ?? 0) + 1
      if (first.seq !== expected) throw new SeqConflictError(sessionId, expected, first.seq)
      for (const [i, line] of lines.entries()) {
        if (line.seq !== first.seq + i) throw new Error('lines in one append must be consecutive')
        await tx`
          insert into events (session_id, seq, batch, at, by_seat, intent, outcome)
          values (
            ${sessionId}, ${line.seq}, ${line.batch}, ${line.at}, ${line.by},
            ${tx.json(line.intent as never)},
            ${line.outcome === undefined ? null : tx.json(line.outcome as never)}
          )
        `
      }
    })
  }

  async staleSessions(olderThan: Date): Promise<string[]> {
    const rows = await this.sql<{ id: string }[]>`
      select s.id from sessions s
      left join lateral (select at, intent from events e where e.session_id = s.id order by seq desc limit 1) last on true
      where coalesce(last.at, s.created_at) < ${olderThan}
        and coalesce(last.intent->>'v', '') <> 'session.end'
    `
    return rows.map((r) => r.id)
  }

  async read(sessionId: string): Promise<Applied[]> {
    const rows = await this.sql<
      { seq: number; batch: string; at: Date; by_seat: string | null; intent: unknown; outcome: unknown }[]
    >`
      select seq, batch, at, by_seat, intent, outcome
      from events where session_id = ${sessionId} order by seq
    `
    return rows.map((r) =>
      Applied.parse({
        seq: r.seq,
        batch: r.batch,
        at: r.at.toISOString(),
        by: r.by_seat,
        intent: r.intent,
        ...(r.outcome === null ? {} : { outcome: r.outcome }),
      }),
    )
  }
}

export class PostgresProjectStore implements ProjectStore {
  constructor(private readonly sql: postgres.Sql) {}

  async create(id: string, doc: ProjectDoc, owner?: string): Promise<ProjectRecord> {
    await this.sql`insert into projects (id, rev, doc, owner) values (${id}, 1, ${this.sql.json(doc as never)}, ${owner ?? null})`
    return { ...doc, id, rev: 1, ...(owner !== undefined ? { owner } : {}) }
  }

  async load(id: string): Promise<ProjectRecord | null> {
    const [row] = await this.sql<{ rev: number; doc: ProjectDoc; owner: string | null }[]>`select rev, doc, owner from projects where id = ${id}`
    return row ? { ...row.doc, id, rev: row.rev, ...(row.owner ? { owner: row.owner } : {}) } : null
  }

  async list(owner: string): Promise<ProjectSummary[]> {
    const rows = await this.sql<{ id: string; rev: number; name: string }[]>`select id, rev, doc->>'name' as name from projects where owner = ${owner} order by updated_at desc`
    return rows.map((r) => ({ id: r.id, name: r.name, rev: r.rev }))
  }

  async replace(id: string, expectedRev: number, doc: ProjectDoc): Promise<ProjectRecord | 'conflict' | 'missing'> {
    return this.sql.begin(async (tx) => {
      const [row] = await tx<{ rev: number }[]>`select rev from projects where id = ${id} for update`
      if (!row) return 'missing'
      if (row.rev !== expectedRev) return 'conflict'
      const rev = row.rev + 1
      await tx`update projects set rev = ${rev}, doc = ${tx.json(doc as never)}, updated_at = now() where id = ${id}`
      return { ...doc, id, rev }
    })
  }
}
