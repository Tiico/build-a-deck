import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { assetKey, outputKey, type ObjectStore } from '@byd/render'
import { PHYSICAL_VERBS, REDACTED, type Applied, type Seating } from '@byd/protocol'
import { liftLine, type SetupDef } from '@byd/engine'
import { ACCOUNT_SWEEP_DAYS, NOTHING_ERASED, changesAt, maskedIntent, type Erased, type ErasureStore, type LedgerEntry } from './erase.js'
import { SeqConflictError, type Deck, type GuestRecord, type LogStore, type SessionInfo, type SessionRecord, type SessionSummary, type PlayedRecord } from './store.js'
import { checkedHistory, liftDoc, stamp, type Ceilings, type InviteRecord, type ProjectDoc, type ProjectRecord, type ProjectRow, type ProjectStore, type ProjectSummary, type RestoredVersion, type VersionSummary } from './projects.js'
import { peekCard } from './names.js'
import { PostgresAssetStore, assetHashesOf } from './assets.js'
import { PostgresAiKeyStore } from './ai-keys.js'
import { PostgresReportStore } from './reports-postgres.js'
import { PostgresAccountPlanStore } from './account-plans.js'
import { QuotaReached, growth, startThatFrees, tableGrowth, withFrees, type Limit, type TableCeilings, type TableUse } from './quotas.js'
import type { AppliedEdit } from './project-actor.js'
import type { EditIntent } from './edits.js'
import type { Role } from './roles.js'
import type { Account, AccountFacts, AuthStore, TermsAcceptance } from './auth.js'
import type { PasskeyRecord } from './passkeys.js'

type AccountRow = { id: string; email: string; name: string | null; name_asked: boolean }
const accountOf = (row: AccountRow): Account => ({ id: String(row.id), email: row.email, name: row.name, asked: row.name_asked })

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
    const rows = await this.sql<AccountRow[]>`
      insert into accounts (email) values (${email}) on conflict (email) do update set email = excluded.email returning id, email, name, name_asked
    `
    const row = rows[0]
    if (!row) throw new Error('the insert made no account')
    return accountOf(row)
  }
  async accountById(id: string): Promise<Account | null> {
    const [row] = await this.sql<AccountRow[]>`select id, email, name, name_asked from accounts where id = ${id}`
    return row ? accountOf(row) : null
  }
  async accountByEmail(email: string): Promise<Account | null> {
    const [row] = await this.sql<AccountRow[]>`select id, email, name, name_asked from accounts where email = ${email}`
    return row ? accountOf(row) : null
  }
  async listAccounts(): Promise<Account[]> {
    const rows = await this.sql<AccountRow[]>`select id, email, name, name_asked from accounts order by id`
    return rows.map(accountOf)
  }
  async setName(accountId: string, name: string | null): Promise<void> {
    await this.sql`update accounts set name = ${name}, name_asked = true where id = ${accountId}`
  }
  async createSession(sessionHash: string, accountId: string, expiresAt: string): Promise<void> {
    await this.sql`insert into auth_sessions (session_hash, account_id, expires_at) values (${sessionHash}, ${accountId}, ${expiresAt})`
  }
  async sessionAccount(sessionHash: string, now: string): Promise<Account | null> {
    const rows = await this.sql<AccountRow[]>`
      select a.id, a.email, a.name, a.name_asked from auth_sessions s join accounts a on a.id = s.account_id where s.session_hash = ${sessionHash} and s.expires_at > ${now}
    `
    const row = rows[0]
    return row ? accountOf(row) : null
  }
  async sweepSpent(now: string): Promise<{ loginTokens: number; sessions: number }> {
    const tokens = await this.sql`delete from login_tokens where used_at is not null or expires_at <= ${now} returning 1`
    const sessions = await this.sql`delete from auth_sessions where expires_at <= ${now} returning 1`
    return { loginTokens: tokens.length, sessions: sessions.length }
  }
  async deleteSession(sessionHash: string): Promise<void> {
    await this.sql`delete from auth_sessions where session_hash = ${sessionHash}`
  }
  async accountFacts(accountId: string): Promise<AccountFacts | null> {
    const [row] = await this.sql<{ created_at: Date; email: string }[]>`select created_at, email from accounts where id = ${accountId}`
    if (!row) return null
    const sessions = await this.sql<{ expires_at: Date }[]>`select expires_at from auth_sessions where account_id = ${accountId} order by expires_at`
    const links = await this.sql<{ expires_at: Date; used_at: Date | null }[]>`select expires_at, used_at from login_tokens where email = ${row.email} order by expires_at`
    return {
      createdAt: row.created_at.toISOString(),
      sessions: sessions.map((s) => ({ expiresAt: s.expires_at.toISOString() })),
      loginLinks: links.map((l) => ({ expiresAt: l.expires_at.toISOString(), usedAt: l.used_at?.toISOString() ?? null })),
    }
  }
  async addPasskey(p: PasskeyRecord): Promise<void> {
    await this.sql`
      insert into passkeys (id, account_id, public_key, counter, transports, aaguid, device, created_at, last_used_at)
      values (${p.id}, ${p.accountId}, ${Buffer.from(p.publicKey)}, ${p.counter}, ${p.transports}, ${p.aaguid}, ${p.device}, ${p.createdAt}, ${p.lastUsedAt})
    `
  }
  async passkey(id: string): Promise<PasskeyRecord | null> {
    const [row] = await this.sql<PasskeyRow[]>`select * from passkeys where id = ${id}`
    return row ? passkeyOf(row) : null
  }
  async passkeysOf(accountId: string): Promise<PasskeyRecord[]> {
    return (await this.sql<PasskeyRow[]>`select * from passkeys where account_id = ${accountId} order by created_at desc, id`).map(passkeyOf)
  }
  async usePasskey(id: string, counter: number, at: string): Promise<void> {
    await this.sql`update passkeys set counter = ${counter}, last_used_at = ${at} where id = ${id}`
  }
  async removePasskey(accountId: string, id: string): Promise<boolean> {
    return (await this.sql`delete from passkeys where id = ${id} and account_id = ${accountId}`).count > 0
  }
  async acceptTerms(accountId: string, version: string, at: string): Promise<void> {
    await this.sql`insert into terms_acceptances (account_id, version, accepted_at) values (${accountId}, ${version}, ${at}) on conflict (account_id, version) do nothing`
  }
  async termsAccepted(accountId: string): Promise<TermsAcceptance[]> {
    const rows = await this.sql<{ version: string; accepted_at: Date }[]>`select version, accepted_at from terms_acceptances where account_id = ${accountId} order by accepted_at, version`
    return rows.map((r) => ({ version: r.version, at: r.accepted_at.toISOString() }))
  }
}

type PasskeyRow = { id: string; account_id: string; public_key: Buffer; counter: string | number; transports: string[]; aaguid: string; device: string; created_at: Date; last_used_at: Date | null }
const passkeyOf = (r: PasskeyRow): PasskeyRecord => ({ id: r.id, accountId: String(r.account_id), publicKey: new Uint8Array(r.public_key), counter: Number(r.counter), transports: r.transports, aaguid: r.aaguid, device: r.device, createdAt: r.created_at.toISOString(), lastUsedAt: r.last_used_at?.toISOString() ?? null })
import type { SurveyRecord, SurveyStore } from './surveys.js'

export class PostgresSurveyStore implements SurveyStore {
  constructor(private readonly sql: postgres.Sql) {}

  // One answer per seat and per observer (#1021): the unique keys in the schema hold it, and a
  // second answer takes the place of the first.
  async put(r: SurveyRecord): Promise<void> {
    const answers = this.sql.json(r.answers as never)
    if (r.observer) {
      await this.sql`
        insert into surveys (session_id, version, at, who, seat, observer, answers)
        values (${r.sessionId}, ${r.version}, ${r.at}, ${r.who}, null, true, ${answers})
        on conflict (session_id, who) where observer
        do update set version = excluded.version, at = excluded.at, answers = excluded.answers
      `
      return
    }
    await this.sql`
      insert into surveys (session_id, version, at, who, seat, observer, answers)
      values (${r.sessionId}, ${r.version}, ${r.at}, ${r.who}, ${r.seat}, false, ${answers})
      on conflict (session_id, seat) where not observer
      do update set version = excluded.version, at = excluded.at, who = excluded.who, answers = excluded.answers
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

  // Each account's tier (#1193, A2): the operator's today, Stripe's later.
  accountPlans(): PostgresAccountPlanStore {
    return new PostgresAccountPlanStore(this.sql)
  }

  // The erasure (#1279, G6): masking in place, the ledger, and the notification that tells the app.
  erasures(): PostgresErasureStore {
    return new PostgresErasureStore(this.sql)
  }

  // Reports and blocks (#1274): what was reported, and which pictures are treated as not there.
  reports(): PostgresReportStore {
    return new PostgresReportStore(this.sql)
  }

  // The designer's own AI key (#999): sealed, one per account.
  aiKeys(): PostgresAiKeyStore {
    return new PostgresAiKeyStore(this.sql)
  }

  // The sweep of what a deleted account's games named (#1280, G6, DRIFT §4), over this database and
  // the object store the bytes are in.
  assetSweep(objects?: ObjectStore): PostgresAssetSweep {
    return new PostgresAssetSweep(this.sql, objects)
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

  // The ceilings on the bearer's tables (#1196) are counted and held in the transaction that writes
  // the table, as the games' are (#1193): the account's lock for its tables, taken only when there
  // is a ceiling to hold, serialises exactly the starts that could cross it. A second start for the
  // same bearer waits here until the first has committed or rolled back, and then counts what the
  // first left. In the two-key form, beside the games' own lock and never sharing a key with it.
  async createSession(record: SessionRecord, ceilings?: TableCeilings): Promise<void> {
    await this.sql.begin(async (tx) => {
      const bearer = record.accountId
      if (bearer !== undefined && ceilings && (ceilings.openTables !== null || ceilings.tablesPer30Days !== null)) {
        await tx`select pg_advisory_xact_lock(hashtext('quota:tables'), hashtext(${bearer}))`
        const met = tableGrowth(ceilings, await tablesIn(tx, bearer, ceilings.since))
        if (met) throw new QuotaReached(met.measure === 'tablesPer30Days' ? withFrees(met, await startIn(tx, bearer, ceilings.since, startThatFrees(met))) : met)
      }
      await tx`
        insert into sessions (id, version, setup, deck, project, account_id, code, code_expires_at, host_key_hash, seating)
        values (${record.id}, ${record.version}, ${tx.json(record.setup as never)}, ${record.deck ? tx.json(record.deck as never) : null}, ${record.project ?? null},
                ${record.accountId ?? null}, ${record.code ?? null}, ${record.codeExpiresAt ?? null}, ${record.hostKeyHash ?? null}, ${record.seating ?? null})
      `
    })
  }

  async tablesOf(account: string, since: Date): Promise<TableUse> {
    return tablesIn(this.sql, account, since)
  }

  async addDeck(sessionId: string, version: string, deck: Deck): Promise<void> {
    await this.sql`
      insert into session_decks (session_id, version, deck) values (${sessionId}, ${version}, ${this.sql.json(deck as never)})
      on conflict (session_id, version) do update set deck = excluded.deck
    `
  }

  async deckOf(sessionId: string, version: string): Promise<Deck | null> {
    const [refreshed] = await this.sql<{ deck: Deck }[]>`select deck from session_decks where session_id = ${sessionId} and version = ${version}`
    if (refreshed) return refreshed.deck
    const [start] = await this.sql<{ deck: Deck | null }[]>`select deck from sessions where id = ${sessionId}`
    return start?.deck ?? null
  }

  // Never the deck (#1012): see `SessionInfo`. It is `deckOf`'s, for the one reader that deals.
  async loadSession(id: string): Promise<SessionInfo | null> {
    const rows = await this.sql<{ id: string; version: string; setup: SetupDef; project: string | null; account_id: string | null; code: string | null; code_expires_at: Date | null; host_key_hash: string | null; seating: Seating | null }[]>`
      select id, version, setup, project, account_id, code, code_expires_at, host_key_hash, seating from sessions where id = ${id}
    `
    const row = rows[0]
    if (!row) return null
    return {
      id: row.id,
      version: row.version,
      setup: row.setup,
      ...(row.project ? { project: row.project } : {}),
      ...(row.account_id ? { accountId: row.account_id } : {}),
      ...(row.code ? { code: row.code } : {}),
      ...(row.code_expires_at ? { codeExpiresAt: row.code_expires_at.toISOString() } : {}),
      ...(row.host_key_hash ? { hostKeyHash: row.host_key_hash } : {}),
      ...(row.seating ? { seating: row.seating } : {}),
    }
  }

  async sessionByCode(code: string): Promise<{ id: string; codeExpiresAt: string } | null> {
    const [row] = await this.sql<{ id: string; code_expires_at: Date }[]>`select id, code_expires_at from sessions where code = ${code} and code_expires_at is not null`
    return row ? { id: row.id, codeExpiresAt: row.code_expires_at.toISOString() } : null
  }

  async setCode(sessionId: string, code: string, expiresAt: string): Promise<void> {
    await this.sql`update sessions set code = ${code}, code_expires_at = ${expiresAt} where id = ${sessionId}`
  }

  async rotateAdmission(sessionId: string, code: string, expiresAt: string, hostKeyHash: string): Promise<void> {
    await this.sql`update sessions set code = ${code}, code_expires_at = ${expiresAt}, host_key_hash = ${hostKeyHash} where id = ${sessionId}`
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

  async guestsAt(sessionId: string): Promise<GuestRecord[]> {
    const rows = await this.sql<GuestRow[]>`
      select session_id, token_hash, kind, seat, name, issued_at, expires_at, revoked_at, account_id
      from guest_tokens where session_id = ${sessionId} order by issued_at
    `
    return rows.map((row) => {
      const { sessionId: _session, ...guest } = played(row)
      return guest
    })
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

  async returnGuest(sessionId: string, accountId: string, tokenHash: string, now: string): Promise<GuestRecord | null> {
    const [row] = await this.sql<GuestRow[]>`
      update guest_tokens set token_hash = ${tokenHash}
      where token_hash = (
        select token_hash from guest_tokens
        where session_id = ${sessionId} and account_id = ${accountId} and revoked_at is null and expires_at > ${now}
        order by issued_at desc limit 1
      )
      returning session_id, token_hash, kind, seat, name, issued_at, expires_at, revoked_at, account_id
    `
    return row ? played(row) : null
  }

  async sweepGuests(now: string, pendingMs: number): Promise<number> {
    const rows = await this.sql`
      delete from guest_tokens
      where account_id is null and expires_at <= ${now}
        and expires_at <= issued_at + ${pendingMs} * interval '1 millisecond'
        and (revoked_at is null or revoked_at >= expires_at)
      returning 1
    `
    return rows.length
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
      left join lateral (select at from events e where e.session_id = s.id and e.intent->>'v' = any(${PHYSICAL_VERBS as string[]}) order by seq desc limit 1) last on true
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
    return this.lines(sessionId)
  }

  // Only the lines of these verbs, chosen in the query, so a long log's moves never travel (#1225).
  async readVerbs(sessionId: string, verbs: readonly Applied['intent']['v'][]): Promise<Applied[]> {
    return this.lines(sessionId, verbs)
  }

  private async lines(sessionId: string, verbs?: readonly string[]): Promise<Applied[]> {
    const rows = await this.sql<
      { seq: number; batch: string; at: Date; by_seat: string | null; intent: unknown; outcome: unknown; schema_version: number | null }[]
    >`
      select seq, batch, at, by_seat, intent, outcome, schema_version
      from events where session_id = ${sessionId} ${verbs ? this.sql`and intent->>'v' = any(${verbs as string[]})` : this.sql``} order by seq
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

// What an account bears of tables (#1196): the ones whose latest line is not `session.end`, and the
// ones started after `since`, out of the bearer's index.
async function tablesIn(sql: postgres.Sql | postgres.TransactionSql, account: string, since: Date): Promise<TableUse> {
  const [row] = await sql<{ open: number; started: number }[]>`
    select count(*) filter (where coalesce(last.v, '') <> 'session.end')::int as open,
           count(*) filter (where s.created_at > ${since})::int as started
    from sessions s
    left join lateral (select intent->>'v' as v from events e where e.session_id = s.id order by seq desc limit 1) last on true
    where s.account_id = ${account}
  `
  return { open: row?.open ?? 0, started: row?.started ?? 0 }
}

// When the account's `nth` table in the window was started, counted from the oldest and from 0, in
// milliseconds rounded up: the stamp is finer than a millisecond, and a moment rounded down would
// be one at which the start still stands in the window.
async function startIn(sql: postgres.Sql | postgres.TransactionSql, account: string, since: Date, nth: number): Promise<number | undefined> {
  const [row] = await sql<{ ms: string }[]>`
    select ceil(extract(epoch from created_at) * 1000)::bigint as ms from sessions
    where account_id = ${account} and created_at > ${since}
    order by created_at, id offset ${nth} limit 1
  `
  return row ? Number(row.ms) : undefined
}

// The ceiling on the games an account owns (#1193), counted and held in the transaction that writes
// the game. The lock is the account's for its games, taken only when there is a ceiling to hold, and
// it serialises exactly the writes that could cross it: a second create for the same account waits
// here until the first has committed or rolled back, and then counts what the first left. In the
// two-key form, so it never shares a key with the single-key locks on tables.
async function within(tx: postgres.TransactionSql, owner: string | undefined, limit: Limit | undefined): Promise<void> {
  if (owner === undefined || limit === undefined || limit === null) return
  await tx`select pg_advisory_xact_lock(hashtext('quota:projects'), hashtext(${owner}))`
  const [row] = await tx<{ n: number }[]>`select count(*)::int as n from projects where owner = ${owner}`
  const met = growth('projects', limit, row?.n ?? 0, 1)
  if (met) throw new QuotaReached(met)
}

// What an account's games use (#1197): the sizes of the distinct assets the derived table says some
// version of some game it owns names. A name no asset answers to weighs nothing.
async function storedIn(sql: postgres.Sql | postgres.TransactionSql, owner: string): Promise<number> {
  const [row] = await sql<{ n: string }[]>`
    select coalesce(sum(a.size), 0)::text as n from assets a
    where a.hash in (select pa.hash from project_assets pa join projects p on p.id = pa.project_id where p.owner = ${owner})
  `
  return Number(row?.n ?? 0)
}

// The ceiling on what an account's games name (#1197), held in the transaction that writes the
// versions that name `hashes`, the way the ceiling on games is: under the account's own lock for
// storage, so a second such write waits until the first has committed or rolled back and then
// counts what the first left. What the account bears already costs nothing again.
async function storing(tx: postgres.TransactionSql, owner: string | undefined, limit: Limit | undefined, hashes: readonly string[]): Promise<void> {
  if (owner === undefined || limit === undefined || limit === null) return
  await tx`select pg_advisory_xact_lock(hashtext('quota:storageBytes'), hashtext(${owner}))`
  const used = await storedIn(tx, owner)
  const [row] = hashes.length === 0 ? [{ n: '0' }] : await tx<{ n: string }[]>`
    select coalesce(sum(a.size), 0)::text as n from assets a
    where a.hash in ${tx(hashes as string[])}
      and a.hash not in (select pa.hash from project_assets pa join projects p on p.id = pa.project_id where p.owner = ${owner})
  `
  const met = growth('storageBytes', limit, used, Number(row?.n ?? 0))
  if (met) throw new QuotaReached(met)
}

// What a game's versions name, kept beside them (#1197): derived from the versions, never told
// anything they do not say, and gone with the game. See `project_assets` in 001-init.sql.
async function naming(tx: postgres.TransactionSql, id: string, hashes: readonly string[]): Promise<void> {
  if (hashes.length === 0) return
  await tx`insert into project_assets ${tx(hashes.map((hash) => ({ project_id: id, hash })))} on conflict do nothing`
}

// The edit log between saves (D3), written in whatever transaction the caller is in.
async function logged(sql: postgres.Sql | postgres.TransactionSql, id: string, edits: readonly AppliedEdit[]): Promise<void> {
  if (edits.length === 0) return
  await sql`
    insert into project_events ${sql(
      edits.map((e) => ({ project_id: id, seq: e.seq, intent: sql.json(e.intent as never), by_account: e.by ?? null, created_at: e.at })),
      'project_id',
      'seq',
      'intent',
      'by_account',
      'created_at',
    )}
  `
}

export class PostgresProjectStore implements ProjectStore {
  constructor(private readonly sql: postgres.Sql) {}

  async create(id: string, doc: ProjectDoc, owner?: string, ceilings?: Ceilings): Promise<ProjectRecord> {
    const hashes = assetHashesOf(doc)
    await this.sql.begin(async (tx) => {
      await within(tx, owner, ceilings?.projects)
      await storing(tx, owner, ceilings?.storageBytes, hashes)
      await tx`insert into projects (id, rev, doc, owner) values (${id}, 1, ${tx.json(doc as never)}, ${owner ?? null})`
      // The first version is the one who made the game's (#1225).
      await tx`insert into project_versions (project_id, rev, doc, saved_by) values (${id}, 1, ${tx.json(doc as never)}, ${owner ?? null})`
      await naming(tx, id, hashes)
    })
    return { ...doc, id, rev: 1, ...(owner !== undefined ? { owner } : {}) }
  }

  async restore(id: string, versions: RestoredVersion[], owner?: string, ceilings?: Ceilings): Promise<ProjectRecord> {
    const last = checkedHistory(versions)
    const hashes = [...new Set(versions.flatMap((v) => assetHashesOf(v.doc)))]
    // One transaction: a history is brought back whole or not at all, and an id that is taken fails
    // on its primary key before anything is kept.
    await this.sql.begin(async (tx) => {
      await within(tx, owner, ceilings?.projects)
      await storing(tx, owner, ceilings?.storageBytes, hashes)
      await tx`insert into projects (id, rev, doc, owner) values (${id}, ${last.rev}, ${tx.json(last.doc as never)}, ${owner ?? null})`
      for (const v of versions) {
        await tx`insert into project_versions (project_id, rev, doc, label, created_at) values (${id}, ${v.rev}, ${tx.json(v.doc as never)}, ${v.label ?? null}, ${v.at})`
      }
      await naming(tx, id, hashes)
    })
    return { ...last.doc, id, rev: last.rev, ...(owner !== undefined ? { owner } : {}) }
  }

  async owned(owner: string): Promise<number> {
    const [row] = await this.sql<{ n: number }[]>`select count(*)::int as n from projects where owner = ${owner}`
    return row?.n ?? 0
  }

  stored(owner: string): Promise<number> {
    return storedIn(this.sql, owner)
  }

  async using(hash: string): Promise<{ id: string; owner?: string }[]> {
    const rows = await this.sql<{ id: string; owner: string | null }[]>`
      select p.id, p.owner from project_assets pa join projects p on p.id = pa.project_id where pa.hash = ${hash} order by p.id collate "C"
    `
    return rows.map((r) => ({ id: r.id, ...(r.owner !== null ? { owner: String(r.owner) } : {}) }))
  }

  async borne(owner: string, hashes: readonly string[]): Promise<Set<string>> {
    if (hashes.length === 0) return new Set()
    const rows = await this.sql<{ hash: string }[]>`
      select distinct pa.hash from project_assets pa join projects p on p.id = pa.project_id
      where p.owner = ${owner} and pa.hash in ${this.sql(hashes as string[])}
    `
    return new Set(rows.map((r) => r.hash))
  }

  async ownedIds(owner: string): Promise<string[]> {
    const rows = await this.sql<{ id: string }[]>`select id from projects where owner = ${owner} order by id collate "C"`
    return rows.map((r) => r.id)
  }

  async load(id: string): Promise<ProjectRecord | null> {
    const [row] = await this.sql<{ rev: number; doc: ProjectDoc; owner: string | null }[]>`select rev, doc, owner from projects where id = ${id}`
    return row ? liftDoc({ ...row.doc, id, rev: row.rev, ...(row.owner ? { owner: row.owner } : {}) }) : null
  }

  // Every project the account can see (D3): its own, and the ones shared with it.
  async list(account: string): Promise<ProjectSummary[]> {
    // The deck's first row only, as an id and a title: the list names one card per game (G1,
    // #231), and a hundred whole rows per game would be a document each just to name one. The
    // order is the document's own, so the row that comes back is the row the table shows first.
    const rows = await this.sql<{ id: string; rev: number; name: string; role: string; first: ProjectRow | null }[]>`
      select p.id, p.rev, p.doc->>'name' as name,
             case when p.owner = ${account} or p.owner is null then 'owner' else m.role end as role,
             jsonb_build_object('id', p.doc->'rows'->0->>'id', 'fields', jsonb_build_object('title', p.doc->'rows'->0->'fields'->>'title')) as first
      from projects p
      left join project_members m on m.project_id = p.id and m.account_id = ${account}
      where p.owner = ${account} or p.owner is null or m.role is not null
      order by p.updated_at desc
    `
    return rows.map((r) => ({ id: r.id, name: r.name, rev: r.rev, role: r.role as Role, card: peekCard(r.first?.id ? [r.first] : []) }))
  }

  async roleOf(id: string, account: string): Promise<Role | null> {
    const [row] = await this.sql<{ owner: string | null }[]>`select owner from projects where id = ${id}`
    if (!row) return null
    if (row.owner === null || row.owner === account) return 'owner'
    const [member] = await this.sql<{ role: string }[]>`select role from project_members where project_id = ${id} and account_id = ${account}`
    return member ? (member.role as Role) : null
  }

  async members(id: string): Promise<{ account: string; role: Role }[]> {
    const [row] = await this.sql<{ owner: string | null }[]>`select owner from projects where id = ${id}`
    if (!row) return []
    const rows = await this.sql<{ account_id: string; role: string }[]>`select account_id, role from project_members where project_id = ${id} order by added_at`
    const owner = row.owner ? [{ account: row.owner, role: 'owner' as Role }] : []
    return [...owner, ...rows.map((r) => ({ account: r.account_id, role: r.role as Role }))]
  }

  async share(id: string, account: string, role: Role): Promise<void> {
    await this.sql`
      insert into project_members (project_id, account_id, role) values (${id}, ${account}, ${role})
      on conflict (project_id, account_id) do update set role = excluded.role
    `
  }

  async unshare(id: string, account: string): Promise<void> {
    const [row] = await this.sql<{ owner: string | null }[]>`select owner from projects where id = ${id}`
    if (row?.owner === account) throw new Error('the owner cannot be unshared')
    await this.sql`delete from project_members where project_id = ${id} and account_id = ${account}`
  }

  async invite(invite: { tokenHash: string; project: string; email: string; role: Role; by?: string; expiresAt: string }): Promise<void> {
    await this.sql`
      insert into project_invites (token_hash, project_id, email, role, invited_by, expires_at)
      values (${invite.tokenHash}, ${invite.project}, ${invite.email}, ${invite.role}, ${invite.by ?? null}, ${invite.expiresAt})
    `
  }

  async openInvites(project: string, now: string): Promise<{ email: string; role: Role; expiresAt: string }[]> {
    const rows = await this.sql<{ email: string; role: string; expires_at: Date | string }[]>`
      select email, role, expires_at from project_invites
      where project_id = ${project} and accepted_at is null and expires_at > ${now}
      order by expires_at
    `
    return rows.map((r) => ({ email: r.email, role: r.role as Role, expiresAt: new Date(r.expires_at).toISOString() }))
  }

  async withdrawInvites(project: string, email: string): Promise<number> {
    const rows = await this.sql`
      delete from project_invites
      where project_id = ${project} and accepted_at is null and lower(email) = lower(${email})
      returning token_hash
    `
    return rows.length
  }

  async inviteTo(tokenHash: string, now: string): Promise<string | null> {
    const [row] = await this.sql<{ project_id: string }[]>`
      select project_id from project_invites
      where token_hash = ${tokenHash} and accepted_at is null and expires_at > ${now}
    `
    return row?.project_id ?? null
  }

  async invitesOf(account: string, email: string): Promise<{ sent: InviteRecord[]; received: InviteRecord[] }> {
    const rows = await this.sql<{ project_id: string; email: string; role: string; invited_by: string | null; created_at: Date; expires_at: Date; accepted_at: Date | null }[]>`
      select project_id, email, role, invited_by::text, created_at, expires_at, accepted_at from project_invites
      where invited_by::text = ${account} or lower(email) = lower(${email})
      order by created_at, token_hash
    `
    const told = (r: (typeof rows)[number]): InviteRecord => ({ project: r.project_id, email: r.email, role: r.role as Role, sentAt: r.created_at.toISOString(), expiresAt: r.expires_at.toISOString(), acceptedAt: r.accepted_at?.toISOString() ?? null })
    return { sent: rows.filter((r) => r.invited_by === account).map(told), received: rows.filter((r) => r.email.toLowerCase() === email.toLowerCase()).map(told) }
  }

  async sweepInvites(before: string): Promise<number> {
    const rows = await this.sql`
      delete from project_invites
      where (accepted_at is not null and accepted_at < ${before}) or (accepted_at is null and expires_at < ${before})
      returning 1
    `
    return rows.length
  }

  async acceptInvite(tokenHash: string, now: string): Promise<{ project: string; email: string; role: Role } | null> {
    const [row] = await this.sql<{ project_id: string; email: string; role: string }[]>`
      update project_invites set accepted_at = ${now}
      where token_hash = ${tokenHash} and accepted_at is null and expires_at > ${now}
      returning project_id, email, role
    `
    return row ? { project: row.project_id, email: row.email, role: row.role as Role } : null
  }

  // The edit log between saves (D3): committed before an edit is applied, read back on load.
  async appendEdits(id: string, edits: AppliedEdit[]): Promise<void> {
    await logged(this.sql, id, edits)
  }

  async readEdits(id: string, sinceSeq: number): Promise<AppliedEdit[]> {
    const rows = await this.sql<{ seq: number; intent: EditIntent; by_account: string | null; created_at: Date }[]>`
      select seq, intent, by_account, created_at from project_events where project_id = ${id} and seq > ${sinceSeq} order by seq
    `
    return rows.map((r) => ({ seq: r.seq, at: r.created_at.toISOString(), ...(r.by_account ? { by: r.by_account } : {}), intent: r.intent }))
  }

  // One transaction: the edits, the version and what it names are written together after the
  // ceiling is asked, or none of them is (#1233).
  async replace(id: string, expectedRev: number, doc: ProjectDoc, atSeq?: number, ceilings?: Pick<Ceilings, 'storageBytes'>, edits: readonly AppliedEdit[] = [], by?: string): Promise<ProjectRecord | 'conflict' | 'missing'> {
    const hashes = assetHashesOf(doc)
    return this.sql.begin(async (tx) => {
      const [row] = await tx<{ rev: number; doc: ProjectDoc; owner: string | null }[]>`select rev, doc, owner from projects where id = ${id} for update`
      if (!row) return 'missing'
      if (row.rev !== expectedRev) return 'conflict'
      // Read under the same lock as the write, so "nothing changed" cannot be decided against a
      // document somebody else has already replaced (B4).
      if (stamp(row.doc) === stamp(doc)) {
        await logged(tx, id, edits)
        return { ...row.doc, id, rev: row.rev, ...(row.owner ? { owner: row.owner } : {}) }
      }
      await storing(tx, row.owner ?? undefined, ceilings?.storageBytes, hashes)
      await logged(tx, id, edits)
      const rev = row.rev + 1
      await tx`update projects set rev = ${rev}, doc = ${tx.json(doc as never)}, updated_at = now() where id = ${id}`
      // The history (B4) grows by one; nothing already in it is ever written again.
      await tx`insert into project_versions (project_id, rev, doc, at_seq, saved_by) values (${id}, ${rev}, ${tx.json(doc as never)}, ${atSeq ?? null}, ${by ?? null})`
      await naming(tx, id, hashes)
      return { ...doc, id, rev }
    })
  }

  async versions(id: string): Promise<VersionSummary[]> {
    const rows = await this.sql<{ rev: number; created_at: Date; label: string | null; at_seq: number | null; saved_by: string | null }[]>`
      select rev, created_at, label, at_seq, saved_by from project_versions where project_id = ${id} order by rev desc
    `
    return rows.map((r) => ({ rev: r.rev, at: r.created_at.toISOString(), ...(r.label ? { label: r.label } : {}), ...(r.at_seq !== null ? { atSeq: r.at_seq } : {}), ...(r.saved_by !== null ? { by: r.saved_by } : {}) }))
  }

  async at(id: string, rev: number): Promise<ProjectRecord | null> {
    const [row] = await this.sql<{ doc: ProjectDoc }[]>`select doc from project_versions where project_id = ${id} and rev = ${rev}`
    if (!row) return null
    const [own] = await this.sql<{ owner: string | null }[]>`select owner from projects where id = ${id}`
    return liftDoc({ ...row.doc, id, rev, ...(own?.owner ? { owner: own.owner } : {}) })
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

// The channel an erasure is told on when it commits (#1279): the payload is a table's id, and only
// an id. Postgres holds a notification back until its transaction commits and drops it if it rolls
// back, so the app reads a table again exactly when there is a masked log to read.
export const ERASED_CHANNEL = 'byd_erased'

type LedgerRow = { id: string; at: Date; kind: LedgerEntry['kind']; reason: LedgerEntry['reason']; session_id: string | null; seat: string | null; issued_at: Date | null; project_id: string | null; account_id: string | null }
const ledgerOf = (r: LedgerRow): LedgerEntry => {
  const base = { id: r.id, at: r.at.toISOString(), reason: r.reason }
  if (r.kind === 'game') return { ...base, kind: 'game', project: r.project_id ?? '' }
  if (r.kind === 'account') return { ...base, kind: 'account', account: r.account_id ?? '' }
  if (r.kind === 'table') return { ...base, kind: 'table', session: r.session_id ?? '' }
  return { ...base, kind: 'guest', session: r.session_id ?? '', seat: r.seat, issuedAt: r.issued_at?.toISOString() ?? '' }
}
type SurveyRow = { id: string; session_id: string; version: string; at: Date; who: string; seat: string | null; observer: boolean; answers: SurveyRecord['answers'] }
type EventRow = { seq: number; batch: string; at: Date; by_seat: string | null; intent: unknown; outcome: unknown; schema_version: number | null }

export class PostgresErasureStore implements ErasureStore {
  constructor(private readonly sql: postgres.Sql) {}

  // One transaction for the whole request: every table it names, the ledger, and the notifications.
  // Each table is masked under its writer's lock (`append`), so no line is committed between the
  // reading and the masking. A row is masked as it was written (DRIFT §7): only `intent` changes,
  // only in the personal fields, and the row keeps its `schema_version`.
  async erase(entries: readonly LedgerEntry[]): Promise<Erased> {
    return this.sql.begin(async (tx) => {
      const sum: Erased = { ...NOTHING_ERASED, sessions: [] }
      for (const e of entries) {
        if (e.kind === 'account') await this.account(tx, e, sum)
        else {
          const sessions = e.kind === 'game' ? (await tx<{ id: string }[]>`select id from sessions where project = ${e.project} order by id`).map((r) => r.id) : [e.session]
          for (const session of sessions) await this.at(tx, session, e, sum)
        }
        await tx`
          insert into erasures (id, at, kind, reason, session_id, seat, issued_at, project_id, account_id)
          values (${e.id}, ${e.at}, ${e.kind}, ${e.reason}, ${e.kind === 'guest' || e.kind === 'table' ? e.session : null}, ${e.kind === 'guest' ? e.seat : null}, ${e.kind === 'guest' ? e.issuedAt : null}, ${e.kind === 'game' ? e.project : null}, ${e.kind === 'account' ? e.account : null})
          on conflict (id) do nothing
        `
      }
      sum.sessions = [...new Set(sum.sessions)]
      for (const session of sum.sessions) await tx`select pg_notify(${ERASED_CHANNEL}, ${session})`
      return sum
    })
  }

  // An account that deleted itself (#1280, G6): its tables claimed masked as a guest's are, then
  // every row that says its id or its address goes, or forgets it — its games with their history
  // (the tables were ended and are masked by the `game` entries beside this one), what it bore, the
  // versions and edits it made in other people's games, the invitations it sent and those to its
  // address, its login links, and the account with everything that hangs on it (passkeys, sessions,
  // AI key, tier, terms, memberships). What only its games named is put down for the sweep first,
  // while the games are still there to say it. Run again after a restore, it does it all again.
  private async account(tx: postgres.TransactionSql, e: Extract<LedgerEntry, { kind: 'account' }>, sum: Erased): Promise<void> {
    const id = e.account
    const [found] = await tx<{ email: string }[]>`select email from accounts where id::text = ${id}`
    const due = new Date(Date.parse(e.at) + ACCOUNT_SWEEP_DAYS * 24 * 3600_000).toISOString()
    await tx`
      insert into asset_sweeps (hash, kind, due_at)
      select distinct a.hash, 'asset', ${due}::timestamptz from project_assets a join projects p on p.id = a.project_id where p.owner = ${id}
      on conflict (hash, kind) do nothing
    `
    const [renderLog] = await tx<{ there: boolean }[]>`select to_regclass('render_log') is not null as there`
    if (renderLog?.there) {
      await tx`
        insert into asset_sweeps (hash, kind, due_at) select distinct hash, 'render', ${due}::timestamptz from render_log where account_id = ${id}
        on conflict (hash, kind) do nothing
      `
      await tx`delete from render_log where account_id = ${id}`
    }
    const claimed = await tx<{ session_id: string; seat: string | null; issued_at: Date }[]>`select session_id, seat, issued_at from guest_tokens where account_id = ${id} order by session_id, issued_at`
    for (const g of claimed) await this.at(tx, g.session_id, { id: e.id, at: e.at, reason: 'request', kind: 'guest', session: g.session_id, seat: g.seat, issuedAt: g.issued_at.toISOString() }, sum)
    await tx`update guest_tokens set account_id = null where account_id = ${id}`
    await tx`delete from projects where owner = ${id}`
    await tx`update project_versions set saved_by = null where saved_by = ${id}`
    await tx`update project_events set by_account = null where by_account = ${id}`
    await tx`update sessions set account_id = null where account_id = ${id}`
    await tx`delete from project_invites where invited_by::text = ${id} or lower(email) = lower(${found?.email ?? ''})`
    if (found) await tx`delete from login_tokens where lower(email) = lower(${found.email})`
    const gone = await tx`delete from accounts where id::text = ${id} returning 1`
    sum.accounts += gone.length
  }

  private async at(tx: postgres.TransactionSql, session: string, e: Exclude<LedgerEntry, { kind: 'account' }>, sum: Erased): Promise<void> {
    await tx`select pg_advisory_xact_lock(hashtext(${session}))`
    const [exists] = await tx`select 1 from sessions where id = ${session}`
    if (!exists) return
    const rows = await tx<EventRow[]>`select seq, batch, at, by_seat, intent, outcome, schema_version from events where session_id = ${session} order by seq`
    const log = rows.map((r) => liftLine({ ...(r.schema_version === null ? {} : { schemaVersion: r.schema_version }), seq: r.seq, batch: r.batch, at: r.at.toISOString(), by: r.by_seat, intent: r.intent, ...(r.outcome === null ? {} : { outcome: r.outcome }) }))
    const guests = (await tx<GuestRow[]>`
      select session_id, token_hash, kind, seat, name, issued_at, expires_at, revoked_at, account_id from guest_tokens where session_id = ${session} order by issued_at, token_hash
    `).map(played)
    const answers = await tx<SurveyRow[]>`select id, session_id, version, at, who, seat, observer, answers from surveys where session_id = ${session} order by at, id`
    const surveys: SurveyRecord[] = answers.map((r) => ({ sessionId: r.session_id, version: r.version, at: r.at.toISOString(), who: r.who, seat: r.seat, observer: r.observer, answers: r.answers }))
    const changes = changesAt({ log, guests, surveys }, e, e.reason)
    for (const [i, line] of log.entries()) {
      if (changes.seqs.includes(line.seq)) await tx`update events set intent = ${tx.json(maskedIntent(line, rows[i]?.intent) as never)} where session_id = ${session} and seq = ${line.seq}`
    }
    const hashes = changes.guests.flatMap((i) => guests[i]?.tokenHash ?? [])
    if (hashes.length > 0) await tx`update guest_tokens set name = ${REDACTED} where session_id = ${session} and token_hash = any(${hashes})`
    const dropped = changes.drop.flatMap((i) => answers[i]?.id ?? [])
    if (dropped.length > 0) await tx`delete from surveys where id = any(${dropped})`
    for (const { index, record } of changes.mask) await tx`update surveys set who = ${record.who}, answers = ${tx.json(record.answers as never)} where id = ${answers[index]?.id ?? null}`
    if (changes.seqs.length + changes.guests.length + changes.drop.length + changes.mask.length > 0 || e.kind !== 'guest') sum.sessions.push(session)
    sum.lines += changes.seqs.length
    sum.guests += changes.guests.length
    sum.surveys += changes.drop.length + changes.mask.length
  }

  async ledger(): Promise<LedgerEntry[]> {
    return (await this.sql<LedgerRow[]>`select id, at, kind, reason, session_id, seat, issued_at, project_id, account_id from erasures order by at, id`).map(ledgerOf)
  }

  async retained(endedBefore: string): Promise<{ kind: 'guest'; session: string; seat: string | null; issuedAt: string }[]> {
    const rows = await this.sql<{ session_id: string; seat: string | null; issued_at: Date }[]>`
      select g.session_id, g.seat, g.issued_at from guest_tokens g
      join lateral (select at, intent->>'v' as v from events e where e.session_id = g.session_id order by seq desc limit 1) last on true
      where g.account_id is null and left(g.name, 1) <> ${REDACTED} and last.v = 'session.end' and last.at < ${endedBefore}
      order by g.session_id, g.issued_at
    `
    return rows.map((r) => ({ kind: 'guest', session: r.session_id, seat: r.seat, issuedAt: r.issued_at.toISOString() }))
  }

  async orphans(): Promise<string[]> {
    const rows = await this.sql<{ project: string }[]>`
      select distinct s.project from sessions s
      where s.project is not null
        and not exists (select 1 from projects p where p.id = s.project)
        and not exists (select 1 from erasures x where x.kind = 'game' and x.project_id = s.project)
      order by s.project
    `
    return rows.map((r) => r.project)
  }

  async listen(fn: (sessions: string[]) => void): Promise<() => Promise<void>> {
    const { unlisten } = await this.sql.listen(ERASED_CHANNEL, (session) => fn([session]))
    return unlisten
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

// What a deleted account's games named, swept when its day comes (#1280, G6, F4, DRIFT §4): the 30
// days after the account went, so a restore inside them, or a designer who imports her export into a
// new account, finds the bytes still there. A picture or a typeface goes when no game there is names
// it and no table whose game is still there plays with it, nor a job waiting to be drawn; a rendering
// goes when no other account bore it. The tables of the account's own games are not asked: their
// games are gone, so they are never drawn again. A hash named again is no longer the account's and
// is left for good. Each goes in a transaction of its own, the row before the bytes, so bytes that
// cannot be deleted leave the row to be tried again next round.
export type AssetSweep = { sweep(now: Date): Promise<{ assets: number; renders: number; kept: number }> }
export class PostgresAssetSweep implements AssetSweep {
  constructor(
    private readonly sql: postgres.Sql,
    private readonly objects?: ObjectStore,
  ) {}

  async sweep(now: Date): Promise<{ assets: number; renders: number; kept: number }> {
    const done = { assets: 0, renders: 0, kept: 0 }
    const due = await this.sql<{ hash: string; kind: 'asset' | 'render' }[]>`select hash, kind from asset_sweeps where due_at <= ${now.toISOString()} order by due_at, hash`
    const [queue] = await this.sql<{ there: boolean }[]>`select to_regclass('render_jobs') is not null and to_regclass('render_log') is not null as there`
    for (const { hash, kind } of due) {
      await this.sql.begin(async (tx) => {
        const named = `%asset:${hash}%`
        const [still] =
          kind === 'asset'
            ? await tx<{ yes: boolean }[]>`
                select exists (select 1 from project_assets where hash = ${hash})
                  or exists (select 1 from sessions s where s.deck::text like ${named} and (s.project is null or exists (select 1 from projects p where p.id = s.project)))
                  or exists (select 1 from session_decks d join sessions s on s.id = d.session_id where d.deck::text like ${named} and (s.project is null or exists (select 1 from projects p where p.id = s.project)))
                  ${queue?.there ? tx`or exists (select 1 from render_jobs where state in ('queued', 'running') and compiled::text like ${named})` : tx``}
                  as yes`
            : queue?.there
              ? await tx<{ yes: boolean }[]>`select exists (select 1 from render_log where hash = ${hash}) as yes`
              : [{ yes: true }]
        await tx`delete from asset_sweeps where hash = ${hash} and kind = ${kind}`
        if (still?.yes) {
          done.kept++
          return
        }
        if (kind === 'asset') {
          await tx`delete from assets where hash = ${hash}`
          await this.objects?.delete(assetKey(hash))
          done.assets++
        } else {
          await tx`delete from render_outputs where hash = ${hash}`
          await tx`delete from render_jobs where hash = ${hash}`
          await this.objects?.delete(outputKey(hash))
          done.renders++
        }
      })
    }
    console.log(JSON.stringify({ msg: 'swept-assets', ...done }))
    return done
  }
}
