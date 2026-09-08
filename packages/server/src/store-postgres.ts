import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import type { ObjectStore } from '@byd/render'
import type { Applied } from '@byd/protocol'
import { liftLine, type SetupDef } from '@byd/engine'
import { SeqConflictError, type Deck, type GuestRecord, type LogStore, type SessionRecord, type SessionSummary, type PlayedRecord } from './store.js'
import type { ProjectDoc, ProjectRecord, ProjectStore, ProjectSummary, VersionSummary } from './projects.js'
import { PostgresAssetStore } from './assets.js'
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

  // `schema` puts the tables in a schema of their own — a test run's, so it never shares
  // sessions with a stack running against the same database.
  static connect(url: string, options: { schema?: string } = {}): PostgresLogStore {
    const store = new PostgresLogStore(postgres(url, { max: 5, onnotice: () => undefined, ...(options.schema ? { connection: { search_path: options.schema } } : {}) }))
    store.schema = options.schema
    return store
  }
  private schema: string | undefined

  // Drops a schema made for a test run.
  async dropSchema(): Promise<void> {
    if (this.schema) await this.sql.unsafe(`drop schema if exists "${this.schema.replace(/"/g, '')}" cascade`)
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

  // The project's images (E1): in the object store when there is one, else in this database.
  assets(objects?: ObjectStore): PostgresAssetStore {
    return new PostgresAssetStore(this.sql, objects)
  }

  // Idempotent schema for the slice. DRIFT §7 moves this into a migration step before start.
  async migrate(): Promise<void> {
    if (this.schema) await this.sql.unsafe(`create schema if not exists "${this.schema.replace(/"/g, '')}"`)
    const path = fileURLToPath(new URL('../sql/001-init.sql', import.meta.url))
    await this.sql.unsafe(await readFile(path, 'utf8'))
  }

  async close(): Promise<void> {
    await this.sql.end()
  }

  async createSession(record: SessionRecord): Promise<void> {
    await this.sql`
      insert into sessions (id, version, setup, deck, project, code, code_expires_at, host_key_hash)
      values (${record.id}, ${record.version}, ${this.sql.json(record.setup as never)}, ${record.deck ? this.sql.json(record.deck as never) : null}, ${record.project ?? null},
              ${record.code ?? null}, ${record.codeExpiresAt ?? null}, ${record.hostKeyHash ?? null})
    `
  }

  async loadSession(id: string): Promise<SessionRecord | null> {
    const rows = await this.sql<{ id: string; version: string; setup: SetupDef; deck: Deck | null; project: string | null; code: string | null; code_expires_at: Date | null; host_key_hash: string | null }[]>`
      select id, version, setup, deck, project, code, code_expires_at, host_key_hash from sessions where id = ${id}
    `
    const row = rows[0]
    if (!row) return null
    return {
      id: row.id,
      version: row.version,
      setup: row.setup,
      ...(row.deck ? { deck: row.deck } : {}),
      ...(row.project ? { project: row.project } : {}),
      ...(row.code ? { code: row.code } : {}),
      ...(row.code_expires_at ? { codeExpiresAt: row.code_expires_at.toISOString() } : {}),
      ...(row.host_key_hash ? { hostKeyHash: row.host_key_hash } : {}),
    }
  }

  async sessionByCode(code: string): Promise<{ id: string; codeExpiresAt: string } | null> {
    const [row] = await this.sql<{ id: string; code_expires_at: Date }[]>`select id, code_expires_at from sessions where code = ${code} and code_expires_at is not null`
    return row ? { id: row.id, codeExpiresAt: row.code_expires_at.toISOString() } : null
  }

  async setCode(sessionId: string, code: string, expiresAt: string): Promise<void> {
    await this.sql`update sessions set code = ${code}, code_expires_at = ${expiresAt} where id = ${sessionId}`
  }

  async issueGuest(sessionId: string, g: GuestRecord): Promise<boolean> {
    return this.sql.begin(async (tx) => {
      await tx`
        update guest_tokens set revoked_at = ${g.issuedAt}
        where session_id = ${sessionId} and revoked_at is null and expires_at <= ${g.issuedAt}
      `
      const rows = await tx`
        insert into guest_tokens (session_id, token_hash, kind, seat, name, issued_at, expires_at, revoked_at)
        values (${sessionId}, ${g.tokenHash}, ${g.kind}, ${g.seat}, ${g.name}, ${g.issuedAt}, ${g.expiresAt}, ${g.revokedAt ?? null})
        on conflict do nothing
        returning token_hash
      `
      return rows.length === 1
    })
  }

  async guestByToken(sessionId: string, tokenHash: string): Promise<GuestRecord | null> {
    const [row] = await this.sql<{ token_hash: string; kind: 'seat' | 'observer'; seat: string | null; name: string; issued_at: Date; expires_at: Date; revoked_at: Date | null }[]>`
      select token_hash, kind, seat, name, issued_at, expires_at, revoked_at from guest_tokens where session_id = ${sessionId} and token_hash = ${tokenHash}
    `
    if (!row) return null
    return { tokenHash: row.token_hash, kind: row.kind, seat: row.seat, name: row.name, issuedAt: row.issued_at.toISOString(), expiresAt: row.expires_at.toISOString(), ...(row.revoked_at ? { revokedAt: row.revoked_at.toISOString() } : {}) }
  }

  async activateGuest(sessionId: string, tokenHash: string, now: string, expiresAt: string): Promise<GuestRecord | null> {
    const [row] = await this.sql<{ token_hash: string; kind: 'seat' | 'observer'; seat: string | null; name: string; issued_at: Date; expires_at: Date }[]>`
      update guest_tokens set expires_at = greatest(expires_at, ${expiresAt})
      where session_id = ${sessionId} and token_hash = ${tokenHash}
        and revoked_at is null and expires_at > ${now}
      returning token_hash, kind, seat, name, issued_at, expires_at
    `
    return row
      ? { tokenHash: row.token_hash, kind: row.kind, seat: row.seat, name: row.name, issuedAt: row.issued_at.toISOString(), expiresAt: row.expires_at.toISOString() }
      : null
  }

  async claimGuest(tokenHash: string, accountId: string): Promise<PlayedRecord | 'other' | null> {
    const [row] = await this.sql<GuestRow[]>`
      update guest_tokens set account_id = ${accountId}
      where token_hash = ${tokenHash} and (account_id is null or account_id = ${accountId})
      returning session_id, token_hash, kind, seat, name, issued_at, expires_at, revoked_at, account_id
    `
    if (row) return played(row)
    const [taken] = await this.sql`select 1 from guest_tokens where token_hash = ${tokenHash}`
    return taken ? 'other' : null
  }

  async guestsOf(accountId: string): Promise<PlayedRecord[]> {
    const rows = await this.sql<GuestRow[]>`
      select session_id, token_hash, kind, seat, name, issued_at, expires_at, revoked_at, account_id
      from guest_tokens where account_id = ${accountId} order by issued_at desc
    `
    return rows.map(played)
  }

  async revokeGuests(sessionId: string, seat: string | null, at: string): Promise<number> {
    const rows = await this.sql`
      update guest_tokens set revoked_at = ${at}
      where session_id = ${sessionId} and revoked_at is null and seat is not distinct from ${seat}
      returning token_hash
    `
    return rows.length
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
          insert into events (session_id, seq, batch, at, by_seat, intent, outcome, schema_version)
          values (
            ${sessionId}, ${line.seq}, ${line.batch}, ${line.at}, ${line.by},
            ${tx.json(line.intent as never)},
            ${line.outcome === undefined ? null : tx.json(line.outcome as never)},
            ${line.schemaVersion}
          )
        `
      }
    })
  }

  async sessionsOf(project: string): Promise<SessionSummary[]> {
    const rows = await this.sql<{ id: string; last_at: Date | null }[]>`
      select s.id, last.at as last_at from sessions s
      left join lateral (select at from events e where e.session_id = s.id order by seq desc limit 1) last on true
      where s.project = ${project}
      order by s.created_at desc, s.id desc
    `
    return rows.map((r) => ({ id: r.id, lastAt: r.last_at ? new Date(r.last_at).toISOString() : null }))
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

  // Lines are lifted to today's schema as they are read (DRIFT §7); the rows stay as written.
  async read(sessionId: string): Promise<Applied[]> {
    const rows = await this.sql<
      { seq: number; batch: string; at: Date; by_seat: string | null; intent: unknown; outcome: unknown; schema_version: number | null }[]
    >`
      select seq, batch, at, by_seat, intent, outcome, schema_version
      from events where session_id = ${sessionId} order by seq
    `
    return rows.map((r) =>
      liftLine({
        ...(r.schema_version === null ? {} : { schemaVersion: r.schema_version }),
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
    await this.sql.begin(async (tx) => {
      await tx`insert into projects (id, rev, doc, owner) values (${id}, 1, ${tx.json(doc as never)}, ${owner ?? null})`
      await tx`insert into project_versions (project_id, rev, doc) values (${id}, 1, ${tx.json(doc as never)})`
    })
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
      // The history (B4) grows by one; nothing already in it is ever written again.
      await tx`insert into project_versions (project_id, rev, doc) values (${id}, ${rev}, ${tx.json(doc as never)})`
      return { ...doc, id, rev }
    })
  }

  async versions(id: string): Promise<VersionSummary[]> {
    const rows = await this.sql<{ rev: number; created_at: Date; label: string | null }[]>`
      select rev, created_at, label from project_versions where project_id = ${id} order by rev desc
    `
    return rows.map((r) => ({ rev: r.rev, at: r.created_at.toISOString(), ...(r.label ? { label: r.label } : {}) }))
  }

  async at(id: string, rev: number): Promise<ProjectRecord | null> {
    const [row] = await this.sql<{ doc: ProjectDoc }[]>`select doc from project_versions where project_id = ${id} and rev = ${rev}`
    if (!row) return null
    const [own] = await this.sql<{ owner: string | null }[]>`select owner from projects where id = ${id}`
    return { ...row.doc, id, rev, ...(own?.owner ? { owner: own.owner } : {}) }
  }

  // The history goes with the game: `project_versions` cascades on the project row.
  async remove(id: string): Promise<boolean> {
    const rows = await this.sql`delete from projects where id = ${id} returning id`
    return rows.length > 0
  }

  async label(id: string, rev: number, label: string | null): Promise<VersionSummary | 'missing'> {
    const [row] = await this.sql<{ rev: number; created_at: Date; label: string | null }[]>`
      update project_versions set label = ${label} where project_id = ${id} and rev = ${rev} returning rev, created_at, label
    `
    if (!row) return 'missing'
    return { rev: row.rev, at: row.created_at.toISOString(), ...(row.label ? { label: row.label } : {}) }
  }
}

type GuestRow = { session_id: string; token_hash: string; kind: 'seat' | 'observer'; seat: string | null; name: string; issued_at: Date; expires_at: Date; revoked_at: Date | null; account_id: string | null }
function played(row: GuestRow): PlayedRecord {
  return {
    sessionId: row.session_id,
    tokenHash: row.token_hash,
    kind: row.kind,
    seat: row.seat,
    name: row.name,
    issuedAt: row.issued_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    ...(row.revoked_at ? { revokedAt: row.revoked_at.toISOString() } : {}),
    ...(row.account_id ? { accountId: row.account_id } : {}),
  }
}
